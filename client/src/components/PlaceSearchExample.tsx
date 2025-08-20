import React from "react";
import PlaceSearch from "./PlaceSearch";

export default function PlaceSearchExample() {
  const handlePlaceChange = () => {
    console.log("Place selected!");
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Place Search Example</h2>
      <PlaceSearch pill={true} onChange={handlePlaceChange} placeholder="Search for a place..." />
    </div>
  );
}
