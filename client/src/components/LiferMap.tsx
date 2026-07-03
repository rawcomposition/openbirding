import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type LiferMapPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lifers: number;
};

type Props = {
  points: LiferMapPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const MAP_GREEN = "#2e7d55";

export default function LiferMap({ points, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Init map once.
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

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource("lifers", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "lifers-circles",
        type: "circle",
        source: "lifers",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "lifers"], 0, 5, 300, 22],
          "circle-color": MAP_GREEN,
          "circle-opacity": 0.75,
          "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 3, 1],
          "circle-stroke-color": ["case", ["boolean", ["get", "selected"], false], "#f59e0b", "#ffffff"],
        },
      });
      map.addLayer({
        id: "lifers-labels",
        type: "symbol",
        source: "lifers",
        layout: {
          "text-field": ["to-string", ["get", "lifers"]],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-allow-overlap": false,
        },
        paint: { "text-color": "#ffffff", "text-halo-color": MAP_GREEN, "text-halo-width": 1 },
      });

      map.on("click", "lifers-circles", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.id) onSelectRef.current(String(f.properties.id));
      });
      map.on("mouseenter", "lifers-circles", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "lifers-circles", () => (map.getCanvas().style.cursor = ""));

      updateData();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push data + fit bounds when points change.
  useEffect(() => {
    updateData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Restyle selection without refitting.
  useEffect(() => {
    updateData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function emptyFc(): GeoJSON.FeatureCollection {
    return { type: "FeatureCollection", features: [] };
  }

  function updateData(fit = false) {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource("lifers") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { id: p.id, name: p.name, lifers: p.lifers, selected: p.id === selectedId },
      })),
    };
    source.setData(fc);

    if (fit && points.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const p of points) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 48, maxZoom: 8, duration: 600 });
    }
  }

  // Fly to selected marker when it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const p = points.find((x) => x.id === selectedId);
    if (p) map.easeTo({ center: [p.lng, p.lat], duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
