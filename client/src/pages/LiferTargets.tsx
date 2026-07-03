import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Binoculars, Upload, MapPin, ChevronDown, ChevronRight, X, Info } from "lucide-react";
import toast from "react-hot-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import RegionSearch from "@/components/RegionSearch";
import LiferMap from "@/components/LiferMap";
import { mutate } from "@/lib/utils";
import { parseEbirdCsv, EbirdCsvError } from "@/lib/ebirdCsv";
import {
  useLiferTargetsStore,
  FREQUENCY_PRESETS,
  MIN_CHECKLIST_PRESETS,
} from "@/stores/liferTargetsStore";

type LiferHotspot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  regionCode: string;
  lifers: number;
  totalSpecies: number;
  checklists: number;
};

type HotspotsResponse = {
  items: LiferHotspot[];
  meta: {
    seenMatched: number;
    seenUnmatched: number;
    unmatchedSample: string[];
    frequencyPct: number;
    minChecklists: number;
    version: string;
  };
  citation?: string;
  queryTime: string;
};

type LiferSpecies = { code: string; name: string; sciName: string; frequency: number; score: number };

const LiferTargets = () => {
  useEffect(() => {
    document.title = "Lifer Targets | OpenBirding";
  }, []);

  const {
    lifeList,
    fileName,
    frequency,
    minChecklists,
    region,
    setLifeList,
    clearLifeList,
    setFrequency,
    setMinChecklists,
    setRegion,
  } = useLiferTargetsStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const speciesPayload = useMemo(
    () => (lifeList ? lifeList.map((e) => ({ sciName: e.sciName, commonName: e.commonName })) : []),
    [lifeList]
  );

  const { data, isFetching, error } = useQuery<HotspotsResponse>({
    queryKey: [
      "lifer-hotspots",
      lifeList?.length ?? 0,
      fileName,
      frequency,
      minChecklists,
      region?.regionCode ?? "",
    ],
    enabled: !!lifeList && lifeList.length > 0,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", "/lifers/hotspots", {
        species: speciesPayload,
        frequency,
        minChecklists,
        region: region?.regionCode || undefined,
        limit: 100,
      }) as Promise<HotspotsResponse>,
  });

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseEbirdCsv(text);
      setLifeList(parsed.entries, file.name);
      setSelectedId(null);
      toast.success(`Loaded ${parsed.entries.length.toLocaleString()} species from ${file.name}`);
    } catch (err) {
      const message = err instanceof EbirdCsvError ? err.message : "Could not read that file.";
      toast.error(message);
    }
  };

  const items = data?.items ?? [];
  const mapPoints = useMemo(
    () => items.map((h) => ({ id: h.id, name: h.name, lat: h.lat, lng: h.lng, lifers: h.lifers })),
    [items]
  );

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
          Upload your eBird life list and discover the hotspots — anywhere in the world — where you can see the most
          species you haven't recorded yet.
        </p>
      </div>

      {!lifeList ? (
        <UploadPanel onFile={handleFile} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <LifeListChip
              fileName={fileName}
              count={lifeList.length}
              matched={data?.meta.seenMatched}
              onReplace={handleFile}
              onClear={() => {
                clearLifeList();
                setSelectedId(null);
              }}
            />
          </div>

          <div className="flex flex-wrap items-end gap-4 mb-6">
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
            <div className="grid lg:grid-cols-[1fr_minmax(360px,42%)] gap-6 items-start">
              <ResultsList
                items={items}
                isLoading={isFetching}
                selectedId={selectedId}
                onSelect={setSelectedId}
                frequency={frequency}
                species={speciesPayload}
                meta={data?.meta}
                queryTime={data?.queryTime}
              />
              <div className="lg:sticky lg:top-20 h-[420px] lg:h-[600px] rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                {mapPoints.length > 0 ? (
                  <LiferMap points={mapPoints} selectedId={selectedId} onSelect={setSelectedId} />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
                    {isFetching ? "Finding hotspots…" : "No hotspots to map"}
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
  items,
  isLoading,
  selectedId,
  onSelect,
  frequency,
  species,
  meta,
  queryTime,
}: {
  items: LiferHotspot[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  frequency: number;
  species: { sciName: string; commonName: string }[];
  meta?: HotspotsResponse["meta"];
  queryTime?: string;
}) {
  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="bg-slate-50 border-slate-200">
        <CardContent>
          <p className="text-slate-700 text-center">
            No hotspots match these filters. Try a lower minimum frequency or fewer required checklists.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-bold text-slate-900">
          Top {items.length} hotspots for new lifers
        </h2>
        {queryTime && meta && (
          <span className="text-xs text-slate-400">
            ≥{meta.frequencyPct}% · {meta.minChecklists}+ lists · {queryTime}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {items.map((h, i) => (
          <HotspotRow
            key={h.id}
            rank={i + 1}
            hotspot={h}
            selected={h.id === selectedId}
            onSelect={() => onSelect(h.id)}
            frequency={frequency}
            species={species}
          />
        ))}
      </div>
    </div>
  );
}

function HotspotRow({
  rank,
  hotspot,
  selected,
  onSelect,
  frequency,
  species,
}: {
  rank: number;
  hotspot: LiferHotspot;
  selected: boolean;
  onSelect: () => void;
  frequency: number;
  species: { sciName: string; commonName: string }[];
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail, isFetching } = useQuery<{ lifers: LiferSpecies[]; liferCount: number }>({
    queryKey: ["lifer-detail", hotspot.id, frequency, species.length],
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      mutate("POST", `/lifers/hotspot/${hotspot.id}`, { species, frequency }) as Promise<{
        lifers: LiferSpecies[];
        liferCount: number;
      }>,
  });

  return (
    <div
      className={`rounded-lg border bg-white transition-colors ${
        selected ? "border-amber-400 ring-1 ring-amber-300" : "border-slate-200 hover:border-emerald-300"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <span className="w-6 text-center font-bold text-slate-400 tabular-nums">{rank}</span>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
          <a
            href={`https://ebird.org/hotspot/${hotspot.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-900 hover:text-emerald-700 truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {hotspot.name}
          </a>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {hotspot.regionCode} · {hotspot.checklists.toLocaleString()} checklists
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-emerald-600 leading-none tabular-nums">{hotspot.lifers}</div>
          <div className="text-[11px] text-slate-400">lifers</div>
        </div>
        <button
          className="text-slate-400 hover:text-slate-700 p-1"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Hide species" : "Show species"}
        >
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-3 py-3 bg-slate-50/60">
          {isFetching ? (
            <p className="text-sm text-slate-400">Loading species…</p>
          ) : detail && detail.lifers.length > 0 ? (
            <>
              <p className="text-xs text-slate-500 mb-2">
                {detail.liferCount} potential lifers, most likely first:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detail.lifers.map((s) => (
                  <span
                    key={s.code}
                    className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700"
                    title={`${s.sciName} — seen on ~${s.score}% of checklists`}
                  >
                    {s.name}
                    <span className="text-emerald-600 font-medium">{s.score}%</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">No species details available.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default LiferTargets;
