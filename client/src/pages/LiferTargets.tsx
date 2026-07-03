import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cellToBoundary } from "h3-js";
import {
  Binoculars,
  Upload,
  MapPin,
  ChevronDown,
  ChevronRight,
  X,
  Info,
  Hexagon,
  ExternalLink,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import RegionSearch from "@/components/RegionSearch";
import LiferMap, { type LiferMapHandle, type LiferMapItem } from "@/components/LiferMap";
import { cn, mutate } from "@/lib/utils";
import { parseEbirdCsv, EbirdCsvError } from "@/lib/ebirdCsv";
import {
  useLiferTargetsStore,
  FREQUENCY_PRESETS,
  MIN_CHECKLIST_PRESETS,
  type LiferMode,
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

type ZoneItem = {
  cellRef: number;
  h3: string;
  lat: number;
  lng: number;
  regionCode: string;
  regionName: string | null;
  anchorHotspot: { id: string; name: string } | null;
  lifers: number;
  totalSpecies: number;
  checklists: number;
};

type ApiResponse<T> = {
  items: T[];
  meta: {
    seenMatched: number;
    seenUnmatched: number;
    unmatchedSample?: string[];
    frequencyPct: number;
    minChecklists: number;
    version: string;
  };
  citation?: string;
  queryTime: string;
};

// Normalized result shared by both modes.
type ResultItem = {
  key: string;
  title: string;
  subtitle: string;
  regionCode: string;
  lat: number;
  lng: number;
  h3?: string;
  lifers: number;
  totalSpecies: number;
  checklists: number;
  externalUrl: string;
  externalLabel: string;
  detailPath: string;
};

type LiferSpecies = { code: string; name: string; sciName: string; score: number };

type SpeciesPayload = { sciName: string; commonName: string }[];

const LiferTargets = () => {
  useEffect(() => {
    document.title = "Lifer Targets | OpenBirding";
  }, []);

  const {
    lifeList,
    fileName,
    mode,
    frequency,
    minChecklists,
    region,
    setLifeList,
    clearLifeList,
    setMode,
    setFrequency,
    setMinChecklists,
    setRegion,
  } = useLiferTargetsStore();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const mapHandle = useRef<LiferMapHandle>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const speciesPayload: SpeciesPayload = useMemo(
    () => (lifeList ? lifeList.map((e) => ({ sciName: e.sciName, commonName: e.commonName })) : []),
    [lifeList]
  );

  const { data, isFetching, isPlaceholderData, error } = useQuery<ApiResponse<HotspotItem | ZoneItem>>({
    queryKey: [
      "lifer-targets",
      mode,
      lifeList?.length ?? 0,
      fileName,
      frequency,
      minChecklists,
      region?.regionCode ?? "",
    ],
    enabled: !!lifeList && lifeList.length > 0,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: () =>
      mutate("POST", mode === "hotspots" ? "/lifers/hotspots" : "/lifers/zones", {
        species: speciesPayload,
        frequency,
        minChecklists,
        region: region?.regionCode || undefined,
        limit: 100,
      }) as Promise<ApiResponse<HotspotItem | ZoneItem>>,
  });

  // While a mode switch is in flight the previous mode's data is still showing;
  // render it under the previous mode's rules so hexes/points stay coherent.
  const dataMode: LiferMode = useMemo(() => {
    if (!data?.items?.length) return mode;
    return (data.items[0] as ZoneItem).h3 ? "zones" : "hotspots";
  }, [data, mode]);

  const results: ResultItem[] = useMemo(() => {
    if (!data?.items) return [];
    if (dataMode === "hotspots") {
      return (data.items as HotspotItem[]).map((h) => ({
        key: h.id,
        title: h.name,
        subtitle: h.regionName ?? h.regionCode,
        regionCode: h.regionCode,
        lat: h.lat,
        lng: h.lng,
        lifers: h.lifers,
        totalSpecies: h.totalSpecies,
        checklists: h.checklists,
        externalUrl: `https://ebird.org/hotspot/${h.id}`,
        externalLabel: "View on eBird",
        detailPath: `/lifers/hotspot/${h.id}`,
      }));
    }
    return (data.items as ZoneItem[]).map((z) => ({
      key: `z${z.cellRef}`,
      title: z.anchorHotspot ? `${z.anchorHotspot.name} area` : `Unnamed area`,
      subtitle: z.regionName ?? z.regionCode,
      regionCode: z.regionCode,
      lat: z.lat,
      lng: z.lng,
      h3: z.h3,
      lifers: z.lifers,
      totalSpecies: z.totalSpecies,
      checklists: z.checklists,
      externalUrl: `https://www.google.com/maps/@${z.lat},${z.lng},12z`,
      externalLabel: "Google Maps",
      detailPath: `/lifers/zone/${z.cellRef}`,
    }));
  }, [data, dataMode]);

  const mapItems: LiferMapItem[] = useMemo(
    () =>
      results.map((r) => ({
        id: r.key,
        name: r.title,
        subtitle: r.subtitle,
        lat: r.lat,
        lng: r.lng,
        lifers: r.lifers,
        h3: r.h3,
      })),
    [results]
  );

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseEbirdCsv(text);
      setLifeList(parsed.entries, file.name);
      setSelectedKey(null);
      toast.success(`Loaded ${parsed.entries.length.toLocaleString()} species from ${file.name}`);
    } catch (err) {
      const message = err instanceof EbirdCsvError ? err.message : "Could not read that file.";
      toast.error(message);
    }
  };

  const selectFromList = (key: string) => {
    const next = selectedKey === key ? null : key;
    setSelectedKey(next);
    if (next) mapHandle.current?.flyTo(next);
  };

  const selectFromMap = (key: string | null) => {
    setSelectedKey(key);
    if (key) {
      // Let the row expand first so the scroll target has its final size.
      requestAnimationFrame(() => {
        rowRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  };

  const switchMode = (m: LiferMode) => {
    if (m === mode) return;
    setMode(m);
    setSelectedKey(null);
    setHoveredKey(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Binoculars className="h-6 w-6 text-emerald-600" />
          <h1 className="text-3xl font-bold text-slate-900">Lifer Targets</h1>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
            Experimental
          </Badge>
        </div>
        <p className="text-slate-600 max-w-2xl">
          Upload your eBird life list and discover where — anywhere in the world — you can see the most species you
          haven't recorded yet.
        </p>
      </div>

      {!lifeList ? (
        <UploadPanel onFile={handleFile} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <LifeListChip
              fileName={fileName}
              count={lifeList.length}
              matched={data?.meta.seenMatched}
              onReplace={handleFile}
              onClear={() => {
                clearLifeList();
                setSelectedKey(null);
              }}
            />
            <ModeToggle mode={mode} onChange={switchMode} />
          </div>

          <div className="flex flex-wrap items-end gap-4 mb-5">
            <div className="min-w-[240px] flex-1 max-w-sm">
              <label className="block text-xs font-medium text-slate-500 mb-1">Region (optional)</label>
              <RegionSearch value={region} onChange={setRegion} />
            </div>
            <PresetSelect
              label="Min. frequency"
              value={frequency}
              onChange={(v) => setFrequency(Number(v))}
              options={FREQUENCY_PRESETS.map((p) => ({ value: p.value, label: `${p.label} — ${p.hint}` }))}
            />
            <PresetSelect
              label="Min. checklists"
              value={minChecklists}
              onChange={(v) => setMinChecklists(Number(v))}
              options={MIN_CHECKLIST_PRESETS.map((n) => ({ value: n, label: `${n}+ checklists` }))}
            />
          </div>

          {data?.meta && data.meta.seenUnmatched > 0 && (
            <p className="text-xs text-slate-500 mb-4 flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Matched {data.meta.seenMatched.toLocaleString()} of your species to the eBird taxonomy.{" "}
              {data.meta.seenUnmatched} couldn't be matched (usually hybrids, "spuh", or slash entries) and are ignored.
            </p>
          )}

          {error ? (
            <Card className="bg-red-50 border-red-200">
              <CardContent>
                <p className="text-red-700 text-center">{(error as Error).message}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,44%)] gap-6 items-start">
              <div
                className={cn(
                  "order-2 lg:order-1 transition-opacity",
                  isPlaceholderData && isFetching && "opacity-50 pointer-events-none"
                )}
              >
                <ResultsList
                  mode={dataMode}
                  items={results}
                  isLoading={isFetching && !data}
                  selectedKey={selectedKey}
                  hoveredKey={hoveredKey}
                  onSelect={selectFromList}
                  onHover={setHoveredKey}
                  rowRefs={rowRefs.current}
                  frequency={frequency}
                  species={speciesPayload}
                  meta={data?.meta}
                  queryTime={data?.queryTime}
                />
              </div>
              <div className="order-1 lg:order-2 relative lg:sticky lg:top-20 h-[360px] lg:h-[calc(100vh-7rem)] min-h-[360px] rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                <LiferMap
                  ref={mapHandle}
                  items={mapItems}
                  selectedId={selectedKey}
                  hoveredId={hoveredKey}
                  onSelect={(key, fromMap) => (fromMap ? selectFromMap(key) : setSelectedKey(key))}
                  onHover={setHoveredKey}
                />
                {isFetching && (
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full bg-white/90 border border-slate-200 shadow-sm px-3 py-1.5 text-xs font-medium text-slate-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                    Finding the best {mode === "hotspots" ? "hotspots" : "zones"}…
                  </div>
                )}
                {!isFetching && results.length === 0 && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/80 text-slate-500 text-sm">
                    Nothing to map
                  </div>
                )}
              </div>
            </div>
          )}

          {data?.citation && <p className="mt-6 text-xs text-slate-500 max-w-2xl">{data.citation}</p>}
        </>
      )}
    </div>
  );
};

// --- Mode toggle ------------------------------------------------------------

function ModeToggle({ mode, onChange }: { mode: LiferMode; onChange: (m: LiferMode) => void }) {
  const options: { value: LiferMode; icon: typeof MapPin; label: string; hint: string }[] = [
    { value: "hotspots", icon: MapPin, label: "Hotspots", hint: "Specific birding sites" },
    { value: "zones", icon: Hexagon, label: "Zones", hint: "~36 km² areas, great for trips" },
  ];
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-1" role="tablist" aria-label="Result type">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={mode === o.value}
          className={cn(
            "flex flex-col items-start px-3 py-1.5 rounded-md transition-colors text-left",
            mode === o.value ? "bg-white shadow-sm" : "hover:bg-slate-200/60"
          )}
          onClick={() => onChange(o.value)}
        >
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium",
              mode === o.value ? "text-emerald-700" : "text-slate-600"
            )}
          >
            <o.icon className="h-4 w-4" /> {o.label}
          </span>
          <span className="text-[11px] text-slate-400 leading-tight">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

