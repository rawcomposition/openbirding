import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PillSelect({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (value: string) => void;
  options: { value: number; label: string }[];
}) {
  return (
    <Select value={String(value)} onValueChange={onChange}>
      <SelectTrigger size="sm" className="cursor-pointer rounded-full border-slate-300 pl-3 pr-2 text-xs font-medium text-slate-700 shadow-xs hover:border-emerald-400 hover:text-emerald-700 [&_svg]:size-3 [&_svg]:opacity-100">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={String(o.value)} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
