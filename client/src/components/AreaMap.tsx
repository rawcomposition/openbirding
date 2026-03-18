import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./AreaMap.css";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2 } from "lucide-react";

type AreaMapProps = {
  onComplete: (polygon: [number, number][]) => void;
  onClear?: () => void;
  onRequestClose?: () => void;
  initialPolygon?: [number, number][] | null;
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// MapLibre doesn't support oklch, so we hardcode hex (emerald-600)
const MAP_COLOR = "#059669";
const DEFAULT_VERTEX_RADIUS = 6;
const COARSE_VERTEX_RADIUS = 9;
const DEFAULT_CLOSE_TOLERANCE = 18;
const COARSE_CLOSE_TOLERANCE = 30;

function updateMapSource(
  map: maplibregl.Map,
  vertices: [number, number][],
  closed: boolean,
) {
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

function updateAuxiliarySource(map: maplibregl.Map, sourceId: string, data: GeoJSON.FeatureCollection) {
  (map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined)?.setData(data);
}

function clearAuxiliarySources(map: maplibregl.Map) {
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  updateAuxiliarySource(map, "snap-line", empty);
  updateAuxiliarySource(map, "cursor-dot", empty);
  updateAuxiliarySource(map, "preview-fill", empty);
}

function updatePreview(
  map: maplibregl.Map,
  vertices: [number, number][],
  cursor: [number, number],
  point: { x: number; y: number },
  closeTolerance: number,
) {
  const cursorDotSource = map.getSource("cursor-dot") as maplibregl.GeoJSONSource | undefined;
  const snapLineSource = map.getSource("snap-line") as maplibregl.GeoJSONSource | undefined;
  const previewFillSource = map.getSource("preview-fill") as maplibregl.GeoJSONSource | undefined;
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

  let snapping = false;
  if (vertices.length >= 3) {
    const first = map.project(vertices[0] as maplibregl.LngLatLike);
    const dist = Math.sqrt((first.x - point.x) ** 2 + (first.y - point.y) ** 2);
    snapping = dist < closeTolerance;
  }

  if (vertices.length === 0 || snapping) {
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

  if (vertices.length === 0) {
    snapLineSource?.setData(empty);
  } else {
    const last = vertices[vertices.length - 1];
    const target = snapping ? vertices[0] : cursor;
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

  if (vertices.length >= 2) {
    const target = snapping ? vertices[0] : cursor;
    previewFillSource?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[...vertices, target, vertices[0]]],
          },
          properties: {},
        },
      ],
    });
  } else {
    previewFillSource?.setData(empty);
  }
}

function fitMapToPolygon(map: maplibregl.Map, polygon: [number, number][]) {
  const bounds = new maplibregl.LngLatBounds();
  for (const coord of polygon) {
    bounds.extend(coord as maplibregl.LngLatLike);
  }
  map.fitBounds(bounds, { padding: 40 });
}

