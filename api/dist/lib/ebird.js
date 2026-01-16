export const getHotspotsForRegion = async (region) => {
    const apiKey = process.env.EBIRD_API_KEY;
    if (!apiKey) {
        throw new Error("EBIRD_API_KEY environment variable is required");
    }
    const response = await fetch(`https://api.ebird.org/v2/ref/hotspot/${region}?fmt=json&key=${apiKey}`);
    if (!response.ok) {
        throw new Error(`eBird API request failed: ${response.statusText}`);
    }
    const json = (await response.json());
    if ("errors" in json) {
        throw new Error("Error fetching eBird hotspots");
    }
    return json
        .map((hotspot) => ({
        locationId: hotspot.locId,
        name: hotspot.locName.trim(),
        lat: hotspot.lat,
        lng: hotspot.lng,
        total: hotspot.numSpeciesAllTime || 0,
        countryCode: hotspot.countryCode,
        subnational1Code: hotspot.subnational1Code,
        subnational2Code: hotspot.subnational2Code,
    }))
        .filter((hotspot) => !hotspot.name.toLowerCase().startsWith("stakeout"));
};
