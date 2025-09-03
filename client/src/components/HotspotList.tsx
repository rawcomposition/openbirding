import { ChevronUp, ChevronDown, Edit, Save, X as CancelIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Hotspot } from "@/lib/types";
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
import { Button } from "@/components/ui/button";
import { useEditStore } from "@/lib/editStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mutate } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/authStore";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import HotspotRow from "./HotspotRow";

type Props = {
  hotspots: Hotspot[];
  queryKey: string;
  total?: number;
  defaultSort?: { id: string; desc: boolean };
  showDistance?: boolean;
  isLoading?: boolean;
};

const HotspotList = ({ hotspots, queryKey, total, defaultSort, showDistance, isLoading }: Props) => {
  const [sorting, setSorting] = useState<SortingState>([defaultSort || { id: "species", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const { isEditMode, setEditMode, hasChanges, getChanges, getChangeCount, clearChanges } = useEditStore();
  const changeCount = getChangeCount();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { redirectToLogin } = useLoginRedirect();

  const saveChangesMutation = useMutation({
    mutationFn: async (changes: Array<{ id: string; open?: boolean | null; notes?: string }>) => {
      return mutate("PUT", "/hotspots/bulk-update", changes);
    },
    onSuccess: () => {
      toast.success("Changes saved successfully!");
      clearChanges();
      setEditMode(false);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (error) => {
      toast.error(`Failed to save changes: ${error.message}`);
    },
  });

  const handleSaveChanges = () => {
    const changes = getChanges();
    if (changes.length > 0) {
      saveChangesMutation.mutate(changes);
    }
  };

  const handleCancelEdit = () => {
    const changes = getChanges();
    if (changes.length > 0 && !confirm("Are you sure you want to cancel editing?")) {
      return;
    }
    clearChanges();
    setEditMode(false);
  };

  const handleEditClick = () => {
    if (!user) {
      redirectToLogin();
      return;
    }
    setEditMode(true);
  };

  useUnsavedChangesWarning(hasChanges(), isEditMode, clearChanges);

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
    ...(showDistance
      ? [
          {
            accessorKey: "distance",
            header: "Distance",
            enableSorting: true,
            cell: ({ row }: { row: Row<Hotspot> }) => {
              const distance = row.original.distance;
              if (distance === undefined) return "-";
              const km = distance / 1000;
              return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
            },
          },
        ]
      : []),
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
              <Button
                variant="primary"
                size="lg"
                onClick={handleSaveChanges}
                disabled={!hasChanges() || saveChangesMutation.isPending}
              >
                <Save className="h-4 w-4" />
                {saveChangesMutation.isPending ? "Saving..." : "Save Changes"}
                {changeCount > 0 && !saveChangesMutation.isPending && (
                  <Badge variant="secondary" className="ml-2 bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                    {changeCount}
                  </Badge>
                )}
              </Button>
              <Button variant="outline" size="lg" onClick={handleCancelEdit}>
                <CancelIcon className="h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" onClick={handleEditClick}>
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
                    className={cn(
                      "text-left p-4 text-sm font-medium text-gray-100",
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
                  <tr key={i} className="border-b border-white/10">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-5 bg-slate-700 rounded animate-pulse"></div>
                        <div className="h-4 bg-slate-700 rounded w-40 animate-pulse"></div>
                      </div>
                    </td>
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-700 rounded w-8 animate-pulse"></div>
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-700 rounded w-32 animate-pulse"></div>
                    </td>
                    <td className="p-4 w-0 whitespace-nowrap">
                      <div className="h-4 bg-slate-700 rounded w-12 animate-pulse"></div>
                    </td>
                    {showDistance && (
                      <td className="p-4 w-0 whitespace-nowrap">
                        <div className="h-4 bg-slate-700 rounded w-16 animate-pulse"></div>
                      </td>
                    )}
                    {!isEditMode && (
                      <td className="p-4 w-0 whitespace-nowrap">
                        <div className="h-4 bg-slate-700 rounded w-20 animate-pulse"></div>
                      </td>
                    )}
                  </tr>
                ))}
              </>
            ) : (
              rows.map((row) => (
                <HotspotRow
                  key={row.id}
                  id={row.original.id}
                  name={row.original.name}
                  open={row.original.open}
                  notes={row.original.notes}
                  species={row.original.species}
                  lat={row.original.lat}
                  lng={row.original.lng}
                  distance={row.original.distance}
                  showDistance={showDistance}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HotspotList;
