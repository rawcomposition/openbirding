import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  required?: boolean;
  large?: boolean;
  icon?: React.ReactNode;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, required, large, icon, id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const inputClasses = cn(
      "w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent",
      large ? "px-4 py-3 rounded-lg" : "px-2 py-2 rounded-sm",
      error && "border-red-500 focus:ring-red-500 focus:border-red-500",
      className
    );

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <Label htmlFor={inputId} className="text-slate-700">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
        )}
        <div className="relative">
          {icon && <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500">{icon}</div>}
          <input type={type} id={inputId} className={cn(inputClasses, icon && "pl-10")} ref={ref} {...props} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
