import { ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TargetHotspot } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Row,
} from "@tanstack/react-table";
import { useState } from "react";
import HotspotRow from "./HotspotRow";

type Props = {
  hotspots: TargetHotspot[];
  total?: number;
  defaultSort?: { id: string; desc: boolean };
  showDistance?: boolean;
  isLoading?: boolean;
};

const HotspotList = ({ hotspots, total, defaultSort, showDistance, isLoading }: Props) => {
  const [sorting, setSorting] = useState<SortingState>([defaultSort || { id: "species", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns: ColumnDef<TargetHotspot>[] = [
    {
      accessorKey: "name",
      header: "Hotspot",
    },
    {
      accessorKey: "notes",
      header: "Frequency",
    },
    {
      accessorKey: "species",
      header: "Adjusted Frequency",
      enableSorting: true,
    },
    ...(showDistance
      ? [
          {
            accessorKey: "distance",
            header: "Distance",
            enableSorting: true,
            cell: ({ row }: { row: Row<TargetHotspot> }) => {
              const distance = row.original.distance;
              if (distance === undefined) return "-";
              const km = distance / 1000;
              return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
            },
          },
        ]
      : []),
  ];

  const table = useReactTable({
    data: hotspots,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === "function" ? updater(sorting) : updater;
      if (newSorting.length === 0) {
        const currentSort = sorting[0];
        if (currentSort) {
          setSorting([{ id: currentSort.id, desc: !currentSort.desc }]);
        } else {
          setSorting([{ id: "species", desc: true }]);
        }
      } else {
        setSorting(newSorting);
      }
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const { rows } = table.getRowModel();

  return (
    <div className="space-y-6">
      <style>
        {`
          .row-number::before {
            content: counter(row-counter) ".";
            counter-increment: row-counter;
          }
        `}
      </style>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Hotspots</h2>
          <p className="text-slate-600 mt-1">Found {total || hotspots.length} hotspots</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <Input
            type="text"
            placeholder="Search hotspots..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full sm:w-80"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full" style={{ counterReset: "row-counter" }}>
          <thead className="sticky top-0 bg-slate-50 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-slate-200">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "text-left p-4 text-sm font-medium text-slate-700",
                      ["open", "species", "distance", "location"].includes(header.column.id) && "w-0 whitespace-nowrap",
                      header.column.id === "notes" && "sm:w-xs"
                    )}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          header.column.getCanSort() && "cursor-pointer select-none"
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ChevronUp className="h-4 w-4" />,
                          desc: <ChevronDown className="h-4 w-4" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <>
                {[...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-5 bg-slate-200 rounded animate-pulse"></div>
                        <div className="h-4 bg-slate-200 rounded w-40 animate-pulse"></div>
                      </div>
                    </td>
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-200 rounded w-8 animate-pulse"></div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-32 animate-pulse"></div>
                    </td>
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-200 rounded w-12 animate-pulse"></div>
                    </td>
                    {showDistance && (
                      <td className="p-4 w-0 whitespace-nowrap">
                        <div className="h-4 bg-slate-200 rounded w-16 animate-pulse"></div>
                      </td>
                    )}
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-200 rounded w-20 animate-pulse"></div>
                    </td>
                  </tr>
                ))}
              </>
            ) : (
              rows.map((row) => <HotspotRow key={row.id} showDistance={showDistance} {...row.original} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HotspotList;
