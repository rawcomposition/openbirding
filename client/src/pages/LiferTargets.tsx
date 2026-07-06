import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cellToBoundary, latLngToCell } from "h3-js";
import { Binoculars, Upload, X, Loader2, Hexagon, Eraser, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import toast from "react-hot-toast";
import LiferGridMap, { type GridMapHandle, type Bbox } from "@/components/LiferGridMap";
import { cn, mutate } from "@/lib/utils";
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
  meta: { seenMatched: number; seenUnmatched: number; frequencyPct: number; minChecklists: number };
  queryTime: string;
};

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
  const p = new URLSearchParams({ r1: hotspotId, bmo: "1", emo: "12", r2: "world", t2: "life", mediaType: "" });
  return `https://ebird.org/targets?${p.toString()}`;
}

/** Union bounding box over a set of H3 cells (skips antimeridian-straddling sets). */
function cellsBbox(cells: string[]): Bbox | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const h of cells) {
    const ring = cellToBoundary(h, true) as [number, number][];
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng)) return null;
  if (maxLng - minLng > 180) return null;
  return { minLng, minLat, maxLng, maxLat };
}

const LiferTargets = () => {
  useEffect(() => {
    document.title = "Lifer Targets | OpenBirding";
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

  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null);
  // The map's settled viewport — the default scope for hotspot results.
  const [viewport, setViewport] = useState<{ bbox: Bbox; resolution: number } | null>(null);
  const mapHandle = useRef<GridMapHandle>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const onViewportChange = useCallback((bbox: Bbox, resolution: number) => {
    setViewport({ bbox, resolution });
  }, []);

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
      setSelectedHotspotId(null);
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
    const next = selectedHotspotId === h.id ? null : h.id;
    setSelectedHotspotId(next);
    if (next) mapHandle.current?.flyTo(h.lng, h.lat);
  };

  const selectedCells = selection?.cells ?? [];

  return (
    <div className="relative h-[calc(100vh_-_4rem)] w-full overflow-hidden">
      <LiferGridMap
        ref={mapHandle}
        listToken={listToken}
        resolutions={resolutions}
        breaksByRes={breaksByRes}
        selectedCells={selectedCells}
        onToggleCell={toggleCell}
        onResolutionChange={handleResolutionChange}
        onViewportChange={onViewportChange}
      />

      <Sidebar
        speciesCount={speciesCount}
        hasList={!!listToken || !!legacyLifeList}
        fileName={fileName}
        matched={results?.meta.seenMatched}
        onFile={handleFile}
        onClearLifeList={() => {
          if (listToken) mutate("DELETE", `/lifers/list/${listToken}`).catch(() => {});
          clearLifeList();
          setSelectedHotspotId(null);
        }}
        frequency={frequency}
        onFrequency={setFrequency}
        minChecklists={minChecklists}
        onMinChecklists={setMinChecklists}
        selectedCells={selectedCells}
        cellsInfo={cellsData?.cells ?? null}
        onClearSelection={clearSelection}
        scopeKind={scope?.kind ?? null}
        hotspots={hotspots}
        isFetching={isFetching}
        selectedHotspotId={selectedHotspotId}
        hoveredHotspotId={hoveredHotspotId}
        onSelectHotspot={selectHotspotFromList}
        onHoverHotspot={setHoveredHotspotId}
        rowRefs={rowRefs.current}
      />
    </div>
  );
};

// --- Docked sidebar ----------------------------------------------------------

