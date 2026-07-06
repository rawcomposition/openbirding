import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import { cellToBoundary } from "h3-js";
import "maplibre-gl/dist/maplibre-gl.css";
import { mutate } from "@/lib/utils";
import { quantileStops } from "@/lib/liferColors";

export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

type GridResponse = {
  resolution: number;
  cells: { h3: string; lifers: number }[];
  maxLifers: number;
};

type Props = {
  /** Server-side life-list token; the grid only renders once one exists. */
  listToken: string | null;
  resolutions: number[];
  /** Worldwide quantile breakpoints per resolution — the fixed colour scale. */
  breaksByRes: Record<number, number[]> | null;
  selectedCells: string[];
  onToggleCell: (h3: string, resolution: number) => void;
  onResolutionChange: (resolution: number) => void;
  /** Fired on every settled pan/zoom — the page scopes hotspot results to it. */
  onViewportChange: (bbox: Bbox, resolution: number) => void;
};

export type GridMapHandle = {
  fitBounds: (bbox: Bbox) => void;
  flyTo: (lng: number, lat: number) => void;
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SELECTED_COLOR = "#f59e0b";

/**
 * Finer H3 resolution as you zoom in, clamped to what the server has. Coarse
 * hexes are kept for a wide zoom range; fine hexes only appear once zoomed in.
 */
function resForZoom(zoom: number, available: number[]): number {
  const sorted = [...available].sort((a, b) => a - b);
  if (sorted.length === 0) return 6;
  const idx = zoom < 5 ? 0 : zoom < 7.5 ? 1 : zoom < 10 ? 2 : 3;
  return sorted[Math.min(idx, sorted.length - 1)];
}

/** Hex boundary as a GeoJSON ring, unwrapped across the antimeridian. */
function hexRing(h3: string): [number, number][] {
  const ring = cellToBoundary(h3, true) as [number, number][];
  const lngs = ring.map(([lng]) => lng);
  if (Math.max(...lngs) - Math.min(...lngs) > 180) {
    return ring.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat]);
  }
  return ring;
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

