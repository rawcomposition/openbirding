import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { HotspotsResponse } from "@/lib/types";

const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [bounds, setBounds] = useState<string | null>(null);
  const [isZoomedTooFarOut, setIsZoomedTooFarOut] = useState(false);

  const {
    data: hotspotsData,
    isLoading,
    error,
  } = useQuery<HotspotsResponse>({
    queryKey: ["/hotspots", { bounds }],
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

    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-74.006, 40.7128],
      zoom: 10,
      attributionControl: false,
    });

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

      setIsZoomedTooFarOut(currentZoom < 8);

      if (currentZoom >= 8) {
        setBounds(boundsString);
      }
    });

    map.current.on("moveend", () => {
      if (!map.current) return;

      const currentBounds = map.current.getBounds();
      if (!currentBounds) return;

      const currentZoom = map.current.getZoom();
      const boundsString = `${currentBounds.getWest()},${currentBounds.getSouth()},${currentBounds.getEast()},${currentBounds.getNorth()}`;

      setIsZoomedTooFarOut(currentZoom < 8);

      if (currentZoom >= 8) {
        setBounds(boundsString);
      }
    });

    map.current.on("zoomend", () => {
      if (!map.current) return;

      const currentZoom = map.current.getZoom();
      setIsZoomedTooFarOut(currentZoom < 8);
    });

    map.current.on("click", "hotspot-points", (e) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const properties = feature.properties;

      if (!properties) return;

      const coordinates = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates.slice() as [
        number,
        number
      ];

      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(
          `
          <div class="p-2">
            <h3 class="font-semibold text-gray-800">${properties.title}</h3>
            <p class="text-sm text-gray-700">${properties.species} species</p>
            <p class="text-sm text-gray-700">${
              properties.open === true ? "Open Access" : properties.open === false ? "Not Open Access" : "Not Reviewed"
            }</p>
          </div>
        `
        )
        .addTo(map.current!);
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
        coordinates: [hotspot.location.coordinates[0], hotspot.location.coordinates[1]],
      },
      properties: {
        title: hotspot.name,
        species: hotspot.species,
        id: hotspot._id,
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

      {isLoading && (
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-sm text-gray-700">Loading hotspots...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 right-4 bg-red-100/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-red-300">
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-700">Error loading hotspots</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-8 left-2 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Legend</h3>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white"></div>
            <span className="text-xs text-gray-700">Open</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-700 border-2 border-white"></div>
            <span className="text-xs text-gray-700">Closed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white"></div>
            <span className="text-xs text-gray-700">Not Reviewed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Map;
