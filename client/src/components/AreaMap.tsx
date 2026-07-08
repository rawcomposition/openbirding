import { useRef, useEffect, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./AreaMap.css";
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  TerraDrawModeUndoRedo,
  type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2 } from "lucide-react";

type AreaMapProps = {
  onComplete: (polygon: [number, number][]) => void;
  onClear?: () => void;
  onRequestClose?: () => void;
  initialPolygon?: [number, number][] | null;
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// MapLibre doesn't support oklch, so we hardcode hex (brand green, emerald-600)
const MAP_COLOR = "#2e7d55";
const DEFAULT_VERTEX_RADIUS = 6;
const COARSE_VERTEX_RADIUS = 9;

function polygonFromFeature(
  feature: GeoJSONStoreFeatures,
): [number, number][] | null {
  if (feature.geometry.type !== "Polygon") return null;
  const ring = feature.geometry.coordinates[0];
  if (!ring || ring.length < 4) return null;
  return ring.slice(0, -1).map((c) => [c[0], c[1]] as [number, number]);
}

function countRingVertices(ring: GeoJSON.Position[]): number {
  if (ring.length < 2) return ring.length;
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  return closed ? ring.length - 1 : ring.length;
}

export default function AreaMap({
  onComplete,
  onClear,
  onRequestClose,
  initialPolygon,
}: AreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const isCoarsePointer = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
  ).current;

  const hasInitial = !!initialPolygon && initialPolygon.length >= 3;
  const [mode, setMode] = useState<"polygon" | "select">(
    hasInitial ? "select" : "polygon",
  );
  const [vertexCount, setVertexCount] = useState(
    hasInitial ? (initialPolygon?.length ?? 0) : 0,
  );
  const [canUndo, setCanUndo] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!containerRef.current) return;

    const vertexRadius = isCoarsePointer
      ? COARSE_VERTEX_RADIUS
      : DEFAULT_VERTEX_RADIUS;
    const midPointRadius = isCoarsePointer ? 7 : 5;

    const initialBounds = hasInitial && initialPolygon
      ? initialPolygon.reduce(
          (b, coord) => b.extend(coord as maplibregl.LngLatLike),
          new maplibregl.LngLatBounds(),
        )
      : null;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      ...(initialBounds
        ? { bounds: initialBounds, fitBoundsOptions: { padding: 40 } }
        : { center: [-85, 14], zoom: 1 }),
      doubleClickZoom: false,
      attributionControl: false,
    });

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;

    map.on("load", () => {
      const attrib = containerRef.current?.querySelector(
        ".maplibregl-ctrl-attrib",
      );
      if (attrib) {
        attrib.classList.remove("maplibregl-compact-show");
        attrib.classList.add("attrib-ready");
      }

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode({
            editable: true,
            showCoordinatePoints: true,
            styles: {
              fillColor: MAP_COLOR,
              fillOpacity: 0.3,
              outlineColor: MAP_COLOR,
              outlineWidth: 3,
              closingPointColor: MAP_COLOR,
              closingPointWidth: vertexRadius,
              closingPointOutlineColor: "#ffffff",
              closingPointOutlineWidth: 2,
              coordinatePointColor: MAP_COLOR,
              coordinatePointWidth: vertexRadius,
              coordinatePointOutlineColor: "#ffffff",
              coordinatePointOutlineWidth: 2,
              editedPointColor: MAP_COLOR,
              editedPointWidth: vertexRadius + 1,
              editedPointOutlineColor: "#ffffff",
              editedPointOutlineWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            allowManualDeselection: false,
            flags: {
              polygon: {
                feature: {
                  draggable: false,
                  coordinates: {
                    draggable: true,
                    midpoints: { draggable: true },
                    deletable: true,
                  },
                },
              },
            },
            styles: {
              selectedPolygonColor: MAP_COLOR,
              selectedPolygonFillOpacity: 0.3,
              selectedPolygonOutlineColor: MAP_COLOR,
              selectedPolygonOutlineWidth: 3,
              selectionPointColor: MAP_COLOR,
              selectionPointWidth: vertexRadius,
              selectionPointOutlineColor: "#ffffff",
              selectionPointOutlineWidth: 2,
              midPointColor: MAP_COLOR,
              midPointOutlineColor: "#ffffff",
              midPointWidth: midPointRadius,
              midPointOutlineWidth: 2,
              midPointOpacity: 0.6,
            },
          }),
        ],
        undoRedo: { modeLevel: new TerraDrawModeUndoRedo() },
      });
      draw.start();
      drawRef.current = draw;

      const syncState = () => {
        const snapshot = draw.getSnapshot();
        const polygonFeature = snapshot.find(
          (f) => f.geometry.type === "Polygon",
        );
        if (polygonFeature) {
          const ring = (polygonFeature.geometry as GeoJSON.Polygon)
            .coordinates[0];
          setVertexCount(countRingVertices(ring));
        } else {
          setVertexCount(0);
        }
        setCanUndo(draw.canUndo());
        setMode(draw.getMode() === "select" ? "select" : "polygon");
      };

      draw.on("change", syncState);

      draw.on("finish", (_id, context) => {
        const snapshot = draw.getSnapshot();
        const polygonFeature = snapshot.find(
          (f) => f.geometry.type === "Polygon",
        );
        if (!polygonFeature) return;
        const polygon = polygonFromFeature(polygonFeature);
        if (!polygon) return;

        onCompleteRef.current(polygon);

        if (context.action === "draw" && polygonFeature.id !== undefined) {
          draw.setMode("select");
          draw.selectFeature(polygonFeature.id);
        }
      });

      if (hasInitial && initialPolygon) {
        const ring = [...initialPolygon, initialPolygon[0]];
        const result = draw.addFeatures([
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: { mode: "polygon" },
          },
        ]);
        const added = result.find((r) => r.valid && r.id !== undefined);
        if (added?.id !== undefined) {
          draw.setMode("select");
          draw.selectFeature(added.id);
        }
      } else {
        draw.setMode("polygon");
      }
      syncState();
    });

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.clear();
    draw.setMode("polygon");
    setMode("polygon");
    setVertexCount(0);
    setCanUndo(false);
    onClear?.();
  }, [onClear]);

  const handleUndo = useCallback(() => {
    drawRef.current?.undo();
  }, []);

  const handleClose = useCallback(() => {
    onRequestClose?.();
  }, [onRequestClose]);

  const instructionText = (() => {
    if (mode === "select") {
      return "Drag points to adjust area";
    }
    if (vertexCount === 0) return "Tap or click the map to start drawing";
    if (vertexCount < 3) return "Add at least three points · drag a point to adjust";
    return "Double-click to finish";
  })();

  const showMobileControls = isCoarsePointer;
  const showUndo = mode === "polygon" && canUndo;
  const showClear = vertexCount > 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="area-map h-[320px] w-full overflow-hidden rounded-md border border-slate-200 sm:h-[420px]"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">{instructionText}</p>
        {showMobileControls ? (
          <div
            className={`flex items-center rounded-md border border-slate-200 bg-slate-50/80 p-2 ${
              showUndo || showClear ? "justify-between" : "justify-end"
            }`}
          >
            <div className="flex items-center gap-2">
              {showUndo && (
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
              {showClear && (
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
        ) : (
          <div className="flex items-center gap-2">
            {showUndo && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-slate-500 hover:text-slate-700"
                onClick={handleUndo}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Undo
              </Button>
            )}
            {showClear && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-slate-500 hover:text-slate-700"
                onClick={handleClear}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
