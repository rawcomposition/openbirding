import { cn } from "@/lib/utils";

type Props = {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  size?: "sm" | "md";
  theme?: "dark" | "light";
  className?: string;
};

const InputOpenAccess = ({ value, onChange, size = "md", theme = "dark", className }: Props) => {
  const sizeClasses = {
    sm: "px-3 py-1 text-xs",
    md: "px-3 py-1 text-sm",
  };

  const themeClasses = {
    dark: {
      selected: {
        true: "bg-blue-600 text-white border-blue-600",
        false: "bg-red-800/80 text-white border-red-800/80",
        null: "bg-gray-600 text-white border-gray-600",
      },
      unselected: "bg-transparent text-gray-300 border-gray-500 hover:border-gray-400",
    },
    light: {
      selected: {
        true: "bg-blue-500 text-white border-blue-500",
        false: "bg-gray-700 text-white border-gray-700",
        null: "bg-gray-400 text-white border-gray-400",
      },
      unselected: "bg-white text-gray-700 border-gray-300 hover:border-gray-500",
    },
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <button
        onClick={() => onChange(true)}
        className={cn(
          "rounded border transition-colors",
          sizeClasses[size],
          value === true ? themeClasses[theme].selected.true : themeClasses[theme].unselected
        )}
      >
        Yes
      </button>
      <button
        onClick={() => onChange(false)}
        className={cn(
          "rounded border transition-colors",
          sizeClasses[size],
          value === false ? themeClasses[theme].selected.false : themeClasses[theme].unselected
        )}
      >
        No
      </button>
      <button
        onClick={() => onChange(null)}
        className={cn(
          "rounded border transition-colors",
          sizeClasses[size],
          value === null ? themeClasses[theme].selected.null : themeClasses[theme].unselected
        )}
      >
        ?
      </button>
    </div>
  );
};

export default InputOpenAccess;
