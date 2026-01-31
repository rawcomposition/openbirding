import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const ADJUSTED_FREQUENCY_INFO =
  "Adjusted Frequency accounts for sample size, giving less weight to hotspots with fewer checklists. To calculate this, we use the Wilson lower bound formula with a confidence level of 95%.";

export function AdjustedFrequencyInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-slate-400 md:text-slate-600 ml-0.5 md:ml-1">
          <Info className="w-3.5 h-3.5 md:h-4 md:w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="text-sm text-slate-700">
        <p>{ADJUSTED_FREQUENCY_INFO}</p>
      </PopoverContent>
    </Popover>
  );
}
