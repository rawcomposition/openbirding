import { forwardRef } from "react";
import { useFormContext } from "react-hook-form";
import { ErrorMessage } from "@hookform/error-message";
import { cn } from "@/lib/utils";
import { Input as UIInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label?: string;
  required?: boolean;
};

const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ name, label, required, className, ...props }, ref) => {
    const {
      register,
      formState: { errors },
    } = useFormContext();

    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor={name} className="text-sm font-medium text-slate-200">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </Label>
        )}
        <UIInput
          {...register(name)}
          {...props}
          ref={ref}
          id={name}
          className={cn(errors[name] && "border-red-500 focus:ring-red-500 focus:border-red-500", className)}
        />
        <ErrorMessage
          errors={errors}
          name={name}
          render={({ message }) => <p className="text-sm text-red-400">{message}</p>}
        />
      </div>
    );
  }
);

FormInput.displayName = "FormInput";

export { FormInput };
