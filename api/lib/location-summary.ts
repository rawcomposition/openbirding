import { wilsonLowerBound } from "./wilson.js";

export type LocationSummaryRow = {
  locationId: string;
  code: string;
  name: string;
  month: number;
  obs: number;
  samples: number;
};

type LocationSummaryItem = {
  code: string;
  name: string;
  observations: number;
  frequency: number;
  wilsonScore: number;
  rank: number;
};

export type LocationSummary = {
  samples: number;
  items: LocationSummaryItem[];
};

export function summarizeLocationTargets(locationIds: string[], rows: LocationSummaryRow[]): Record<string, LocationSummary> {
  const summaries = new Map<string, { samplesByMonth: Map<number, number>; species: Map<string, { name: string; observations: number }> }>();
  for (const locationId of locationIds) {
    summaries.set(locationId, { samplesByMonth: new Map(), species: new Map() });
  }

  for (const row of rows) {
    const summary = summaries.get(row.locationId);
    if (!summary) continue;

    summary.samplesByMonth.set(row.month, row.samples);
    const species = summary.species.get(row.code) ?? { name: row.name, observations: 0 };
    species.observations += row.obs;
    summary.species.set(row.code, species);
  }

  const locations: Record<string, LocationSummary> = {};
  const speciesLocations = new Map<string, Array<{ locationId: string; item: LocationSummaryItem; score: number }>>();

  for (const [locationId, summary] of summaries) {
    const samples = [...summary.samplesByMonth.values()].reduce((total, value) => total + value, 0);
    const items = [...summary.species.entries()].map(([code, species]) => {
      const frequency = samples > 0 ? (species.observations / samples) * 100 : 0;
      const score = wilsonLowerBound(species.observations, samples);
      const item = {
        code,
        name: species.name,
        observations: species.observations,
        frequency: Math.round(frequency * 10) / 10,
        wilsonScore: Math.round(score * 1000) / 10,
        rank: 0,
      };
      const rankedLocations = speciesLocations.get(code) ?? [];
      rankedLocations.push({ locationId, item, score });
      speciesLocations.set(code, rankedLocations);
      return item;
    });
    locations[locationId] = { samples, items };
  }

  for (const rankedLocations of speciesLocations.values()) {
    rankedLocations.sort((a, b) => b.score - a.score || a.locationId.localeCompare(b.locationId));
    let rank = 0;
    let previousScore: number | null = null;
    for (let index = 0; index < rankedLocations.length; index++) {
      const current = rankedLocations[index].item;
      if (rankedLocations[index].score !== previousScore) {
        rank = index + 1;
        previousScore = rankedLocations[index].score;
      }
      current.rank = rank;
    }
  }

  for (const location of Object.values(locations)) {
    location.items.sort((a, b) => b.wilsonScore - a.wilsonScore || a.code.localeCompare(b.code));
  }

  return locations;
}
