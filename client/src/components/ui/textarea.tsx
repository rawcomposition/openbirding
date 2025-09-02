import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  required?: boolean;
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, required, id, maxLength, ...props }, ref) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <Label htmlFor={textareaId} className="text-slate-200">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </Label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            "w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-vertical min-h-[100px]",
            error && "border-red-500 focus:ring-red-500",
            className
          )}
          ref={ref}
          maxLength={maxLength}
          {...props}
        />
        {maxLength && props.value && String(props.value).length >= maxLength * 0.8 && (
          <div className="flex justify-end">
            <span className={`text-xs ${String(props.value).length >= maxLength ? "text-red-400" : "text-slate-400"}`}>
              {String(props.value).length}/{maxLength}
            </span>
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
