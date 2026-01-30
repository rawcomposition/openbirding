import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AdjustedFrequencyInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-slate-600 ml-1">
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="text-sm text-slate-700">
        <p>
          Adjusted Frequency accounts for sample size, giving less weight to hotspots with fewer checklists. To
          calculate this, we use the Wilson lower bound formula with a confidence level of 95%.
        </p>
      </PopoverContent>
    </Popover>
  );
}
