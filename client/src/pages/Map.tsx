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
      center: [-74.006, 40.7128], // New York City
      zoom: 10,
      attributionControl: false,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.current.addControl(new mapboxgl.FullscreenControl(), "top-right");

    // Adjust map controls to account for header height
    const controls = document.querySelectorAll(".mapboxgl-ctrl-group");
    controls.forEach((control) => {
      if (control instanceof HTMLElement) {
        control.style.marginTop = "80px";
      }
    });

    map.current.on("load", () => {
      if (!map.current) return;

      map.current.addSource("bird-sightings", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [-74.006, 40.7128],
              },
              properties: {
                title: "American Robin",
                description: "Spotted in Central Park",
                species: "Turdus migratorius",
              },
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [-74.005, 40.713],
              },
              properties: {
                title: "Northern Cardinal",
                description: "Bright red male spotted",
                species: "Cardinalis cardinalis",
              },
            },
          ],
        },
      });

      map.current.addLayer({
        id: "bird-points",
        type: "circle",
        source: "bird-sightings",
        paint: {
          "circle-radius": 8,
          "circle-color": "#3b82f6",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.current.addLayer({
        id: "bird-labels",
        type: "symbol",
        source: "bird-sightings",
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
