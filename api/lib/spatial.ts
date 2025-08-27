export function makeBounds(lat0: number, lng0: number, radiusKm = 200) {
  const kmPerDeg = 111.32;
  const rad = Math.PI / 180;
  const dLat = radiusKm / kmPerDeg;
  const dLng = radiusKm / (kmPerDeg * Math.max(Math.cos(lat0 * rad), 1e-9));

  const south = lat0 - dLat;
  const north = lat0 + dLat;
  let west = lng0 - dLng;
  let east = lng0 + dLng;

  if (west < -180) {
    return [
      { minLat: south, maxLat: north, minLng: west + 360, maxLng: 180 },
      { minLat: south, maxLat: north, minLng: -180, maxLng: east },
    ];
  }
  if (east > 180) {
    return [
      { minLat: south, maxLat: north, minLng: west, maxLng: 180 },
      { minLat: south, maxLat: north, minLng: -180, maxLng: east - 360 },
    ];
  }
  return [{ minLat: south, maxLat: north, minLng: west, maxLng: east }];
}

export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getCosLat(lat: number): number {
  const RAD = Math.PI / 180;
  return Math.cos(lat * RAD) || 1e-9; // avoid div-by-zero at poles
}

export function getRadiusSquared(radiusKm: number): number {
  const KM_PER_DEG = 111.32;
  const degPerKm = 1 / KM_PER_DEG;
  const rDeg = radiusKm * degPerKm;
  return rDeg * rDeg;
}
