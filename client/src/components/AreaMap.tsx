import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./AreaMap.css";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type AreaMapProps = {
  onComplete: (polygon: [number, number][]) => void;
  onClear?: () => void;
  initialPolygon?: [number, number][] | null;
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// MapLibre doesn't support oklch, so we hardcode hex (emerald-600)
const MAP_COLOR = "#059669";


function updateMapSource(map: maplibregl.Map, vertices: [number, number][], closed: boolean) {
  const features: GeoJSON.Feature[] = [];

  for (const coord of vertices) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: {},
    });
  }

  if (vertices.length >= 2) {
    if (closed && vertices.length >= 3) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[...vertices, vertices[0]]],
        },
        properties: {},
      });
    } else {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: vertices,
        },
        properties: {},
      });
    }
  }

  (map.getSource("draw-polygon") as maplibregl.GeoJSONSource)?.setData({
    type: "FeatureCollection",
    features,
  });
}

function fitMapToPolygon(map: maplibregl.Map, polygon: [number, number][]) {
  const bounds = new maplibregl.LngLatBounds();
  for (const coord of polygon) {
    bounds.extend(coord as maplibregl.LngLatLike);
  }
  map.fitBounds(bounds, { padding: 40 });
}

export default function AreaMap({ onComplete, onClear, initialPolygon }: AreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const verticesRef = useRef<[number, number][]>([]);
  const isDrawingRef = useRef(true);
  const [isDrawing, setIsDrawing] = useState(true);
  const [vertexCount, setVertexCount] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!containerRef.current) return;

    const hasInitial = initialPolygon && initialPolygon.length >= 3;
    if (hasInitial) {
      verticesRef.current = [...initialPolygon];
      isDrawingRef.current = false;
      setIsDrawing(false);
      setVertexCount(initialPolygon.length);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [-85, 14],
      zoom: 1,
      doubleClickZoom: false,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      const attrib = containerRef.current?.querySelector(".maplibregl-ctrl-attrib");
      if (attrib) {
        attrib.classList.remove("maplibregl-compact-show");
        attrib.classList.add("attrib-ready");
      }
      map.addSource("draw-polygon", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "draw-polygon-fill",
        type: "fill",
        source: "draw-polygon",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": MAP_COLOR,
          "fill-opacity": 0.3,
        },
      });

      map.addLayer({
        id: "draw-polygon-line",
        type: "line",
        source: "draw-polygon",
        paint: {
          "line-color": MAP_COLOR,
          "line-width": 3,
        },
      });

      map.addLayer({
        id: "draw-polygon-vertices",
        type: "circle",
        source: "draw-polygon",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": MAP_COLOR,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      map.addSource("snap-line", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "snap-line",
        type: "line",
        source: "snap-line",
        paint: {
          "line-color": MAP_COLOR,
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });

      map.addSource("preview-fill", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "preview-fill",
        type: "fill",
        source: "preview-fill",
        paint: {
          "fill-color": MAP_COLOR,
          "fill-opacity": 0.2,
        },
      });

      map.addSource("cursor-dot", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "cursor-dot",
        type: "circle",
        source: "cursor-dot",
        paint: {
          "circle-radius": 5,
          "circle-color": MAP_COLOR,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      if (hasInitial) {
        updateMapSource(map, initialPolygon, true);
        fitMapToPolygon(map, initialPolygon);
      } else {
        map.getCanvas().style.cursor = "crosshair";
      }
    });

    map.on("click", (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      // Close polygon by clicking near the first vertex
      if (verticesRef.current.length >= 3) {
        const first = map.project(verticesRef.current[0] as maplibregl.LngLatLike);
        const click = e.point;
        const dist = Math.sqrt((first.x - click.x) ** 2 + (first.y - click.y) ** 2);
        if (dist < 15) {
          isDrawingRef.current = false;
          setIsDrawing(false);
          map.getCanvas().style.cursor = "";
          const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
          updateMapSource(map, verticesRef.current, true);
          (map.getSource("snap-line") as maplibregl.GeoJSONSource)?.setData(empty);
          (map.getSource("cursor-dot") as maplibregl.GeoJSONSource)?.setData(empty);
          (map.getSource("preview-fill") as maplibregl.GeoJSONSource)?.setData(empty);
          onCompleteRef.current(verticesRef.current);
          return;
        }
      }

      verticesRef.current.push(lngLat);
      setVertexCount(verticesRef.current.length);
      updateMapSource(map, verticesRef.current, false);
    });

    map.on("dblclick", (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;
      if (verticesRef.current.length < 3) return;
      e.preventDefault();
      isDrawingRef.current = false;
      setIsDrawing(false);
      map.getCanvas().style.cursor = "";
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      updateMapSource(map, verticesRef.current, true);
      (map.getSource("snap-line") as maplibregl.GeoJSONSource)?.setData(empty);
      (map.getSource("cursor-dot") as maplibregl.GeoJSONSource)?.setData(empty);
      (map.getSource("preview-fill") as maplibregl.GeoJSONSource)?.setData(empty);
      onCompleteRef.current(verticesRef.current);
    });

    map.on("mousemove", (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;
      const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const verts = verticesRef.current;
      const cursorDotSource = map.getSource("cursor-dot") as maplibregl.GeoJSONSource;
      const snapLineSource = map.getSource("snap-line") as maplibregl.GeoJSONSource;
      const previewFillSource = map.getSource("preview-fill") as maplibregl.GeoJSONSource;
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

      // Check if snapping to first vertex
      let snapping = false;
      if (verts.length >= 3) {
        const first = map.project(verts[0] as maplibregl.LngLatLike);
        const dist = Math.sqrt((first.x - e.point.x) ** 2 + (first.y - e.point.y) ** 2);
        snapping = dist < 15;
      }

      // Cursor dot: only show after first vertex is placed, hide when snapping
      if (verts.length === 0 || snapping) {
        cursorDotSource?.setData(empty);
      } else {
        cursorDotSource?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: cursor },
              properties: {},
            },
          ],
        });
      }

      // Snap line from last vertex to cursor (or to first vertex when snapping)
      if (verts.length === 0) {
        snapLineSource?.setData(empty);
      } else {
        const last = verts[verts.length - 1];
        const target = snapping ? verts[0] : cursor;
        snapLineSource?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: [last, target] },
              properties: {},
            },
          ],
        });
      }

      // Preview fill: show shaded polygon when 2+ vertices placed
      if (verts.length >= 2) {
        const target = snapping ? verts[0] : cursor;
        previewFillSource?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [[...verts, target, verts[0]]],
              },
              properties: {},
            },
          ],
        });
      } else {
        previewFillSource?.setData(empty);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = useCallback(() => {
    verticesRef.current = [];
    setVertexCount(0);
    isDrawingRef.current = true;
    setIsDrawing(true);
    onClear?.();
    if (mapRef.current) {
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      updateMapSource(mapRef.current, [], false);
      (mapRef.current.getSource("snap-line") as maplibregl.GeoJSONSource)?.setData(empty);
      (mapRef.current.getSource("cursor-dot") as maplibregl.GeoJSONSource)?.setData(empty);
      (mapRef.current.getSource("preview-fill") as maplibregl.GeoJSONSource)?.setData(empty);
      mapRef.current.getCanvas().style.cursor = "crosshair";
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="w-full rounded-md border border-slate-200 overflow-hidden"
        style={{ height: 300 }}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {isDrawing
            ? vertexCount === 0
              ? "Click map to start drawing"
              : vertexCount < 3
              ? "Click to add more points"
              : "Click first point or double-click to close"
            : "Area complete"}
        </p>
        {vertexCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-slate-500 hover:text-slate-700"
            onClick={handleClear}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
