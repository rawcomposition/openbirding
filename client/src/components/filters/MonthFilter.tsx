import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FilterButton } from "@/components/FilterButton";
import { useBirdFinderStore } from "@/stores/birdFinderStore";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthFilter() {
  const { month, setMonth } = useBirdFinderStore();
  const [open, setOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(month);

  const getDisplayValue = () => {
    if (!month) return null;
    return MONTHS[month - 1];
  };

  const handleMonthSelect = (monthNum: number) => {
    setSelectedMonth(selectedMonth === monthNum ? null : monthNum);
  };

  const handleApply = () => {
    setMonth(selectedMonth);
    setOpen(false);
  };

  const handleClear = () => {
    setMonth(null);
    setSelectedMonth(null);
    setOpen(false);
  };

  return (
    <FilterButton
      label="Month"
      value={getDisplayValue()}
      onClear={() => setMonth(null)}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setSelectedMonth(month);
        }
      }}
    >
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Label>Select Month</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((monthName, index) => {
              const monthNum = index + 1;
              const isSelected = selectedMonth === monthNum;

              return (
                <Button
                  key={monthName}
                  variant="outline"
                  size="sm"
                  onClick={() => handleMonthSelect(monthNum)}
                  className={cn(
                    "h-9",
                    isSelected && "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:text-white"
                  )}
                >
                  {monthName}
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
