import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Spinner from "@/components/ui/spinner";
import { useModalStore } from "@/lib/modalStore";

const MIN_ZOOM = 7;

export type HotspotsResponse = {
  hotspots: {
    id: string;
    lat: number;
    lng: number;
    open: boolean;
  }[];
  count: number;
};

const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [bounds, setBounds] = useState<string | null>(null);
  const [isZoomedTooFarOut, setIsZoomedTooFarOut] = useState(false);
  const { openModal, closeModal } = useModalStore();
  const [searchParams] = useSearchParams();

  const getStoredMapState = () => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("mapState");
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  };

  const storeMapState = (center: [number, number], zoom: number) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("mapState", JSON.stringify({ center, zoom }));
  };

  const {
    data: hotspotsData,
    refetch,
    isLoading,
    error,
  } = useQuery<HotspotsResponse>({
    queryKey: ["/hotspots/within-bounds", { bounds }],
    enabled: !!bounds && !isZoomedTooFarOut,
    staleTime: 5 * 60 * 1000,
  });

  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  }, []);

  useEffect(() => {
    const mapboxKey = import.meta.env.VITE_MAPBOX_KEY;

    if (!mapboxKey) {
      console.error("Mapbox API key not found. Please add VITE_MAPBOX_KEY to your .env file.");
      return;
    }

    if (map.current) return;

    mapboxgl.accessToken = mapboxKey;

    const storedState = getStoredMapState();
    const defaultCenter: [number, number] = [-98, 39];
    const defaultZoom = 4;

    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const zoomParam = searchParams.get("zoom");

    let initialCenter: [number, number] = defaultCenter;
    let initialZoom = defaultZoom;

    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      if (!isNaN(lat) && !isNaN(lng)) {
        initialCenter = [lng, lat];
        if (zoomParam) {
          const zoom = parseFloat(zoomParam);
          if (!isNaN(zoom)) {
            initialZoom = Math.max(zoom, MIN_ZOOM);
          }
        } else {
          initialZoom = 12;
        }
      }
    } else if (storedState?.center) {
      initialCenter = storedState.center;
      initialZoom = storedState.zoom;
    }

    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    map.current.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.current.addControl(new mapboxgl.FullscreenControl(), "top-right");

    map.current.on("load", () => {
      if (!map.current) return;

      map.current.addSource("birding-hotspots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.current.addLayer({
        id: "hotspot-points",
        type: "circle",
        source: "birding-hotspots",
        paint: {
          "circle-radius": isMobile ? 8 : 7,
          "circle-color": [
            "case",
            ["==", ["get", "open"], true],
            "#3b82f6",
            ["==", ["get", "open"], false],
            "#374151",
            "#9ca3af",
          ],
          "circle-stroke-width": 0.75,
          "circle-stroke-color": "#ffffff",
        },
      });

      const bounds = map.current.getBounds();
      if (!bounds) return;

      const currentZoom = map.current.getZoom();
      const boundsString = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

      setIsZoomedTooFarOut(currentZoom < MIN_ZOOM);

      if (currentZoom >= MIN_ZOOM) {
        setBounds(boundsString);
      }
    });

    map.current.on("moveend", () => {
      if (!map.current) return;

      const currentBounds = map.current.getBounds();
      if (!currentBounds) return;

      const currentZoom = map.current.getZoom();
      const currentCenter = map.current.getCenter();
      const boundsString = `${currentBounds.getWest()},${currentBounds.getSouth()},${currentBounds.getEast()},${currentBounds.getNorth()}`;

      setIsZoomedTooFarOut(currentZoom < MIN_ZOOM);

      if (currentZoom >= MIN_ZOOM) {
        setBounds(boundsString);
      }

      storeMapState([currentCenter.lng, currentCenter.lat], currentZoom);
    });

    map.current.on("zoomend", () => {
      if (!map.current) return;

      const currentZoom = map.current.getZoom();
      const currentCenter = map.current.getCenter();
      setIsZoomedTooFarOut(currentZoom < MIN_ZOOM);

      storeMapState([currentCenter.lng, currentCenter.lat], currentZoom);
    });

    map.current.on("click", "hotspot-points", (e) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const properties = feature.properties;

      if (!properties) return;

      openModal(properties.id);
    });

    map.current.on("click", (e) => {
      const features = map.current?.queryRenderedFeatures(e.point, { layers: ["hotspot-points"] });
      if (!features || features.length === 0) {
        closeModal();
      }
    });

    map.current.on("mouseenter", "hotspot-points", () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "pointer";
      }
    });

    map.current.on("mouseleave", "hotspot-points", () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "";
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !hotspotsData?.hotspots) return;

    const source = map.current.getSource("birding-hotspots") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const features = hotspotsData.hotspots.map((hotspot) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [hotspot.lng, hotspot.lat],
      },
      properties: {
        id: hotspot.id,
        open: hotspot.open,
      },
    }));

    source.setData({
      type: "FeatureCollection",
      features,
    });
  }, [hotspotsData]);

  return (
    <div className="h-[calc(100vh-4rem)] w-full relative">
      <div ref={mapContainer} className="h-full w-full" />

      {isZoomedTooFarOut && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Zoom in to see hotspots</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg py-3 px-4 shadow-lg">
          <div className="flex items-center gap-4">
            <span className="text-sm text-red-700">Error loading hotspots</span>
            <button
              className="text-sm text-red-700 border border-red-700 rounded-md px-2 py-1 cursor-pointer"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg hidden sm:block">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Legend</h3>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
            <span className="text-xs text-gray-700">Open Access</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-700 border-2 border-white" />
            <span className="text-xs text-gray-700">Not Open Access</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white" />
            <span className="text-xs text-gray-700">Not Reviewed</span>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200">
          {isLoading ? (
            <Spinner size="md" />
          ) : (
            <p className="text-xs text-gray-600">{hotspotsData?.count || "--"} hotspots</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Map;
