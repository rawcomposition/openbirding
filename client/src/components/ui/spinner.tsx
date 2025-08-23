type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const Spinner = ({ size = "md", className = "" }: SpinnerProps) => {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  };

  return <div className={`animate-spin rounded-full border-b-2 border-blue-500 ${sizeClasses[size]} ${className}`} />;
};

export default Spinner;
