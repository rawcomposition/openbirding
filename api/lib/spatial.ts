export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  // Handle longitude wrapping around the date line
  let dLngDeg = lng2 - lng1;
  if (dLngDeg > 180) dLngDeg -= 360;
  if (dLngDeg < -180) dLngDeg += 360;
  const dLng = toRad(dLngDeg);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function kCenterClustering<T extends { lat: number; lng: number }>(
  points: T[],
  k: number,
  startLat?: number | null,
  startLng?: number | null
): T[] {
  if (points.length === 0 || k <= 0) return [];
  if (k >= points.length) return [...points];

  let firstCenter: T;
  if (startLat != null && startLng != null) {
    let minDistance = Infinity;
    let nearestPoint: T | null = null;

    for (const point of points) {
      const distance = getDistanceKm(startLat, startLng, point.lat, point.lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    firstCenter = nearestPoint || points[0];
  } else {
    firstCenter = points[0];
  }

  const centers: T[] = [firstCenter];
  const minDistances = new Array(points.length).fill(Infinity);
  const centerIndices = new Set<number>();

  for (let i = 0; i < points.length; i++) {
    if (points[i] === firstCenter) {
      centerIndices.add(i);
      minDistances[i] = 0;
    } else {
      minDistances[i] = getDistanceKm(firstCenter.lat, firstCenter.lng, points[i].lat, points[i].lng);
    }
  }

  for (let i = 1; i < k; i++) {
    let maxMinDistance = -1;
    let nextCenterIndex = -1;

    for (let j = 0; j < points.length; j++) {
      if (centerIndices.has(j)) continue;

      if (minDistances[j] > maxMinDistance) {
        maxMinDistance = minDistances[j];
        nextCenterIndex = j;
      }
    }

    if (nextCenterIndex === -1) break;

    const nextCenter = points[nextCenterIndex];
    centers.push(nextCenter);
    centerIndices.add(nextCenterIndex);
    minDistances[nextCenterIndex] = 0;

    for (let j = 0; j < points.length; j++) {
      if (centerIndices.has(j)) continue;

      const distance = getDistanceKm(nextCenter.lat, nextCenter.lng, points[j].lat, points[j].lng);
      if (distance < minDistances[j]) {
        minDistances[j] = distance;
      }
    }
  }

  return centers;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function desiredClusters(hotspotCount: number, minK = 3, maxK = 30, scale = 1.5): number {
  if (hotspotCount <= 0) return minK;

  const k = Math.ceil(scale * Math.log2(hotspotCount));
  return clamp(k, minK, maxK);
}
