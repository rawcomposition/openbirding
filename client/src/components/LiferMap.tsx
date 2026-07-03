import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { cellToBoundary } from "h3-js";
import "maplibre-gl/dist/maplibre-gl.css";

export type LiferMapItem = {
  id: string;
  name: string;
  subtitle?: string;
  lat: number;
  lng: number;
  lifers: number;
  /** H3 cell index (hex string). When present the item renders as a hexagon. */
  h3?: string;
};

type Props = {
  items: LiferMapItem[];
  selectedId: string | null;
  hoveredId?: string | null;
  /** `fromMap` is true when the user clicked the feature on the map itself. */
  onSelect: (id: string | null, fromMap: boolean) => void;
  onHover?: (id: string | null) => void;
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SELECTED_COLOR = "#f59e0b";

/** Sequential green ramp: 0 (few lifers) -> 1 (most lifers in the result set). */
function rampColor(t: number): string {
  const lightness = 58 - t * 34; // 58% -> 24%
  const saturation = 52 + t * 24; // 52% -> 76%
  return `hsl(155, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%)`;
}

/**
 * Hexagon boundary as a GeoJSON ring, unwrapped so cells crossing the
 * antimeridian don't smear across the whole map.
 */
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

export type LiferMapHandle = {
  /** Ease/zoom to an item — used when a selection originates from the list. */
  flyTo: (id: string) => void;
};

const LiferMap = forwardRef<LiferMapHandle, Props>(function LiferMap(
  { items, selectedId, hoveredId, onSelect, onHover }: Props,
  handleRef
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Latest props, readable from map event handlers without re-binding them.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  const maxLifers = useMemo(() => Math.max(1, ...items.map((i) => i.lifers)), [items]);

  // A stable signature of the result set: refit the viewport only when the
  // actual set of places changes, not on selection/hover restyles.
  const setSignature = useMemo(() => items.map((i) => i.id).join("|"), [items]);

  // --- Map bootstrap (once) --------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [0, 20],
      zoom: 1.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
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

      map.addSource("lifer-zones", { type: "geojson", data: emptyFc(), promoteId: "id" });
      map.addSource("lifer-points", { type: "geojson", data: emptyFc(), promoteId: "id" });

      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "lifer-zones",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.72,
            ["boolean", ["feature-state", "hover"], false],
            0.6,
            0.42,
          ],
        },
      });
      map.addLayer({
        id: "zones-outline",
        type: "line",
        source: "lifer-zones",
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOR,
            ["get", "color"],
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            ["boolean", ["feature-state", "hover"], false],
            2,
            1,
          ],
        },
      });

      // Res-6 hexes are sub-pixel below ~z6, so zones also get center circles
      // that fade out as the hexagons become legible.
      map.addLayer({
        id: "zones-circles",
        type: "circle",
        source: "lifer-points",
        filter: ["get", "isZoneCenter"],
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": ["get", "color"],
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 6.5, 0.8, 8, 0],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            ["boolean", ["feature-state", "hover"], false],
            2,
            1,
          ],
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOR,
            "#ffffff",
          ],
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 6.5, 1, 8, 0],
        },
      });

      map.addLayer({
        id: "points-circles",
        type: "circle",
        source: "lifer-points",
        filter: ["!", ["get", "isZoneCenter"]],
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": ["get", "color"],
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.95,
            ["boolean", ["feature-state", "hover"], false],
            0.9,
            0.8,
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            ["boolean", ["feature-state", "hover"], false],
            2,
            1,
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
        id: "points-labels",
        type: "symbol",
        source: "lifer-points",
        layout: {
          "text-field": ["to-string", ["get", "lifers"]],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#1f2937",
          "text-halo-width": 1,
        },
      });

      // Interactions are shared by all representations.
      for (const layer of ["zones-fill", "zones-circles", "points-circles"]) {
        map.on("click", layer, (e) => {
          const f = e.features?.[0];
          if (f?.properties?.id) {
            e.preventDefault();
            onSelectRef.current(String(f.properties.id), true);
          }
        });
        map.on("mousemove", layer, (e) => {
          const f = e.features?.[0];
          if (!f?.properties?.id) return;
          map.getCanvas().style.cursor = "pointer";
          const item = itemsRef.current.find((i) => i.id === String(f.properties.id));
          if (item) {
            onHoverRef.current?.(item.id);
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<div class="text-[13px] font-semibold text-slate-800 leading-tight">${escapeHtml(item.name)}</div>` +
                  (item.subtitle
                    ? `<div class="text-[11px] text-slate-500 leading-tight mt-0.5">${escapeHtml(item.subtitle)}</div>`
                    : "") +
                  `<div class="text-[12px] font-bold text-emerald-700 mt-1">${item.lifers.toLocaleString()} potential lifers</div>`
              )
              .addTo(map);
          }
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
          onHoverRef.current?.(null);
        });
      }

      // Clicking empty map clears the selection.
      map.on("click", (e) => {
        if (e.defaultPrevented) return;
        onSelectRef.current(null, true);
      });

      syncData(map);
      syncFeatureState(map);
      fitToItems(map, itemsRef.current, false);
    });

    // The container can mount mid-layout (e.g. a grid still settling); keep the
    // canvas sized to it or tiles render at a stale size.
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

  function emptyFc(): GeoJSON.FeatureCollection {
    return { type: "FeatureCollection", features: [] };
  }

  function syncData(map: maplibregl.Map) {
    const current = itemsRef.current;
    const max = Math.max(1, ...current.map((i) => i.lifers));

    const zoneFeatures: GeoJSON.Feature[] = [];
    const pointFeatures: GeoJSON.Feature[] = [];
    for (const item of current) {
      const t = item.lifers / max;
      const color = rampColor(t);
      if (item.h3) {
        const ring = hexRing(item.h3);
        zoneFeatures.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [ring] },
          properties: { id: item.id, color },
        });
        // Zone lifer counts are labelled at the cell center; the same point
        // backs the zoomed-out circle representation.
        pointFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [item.lng, item.lat] },
          properties: {
            id: item.id,
            lifers: item.lifers,
            color,
            isZoneCenter: true,
            r: 7 + Math.sqrt(t) * 11,
          },
        });
      } else {
        pointFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [item.lng, item.lat] },
          properties: {
            id: item.id,
            lifers: item.lifers,
            color,
            isZoneCenter: false,
            r: 7 + Math.sqrt(t) * 11,
          },
        });
      }
    }

    (map.getSource("lifer-zones") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: zoneFeatures,
    });
    (map.getSource("lifer-points") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: pointFeatures,
    });
  }

  const stateRef = useRef<{ selected: string | null; hovered: string | null }>({ selected: null, hovered: null });

  function syncFeatureState(map: maplibregl.Map) {
    const prev = stateRef.current;
    const next = { selected: selectedId, hovered: hoveredId ?? null };
    for (const source of ["lifer-zones", "lifer-points"]) {
      for (const id of [prev.selected, prev.hovered]) {
        if (id) map.removeFeatureState({ source, id });
      }
      if (next.selected) map.setFeatureState({ source, id: next.selected }, { selected: true });
      if (next.hovered && next.hovered !== next.selected) {
        map.setFeatureState({ source, id: next.hovered }, { hover: true });
      }
    }
    stateRef.current = next;
  }

  function fitToItems(map: maplibregl.Map, current: LiferMapItem[], animate: boolean) {
    if (current.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const item of current) bounds.extend([item.lng, item.lat]);
    map.fitBounds(bounds, {
      padding: { top: 56, bottom: 40, left: 40, right: 56 },
      maxZoom: current[0]?.h3 ? 7.5 : 9,
      duration: animate ? 700 : 0,
    });
  }

  // Data + viewport when the result set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    syncData(map);
    syncFeatureState(map);
    fitToItems(map, itemsRef.current, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSignature, maxLifers]);

  // Selection / hover restyle (no refit).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    syncFeatureState(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, hoveredId]);

  useImperativeHandle(handleRef, () => ({
    flyTo(id: string) {
      const map = mapRef.current;
      const item = itemsRef.current.find((i) => i.id === id);
      if (!map || !item) return;
      map.flyTo({
        center: [item.lng, item.lat],
        zoom: Math.max(map.getZoom(), item.h3 ? 9.5 : 10),
        duration: 900,
        essential: true,
      });
    },
  }));

  return <div ref={containerRef} className="h-full w-full" />;
});

export default LiferMap;
