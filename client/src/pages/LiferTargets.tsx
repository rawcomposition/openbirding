import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cellToBoundary, latLngToCell } from "h3-js";
import { Binoculars, Upload, MapPin, X, Loader2, Hexagon, Eraser, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import RegionSearch from "@/components/RegionSearch";
import LiferGridMap, { type GridMapHandle, type Bbox } from "@/components/LiferGridMap";
import { cn, mutate } from "@/lib/utils";
import { MARKER_COLORS } from "@/lib/liferColors";
import { parseEbirdCsv, EbirdCsvError } from "@/lib/ebirdCsv";
import {
  useLiferTargetsStore,
  FREQUENCY_PRESETS,
  MIN_CHECKLIST_PRESETS,
  type LiferRegionFilter,
} from "@/stores/liferTargetsStore";

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
type SpeciesPayload = { sciName: string; commonName: string }[];
type CellInfo = { h3: string; samples: number; totalSpecies: number; lifers: number };

const HOTSPOT_LIMIT = 50;

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
    lifeList,
    fileName,
    frequency,
    minChecklists,
    regions,
    selection,
    setLifeList,
    clearLifeList,
    setFrequency,
    setMinChecklists,
    addRegion,
    removeRegion,
    toggleCell,
    clearSelection,
  } = useLiferTargetsStore();

  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null);
  const mapHandle = useRef<GridMapHandle>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const species: SpeciesPayload = useMemo(
    () => (lifeList ? lifeList.map((e) => ({ sciName: e.sciName, commonName: e.commonName })) : []),
    [lifeList]
  );

  const { data: status } = useQuery<StatusResponse>({
    queryKey: ["/lifers/status"],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const resolutions = status?.resolutions ?? [3, 4, 5, 6];

  // Fixed, personalised colour scale: worldwide max lifers per resolution, so
  // panning never recolours the grid (only zooming, which changes resolution).
  const { data: scaleData } = useQuery<{ maxByRes: Record<number, number> }>({
    queryKey: ["lifer-grid-scale", species.length, fileName],
    enabled: !!lifeList && lifeList.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: () => mutate("POST", "/lifers/grid-scale", { species }) as Promise<{ maxByRes: Record<number, number> }>,
  });
  const maxByRes = scaleData?.maxByRes ?? null;

  // Result scope: a hex selection takes priority; otherwise the chosen regions.
  const scope: { kind: "hex"; bbox: Bbox | null } | { kind: "region"; codes: string } | null = useMemo(() => {
    if (selection && selection.cells.length) return { kind: "hex", bbox: cellsBbox(selection.cells) };
    if (regions.length) return { kind: "region", codes: regions.map((r) => r.regionCode).join(",") };
    return null;
  }, [selection, regions]);

  const scopeKey =
    scope?.kind === "hex" ? `hex:${selection?.cells.join(",")}` : scope?.kind === "region" ? `region:${scope.codes}` : "none";

  const { data: results, isFetching } = useQuery<HotspotResponse>({
    queryKey: ["lifer-hotspots", scopeKey, frequency, minChecklists, species.length, fileName],
    enabled: !!lifeList && lifeList.length > 0 && !!scope,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: () => {
      const body: Record<string, unknown> = { species, frequency, minChecklists, limit: HOTSPOT_LIMIT };
      if (scope?.kind === "hex") body.bbox = scope.bbox;
      else if (scope?.kind === "region") body.region = scope.codes;
      return mutate("POST", "/lifers/hotspots", body) as Promise<HotspotResponse>;
    },
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
    queryKey: ["lifer-cells", selection?.resolution, selection?.cells.join(","), species.length],
    enabled: !!lifeList && !!selection && selection.cells.length > 0,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", "/lifers/cells", {
        species,
        resolution: selection!.resolution,
        cells: selection!.cells,
      }) as Promise<{ cells: CellInfo[] }>,
  });

  // Frame the map on a region when the region set changes (unless hexes are active).
  const regionKey = regions.map((r) => r.regionCode).join(",");
  useEffect(() => {
    if (!regionKey || (selection && selection.cells.length)) return;
    let cancelled = false;
    (async () => {
      const res = (await mutate("POST", "/lifers/region-bounds", { region: regionKey })) as { bbox: Bbox | null };
      if (!cancelled && res.bbox) mapHandle.current?.fitBounds(res.bbox);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey]);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseEbirdCsv(text);
      setLifeList(parsed.entries, file.name);
      setSelectedHotspotId(null);
      toast.success(`Loaded ${parsed.entries.length.toLocaleString()} species from ${file.name}`);
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
        species={species}
        resolutions={resolutions}
        maxByRes={maxByRes}
        selectedCells={selectedCells}
        onToggleCell={toggleCell}
        onResolutionChange={handleResolutionChange}
      />

      <ControlPanel
        lifeList={lifeList}
        fileName={fileName}
        matched={results?.meta.seenMatched}
        onFile={handleFile}
        onClearLifeList={() => {
          clearLifeList();
          setSelectedHotspotId(null);
        }}
        regions={regions}
        onAddRegion={addRegion}
        onRemoveRegion={removeRegion}
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

// --- Overlay panel ----------------------------------------------------------

function ControlPanel(props: {
  lifeList: { sciName: string; commonName: string }[] | null;
  fileName: string | null;
  matched?: number;
  onFile: (f: File) => void;
  onClearLifeList: () => void;
  regions: LiferRegionFilter[];
  onAddRegion: (r: LiferRegionFilter) => void;
  onRemoveRegion: (code: string) => void;
  frequency: number;
  onFrequency: (v: number) => void;
  minChecklists: number;
  onMinChecklists: (v: number) => void;
  selectedCells: string[];
  cellsInfo: CellInfo[] | null;
  onClearSelection: () => void;
  scopeKind: "hex" | "region" | null;
  hotspots: HotspotItem[];
  isFetching: boolean;
  selectedHotspotId: string | null;
  hoveredHotspotId: string | null;
  onSelectHotspot: (h: HotspotItem) => void;
  onHoverHotspot: (id: string | null) => void;
  rowRefs: Map<string, HTMLDivElement>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasList = !!props.lifeList;

  return (
    <div className="absolute left-3 top-3 z-10 flex max-h-[calc(100%_-_1.5rem)] w-[calc(100vw_-_1.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur sm:w-[23rem]">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2">
          <Binoculars className="h-5 w-5 text-emerald-600" />
          <span className="text-base font-bold tracking-tight text-slate-900">Lifer Targets</span>
        </span>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {!hasList ? (
            <UploadArea onFile={props.onFile} />
          ) : (
            <>
              <LifeListChip
                fileName={props.fileName}
                count={props.lifeList!.length}
                matched={props.matched}
                onReplace={props.onFile}
                onClear={props.onClearLifeList}
              />

              <Legend />

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Regions</label>
                <RegionSearch value={null} onChange={(r) => r && props.onAddRegion(r)} />
                {props.regions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {props.regions.map((r) => (
                      <span
                        key={r.regionCode}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-2 pr-1 text-xs text-slate-700"
                      >
                        <MapPin className="h-3 w-3 text-slate-400" />
                        {r.regionName}
                        <button
                          onClick={() => props.onRemoveRegion(r.regionCode)}
                          className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                          aria-label={`Remove ${r.regionName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

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
                    <div className="mt-1.5 space-y-0.5 border-t border-amber-200/70 pt-1.5 font-mono text-[10.5px] text-amber-800/90">
                      {props.cellsInfo.map((c, i) => (
                        <div key={c.h3} className="flex items-center justify-between gap-2">
                          <span className="text-amber-700/70">#{i + 1}</span>
                          <span>{c.samples.toLocaleString()} checklists</span>
                          <span>{c.totalSpecies} spp.</span>
                          <span className="font-semibold text-amber-900">{c.lifers} lifers</span>
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
            </>
          )}
        </div>
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
  scopeKind: "hex" | "region" | null;
  hotspots: HotspotItem[];
  isFetching: boolean;
  selectedHotspotId: string | null;
  hoveredHotspotId: string | null;
  onSelect: (h: HotspotItem) => void;
  onHover: (id: string | null) => void;
  rowRefs: Map<string, HTMLDivElement>;
}) {
  if (!scopeKind) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
        Add a region or tap hexes on the map to see the best hotspots for new lifers there.
      </div>
    );
  }

  return (
    <div className="min-h-0">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Best hotspots {scopeKind === "hex" ? "in selection" : "in region"}
        </h2>
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />}
      </div>
      {hotspots.length === 0 && !isFetching ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
          No hotspots match these filters. Try a lower frequency or fewer required checklists.
        </p>
      ) : (
        <div className="space-y-1.5">
          {hotspots.map((h, i) => (
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
                "flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-2.5 py-2 scroll-mt-2 transition-colors",
                h.id === selectedHotspotId
                  ? "border-amber-400 ring-1 ring-amber-300"
                  : h.id === hoveredHotspotId
                    ? "border-emerald-400"
                    : "border-slate-200 hover:border-emerald-300"
              )}
            >
              <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <a
                  href={`https://ebird.org/hotspot/${h.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block truncate text-sm font-medium text-slate-800 hover:text-emerald-700"
                >
                  {h.name}
                </a>
                <div className="truncate text-[11px] text-slate-400">
                  {h.regionName ?? h.regionCode} · {h.checklists.toLocaleString()} lists
                </div>
              </div>
              <span className="shrink-0 text-lg font-bold tabular-nums text-emerald-600">{h.lifers}</span>
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
        (World, Life). It stays in your browser and is never uploaded.
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
