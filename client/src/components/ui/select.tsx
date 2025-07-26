import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  required?: boolean;
  options: SelectOption[];
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, required, options, id, ...props }, ref) => {
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <Label htmlFor={selectId} className="text-slate-200">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </Label>
        )}
        <select
          id={selectId}
          className={cn(
            "w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
            error && "border-red-500 focus:ring-red-500",
            className
          )}
          ref={ref}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-slate-700 text-white">
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select };
