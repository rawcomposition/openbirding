import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type AreaMapProps = {
  onComplete: (polygon: [number, number][]) => void;
  initialPolygon?: [number, number][] | null;
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

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

export default function AreaMap({ onComplete, initialPolygon }: AreaMapProps) {
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
      center: [0, 20],
      zoom: 1.5,
      doubleClickZoom: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
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
          "fill-color": "#10b981",
          "fill-opacity": 0.15,
        },
      });

      map.addLayer({
        id: "draw-polygon-line",
        type: "line",
        source: "draw-polygon",
        paint: {
          "line-color": "#10b981",
          "line-width": 2,
        },
      });

      map.addLayer({
        id: "draw-polygon-vertices",
        type: "circle",
        source: "draw-polygon",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#10b981",
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
      updateMapSource(map, verticesRef.current, true);
      onCompleteRef.current(verticesRef.current);
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
    if (mapRef.current) {
      updateMapSource(mapRef.current, [], false);
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
                : "Double-click to close polygon"
            : "Polygon complete"}
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