function Sidebar(props: {
  speciesCount: number | null;
  hasList: boolean;
  fileName: string | null;
  matched?: number;
  onFile: (f: File) => void;
  onClearLifeList: () => void;
  frequency: number;
  onFrequency: (v: number) => void;
  minChecklists: number;
  onMinChecklists: (v: number) => void;
  selectedCells: string[];
  cellsInfo: CellInfo[] | null;
  onClearSelection: () => void;
  scopeKind: "hex" | "view" | null;
  hotspots: HotspotItem[];
  isFetching: boolean;
  selectedHotspotId: string | null;
  hoveredHotspotId: string | null;
  onSelectHotspot: (h: HotspotItem) => void;
  onHoverHotspot: (id: string | null) => void;
  rowRefs: Map<string, HTMLDivElement>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasList = props.hasList;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur hover:border-emerald-300"
        aria-label="Open Lifer Targets panel"
      >
        <Binoculars className="h-5 w-5 text-emerald-600" />
        <span className="text-sm font-bold tracking-tight text-slate-900">Lifer Targets</span>
        <PanelLeftOpen className="h-4 w-4 text-slate-400" />
      </button>
    );
  }

  return (
    <div className="absolute inset-y-0 left-0 z-10 flex w-[min(24rem,calc(100vw_-_2.5rem))] flex-col border-r border-slate-200 bg-white/95 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2">
          <Binoculars className="h-5 w-5 text-emerald-600" />
          <span className="text-base font-bold tracking-tight text-slate-900">Lifer Targets</span>
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
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
              onClear={props.onClearLifeList}
            />

            <Legend />

            {props.selectedCells.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
                      <Hexagon className="h-4 w-4" />
                      {props.selectedCells.length} cell{props.selectedCells.length > 1 ? "s" : ""} selected
                    </span>
                    <button
                      onClick={props.onClearSelection}
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-800 shadow-sm hover:bg-amber-100"
                    >
                      <Eraser className="h-3.5 w-3.5" /> Clear
                    </button>
                  </div>
                  {props.cellsInfo && props.cellsInfo.length > 0 && (
                    <div className="mt-1.5 space-y-1.5 border-t border-amber-200/70 pt-1.5 font-mono text-[10.5px] text-amber-800/90">
                      {props.cellsInfo.map((c, i) => (
                        <div key={c.h3} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-amber-700/70">#{i + 1}</span>
                            <span>{c.samples.toLocaleString()} lists</span>
                            <span>{c.totalSpecies} spp.</span>
                            <span className="font-semibold text-amber-900">{c.lifers} lifers</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-amber-700/70">
                            {c.namedHotspots === 0 ? (
                              <span className="italic">no hotspots — effort is dispersed</span>
                            ) : (
                              <>
                                <span>
                                  {c.namedHotspots} hotspot{c.namedHotspots > 1 ? "s" : ""}
                                </span>
                                <span>{c.hotspotChecklists.toLocaleString()} hotspot lists</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            <div className="grid grid-cols-2 gap-2">
              <PresetSelect
                label="Min. frequency"
                value={props.frequency}
                onChange={(v) => props.onFrequency(Number(v))}
                options={FREQUENCY_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
              />
              <PresetSelect
                label="Min. checklists"
                value={props.minChecklists}
                onChange={(v) => props.onMinChecklists(Number(v))}
                options={MIN_CHECKLIST_PRESETS.map((n) => ({ value: n, label: `${n}+` }))}
              />
            </div>
          </>
        )}
      </div>

      {hasList && (
        <HotspotResults
          scopeKind={props.scopeKind}
          hotspots={props.hotspots}
          isFetching={props.isFetching}
          selectedHotspotId={props.selectedHotspotId}
          hoveredHotspotId={props.hoveredHotspotId}
          onSelect={props.onSelectHotspot}
          onHover={props.onHoverHotspot}
          rowRefs={props.rowRefs}
        />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
        <span>Fewer lifers</span>
        <span>More</span>
      </div>
      <div
        className="h-2 w-full rounded-full"
        style={{ background: `linear-gradient(to right, ${MARKER_COLORS.join(", ")})` }}
      />
    </div>
  );
}

function HotspotResults({
  scopeKind,
  hotspots,
  isFetching,
  selectedHotspotId,
  hoveredHotspotId,
  onSelect,
  onHover,
  rowRefs,
}: {
  scopeKind: "hex" | "view" | null;
  hotspots: HotspotItem[];
  isFetching: boolean;
  selectedHotspotId: string | null;
  hoveredHotspotId: string | null;
  onSelect: (h: HotspotItem) => void;
  onHover: (id: string | null) => void;
  rowRefs: Map<string, HTMLDivElement>;
}) {
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-slate-100">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Best hotspots {scopeKind === "hex" ? "in selection" : "in view"}
        </h2>
        {isFetching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
        ) : (
          scopeKind === "view" && (
            <span className="text-[11px] text-slate-400">tap hexes to narrow</span>
          )
        )}
      </div>
      {hotspots.length === 0 && !isFetching ? (
        <p className="mx-3 rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
          No hotspots match here. Pan or zoom the map, or relax the frequency / checklist filters.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
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
                  ? "border-amber-400 ring-1 ring-amber-300"
                  : h.id === hoveredHotspotId
                    ? "border-emerald-400"
                    : "border-slate-200 hover:border-emerald-300"
              )}
            >
              <div className="min-w-0 flex-1">
                <a
                  href={ebirdTargetsUrl(h.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="See your remaining targets here on eBird"
                  className="text-[13px] font-medium leading-snug text-slate-800 hover:text-emerald-700"
                >
                  {h.name}
                </a>
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
        </div>
      )}
    </div>
  );
}

// --- Small controls ---------------------------------------------------------

function UploadArea({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-2">
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
        <p className="text-sm font-medium text-slate-800">Drop your eBird life list CSV</p>
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
      <p className="text-[11px] leading-tight text-slate-500">
        Export from{" "}
        <a
          href="https://ebird.org/lifelist"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald-600 hover:text-emerald-700"
        >
          ebird.org/lifelist
        </a>{" "}
        (World, Life). Your list is stored under an anonymous ID — no account
        needed — so it's ready when you come back. Clearing it deletes it.
      </p>
    </div>
  );
}

function LifeListChip({
  fileName,
  count,
  matched,
  onReplace,
  onClear,
}: {
  fileName: string | null;
  count: number;
  matched?: number;
  onReplace: (file: File) => void;
  onClear: () => void;
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
      <button className="shrink-0 p-1 text-emerald-700/60 hover:text-emerald-900" onClick={onClear} aria-label="Clear life list">
        <X className="h-4 w-4" />
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

function PresetSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  options: { value: number; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 shadow-xs focus:border-emerald-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default LiferTargets;
