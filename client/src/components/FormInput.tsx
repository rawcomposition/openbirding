import { useFormContext } from "react-hook-form";
import { ErrorMessage } from "@hookform/error-message";
import { cn } from "@/lib/utils";
import { Input as UIInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label?: string;
  required?: boolean;
  icon?: React.ReactNode;
  large?: boolean;
};

const FormInput = ({ name, label, required, icon, large, className, ...props }: FormInputProps) => {
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
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 z-10">{icon}</div>}
        <UIInput
          {...register(name, { required: required ? "This field is required" : false })}
          {...props}
          id={name}
          large={large}
          className={cn(
            icon && "pl-10",
            className,
            errors[name] && "border-red-500 focus:ring-red-500 focus:border-red-500"
          )}
        />
      </div>
      <ErrorMessage
        errors={errors}
        name={name}
        render={({ message }) => <p className="text-sm text-red-400">{message}</p>}
      />
    </div>
  );
};

export { FormInput };
