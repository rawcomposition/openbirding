import { ChevronUp, ChevronDown, Edit, Save, X as CancelIcon } from "lucide-react";
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
import { useEditStore } from "@/lib/editStore";
import HotspotRow from "./HotspotRow";

type Props = {
  hotspots: Hotspot[];
  total?: number;
};

const HotspotList = ({ hotspots, total }: Props) => {
  const [sorting, setSorting] = useState<SortingState>([{ id: "species", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const { isEditMode, setEditMode, hasChanges, getChanges } = useEditStore();

  const handleSaveChanges = () => {
    const changes = getChanges();
    console.log("Saving changes:", changes);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
  };

  const columns: ColumnDef<Hotspot>[] = [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "open",
      header: "Open Access",
      enableSorting: true,
    },
    {
      accessorKey: "notes",
      header: "Notes",
    },
    {
      accessorKey: "species",
      header: "Species",
      enableSorting: true,
    },
    ...(isEditMode
      ? []
      : [
          {
            accessorKey: "location",
            header: "Map",
          },
        ]),
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
      <style>
        {`
          .row-number::before {
            content: counter(row-counter) ".";
            counter-increment: row-counter;
          }
        `}
      </style>
      {total !== undefined && <p className="text-gray-300">Found {total} hotspots</p>}

      <div className="flex sm:flex-row flex-col justify-between gap-4">
        <input
          type="text"
          placeholder="Search hotspots..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 max-w-xs"
        />
        <div className="flex gap-2">
          {isEditMode ? (
            <>
              <Button variant="primary" size="lg" onClick={handleSaveChanges} disabled={!hasChanges()}>
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
              <Button variant="outline" size="lg" onClick={handleCancelEdit}>
                <CancelIcon className="h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setEditMode(true)}>
              <Edit className="h-4 w-4" />
              Edit Hotspots
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg overflow-hidden">
        <table className="w-full" style={{ counterReset: "row-counter" }}>
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
                <HotspotRow
                  key={row.id}
                  id={row.original._id}
                  name={row.original.name}
                  open={row.original.open}
                  notes={row.original.notes}
                  species={row.original.species}
                  lat={row.original.location?.coordinates[1]}
                  lng={row.original.location?.coordinates[0]}
                />
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
