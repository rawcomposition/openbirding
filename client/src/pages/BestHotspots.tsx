import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cellToBoundary, latLngToCell } from "h3-js";
import {
  Binoculars,
  Bird,
  ChevronDown,
  ChevronLeft,
  Upload,
  Loader2,
  Hexagon,
  Info,
  X,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import LiferGridMap, { type GridMapHandle, type Bbox } from "@/components/LiferGridMap";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn, mutate } from "@/lib/utils";
import { useAvicommons, avicommonsPhoto } from "@/lib/avicommons";
import { MARKER_COLORS } from "@/lib/liferColors";
import { parseEbirdCsv, EbirdCsvError } from "@/lib/ebirdCsv";
import { useLiferTargetsStore, FREQUENCY_PRESETS, MIN_CHECKLIST_PRESETS } from "@/stores/liferTargetsStore";

type HotspotItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  regionCode: string;
  regionName: string | null;
  lifers: number;
  totalSpecies: number;
  checklists: number;
};

type HotspotResponse = {
  items: HotspotItem[];
  meta: {
    hotspotsInScope: number;
    seenMatched: number;
    seenUnmatched: number;
    frequencyPct: number;
    minChecklists: number;
  };
  citation?: string;
  queryTime: string;
};

type HotspotLifer = { code: string; name: string; sciName: string; frequency: number; score: number };
type HotspotDetailResponse = { locationId: string; lifers: HotspotLifer[]; liferCount: number; frequency: number };

type StatusResponse = { ready: boolean; resolutions?: number[] };
type ListResponse = { token: string; count: number; matched: number; unmatchedCount: number };
type CellInfo = {
  h3: string;
  samples: number;
  totalSpecies: number;
  lifers: number;
  namedHotspots: number;
  hotspotChecklists: number;
};

const HOTSPOT_LIMIT = 100;

/**
 * eBird's "targets" page for a hotspot — the species you still need there,
 * measured against your worldwide life list (r2=world, t2=life), all months.
 * Opens live on eBird so a logged-in user sees their own up-to-date targets.
 */
function ebirdTargetsUrl(hotspotId: string): string {
  const p = new URLSearchParams({ r1: hotspotId, bmo: "1", emo: "12", r2: "world", t2: "life" });
  return `https://ebird.org/targets?${p.toString()}`;
}

/**
 * Union bounding box over a set of H3 cells. Cell sets straddling the
 * antimeridian are unwrapped and returned in the crossing form
 * (minLng > maxLng), which the server's bbox filter understands.
 */
