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

  const getDisplayValue = () => {
    if (!month) return null;
    return MONTHS[month - 1];
  };

  const handleMonthSelect = (monthNum: number) => {
    setMonth(monthNum);
    setOpen(false);
  };

  return (
    <FilterButton
      label="Month"
      value={getDisplayValue()}
      onClear={() => setMonth(null)}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="p-4">
        <div className="space-y-2">
          <Label>Select Month</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((monthName, index) => {
              const monthNum = index + 1;
              const isSelected = month === monthNum;

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
      </div>
    </FilterButton>
  );
}
