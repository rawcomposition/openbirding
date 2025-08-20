import { Badge } from "@/components/ui/badge";
import { ExternalLink, Check, X, HelpCircle, ChevronUp, ChevronDown, Edit } from "lucide-react";
import type { Hotspot } from "@/lib/types";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  hotspots: Hotspot[];
  total?: number;
};

const HotspotList = ({ hotspots, total }: Props) => {
  const [sorting, setSorting] = useState<SortingState>([{ id: "species", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");

  const openGoogleMaps = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}&z=15&t=m`;
    window.open(url, "_blank");
  };

  const getOpenAccessIcon = (open: boolean | undefined) => {
    if (open === true) {
      return <Check className="h-4 w-4 text-green-400" />;
    } else if (open === false) {
      return <X className="h-4 w-4 text-red-400" />;
    } else {
      return <HelpCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const columns: ColumnDef<Hotspot>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const index = row.index;
        return (
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 flex items-center justify-center font-bold text-emerald-300 flex-shrink-0">
              {index + 1}.
            </span>
            <div>
              <div className="font-medium text-white">{row.original.name}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "open",
      header: "Open Access",
      cell: ({ row }) => getOpenAccessIcon(row.original.open),
      enableSorting: true,
    },
    {
      accessorKey: "notes",
      header: "Notes",
      cell: ({ row }) => {
        const notes = row.original.notes;
        return notes ? <div className="text-sm text-gray-300 max-w-xs truncate">{notes}</div> : null;
      },
    },
    {
      accessorKey: "species",
      header: "Species",
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 whitespace-nowrap"
        >
          {row.original.species} species
        </Badge>
      ),
      enableSorting: true,
    },
    {
      accessorKey: "location",
      header: "Map",
      cell: ({ row }) => {
        const coordinates = row.original.location?.coordinates;
        return coordinates ? (
          <button
            onClick={() => openGoogleMaps(coordinates[1], coordinates[0])}
            className="flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="h-4 w-4" />
            View Map
          </button>
        ) : (
          <span className="text-sm text-gray-500">N/A</span>
        );
      },
    },
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
        setSorting([{ id: "species", desc: true }]);
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

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => document.documentElement,
    estimateSize: () => 80,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start || 0 : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - (virtualRows[virtualRows.length - 1].end || 0) : 0;

  return (
    <div className="space-y-4">
      {total !== undefined && <p className="text-gray-300">Found {total} hotspots</p>}

      <div className="flex sm:flex-row flex-col justify-between gap-4">
        <input
          type="text"
          placeholder="Search hotspots..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 max-w-xs"
        />
        <Button variant="primary" size="lg">
          <Edit className="h-4 w-4" />
          Edit Hotspots
        </Button>
      </div>

      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="sticky top-0 bg-gray-300/10 backdrop-blur-sm z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-white/20">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left p-4 text-sm font-medium text-gray-100"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        className={`flex items-center gap-2 ${
                          header.column.getCanSort() ? "cursor-pointer select-none" : ""
                        }`}
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
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: `${paddingTop}px` }} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr key={row.id} className="border-b border-white/10" style={{ height: `${virtualRow.size}px` }}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: `${paddingBottom}px` }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HotspotList;