function cellsBbox(cells: string[]): Bbox | null {
  const lngs: number[] = [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const h of cells) {
    const ring = cellToBoundary(h, true) as [number, number][];
    for (const [lng, lat] of ring) {
      lngs.push(lng);
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (lngs.length === 0) return null;
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  if (maxLng - minLng > 180) {
    // Straddles the seam: shift the western hemisphere up, recompute, re-wrap.
    const shifted = lngs.map((l) => (l < 0 ? l + 360 : l));
    const wrapLng = (l: number) => (l > 180 ? l - 360 : l);
    minLng = wrapLng(Math.min(...shifted));
    maxLng = wrapLng(Math.max(...shifted));
  }
  return { minLng, minLat, maxLng, maxLat };
}

const BestHotspots = () => {
  useEffect(() => {
    document.title = "Best Hotspots | OpenBirding";
  }, []);

  const {
    listToken,
    fileName,
    speciesCount,
    legacyLifeList,
    frequency,
    minChecklists,
    selection,
    setListInfo,
    clearLifeList,
    setFrequency,
    setMinChecklists,
    toggleCell,
    clearSelection,
  } = useLiferTargetsStore();

  const [selectedHotspot, setSelectedHotspot] = useState<HotspotItem | null>(null);
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // The map's settled viewport — the default scope for hotspot results.
  const [viewport, setViewport] = useState<{ bbox: Bbox; resolution: number } | null>(null);
  const mapHandle = useRef<GridMapHandle>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const onViewportChange = useCallback((bbox: Bbox, resolution: number) => {
    setViewport({ bbox, resolution });
  }, []);

  // Any click on the map — a hex or the empty background — dismisses the
  // hotspot detail card.
  const onMapClick = useCallback(() => setSelectedHotspot(null), []);

  /** Store a parsed list server-side under our (possibly new) anonymous token. */
  const uploadList = async (entries: { sciName: string; commonName: string }[], name: string | null) => {
    const token = useLiferTargetsStore.getState().listToken;
    const res = (await mutate("POST", "/lifers/list", {
      species: entries,
      fileName: name,
      token: token ?? undefined,
    })) as ListResponse;
    setListInfo({ token: res.token, fileName: name, count: res.count });
    return res;
  };

  // One-time migration: v1 kept the raw entries in localStorage; upload them
  // once to mint a token, then drop them.
  const migratingRef = useRef(false);
  useEffect(() => {
    if (!legacyLifeList || listToken || migratingRef.current) return;
    migratingRef.current = true;
    uploadList(legacyLifeList, fileName).catch(() => {
      migratingRef.current = false; // transient failure — retry next visit
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyLifeList, listToken]);

  // Confirm a persisted token still exists server-side; if not, prompt a fresh upload.
  const { error: listError } = useQuery({
    queryKey: [`/lifers/list/${listToken}`],
    enabled: !!listToken,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (listError && /not found/i.test(listError.message)) {
      clearLifeList();
      toast.error("Your saved life list has expired — please upload it again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listError]);

  const { data: status } = useQuery<StatusResponse>({
    queryKey: ["/lifers/status"],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const resolutions = status?.resolutions ?? [3, 4];

  // Fixed, personalised colour scale: worldwide quantile breakpoints per
  // resolution, so panning never recolours the grid (only zooming, which
  // changes resolution) and the full spectrum spreads across the distribution.
  const { data: scaleData } = useQuery<{ breaksByRes: Record<number, number[]> }>({
    queryKey: ["lifer-grid-scale", listToken],
    enabled: !!listToken,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", "/lifers/grid-scale", { listToken }) as Promise<{ breaksByRes: Record<number, number[]> }>,
  });
  const breaksByRes = scaleData?.breaksByRes ?? null;

  // Result scope: a hex selection narrows; otherwise the current viewport.
  const scope: { kind: "hex" | "view"; bbox: Bbox | null } | null = useMemo(() => {
    if (selection && selection.cells.length) return { kind: "hex", bbox: cellsBbox(selection.cells) };
    if (viewport) return { kind: "view", bbox: viewport.bbox };
    return null;
  }, [selection, viewport]);

  const bboxKey = (b: Bbox) =>
    [b.minLng, b.minLat, b.maxLng, b.maxLat].map((v) => v.toFixed(3)).join(",");
  const scopeKey =
    scope?.kind === "hex"
      ? `hex:${selection?.cells.join(",")}`
      : scope?.bbox
        ? `view:${bboxKey(scope.bbox)}`
        : "none";

  const { data: results, isFetching } = useQuery<HotspotResponse>({
    queryKey: ["lifer-hotspots", scopeKey, frequency, minChecklists, listToken],
    enabled: !!listToken && !!scope?.bbox,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: () =>
      mutate("POST", "/lifers/hotspots", {
        listToken,
        frequency,
        minChecklists,
        limit: HOTSPOT_LIMIT,
        bbox: scope!.bbox,
      }) as Promise<HotspotResponse>,
  });

  // For a hex scope, keep only hotspots that actually fall inside a selected cell.
  const hotspots: HotspotItem[] = useMemo(() => {
    const items = results?.items ?? [];
    if (scope?.kind === "hex" && selection) {
      const set = new Set(selection.cells);
      return items.filter((h) => set.has(latLngToCell(h.lat, h.lng, selection.resolution)));
    }
    return items;
  }, [results, scope, selection]);

  // Per-cell debug for the current hex selection (checklist samples etc.).
  const { data: cellsData } = useQuery<{ cells: CellInfo[] }>({
    queryKey: ["lifer-cells", selection?.resolution, selection?.cells.join(","), listToken],
    enabled: !!listToken && !!selection && selection.cells.length > 0,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", "/lifers/cells", {
        listToken,
        resolution: selection!.resolution,
        cells: selection!.cells,
      }) as Promise<{ cells: CellInfo[] }>,
  });

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseEbirdCsv(text);
      const res = await uploadList(parsed.entries, file.name);
      setSelectedHotspot(null);
      toast.success(`Loaded ${res.count.toLocaleString()} species from ${file.name}`);
    } catch (err) {
      toast.error(err instanceof EbirdCsvError ? err.message : "Could not read that file.");
    }
  };

  const handleResolutionChange = (res: number) => {
    const sel = useLiferTargetsStore.getState().selection;
    if (sel && sel.resolution !== res) clearSelection();
  };

  const selectHotspotFromList = (h: HotspotItem) => {
    const next = selectedHotspot?.id === h.id ? null : h;
    setSelectedHotspot(next);
    if (next) mapHandle.current?.flyTo(h.lng, h.lat);
  };

  // The selected hotspot's specific lifers, most likely first.
  const { data: detail, isFetching: detailFetching } = useQuery<HotspotDetailResponse>({
    queryKey: ["lifer-hotspot-detail", selectedHotspot?.id, listToken, frequency],
    enabled: !!listToken && !!selectedHotspot,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      mutate("POST", `/lifers/hotspot/${selectedHotspot!.id}`, { listToken, frequency }) as Promise<HotspotDetailResponse>,
  });

  const selectedCells = selection?.cells ?? [];

  return (
    // Fixed to the viewport below the 4rem header, outside document flow: no
    // page scrollbar on desktop, and no white gap on mobile (where 100vh
    // includes the area behind the browser chrome).
    <div className="fixed inset-x-0 bottom-0 top-16 flex overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        selectedHotspot={selectedHotspot}
        detail={detail ?? null}
        detailFetching={detailFetching}
        onCloseDetail={() => setSelectedHotspot(null)}
        speciesCount={speciesCount}
        hasList={!!listToken || !!legacyLifeList}
        fileName={fileName}
        matched={results?.meta.seenMatched}
        onFile={handleFile}
        frequency={frequency}
        onFrequency={setFrequency}
        minChecklists={minChecklists}
        onMinChecklists={setMinChecklists}
        selectedCells={selectedCells}
        cellsInfo={cellsData?.cells ?? null}
        onClearSelection={clearSelection}
        scopeKind={scope?.kind ?? null}
        hotspots={hotspots}
        hotspotsInScope={results?.meta.hotspotsInScope}
        isFetching={isFetching}
        selectedHotspotId={selectedHotspot?.id ?? null}
        hoveredHotspotId={hoveredHotspotId}
        onSelectHotspot={selectHotspotFromList}
        onHoverHotspot={setHoveredHotspotId}
        rowRefs={rowRefs.current}
        citation={results?.citation}
      />

      <div className="relative z-0 min-w-0 flex-1">
        <LiferGridMap
          ref={mapHandle}
          listToken={listToken}
          resolutions={resolutions}
          breaksByRes={breaksByRes}
          selectedCells={selectedCells}
          onToggleCell={toggleCell}
          onResolutionChange={handleResolutionChange}
          onViewportChange={onViewportChange}
          onMapClick={onMapClick}
          markerAt={selectedHotspot ? { lng: selectedHotspot.lng, lat: selectedHotspot.lat } : null}
        />

        {listToken && (
          <div className="absolute bottom-3 left-3 z-10 w-44 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
            <Legend />
          </div>
        )}

        <MapCredits citation={results?.citation} />
      </div>
    </div>
  );
};

// --- Docked sidebar ----------------------------------------------------------

function Sidebar(props: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  selectedHotspot: HotspotItem | null;
  detail: HotspotDetailResponse | null;
  detailFetching: boolean;
  onCloseDetail: () => void;
  speciesCount: number | null;
  hasList: boolean;
  fileName: string | null;
  matched?: number;
  onFile: (f: File) => void;
  frequency: number;
  onFrequency: (v: number) => void;
  minChecklists: number;
  onMinChecklists: (v: number) => void;
  selectedCells: string[];
  cellsInfo: CellInfo[] | null;
  onClearSelection: () => void;
  scopeKind: "hex" | "view" | null;
  hotspots: HotspotItem[];
  hotspotsInScope?: number;
  isFetching: boolean;
  selectedHotspotId: string | null;
  hoveredHotspotId: string | null;
  onSelectHotspot: (h: HotspotItem) => void;
  onHoverHotspot: (id: string | null) => void;
  rowRefs: Map<string, HTMLDivElement>;
  citation?: string;
}) {
  const hasList = props.hasList;

  if (props.collapsed) {
    return (
      <button
        type="button"
        onClick={() => props.onCollapsedChange(false)}
        className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur hover:border-emerald-300"
        aria-label="Open Best Hotspots panel"
      >
        <Binoculars className="h-5 w-5 text-emerald-600" />
        <span className="text-sm font-bold tracking-tight text-slate-900">Best Hotspots</span>
        <PanelLeftOpen className="h-4 w-4 text-slate-400" />
      </button>
    );
  }

  return (
    <div className="absolute inset-y-0 left-0 z-10 flex w-[min(27rem,calc(100vw_-_2.5rem))] flex-col overflow-hidden border-r border-slate-200 bg-white/95 shadow-xl backdrop-blur md:relative md:inset-auto md:w-[27rem] md:shrink-0 md:bg-white md:shadow-none md:backdrop-blur-none">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2">
          <Binoculars className="h-5 w-5 text-emerald-600" />
          <span className="text-base font-bold tracking-tight text-slate-900">Best Hotspots</span>
        </span>
        <button
          type="button"
          onClick={() => props.onCollapsedChange(true)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Collapse panel"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-3">
        {!hasList ? (
          <UploadArea onFile={props.onFile} />
        ) : (
          <>
            <LifeListChip
              fileName={props.fileName}
              count={props.speciesCount ?? 0}
              matched={props.matched}
              onReplace={props.onFile}
            />

            {props.selectedCells.length > 0 && (
              <SelectedCellsCard
                count={props.selectedCells.length}
                cellsInfo={props.cellsInfo}
                onClear={props.onClearSelection}
              />
            )}
          </>
        )}
      </div>

      {hasList && (
        <HotspotResults
          scopeKind={props.scopeKind}
          hotspots={props.hotspots}
          hotspotsInScope={props.hotspotsInScope}
          isFetching={props.isFetching}
          frequency={props.frequency}
          onFrequency={props.onFrequency}
          minChecklists={props.minChecklists}
          onMinChecklists={props.onMinChecklists}
          selectedHotspotId={props.selectedHotspotId}
          hoveredHotspotId={props.hoveredHotspotId}
          onSelect={props.onSelectHotspot}
          onHover={props.onHoverHotspot}
          rowRefs={props.rowRefs}
          citation={props.citation}
        />
      )}

      <HotspotDetailPanel
        hotspot={props.selectedHotspot}
        detail={props.detail}
        isFetching={props.detailFetching}
        onBack={props.onCloseDetail}
        citation={props.citation}
      />
    </div>
  );
}

function SelectedCellsCard({
  count,
  cellsInfo,
  onClear,
}: {
  count: number;
  cellsInfo: CellInfo[] | null;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
          <Hexagon className="h-4 w-4" />
          {count === 1 ? "Selected area" : `${count} areas selected`}
        </span>
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-800 shadow-sm hover:bg-amber-100"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
      {cellsInfo && cellsInfo.length > 0 && (() => {
        const total = cellsInfo.reduce(
          (a, c) => ({
            lifers: a.lifers + c.lifers,
            totalSpecies: a.totalSpecies + c.totalSpecies,
            samples: a.samples + c.samples,
            namedHotspots: a.namedHotspots + c.namedHotspots,
          }),
          { lifers: 0, totalSpecies: 0, samples: 0, namedHotspots: 0 }
        );
        return (
          <div className="mt-1.5 border-t border-amber-200/70 pt-1.5 text-xs text-amber-900">
            <span className="font-semibold">
              {total.lifers.toLocaleString()} possible lifer{total.lifers === 1 ? "" : "s"}
            </span>
            <span className="text-amber-800/80">
              {" "}
              · {total.totalSpecies.toLocaleString()} species · {total.samples.toLocaleString()} checklists
            </span>
            {total.namedHotspots === 0 && (
              <div className="text-[11px] italic text-amber-700/90">
                No eBird hotspots here — sightings come from personal locations.
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function Legend() {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
        <span>Fewer lifers</span>
        <span>More</span>
      </div>
      <div
        className="h-2 rounded-full"
        style={{ background: `linear-gradient(to right, ${MARKER_COLORS.join(", ")})` }}
      />
    </div>
  );
}

function CitationFooter({ citation }: { citation?: string }) {
  if (!citation) return null;
  return (
    <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-tight text-slate-400">
      {citation}
    </p>
  );
}

function HotspotResults({
  scopeKind,
  hotspots,
  hotspotsInScope,
  isFetching,
  frequency,
  onFrequency,
  minChecklists,
  onMinChecklists,
  selectedHotspotId,
  hoveredHotspotId,
  onSelect,
  onHover,
  rowRefs,
  citation,
}: {
  scopeKind: "hex" | "view" | null;
  hotspots: HotspotItem[];
  hotspotsInScope?: number;
  isFetching: boolean;
  frequency: number;
  onFrequency: (v: number) => void;
  minChecklists: number;
  onMinChecklists: (v: number) => void;
  selectedHotspotId: string | null;
  hoveredHotspotId: string | null;
  onSelect: (h: HotspotItem) => void;
  onHover: (id: string | null) => void;
  rowRefs: Map<string, HTMLDivElement>;
  citation?: string;
}) {
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-slate-100">
      <div className="flex items-center justify-between px-3 pt-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Best hotspots {scopeKind === "hex" ? "in selection" : "in view"}
        </h2>
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-1.5">
        <PillSelect
          value={frequency}
          onChange={(v) => onFrequency(Number(v))}
          options={FREQUENCY_PRESETS.map((p) => ({
            value: p.value,
            label: `${p.label}+ frequency`,
          }))}
        />
        <PillSelect
          value={minChecklists}
          onChange={(v) => onMinChecklists(Number(v))}
          options={MIN_CHECKLIST_PRESETS.map((n) => ({ value: n, label: `${n}+ checklists` }))}
        />
      </div>
      {hotspots.length === 0 && !isFetching ? (
        <p className="mx-3 rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
          {hotspotsInScope === 0
            ? "No hotspots in this area."
            : "No hotspots match your filters."}
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3 pt-1">
          {hotspots.map((h) => (
            <div
              key={h.id}
              ref={(el) => {
                if (el) rowRefs.set(h.id, el);
                else rowRefs.delete(h.id);
              }}
              onMouseEnter={() => onHover(h.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(h)}
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 rounded-md border bg-white px-2 py-1.5 scroll-mt-2 transition-colors",
                h.id === selectedHotspotId
                  ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-400"
                  : h.id === hoveredHotspotId
                    ? "border-emerald-400"
                    : "border-slate-200 hover:border-emerald-300"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-snug text-slate-800">{h.name}</div>
                <div className="truncate text-[11px] leading-tight text-slate-400">{h.regionName ?? h.regionCode}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-base font-bold leading-tight tabular-nums text-emerald-600">{h.lifers}</span>
                <span className="whitespace-nowrap text-[11px] font-medium leading-tight tabular-nums text-slate-500">
                  {h.checklists.toLocaleString()} lists
                </span>
              </div>
            </div>
          ))}
          <CitationFooter citation={citation} />
        </div>
      )}
    </div>
  );
}

// --- Selected-hotspot detail panel --------------------------------------------

/**
 * Mobile-app-style pushed screen shown over the sidebar when a hotspot is
 * selected; Back (or any map click) returns to the results.
 */
function HotspotDetailPanel({
  hotspot,
  detail,
  isFetching,
  onBack,
  citation,
}: {
  hotspot: HotspotItem | null;
  detail: HotspotDetailResponse | null;
  isFetching: boolean;
  onBack: () => void;
  citation?: string;
}) {
  const avicommons = useAvicommons();
  const shown = hotspot;
  if (!shown) return null;
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <div className="px-4 pt-3">
        <button
          onClick={onBack}
          className="-ml-1 inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-emerald-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to results
        </button>
        <h3 className="mt-2 text-sm font-bold leading-snug text-slate-900">{shown.name}</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {shown.regionName ?? shown.regionCode} · {shown.checklists.toLocaleString()} lists
        </p>
      </div>

      <div className="flex gap-2 px-4 py-3">
        <a
          href={ebirdTargetsUrl(shown.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          View targets <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href={`https://ebird.org/hotspot/${shown.id}/about`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
        >
          Hotspot details <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
        <h4 className="text-xs text-slate-600">
          {detail ? (
            <>
              <span className="font-semibold">{detail.liferCount}</span> species above{" "}
              <span className="font-semibold">{Math.round(detail.frequency * 100)}%</span> frequency · year-round
            </>
          ) : (
            "Species"
          )}
        </h4>
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {detail?.lifers.map((l) => {
          const photo = avicommonsPhoto(avicommons, l.code);
          return (
            <a
              key={l.code}
              href={`https://ebird.org/species/${l.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2.5 border-b border-slate-100 py-1.5 last:border-b-0"
            >
              {photo ? (
                <img
                  src={photo.url}
                  alt={l.name}
                  title={`By ${photo.by}`}
                  loading="lazy"
                  className="h-9 w-12 shrink-0 rounded-md bg-slate-100 object-cover"
                />
              ) : (
                <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300">
                  <Bird className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-slate-800 group-hover:text-emerald-700">
                {l.name}
              </span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">{Math.round(l.score)}%</span>
            </a>
          );
        })}
        {detail && detail.lifers.length === 0 && (
          <p className="py-2 text-center text-xs text-slate-500">No new species here at this frequency.</p>
        )}
        <CitationFooter citation={citation} />
      </div>
    </div>
  );
}

// --- Small controls ---------------------------------------------------------

function MapCredits({ citation }: { citation?: string }) {
  return (
    <Dialog>
      <DialogTrigger
        className="absolute bottom-3 right-3 z-10 rounded-full border border-slate-200 bg-white/90 p-1 text-slate-500 shadow-lg backdrop-blur hover:text-slate-800"
        aria-label="Map credits and data sources"
      >
        <Info className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Credits &amp; data sources</DialogTitle>
        </DialogHeader>
        <dl className="space-y-4 text-sm text-slate-600">
          <div>
            <dt className="font-medium text-slate-800">Base map</dt>
            <dd className="mt-1">
              ©{" "}
              <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
                OpenFreeMap
              </a>
              , ©{" "}
              <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
                OpenMapTiles
              </a>
              , data from{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
                © OpenStreetMap
              </a>{" "}
              contributors
            </dd>
          </div>
          {citation && (
            <div>
              <dt className="font-medium text-slate-800">eBird Data</dt>
              <dd className="mt-1">{citation}</dd>
            </div>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function UploadArea({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
          1
        </span>
        <a
          href="https://ebird.org/lifelist?r=world&time=life&fmt=csv"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
        >
          Download your life list from eBird
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
          2
        </span>
        <span className="font-medium">Drop it below</span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-emerald-400"
        )}
      >
        <Upload className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
        <p className="text-sm font-medium text-slate-800">Drag &amp; drop your CSV</p>
        <p className="mt-0.5 text-xs text-slate-500">or click to choose a file</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function LifeListChip({
  fileName,
  count,
  matched,
  onReplace,
}: {
  fileName: string | null;
  count: number;
  matched?: number;
  onReplace: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <Binoculars className="h-4 w-4 shrink-0 text-emerald-600" />
      <span className="min-w-0 flex-1 truncate text-sm text-emerald-900">
        <span className="font-semibold">{(matched ?? count).toLocaleString()}</span> species
        {fileName ? <span className="text-emerald-700/70"> · {fileName}</span> : null}
      </span>
      <button
        className="shrink-0 text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
        onClick={() => inputRef.current?.click()}
      >
        Replace
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onReplace(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** A native <select> styled as a toggle pill — no label, chevron as the only affordance. */
function PillSelect({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (value: string) => void;
  options: { value: number; label: string }[];
}) {
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-full border border-slate-300 bg-white py-1 pl-3 pr-6 text-xs font-medium text-slate-700 shadow-xs hover:border-emerald-400 hover:text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
    </span>
  );
}

export default BestHotspots;
