import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  required?: boolean;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, required, id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <Label htmlFor={inputId} className="text-slate-200">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </Label>
        )}
        <input
          type={type}
          id={inputId}
          className={cn(
            "w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500",
            error && "border-red-500 focus:ring-red-500 focus:border-red-500",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
