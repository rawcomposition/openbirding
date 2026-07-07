import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function LoadingState({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-10", className)}>
      <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
    </div>
  );
}
