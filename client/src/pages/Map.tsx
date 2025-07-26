import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { HotspotsResponse } from "@/lib/types";

const fetchHotspots = async (): Promise<HotspotsResponse> => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const response = await fetch(`${apiUrl}/api/hotspots`);
  if (!response.ok) {
    throw new Error("Failed to fetch hotspots");
  }
  return response.json();
};

const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  const { data: hotspotsData } = useQuery({
    queryKey: ["hotspots"],
    queryFn: fetchHotspots,
  });

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

    const controls = document.querySelectorAll(".mapboxgl-ctrl-group");
    controls.forEach((control) => {
      if (control instanceof HTMLElement) {
        control.style.marginTop = "80px";
      }
    });

    map.current.on("load", () => {
      if (!map.current) return;

      const features =
        hotspotsData?.hotspots.map((hotspot) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [hotspot.lng, hotspot.lat],
          },
          properties: {
            title: hotspot.name,
            description: `${hotspot.county}, ${hotspot.state}, ${hotspot.country}`,
            species: hotspot.species,
            id: hotspot._id,
          },
        })) || [];

      map.current.addSource("birding-hotspots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features,
        },
      });

      map.current.addLayer({
        id: "hotspot-points",
        type: "circle",
        source: "birding-hotspots",
        paint: {
          "circle-radius": 8,
          "circle-color": "#10b981",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.current.addLayer({
        id: "hotspot-labels",
        type: "symbol",
        source: "birding-hotspots",
        layout: {
          "text-field": ["get", "title"],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-size": 12,
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [hotspotsData]);

  return (
    <div className="h-screen w-full">
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
};

export default Map;