const LiferGridMap = forwardRef<GridMapHandle, Props>(function LiferGridMap(
  { listToken, resolutions, breaksByRes, selectedCells, onToggleCell, onResolutionChange, onViewportChange },
  handleRef
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);

  const listTokenRef = useRef(listToken);
  listTokenRef.current = listToken;
  const resolutionsRef = useRef(resolutions);
  resolutionsRef.current = resolutions;
  const breaksByResRef = useRef(breaksByRes);
  breaksByResRef.current = breaksByRes;
  const onToggleCellRef = useRef(onToggleCell);
  onToggleCellRef.current = onToggleCell;
  const onResolutionChangeRef = useRef(onResolutionChange);
  onResolutionChangeRef.current = onResolutionChange;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const currentResRef = useRef<number | null>(null);
  const gridReqIdRef = useRef(0);
  const lastResponseRef = useRef<GridResponse | null>(null);

  // --- Grid fetch (per settled viewport) -------------------------------------
  async function refreshGrid() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const b = map.getBounds();
    const bbox: Bbox = {
      minLng: Math.max(-180, b.getWest()),
      minLat: Math.max(-90, b.getSouth()),
      maxLng: Math.min(180, b.getEast()),
      maxLat: Math.min(90, b.getNorth()),
    };
    const resolution = resForZoom(map.getZoom(), resolutionsRef.current);
    if (resolution !== currentResRef.current) {
      currentResRef.current = resolution;
      onResolutionChangeRef.current(resolution);
    }
    onViewportChangeRef.current(bbox, resolution);

    const token = listTokenRef.current;
    if (!token) return;

    const reqId = ++gridReqIdRef.current;
    try {
      const res = (await mutate("POST", "/lifers/grid", { listToken: token, bbox, resolution })) as GridResponse;
      if (reqId !== gridReqIdRef.current) return; // stale
      lastResponseRef.current = res;
      renderGrid(map, res);
    } catch {
      /* transient — the next settled move retries */
    }
  }

  function renderGrid(map: maplibregl.Map, res: GridResponse) {
    const features: GeoJSON.Feature[] = res.cells.map((cell) => ({
      type: "Feature",
      id: cell.h3,
      geometry: { type: "Polygon", coordinates: [hexRing(cell.h3)] },
      properties: { h3: cell.h3, lifers: cell.lifers },
    }));
    (map.getSource("grid") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });
    applyScale(map, res.resolution);
    syncSelectedCells(map);
  }

  /**
   * Colour + opacity keyed directly on lifer count, using the worldwide quantile
   * breakpoints for the current resolution. Until the scale has loaded, paint a
   * quiet neutral — a placeholder ramp would flash everything bright red.
   */
  function applyScale(map: maplibregl.Map, resolution: number) {
    const breaks = breaksByResRef.current?.[resolution];
    if (!breaks) {
      map.setPaintProperty("grid-fill", "fill-color", "#94a3b8");
      map.setPaintProperty("grid-fill", "fill-opacity", [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0.85,
        0.12,
      ]);
      return;
    }
    const stops = quantileStops(breaks);
    const lo = stops[0] as number;
    const hi = stops[stops.length - 2] as number;
    map.setPaintProperty("grid-fill", "fill-color", [
      "interpolate",
      ["linear"],
      ["get", "lifers"],
      ...stops,
    ]);
    map.setPaintProperty("grid-fill", "fill-opacity", [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      0.85,
      ["==", ["get", "lifers"], 0],
      0.08,
      ["interpolate", ["linear"], ["get", "lifers"], lo, 0.4, hi, 0.78],
    ]);
  }

  const selectedCellsRef = useRef<string[]>([]);
  function syncSelectedCells(map: maplibregl.Map) {
    for (const id of selectedCellsRef.current) map.removeFeatureState({ source: "grid", id });
    for (const id of selectedCells) map.setFeatureState({ source: "grid", id }, { selected: true });
    selectedCellsRef.current = [...selectedCells];
  }

  // --- Bootstrap (once) ------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [0, 20],
      zoom: 1.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource("grid", { type: "geojson", data: emptyFc(), promoteId: "h3" });

      map.addLayer({
        id: "grid-fill",
        type: "fill",
        source: "grid",
        // Neutral placeholder paint; applyScale() sets the real quantile ramp
        // per render once the worldwide scale has loaded.
        paint: {
          "fill-color": "#94a3b8",
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.85, 0.12],
        },
      });
      map.addLayer({
        id: "grid-outline",
        type: "line",
        source: "grid",
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOR,
            "rgba(60,60,60,0.22)",
          ],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 0.4],
        },
      });

      map.on("click", "grid-fill", (e) => {
        const f = e.features?.[0];
        const h3 = f?.properties?.h3;
        if (h3 && currentResRef.current != null) {
          onToggleCellRef.current(String(h3), currentResRef.current);
        }
      });
      map.on("mouseenter", "grid-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "grid-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("moveend", () => void refreshGrid());
      void refreshGrid();
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch grid when the life list changes; clear it when the list is removed
  // (stale cells would otherwise linger and recolour wrongly).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (!listToken) {
      lastResponseRef.current = null;
      (map.getSource("grid") as maplibregl.GeoJSONSource | undefined)?.setData(emptyFc());
      return;
    }
    void refreshGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listToken]);

  // Recolour in place when the fixed scale arrives (no refetch).
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current && lastResponseRef.current) applyScale(map, lastResponseRef.current.resolution);
  }, [breaksByRes]);

  // Restyle selected hexes.
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) syncSelectedCells(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCells]);

  useImperativeHandle(handleRef, () => ({
    fitBounds(bbox: Bbox) {
      const map = mapRef.current;
      if (!map) return;
      map.fitBounds(
        [
          [bbox.minLng, bbox.minLat],
          [bbox.maxLng, bbox.maxLat],
        ],
        { padding: { top: 60, bottom: 60, left: 380, right: 60 }, duration: 800, maxZoom: 9 }
      );
    },
    flyTo(lng: number, lat: number) {
      const map = mapRef.current;
      if (!map) return;
      // Pan only — zooming would change the grid resolution and drop any hex
      // selection, wiping the very results the user just clicked.
      map.flyTo({ center: [lng, lat], duration: 800, essential: true });
    },
  }));

  return <div ref={containerRef} className="h-full w-full" />;
});

export default LiferGridMap;
