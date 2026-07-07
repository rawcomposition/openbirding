export function CitationFooter({ citation }: { citation?: string }) {
  if (!citation) return null;
  return (
    <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-tight text-slate-400">
      {citation}
    </p>
  );
}
