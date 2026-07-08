import toast from "react-hot-toast";
import { mutate } from "@/lib/utils";
import { parseEbirdCsv, EbirdCsvError } from "@/lib/ebirdCsv";
import { useBestHotspotsStore, useBestHotspotsSession } from "@/stores/bestHotspotsStore";
import type { ListResponse } from "@/components/besthotspots/types";

export function useUploadLifeList() {
  const setListInfo = useBestHotspotsStore((s) => s.setListInfo);
  const setSelectedHotspot = useBestHotspotsSession((s) => s.setSelectedHotspot);

  return async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseEbirdCsv(text);
      const token = useBestHotspotsStore.getState().listToken;
      const res = (await mutate("POST", "/best-hotspots/list", {
        species: parsed.entries,
        fileName: file.name,
        token: token ?? undefined,
      })) as ListResponse;
      setListInfo({ token: res.token, fileName: file.name, count: res.count });
      setSelectedHotspot(null);
    } catch (err) {
      toast.error(err instanceof EbirdCsvError ? err.message : "Could not read that file.");
    }
  };
}
