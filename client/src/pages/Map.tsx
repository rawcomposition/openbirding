import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { HotspotsResponse, Hotspot } from "@/lib/types";
import HotspotSheet from "@/components/HotspotSheet";

const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: hotspotsData } = useQuery<HotspotsResponse>({
    queryKey: ["/hotspots"],
    meta: { errorMessage: "Failed to load hotspots" },
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

    map.current.on("load", () => {
      if (!map.current) return;

      const features =
        hotspotsData?.hotspots.map((hotspot) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [hotspot.location.coordinates[0], hotspot.location.coordinates[1]],
          },
          properties: {
            title: hotspot.name,
            description: `${hotspot.county}, ${hotspot.state}, ${hotspot.country}`,
            species: hotspot.species,
            id: hotspot._id,
            hotspot: hotspot,
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

      map.current.on("click", "hotspot-points", (e) => {
        if (e.features && e.features[0]) {
          const hotspot = e.features[0].properties?.hotspot as Hotspot;
          if (hotspot) {
            setSelectedHotspot(hotspot);
            setSheetOpen(true);
          }
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
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [hotspotsData]);

  return (
    <>
      <div className="h-screen w-full">
        <div ref={mapContainer} className="h-full w-full" />
      </div>

      <HotspotSheet hotspot={selectedHotspot} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
};

export default Map;
