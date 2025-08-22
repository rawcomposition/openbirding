import { ChevronUp, ChevronDown } from "lucide-react";
import type { Region } from "@/lib/types";
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
import { get } from "@/lib/utils";
import { Link } from "react-router-dom";

type Props = {
  regionCode: string;
  defaultSort?: { id: string; desc: boolean };
};

const RegionList = ({ regionCode, defaultSort }: Props) => {
  const [sorting, setSorting] = useState<SortingState>([defaultSort || { id: "name", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState("");

  const {
    data: regions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["regions", regionCode, "subregions"],
    queryFn: async () => {
      const response = await get(`/regions/${regionCode}/subregions`, {});
      return response as unknown as Region[];
    },
  });

  const columns: ColumnDef<Region>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 flex items-center justify-center font-bold text-emerald-300 flex-shrink-0 row-number"></span>
          <div>
            <div className="font-medium text-white">{row.original.name}</div>
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
          return <span className="text-gray-400">-</span>;
        }

        const percentage = hotspotCount > 0 ? Math.round((openHotspotCount / hotspotCount) * 100) : 0;
        return (
          <span className="text-gray-200">
            {openHotspotCount.toLocaleString()} <span className="text-gray-400 text-xs">({percentage}%)</span>
          </span>
        );
      },
    },
    {
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Link
          to={`/region/${row.original._id}`}
          className="text-emerald-400 hover:text-emerald-300 transition-colors text-sm"
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
          setSorting([{ id: "name", desc: false }]);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-400">Loading subregions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-red-400">Error loading subregions: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>
        {`
          .row-number::before {
            content: counter(row-counter) ".";
            counter-increment: row-counter;
          }
        `}
      </style>
      <p className="text-gray-300">Found {regions.length} subregions</p>

      <div className="flex sm:flex-row flex-col justify-between gap-4">
        <input
          type="text"
          placeholder="Search subregions..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 max-w-xs"
        />
      </div>

      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg overflow-hidden">
        <table className="w-full" style={{ counterReset: "row-counter" }}>
          <thead className="sticky top-0 bg-gray-300/10 backdrop-blur-sm z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-white/20">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "text-left p-4 text-sm font-medium text-gray-100",
                      ["openHotspots", "actions"].includes(header.column.id) && "w-0 whitespace-nowrap"
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
              <tr>
                <td colSpan={columns.length} className="p-8">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
                    <span className="ml-3 text-gray-400">Loading subregions...</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "p-4 text-gray-200",
                        ["openHotspots", "actions"].includes(cell.column.id) && "w-0 whitespace-nowrap"
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
