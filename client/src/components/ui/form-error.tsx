import { CircleAlert } from "lucide-react";

export function FormError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
      <CircleAlert className="h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
