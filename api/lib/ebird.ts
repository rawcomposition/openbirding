import { TARGETS_DB_FILENAME } from "./config.js";

type EBirdHotspot = {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  numSpeciesAllTime?: number;
  countryCode: string;
  subnational1Code: string;
  subnational2Code: string;
};

type ProcessedHotspot = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  total: number;
  countryCode: string;
  subnational1Code: string;
  subnational2Code: string;
};

export const getHotspotsForRegion = async (region: string): Promise<ProcessedHotspot[]> => {
  const apiKey = process.env.EBIRD_API_KEY;
  if (!apiKey) {
    throw new Error("EBIRD_API_KEY environment variable is required");
  }

  const response = await fetch(`https://api.ebird.org/v2/ref/hotspot/${region}?fmt=json&key=${apiKey}`);

  if (!response.ok) {
    throw new Error(`eBird API request failed: ${response.statusText}`);
  }

  const json = (await response.json()) as EBirdHotspot[];

  if ("errors" in json) {
    throw new Error("Error fetching eBird hotspots");
  }

  return json
    .map((hotspot: EBirdHotspot) => ({
      locationId: hotspot.locId,
      name: hotspot.locName.trim(),
      lat: hotspot.lat,
      lng: hotspot.lng,
      total: hotspot.numSpeciesAllTime || 0,
      countryCode: hotspot.countryCode,
      subnational1Code: hotspot.subnational1Code,
      subnational2Code: hotspot.subnational2Code,
    }))
    .filter((hotspot: ProcessedHotspot) => !hotspot.name.toLowerCase().startsWith("stakeout"));
};

type EBirdTaxon = {
  speciesCode?: string;
  code?: string;
  taxonOrder?: number;
  taxon_order?: number;
  comName?: string;
  sciName?: string;
};

export type TaxonomyEntry = {
  name: string;
  sciName: string;
  code: string;
};

export const getTaxonomy = async (): Promise<TaxonomyEntry[]> => {
  const apiKey = process.env.EBIRD_API_KEY;
  if (!apiKey) {
    throw new Error("EBIRD_API_KEY environment variable is required");
  }
  const response = await fetch(`https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&cat=species&key=${apiKey}`);
  if (!response.ok) {
    throw new Error(`eBird taxonomy request failed: ${response.statusText}`);
  }
  const taxa = (await response.json()) as EBirdTaxon[];
  return taxa.map((t) => ({
    name: t.comName!,
    sciName: t.sciName!,
    code: t.speciesCode!,
  }));
};

export const getEbdCitation = () => {
  const targetsDbMatch = TARGETS_DB_FILENAME.match(/^targets-(.+)-(\d{4})\.db$/);
  const rawMonth = targetsDbMatch?.[1] ?? "mar";
  const rawYear = targetsDbMatch?.[2] ?? "2025";
  const ebdMonth = `${rawMonth.charAt(0).toUpperCase()}${rawMonth.slice(1).toLowerCase()}`;
  const ebdYear = rawYear;
  return `eBird Basic Dataset. Version: EBD_rel${ebdMonth}-${ebdYear}. Cornell Lab of Ornithology, Ithaca, New York. ${ebdMonth} ${ebdYear}.`;
};
