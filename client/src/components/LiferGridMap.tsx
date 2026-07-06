import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl from "maplibre-gl";
import { cellToBoundary } from "h3-js";
import "maplibre-gl/dist/maplibre-gl.css";
import { mutate } from "@/lib/utils";
import { rampStops } from "@/lib/liferColors";

export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };
export type SpeciesPayload = { sciName: string; commonName: string }[];
export type GridHotspot = {
  id: string;
  name: string;
  subtitle?: string;
  lat: number;
  lng: number;
  lifers: number;
};

type GridResponse = {
  resolution: number;
  cells: { h3: string; lifers: number }[];
  maxLifers: number;
};

type Props = {
  species: SpeciesPayload;
  resolutions: number[];
  selectedCells: string[];
  hotspots: GridHotspot[];
  selectedHotspotId: string | null;
  hoveredHotspotId?: string | null;
  onToggleCell: (h3: string, resolution: number) => void;
  onResolutionChange: (resolution: number) => void;
  onSelectHotspot: (id: string | null) => void;
  onHoverHotspot?: (id: string | null) => void;
};

export type GridMapHandle = {
  fitBounds: (bbox: Bbox) => void;
  flyToHotspot: (id: string) => void;
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SELECTED_COLOR = "#f59e0b";

/** Finer H3 resolution as you zoom in, clamped to what the server actually has. */
function resForZoom(zoom: number, available: number[]): number {
  const sorted = [...available].sort((a, b) => a - b);
  if (sorted.length === 0) return 6;
  const idx = zoom < 4 ? 0 : zoom < 6 ? 1 : zoom < 8 ? 2 : 3;
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

const LiferGridMap = forwardRef<GridMapHandle, Props>(function LiferGridMap(
  {
    species,
    resolutions,
    selectedCells,
    hotspots,
    selectedHotspotId,
    hoveredHotspotId,
    onToggleCell,
    onResolutionChange,
    onSelectHotspot,
    onHoverHotspot,
  },
  handleRef
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Latest props readable from stable map handlers.
  const speciesRef = useRef(species);
  speciesRef.current = species;
  const resolutionsRef = useRef(resolutions);
  resolutionsRef.current = resolutions;
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  const onToggleCellRef = useRef(onToggleCell);
  onToggleCellRef.current = onToggleCell;
  const onResolutionChangeRef = useRef(onResolutionChange);
  onResolutionChangeRef.current = onResolutionChange;
  const onSelectHotspotRef = useRef(onSelectHotspot);
  onSelectHotspotRef.current = onSelectHotspot;
  const onHoverHotspotRef = useRef(onHoverHotspot);
  onHoverHotspotRef.current = onHoverHotspot;

  const currentResRef = useRef<number | null>(null);
  const gridReqIdRef = useRef(0);

  // --- Grid fetch (per settled viewport) -------------------------------------
  async function refreshGrid() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const spp = speciesRef.current;
    if (!spp.length) return;

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

    const reqId = ++gridReqIdRef.current;
    try {
      const res = (await mutate("POST", "/lifers/grid", {
        species: spp,
        bbox,
        resolution,
      })) as GridResponse;
      // Ignore stale responses (user kept panning).
      if (reqId !== gridReqIdRef.current) return;
      renderGrid(map, res);
    } catch {
      /* transient — the next settled move will retry */
    }
  }

  function renderGrid(map: maplibregl.Map, res: GridResponse) {
    const max = Math.max(1, res.maxLifers);
    const features: GeoJSON.Feature[] = res.cells.map((cell) => ({
      type: "Feature",
      id: cell.h3,
      geometry: { type: "Polygon", coordinates: [hexRing(cell.h3)] },
      properties: { h3: cell.h3, lifers: cell.lifers, t: cell.lifers / max },
    }));
    (map.getSource("grid") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });
    syncSelectedCells(map);
  }

  function renderHotspots(map: maplibregl.Map) {
    const list = hotspotsRef.current;
    const max = Math.max(1, ...list.map((h) => h.lifers));
    const features: GeoJSON.Feature[] = list.map((h) => ({
      type: "Feature",
      id: h.id,
      geometry: { type: "Point", coordinates: [h.lng, h.lat] },
      properties: {
        id: h.id,
        name: h.name,
        subtitle: h.subtitle ?? "",
        lifers: h.lifers,
        r: 7 + Math.sqrt(h.lifers / max) * 12,
      },
    }));
    (map.getSource("hotspots") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });
  }

  // --- selected hex feature-state --------------------------------------------
  const selectedCellsRef = useRef<string[]>([]);
  function syncSelectedCells(map: maplibregl.Map) {
    for (const id of selectedCellsRef.current) {
      map.removeFeatureState({ source: "grid", id });
    }
    for (const id of selectedCells) {
      map.setFeatureState({ source: "grid", id }, { selected: true });
    }
    selectedCellsRef.current = [...selectedCells];
  }

  const hotspotStateRef = useRef<{ selected: string | null; hovered: string | null }>({
    selected: null,
    hovered: null,
  });
  function syncHotspotState(map: maplibregl.Map) {
    const prev = hotspotStateRef.current;
    for (const id of [prev.selected, prev.hovered]) {
      if (id) map.removeFeatureState({ source: "hotspots", id });
    }
    if (selectedHotspotId) map.setFeatureState({ source: "hotspots", id: selectedHotspotId }, { selected: true });
    if (hoveredHotspotId && hoveredHotspotId !== selectedHotspotId) {
      map.setFeatureState({ source: "hotspots", id: hoveredHotspotId }, { hover: true });
    }
    hotspotStateRef.current = { selected: selectedHotspotId, hovered: hoveredHotspotId ?? null };
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

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      maxWidth: "280px",
      className: "lifer-map-popup",
    });
    popupRef.current = popup;

    map.on("load", () => {
      loadedRef.current = true;

      map.addSource("grid", { type: "geojson", data: emptyFc(), promoteId: "h3" });
      map.addSource("hotspots", { type: "geojson", data: emptyFc(), promoteId: "id" });

      map.addLayer({
        id: "grid-fill",
        type: "fill",
        source: "grid",
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "t"], ...rampStops()],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.85,
            ["==", ["get", "lifers"], 0],
            0.08,
            ["+", 0.32, ["*", 0.4, ["get", "t"]]],
          ],
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

      map.addLayer({
        id: "hotspots-circles",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": "#065f46",
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            ["boolean", ["feature-state", "hover"], false],
            0.95,
            0.85,
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            ["boolean", ["feature-state", "hover"], false],
            2,
            1.5,
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOR,
            "#ffffff",
          ],
        },
      });
      map.addLayer({
        id: "hotspots-labels",
        type: "symbol",
        source: "hotspots",
        layout: {
          "text-field": ["to-string", ["get", "lifers"]],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#064e3b",
          "text-halo-width": 1,
        },
      });

      // Click a hex → toggle it into the selection at the current resolution.
      map.on("click", "grid-fill", (e) => {
        const f = e.features?.[0];
        const h3 = f?.properties?.h3;
        if (h3 && currentResRef.current != null) {
          e.preventDefault();
          onToggleCellRef.current(String(h3), currentResRef.current);
        }
      });

      // Hotspot interactions.
      map.on("click", "hotspots-circles", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.id) {
          e.preventDefault();
          onSelectHotspotRef.current(String(f.properties.id));
        }
      });
      map.on("mousemove", "hotspots-circles", (e) => {
        const f = e.features?.[0];
        if (!f?.properties?.id) return;
        map.getCanvas().style.cursor = "pointer";
        onHoverHotspotRef.current?.(String(f.properties.id));
        const name = String(f.properties.name ?? "");
        const subtitle = String(f.properties.subtitle ?? "");
        const lifers = Number(f.properties.lifers ?? 0);
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="text-[13px] font-semibold text-slate-800 leading-tight">${escapeHtml(name)}</div>` +
              (subtitle
                ? `<div class="text-[11px] text-slate-500 leading-tight mt-0.5">${escapeHtml(subtitle)}</div>`
                : "") +
              `<div class="text-[12px] font-bold text-emerald-700 mt-1">${lifers.toLocaleString()} potential lifers</div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "hotspots-circles", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
        onHoverHotspotRef.current?.(null);
      });

      map.on("mouseenter", "grid-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "grid-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      // Click empty map → drop the hotspot selection (hex stays until cleared).
      map.on("click", (e) => {
        if (e.defaultPrevented) return;
        onSelectHotspotRef.current(null);
      });

      // Refetch the grid whenever the viewport settles.
      map.on("moveend", () => void refreshGrid());

      void refreshGrid();
      renderHotspots(map);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch grid when the life list changes.
  useEffect(() => {
    if (loadedRef.current) void refreshGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species]);

  // Push hotspot markers when results change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    renderHotspots(map);
    syncHotspotState(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotspots]);

  // Restyle selected hexes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    syncSelectedCells(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCells]);

  // Restyle selected/hovered hotspot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    syncHotspotState(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotspotId, hoveredHotspotId]);

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
    flyToHotspot(id: string) {
      const map = mapRef.current;
      const h = hotspotsRef.current.find((x) => x.id === id);
      if (!map || !h) return;
      map.flyTo({ center: [h.lng, h.lat], zoom: Math.max(map.getZoom(), 10), duration: 800, essential: true });
    },
  }));

  return <div ref={containerRef} className="h-full w-full" />;
});

export default LiferGridMap;
