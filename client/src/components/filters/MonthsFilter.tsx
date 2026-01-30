import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore } from "@/stores/birdFinderStore";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthsFilter() {
  const { months, setMonths } = useBirdFinderStore();
  const [open, setOpen] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set(months || []));

  const getDisplayValue = () => {
    if (!months || months.length === 0) return null;
    if (months.length === 12) return "All months";
    if (months.length === 1) return MONTHS[months[0] - 1];

    // Check if consecutive
    const sorted = [...months].sort((a, b) => a - b);
    const isConsecutive = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);

    if (isConsecutive) {
      return `${MONTHS[sorted[0] - 1]} - ${MONTHS[sorted[sorted.length - 1] - 1]}`;
    }

    if (months.length <= 3) {
      return sorted.map((m) => MONTHS[m - 1]).join(", ");
    }

    return `${months.length} months`;
  };

  const handleMonthToggle = (month: number) => {
    const newSelected = new Set(selectedMonths);
    if (newSelected.has(month)) {
      newSelected.delete(month);
    } else {
      newSelected.add(month);
    }
    setSelectedMonths(newSelected);
  };

  const handleApply = () => {
    if (selectedMonths.size === 0) {
      setMonths(null);
    } else {
      setMonths([...selectedMonths].sort((a, b) => a - b));
    }
    setOpen(false);
  };

  const handleClear = () => {
    setMonths(null);
    setOpen(false);
  };

  return (
    <FilterButton
      label="Months"
      value={getDisplayValue()}
      onClear={() => setMonths(null)}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setSelectedMonths(new Set(months || []));
        }
      }}
    >
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Label>Select Months</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((month, index) => {
              const monthNum = index + 1;
              const isSelected = selectedMonths.has(monthNum);

              return (
                <Button
                  key={month}
                  variant="outline"
                  size="sm"
                  onClick={() => handleMonthToggle(monthNum)}
                  className={cn(
                    "h-9",
                    isSelected && "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:text-white"
                  )}
                >
                  {month}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleClear} variant="outline" className="flex-1">
            Clear
          </Button>
          <Button onClick={handleApply} variant="primary" className="flex-1">
            Apply
          </Button>
        </div>
      </div>
    </FilterButton>
  );
}
