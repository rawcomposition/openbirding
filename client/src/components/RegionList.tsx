import { ChevronUp, ChevronDown } from "lucide-react";
import type { Subregion } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

type Props = {
  regionCode: string;
  defaultSort?: { id: string; desc: boolean };
};

const RegionList = ({ regionCode, defaultSort }: Props) => {
  const [sorting, setSorting] = useState<SortingState>([defaultSort || { id: "openHotspotCount", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");

  const {
    data: regions = [],
    isLoading,
    error,
  } = useQuery<Subregion[]>({
    queryKey: [`/regions/${regionCode}/subregions`],
  });

  const columns: ColumnDef<Subregion>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 flex items-center justify-center font-bold text-emerald-600 flex-shrink-0 row-number"></span>
          <div>
            <div className="font-medium text-slate-900">{row.original.name}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "openHotspotCount",
      header: "Open Hotspots",
      enableSorting: true,
      cell: ({ row }) => {
        const { hotspotCount, openHotspotCount } = row.original;
        if (hotspotCount === undefined || openHotspotCount === undefined) {
          return <span className="text-slate-500">-</span>;
        }

        const percentage = hotspotCount > 0 ? Math.round((openHotspotCount / hotspotCount) * 100) : 0;
        return (
          <span className="text-slate-700">
            {openHotspotCount.toLocaleString()} <span className="text-slate-500 text-xs">({percentage}%)</span>
          </span>
        );
      },
    },
    {
      accessorKey: "reviewedHotspotCount",
      header: "Reviewed Hotspots",
      enableSorting: true,
      cell: ({ row }) => {
        const { hotspotCount, reviewedHotspotCount } = row.original;
        if (hotspotCount === undefined || reviewedHotspotCount === undefined) {
          return <span className="text-slate-500">-</span>;
        }

        const percentage = hotspotCount > 0 ? Math.round((reviewedHotspotCount / hotspotCount) * 100) : 0;
        return (
          <span className="text-slate-700">
            {reviewedHotspotCount.toLocaleString()} <span className="text-slate-500 text-xs">({percentage}%)</span>
          </span>
        );
      },
    },
    {
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Link
          to={`/region/${row.original.id}`}
          className="text-emerald-600 hover:text-emerald-700 transition-colors text-sm"
        >
          {row.original.hasChildren ? "View Region" : "View Hotspots"}
        </Link>
      ),
    },
  ];

  const table = useReactTable({
    data: regions,
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
          setSorting([{ id: "openHotspotCount", desc: true }]);
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

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-red-600">Error loading subregions: {error.message}</div>
      </div>
    );
  }

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
          <h2 className="text-2xl font-bold text-slate-900">Subregions</h2>
          <p className="text-slate-600 mt-1">Found {regions.length} subregions</p>
        </div>
        <input
          type="text"
          placeholder="Search subregions..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
        />
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
                      ["openHotspotCount", "reviewedHotspotCount", "actions"].includes(header.column.id) &&
                        "w-0 whitespace-nowrap"
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
                        <div className="h-4 bg-slate-200 rounded w-32 animate-pulse"></div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-24 animate-pulse"></div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-200 rounded w-24 animate-pulse"></div>
                    </td>
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-200 rounded w-16 animate-pulse"></div>
                    </td>
                  </tr>
                ))}
              </>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "p-4 text-slate-700",
                        ["openHotspotCount", "reviewedHotspotCount", "actions"].includes(cell.column.id) &&
                          "w-0 whitespace-nowrap"
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RegionList;
