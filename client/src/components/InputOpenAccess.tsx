import { cn } from "@/lib/utils";

type Props = {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  size?: "sm" | "md";
  className?: string;
};

const InputOpenAccess = ({ value, onChange, size = "md", className }: Props) => {
  const sizeClasses = {
    sm: "px-3 py-1 text-xs",
    md: "px-3 py-1 text-sm",
  };

  const classes = {
    selected: {
      true: "bg-blue-500 text-white border-blue-500",
      false: "bg-gray-700 text-white border-gray-700",
      null: "bg-gray-400 text-white border-gray-400",
    },
    unselected: "bg-white text-gray-700 border-gray-300 hover:border-gray-500",
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <button
        onClick={() => onChange(true)}
        className={cn(
          "rounded border transition-colors",
          sizeClasses[size],
          value === true ? classes.selected.true : classes.unselected
        )}
      >
        Yes
      </button>
      <button
        onClick={() => onChange(false)}
        className={cn(
          "rounded border transition-colors",
          sizeClasses[size],
          value === false ? classes.selected.false : classes.unselected
        )}
      >
        No
      </button>
      <button
        onClick={() => onChange(null)}
        className={cn(
          "rounded border transition-colors",
          sizeClasses[size],
          value === null ? classes.selected.null : classes.unselected
        )}
      >
        ?
      </button>
    </div>
  );
};

export default InputOpenAccess;
