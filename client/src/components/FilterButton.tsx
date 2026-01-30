import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FilterButtonProps = {
  label: string;
  value?: string | null;
  onClear?: () => void;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

export function FilterButton({
  label,
  value,
  onClear,
  children,
  open,
  onOpenChange,
  className,
}: FilterButtonProps) {
  const hasValue = value != null && value !== "";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 gap-1.5 font-normal",
            hasValue && "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900",
            className
          )}
        >
          {hasValue ? (
            <>
              <span className="font-medium">{value}</span>
              <span
                role="button"
                className="ml-0.5 -mr-1.5 p-1 rounded-full hover:bg-emerald-200 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear?.();
                  onOpenChange?.(false);
                }}
              >
                <X className="h-4 w-4" />
              </span>
            </>
          ) : (
            <>
              <span>{label}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-auto min-w-[280px]">
        {children}
      </PopoverContent>
    </Popover>
  );
}
