import { useQuery } from "@tanstack/react-query";

/**
 * Avicommons (https://avicommons.org) species photos, CC-licensed. The lite
 * dataset maps eBird species codes to [photoKey, photographer] and is fetched
 * into client/public by scripts/fetch-avicommons.mjs at dev/build time.
 */
type AvicommonsLite = Record<string, [photoKey: string, by: string]>;

export function useAvicommons(): AvicommonsLite | null {
  const { data } = useQuery<AvicommonsLite>({
    queryKey: ["avicommons-lite"],
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
    // Served from our own origin, not the API — bypass the app's default queryFn.
    queryFn: async () => {
      const res = await fetch("/avicommons-lite.json");
      if (!res.ok) throw new Error(`avicommons-lite.json: HTTP ${res.status}`);
      return res.json();
    },
  });
  return data ?? null;
}

export type AvicommonsPhoto = { url: string; by: string };

/** Thumbnail URL + photographer credit for a species code, if a photo exists. */
export function avicommonsPhoto(
  data: AvicommonsLite | null,
  speciesCode: string,
  size: 160 | 240 | 320 | 480 | 900 = 160
): AvicommonsPhoto | null {
  const entry = data?.[speciesCode];
  if (!entry) return null;
  return { url: `https://static.avicommons.org/${speciesCode}-${entry[0]}-${size}.jpg`, by: entry[1] };
}
