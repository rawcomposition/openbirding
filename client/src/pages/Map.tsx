import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

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

      map.current.addSource("birding-hotspots", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [-73.9654, 40.7829],
              },
              properties: {
                title: "Central Park",
                description: "Famous urban birding location with diverse habitats",
                habitat: "Urban park with lakes, woodlands, and meadows",
              },
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [-73.8231, 40.6215],
              },
              properties: {
                title: "Jamaica Bay Wildlife Refuge",
                description: "Coastal wetland teeming with migratory birds",
                habitat: "Coastal wetlands, marshes, and open water",
              },
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [-73.969, 40.6602],
              },
              properties: {
                title: "Prospect Park",
                description: "Brooklyn's premier birding destination",
                habitat: "Urban park with woodlands, lakes, and meadows",
              },
            },
          ],
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
  }, []);

  return (
    <div className="h-screen w-full">
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
};

export default Map;