// --- Upload panel -----------------------------------------------------------

function UploadPanel({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="max-w-2xl">
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
        className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-emerald-400"
        }`}
      >
        <Upload className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
        <p className="text-slate-800 font-medium">Drop your eBird life list CSV here</p>
        <p className="text-slate-500 text-sm mt-1">or click to choose a file</p>
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

      <div className="mt-6 text-sm text-slate-600 space-y-2">
        <p className="font-medium text-slate-700">How to get your life list from eBird:</p>
        <ol className="list-decimal list-inside space-y-1 text-slate-600">
          <li>
            Go to{" "}
            <a
              href="https://ebird.org/lifelist"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              ebird.org/lifelist
            </a>{" "}
            (World, Life).
          </li>
          <li>Click the download / spreadsheet icon to export a CSV.</li>
          <li>Drop the file above — it stays in your browser and is never stored on our servers.</li>
        </ol>
      </div>
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
    <div className="flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 pl-4 pr-2 py-1.5">
      <Binoculars className="h-4 w-4 text-emerald-600" />
      <span className="text-sm text-emerald-900">
        <span className="font-semibold">{(matched ?? count).toLocaleString()}</span> species
        {fileName ? <span className="text-emerald-700/70"> · {fileName}</span> : null}
      </span>
      <button
        className="text-emerald-700 hover:text-emerald-900 text-xs underline underline-offset-2 ml-1"
        onClick={() => inputRef.current?.click()}
      >
        Replace
      </button>
      <button className="text-emerald-700/60 hover:text-emerald-900 p-1" onClick={onClear} aria-label="Clear life list">
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
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-xs focus:border-emerald-500 focus:outline-none"
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

// --- Results ----------------------------------------------------------------

function ResultsList({
  mode,
  items,
  isLoading,
  selectedKey,
  hoveredKey,
  onSelect,
  onHover,
  rowRefs,
  frequency,
  species,
  meta,
  queryTime,
}: {
  mode: LiferMode;
  items: ResultItem[];
  isLoading: boolean;
  selectedKey: string | null;
  hoveredKey: string | null;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
  rowRefs: Map<string, HTMLDivElement>;
  frequency: number;
  species: SpeciesPayload;
  meta?: ApiResponse<unknown>["meta"];
  queryTime?: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-[72px] rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="bg-slate-50 border-slate-200">
        <CardContent>
          <p className="text-slate-700 text-center">
            No {mode === "hotspots" ? "hotspots" : "zones"} match these filters. Try a lower minimum frequency or fewer
            required checklists.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-bold text-slate-900">
          Top {items.length} {mode === "hotspots" ? "hotspots" : "zones"} for new lifers
        </h2>
        {queryTime && meta && (
          <span className="text-xs text-slate-400">
            ≥{meta.frequencyPct}% · {meta.minChecklists}+ lists · {queryTime}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <ResultRow
            key={item.key}
            mode={mode}
            rank={i + 1}
            item={item}
            selected={item.key === selectedKey}
            hovered={item.key === hoveredKey}
            onSelect={() => onSelect(item.key)}
            onHover={onHover}
            rowRef={(el) => {
              if (el) rowRefs.set(item.key, el);
              else rowRefs.delete(item.key);
            }}
            frequency={frequency}
            species={species}
          />
        ))}
      </div>
    </div>
  );
}

function ResultRow({
  mode,
  rank,
  item,
  selected,
  hovered,
  onSelect,
  onHover,
  rowRef,
  frequency,
  species,
}: {
  mode: LiferMode;
  rank: number;
  item: ResultItem;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (key: string | null) => void;
  rowRef: (el: HTMLDivElement | null) => void;
  frequency: number;
  species: SpeciesPayload;
}) {
  const pctNew = item.totalSpecies > 0 ? Math.round((item.lifers / item.totalSpecies) * 100) : 0;

  return (
    <div
      ref={rowRef}
      className={cn(
        "rounded-lg border bg-white transition-colors scroll-mt-20",
        selected
          ? "border-amber-400 ring-1 ring-amber-300"
          : hovered
            ? "border-emerald-400"
            : "border-slate-200 hover:border-emerald-300"
      )}
      onMouseEnter={() => onHover(item.key)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={onSelect}
        role="button"
        aria-expanded={selected}
      >
        <span className="w-6 text-center font-bold text-slate-400 tabular-nums">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 truncate">{item.title}</div>
          <div className="text-xs text-slate-500 flex items-center gap-1 truncate">
            {mode === "hotspots" ? <MapPin className="h-3 w-3 shrink-0" /> : <Hexagon className="h-3 w-3 shrink-0" />}
            <span className="truncate">
              {item.subtitle} · {item.checklists.toLocaleString()} checklists
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-emerald-600 leading-none tabular-nums">{item.lifers}</div>
          <div className="text-[11px] text-slate-400">
            {pctNew}% of {item.totalSpecies} spp.
          </div>
        </div>
        <span className="text-slate-400 p-1">
          {selected ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </span>
      </div>

      {selected && <RowDetail mode={mode} item={item} frequency={frequency} species={species} />}
    </div>
  );
}

// --- Expanded detail --------------------------------------------------------

const SPECIES_PREVIEW_COUNT = 48;

function RowDetail({
  mode,
  item,
  frequency,
  species,
}: {
  mode: LiferMode;
  item: ResultItem;
  frequency: number;
  species: SpeciesPayload;
}) {
  const [showAll, setShowAll] = useState(false);

  const { data: detail, isFetching } = useQuery<{ lifers: LiferSpecies[]; liferCount: number }>({
    queryKey: ["lifer-detail", item.detailPath, frequency, species.length],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", item.detailPath, { species, frequency }) as Promise<{
        lifers: LiferSpecies[];
        liferCount: number;
      }>,
  });

  const visible = showAll ? detail?.lifers : detail?.lifers.slice(0, SPECIES_PREVIEW_COUNT);

  return (
    <div className="border-t border-slate-100 px-3 py-3 bg-slate-50/60 space-y-3">
      {mode === "zones" && item.h3 && <ZoneHotspots item={item} frequency={frequency} species={species} />}

      {isFetching ? (
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading species…
        </p>
      ) : detail && detail.lifers.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">
            {detail.liferCount} potential lifers, most likely first:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visible?.map((s) => (
              <a
                key={s.code}
                href={`https://ebird.org/species/${s.code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:border-emerald-400 hover:text-emerald-800"
                title={`${s.sciName} — recorded on ~${s.score}% of checklists`}
              >
                {s.name}
                <span className="text-emerald-600 font-medium">{s.score}%</span>
              </a>
            ))}
            {!showAll && detail.lifers.length > SPECIES_PREVIEW_COUNT && (
              <button
                className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
                onClick={() => setShowAll(true)}
              >
                +{detail.lifers.length - SPECIES_PREVIEW_COUNT} more
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No species details available.</p>
      )}

      <div>
        <a
          href={item.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
        >
          {item.externalLabel} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/** Top hotspots inside an expanded zone — the bridge from "area" to "go here". */
function ZoneHotspots({
  item,
  frequency,
  species,
}: {
  item: ResultItem;
  frequency: number;
  species: SpeciesPayload;
}) {
  const bbox = useMemo(() => {
    if (!item.h3) return null;
    const ring = cellToBoundary(item.h3, true) as [number, number][];
    const lngs = ring.map(([lng]) => lng);
    const lats = ring.map(([, lat]) => lat);
    // Cells straddling the antimeridian don't box cleanly; skip the lookup.
    if (Math.max(...lngs) - Math.min(...lngs) > 180) return null;
    return {
      minLng: Math.min(...lngs),
      minLat: Math.min(...lats),
      maxLng: Math.max(...lngs),
      maxLat: Math.max(...lats),
    };
  }, [item.h3]);

  const { data, isFetching } = useQuery<ApiResponse<HotspotItem>>({
    queryKey: ["zone-hotspots", item.key, frequency, species.length],
    enabled: !!bbox,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", "/lifers/hotspots", {
        species,
        frequency,
        minChecklists: 10,
        bbox,
        limit: 5,
      }) as Promise<ApiResponse<HotspotItem>>,
  });

  if (!bbox) return null;
  if (isFetching) {
    return (
      <p className="text-sm text-slate-400 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding hotspots in this zone…
      </p>
    );
  }
  if (!data?.items?.length) return null;

  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1.5">Best hotspots in this zone:</p>
      <div className="space-y-1">
        {data.items.map((h) => (
          <a
            key={h.id}
            href={`https://ebird.org/hotspot/${h.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-2.5 py-1.5 text-sm hover:border-emerald-400 group"
          >
            <MapPin className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0" />
            <span className="flex-1 truncate text-slate-700 group-hover:text-emerald-900">{h.name}</span>
            <span className="text-xs text-slate-400 shrink-0">{h.checklists.toLocaleString()} lists</span>
            <span className="text-sm font-bold text-emerald-600 tabular-nums shrink-0">{h.lifers}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default LiferTargets;
