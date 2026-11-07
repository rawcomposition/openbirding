import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";
import type { RangeRegionsResponse } from "@/components/rangerestricted/types";

type Option = { value: string; label: string };

type RegionSelectProps = {
  value: string;
  onChange: (code: string) => void;
};

export function RegionSelect({ value, onChange }: RegionSelectProps) {
  const { data, isLoading } = useQuery<RangeRegionsResponse>({
    queryKey: ["/range-restricted/regions"],
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const options = useMemo<Option[]>(() => (data?.regions ?? []).map((r) => ({ value: r.code, label: r.name })), [data]);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Select<Option>
      unstyled
      inputId="range-region"
      instanceId="range-region"
      aria-label="Region"
      options={options}
      value={selected}
      isLoading={isLoading}
      onChange={(opt) => opt && onChange(opt.value)}
      placeholder="Choose a region..."
      menuPortalTarget={document.body}
      menuPosition="fixed"
      styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      classNames={{
        container: () => "w-64",
        control: (state) =>
          `rounded-md text-sm min-h-[36px] border bg-white shadow-xs px-2 ${
            state.isFocused ? "border-emerald-500 ring-2 ring-emerald-500/25" : "border-slate-300"
          }`,
        singleValue: () => "text-slate-900 font-medium",
        input: () => "text-slate-900",
        placeholder: () => "text-slate-400",
        dropdownIndicator: () => "text-slate-400",
        menu: () => "mt-1 bg-white border border-slate-200 rounded-md shadow-lg",
        menuList: () => "p-1",
        option: (state) =>
          `text-sm text-slate-900 px-3 py-2 rounded cursor-pointer ${
            state.isSelected ? "bg-emerald-50 font-medium" : state.isFocused ? "bg-slate-100" : ""
          }`,
        noOptionsMessage: () => "text-slate-500 text-sm p-2",
      }}
    />
  );
}