export default function AreaMap({ onComplete, onClear, onRequestClose, initialPolygon }: AreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const verticesRef = useRef<[number, number][]>([]);
  const isDrawingRef = useRef(true);
  const [isDrawing, setIsDrawing] = useState(true);
  const [vertexCount, setVertexCount] = useState(0);
  const isCoarsePointer = useRef(
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  ).current;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!containerRef.current) return;

    const hasInitial = initialPolygon && initialPolygon.length >= 3;
    const closeTolerance = isCoarsePointer ? COARSE_CLOSE_TOLERANCE : DEFAULT_CLOSE_TOLERANCE;
    const vertexRadius = isCoarsePointer ? COARSE_VERTEX_RADIUS : DEFAULT_VERTEX_RADIUS;

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

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
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
          "circle-radius": vertexRadius,
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
          "circle-radius": vertexRadius,
          "circle-color": MAP_COLOR,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      if (hasInitial) {
        updateMapSource(map, initialPolygon, true);
        fitMapToPolygon(map, initialPolygon);
      } else if (!isCoarsePointer) {
        map.getCanvas().style.cursor = "crosshair";
      }
    });

    const finishDrawing = () => {
      if (!isDrawingRef.current || verticesRef.current.length < 3) return;

      isDrawingRef.current = false;
      setIsDrawing(false);
      map.getCanvas().style.cursor = "";
      updateMapSource(map, verticesRef.current, true);
      clearAuxiliarySources(map);
      onCompleteRef.current(verticesRef.current);
    };

    map.on("click", (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      // Close polygon by clicking near the first vertex
      if (verticesRef.current.length >= 3) {
        const first = map.project(verticesRef.current[0] as maplibregl.LngLatLike);
        const click = e.point;
        const dist = Math.sqrt((first.x - click.x) ** 2 + (first.y - click.y) ** 2);
        if (dist < closeTolerance) {
          finishDrawing();
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
      finishDrawing();
    });

    map.on("mousemove", (e: maplibregl.MapMouseEvent) => {
      if (!isDrawingRef.current) return;
      updatePreview(
        map,
        verticesRef.current,
        [e.lngLat.lng, e.lngLat.lat],
        { x: e.point.x, y: e.point.y },
        closeTolerance,
      );
    });

    map.on("touchmove", (e: maplibregl.MapTouchEvent) => {
      if (!isDrawingRef.current || e.points.length !== 1) return;
      updatePreview(
        map,
        verticesRef.current,
        [e.lngLat.lng, e.lngLat.lat],
        { x: e.point.x, y: e.point.y },
        closeTolerance,
      );
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
    onRequestClose?.();
    if (mapRef.current) {
      updateMapSource(mapRef.current, [], false);
      clearAuxiliarySources(mapRef.current);
      mapRef.current.getCanvas().style.cursor = isCoarsePointer ? "" : "crosshair";
    }
  }, [isCoarsePointer, onClear, onRequestClose]);

  const handleUndo = useCallback(() => {
    if (!isDrawingRef.current || verticesRef.current.length === 0) return;

    verticesRef.current = verticesRef.current.slice(0, -1);
    setVertexCount(verticesRef.current.length);

    if (mapRef.current) {
      updateMapSource(mapRef.current, verticesRef.current, false);
      clearAuxiliarySources(mapRef.current);
      if (!isCoarsePointer) {
        mapRef.current.getCanvas().style.cursor = "crosshair";
      }
    }
  }, [isCoarsePointer]);

  const handleFinish = useCallback(() => {
    if (!mapRef.current || !isDrawingRef.current || verticesRef.current.length < 3) return;

    isDrawingRef.current = false;
    setIsDrawing(false);
    mapRef.current.getCanvas().style.cursor = "";
    updateMapSource(mapRef.current, verticesRef.current, true);
    clearAuxiliarySources(mapRef.current);
    onCompleteRef.current(verticesRef.current);
  }, []);

  const handleClose = useCallback(() => {
    onRequestClose?.();
  }, [onRequestClose]);

  const instructionText = isDrawing
    ? vertexCount === 0
      ? "Tap or click the map to start drawing"
      : vertexCount < 3
      ? "Add at least three points to define an area"
      : "Tap the first point or use Finish area"
    : "Area complete";

  const canFinish = isDrawing && vertexCount >= 3;
  const canUndo = isDrawing && vertexCount > 0;
  const showMobileControls = isCoarsePointer;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="h-[320px] w-full overflow-hidden rounded-md border border-slate-200 sm:h-[300px]"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {!showMobileControls && (
          <p className="text-xs leading-5 text-slate-500">{instructionText}</p>
        )}
        {showMobileControls ? (
          <div
            className={`flex items-center rounded-md border border-slate-200 bg-slate-50/80 p-2 ${
              vertexCount > 0 ? "justify-between" : "justify-end"
            }`}
          >
            <div className="flex items-center gap-2">
              {canUndo && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-sm text-slate-600 hover:bg-white hover:text-slate-900"
                  onClick={handleUndo}
                  aria-label="Undo last point"
                  title="Undo last point"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
              {vertexCount > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-sm text-slate-500 hover:bg-white hover:text-slate-900"
                  onClick={handleClear}
                  aria-label="Delete area"
                  title="Delete area"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isDrawing ? (
                <Button
                  variant="primary"
                  className="h-9 rounded-sm px-4 text-sm"
                  disabled={!canFinish}
                  onClick={handleFinish}
                >
                  Finish area
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-sm px-4 text-sm"
                onClick={handleClose}
              >
                Close
              </Button>
            </div>
          </div>
        ) : vertexCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-slate-500 hover:text-slate-700"
            onClick={handleClear}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
