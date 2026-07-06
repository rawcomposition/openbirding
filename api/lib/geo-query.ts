/**
 * Shared "top locations by lifer count" kernel used by both the hotspot and
 * zone indexes. Operates purely on typed arrays for speed.
 *
 *   lifers[ref] = qCount[bucket][ref] - seenCount[ref]
 *
 * seenCount is tallied by walking only the user's seen species through the
 * species -> ref CSR index.
 */

export type GeoArrays = {
  numRefs: number;
  samples: Int32Array;
  lat: Float32Array;
  lng: Float32Array;
  regionCode: string[];
  // Species -> ref CSR
  spOff: Int32Array;
  csrRef: Int32Array;
  csrLvl: Uint8Array;
  // Reusable scratch counter (length numRefs)
  counter: Int32Array;
};

export type GeoQuery = {
  seenIds: Set<number>;
  bucket: number;
  qCountForBucket: Int32Array;
  minChecklists: number;
  regionCodes: string[] | null;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  limit: number;
};

export function regionMatches(rc: string, codes: string[]): boolean {
  for (const code of codes) {
    if (rc === code || rc.startsWith(code + "-")) return true;
  }
  return false;
}

/**
 * Longitude-in-range test that supports antimeridian-crossing boxes: when
 * minLng > maxLng the box wraps through 180° (e.g. Fiji/NZ views), so a point
 * matches on either side of the seam.
 */
function lngInBbox(ln: number, minLng: number, maxLng: number): boolean {
  return minLng <= maxLng ? ln >= minLng && ln <= maxLng : ln >= minLng || ln <= maxLng;
}

/**
 * Every ref inside a bbox with its lifer count (>= 0), unranked. Used to colour
 * the H3 grid: we need *all* visible cells, not just the top-K, and we keep
 * cells with zero lifers so the map can render them subtly.
 */
export function allInBbox(
  a: GeoArrays,
  q: { seenIds: Set<number>; qCountForBucket: Int32Array; bucket: number; bbox: GeoQuery["bbox"] }
): { ref: number; lifers: number }[] {
  const { seenIds, qCountForBucket, bucket, bbox } = q;
  const counter = a.counter;
  counter.fill(0);

  for (const sid of seenIds) {
    if (sid + 1 >= a.spOff.length) continue;
    const start = a.spOff[sid];
    const end = a.spOff[sid + 1];
    for (let i = start; i < end; i++) {
      if (a.csrLvl[i] >= bucket) counter[a.csrRef[i]]++;
    }
  }

  const out: { ref: number; lifers: number }[] = [];
  for (let ref = 0; ref < a.numRefs; ref++) {
    const q0 = qCountForBucket[ref];
    if (q0 <= 0) continue; // cell has no quality species at all → nothing to draw
    if (bbox) {
      const la = a.lat[ref];
      if (la < bbox.minLat || la > bbox.maxLat || !lngInBbox(a.lng[ref], bbox.minLng, bbox.maxLng)) continue;
    }
    const lifers = q0 - counter[ref];
    out.push({ ref, lifers: lifers > 0 ? lifers : 0 });
  }
  return out;
}

export function topByLifers(
  a: GeoArrays,
  q: GeoQuery
): { top: { ref: number; lifers: number }[]; candidates: number } {
  const { seenIds, bucket, qCountForBucket, regionCodes, bbox, minChecklists, limit } = q;
  const counter = a.counter;
  counter.fill(0);

  for (const sid of seenIds) {
    if (sid + 1 >= a.spOff.length) continue;
    const start = a.spOff[sid];
    const end = a.spOff[sid + 1];
    for (let i = start; i < end; i++) {
      if (a.csrLvl[i] >= bucket) counter[a.csrRef[i]]++;
    }
  }

  // Bounded selection via a size-`limit` min-heap keyed by lifer count.
  const heapRef = new Int32Array(limit);
  const heapVal = new Int32Array(limit);
  let heapSize = 0;

  const siftUp = (i: number) => {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapVal[parent] <= heapVal[i]) break;
      swap(parent, i);
      i = parent;
    }
  };
  const siftDown = (i: number) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < heapSize && heapVal[l] < heapVal[smallest]) smallest = l;
      if (r < heapSize && heapVal[r] < heapVal[smallest]) smallest = r;
      if (smallest === i) break;
      swap(smallest, i);
      i = smallest;
    }
  };
  const swap = (x: number, y: number) => {
    const tv = heapVal[x];
    heapVal[x] = heapVal[y];
    heapVal[y] = tv;
    const tr = heapRef[x];
    heapRef[x] = heapRef[y];
    heapRef[y] = tr;
  };

  let candidates = 0; // hotspots in scope before the user's filters — lets the UI explain empty results
  for (let ref = 0; ref < a.numRefs; ref++) {
    if (regionCodes && !regionMatches(a.regionCode[ref], regionCodes)) continue;
    if (bbox) {
      const la = a.lat[ref];
      if (la < bbox.minLat || la > bbox.maxLat || !lngInBbox(a.lng[ref], bbox.minLng, bbox.maxLng)) continue;
    }
    candidates++;
    if (a.samples[ref] < minChecklists) continue;
    const lifers = qCountForBucket[ref] - counter[ref];
    if (lifers <= 0) continue;

    if (heapSize < limit) {
      heapRef[heapSize] = ref;
      heapVal[heapSize] = lifers;
      heapSize++;
      siftUp(heapSize - 1);
    } else if (lifers > heapVal[0]) {
      heapRef[0] = ref;
      heapVal[0] = lifers;
      siftDown(0);
    }
  }

  const out: { ref: number; lifers: number }[] = [];
  for (let i = 0; i < heapSize; i++) out.push({ ref: heapRef[i], lifers: heapVal[i] });
  out.sort((x, y) => y.lifers - x.lifers || a.samples[y.ref] - a.samples[x.ref]);
  return { top: out, candidates };
}
