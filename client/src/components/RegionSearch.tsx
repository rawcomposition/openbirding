import React from "react";
import AsyncSelect from "react-select/async";
import { components, type ClearIndicatorProps, type SingleValue, type MultiValue } from "react-select";
import { X as XIcon } from "lucide-react";
import Highlighter from "react-highlight-words";
import debounce from "lodash/debounce";
import { get } from "@/lib/utils";

type Region = {
  id: string;
  name: string;
  longName: string;
};

type Option = {
  value: string;
  label: string;
  longName: string;
};

type RegionSearchProps = {
  value: { regionCode: string; regionName: string } | null;
  onChange: (value: { regionCode: string; regionName: string } | null) => void;
};

type FormatOptionLabelContext = {
  inputValue: string;
};

const ClearIndicator = (props: ClearIndicatorProps<Option>) => (
  <components.ClearIndicator {...props}>
    <XIcon className="h-4 w-4 opacity-60 hover:opacity-100" />
  </components.ClearIndicator>
);

const LoadingIndicator = () => null;

const sanitize = (text: string) => text.replace(/-/g, " ").toLowerCase();

function formatOptionLabel(option: Option, { inputValue }: FormatOptionLabelContext) {
  const searchWords = inputValue.split(/\s+/).filter(Boolean);
  // Strip the region name prefix from longName (e.g., "California, United States" -> "United States")
  const prefix = `${option.label}, `;
  const parentRegions = option.longName.startsWith(prefix) ? option.longName.slice(prefix.length) : option.longName;
  return (
    <div className="flex flex-col">
      <Highlighter searchWords={searchWords} sanitize={sanitize} textToHighlight={option.label} highlightTag="b" />
      {parentRegions && parentRegions !== option.label && (
        <span className="text-slate-500 text-xs">
          <Highlighter searchWords={searchWords} sanitize={sanitize} textToHighlight={parentRegions} highlightTag="b" />
        </span>
      )}
    </div>
  );
}

export default function RegionSearch({ value, onChange }: RegionSearchProps) {
  const [inputValue, setInputValue] = React.useState("");

  const selectValue: Option | null = value
    ? { value: value.regionCode, label: value.regionName, longName: value.regionName }
    : null;

  const searchRegions = async (searchTerm: string): Promise<Option[]> => {
    try {
      const data = (await get("/regions/search", { q: searchTerm })) as { regions: Region[] };

      return data.regions.map((region) => ({
        value: region.id,
        label: region.name,
        longName: region.longName,
      }));
    } catch (error) {
      console.error("Region search error:", error);
      return [];
    }
  };

  const debouncedSearch = React.useMemo(
    () =>
      debounce(async (inputValue: string, callback: (options: Option[]) => void) => {
        if (inputValue.length < 2) {
          callback([]);
          return;
        }

        const options = await searchRegions(inputValue);
        callback(options);
      }, 300),
    []
  );

  const loadOptions = (inputValue: string, callback: (options: Option[]) => void) => {
    debouncedSearch(inputValue, callback);
  };

  const onSelectChange = (newValue: SingleValue<Option> | MultiValue<Option>) => {
    if (!newValue) {
      onChange(null);
    } else if (!Array.isArray(newValue)) {
      const opt = newValue as Option;
      onChange({ regionCode: opt.value, regionName: opt.label });
    }
  };

  return (
    <AsyncSelect
      unstyled
      classNames={{
        control: (state) =>
          `rounded-md text-sm min-h-[36px] border bg-white shadow-xs px-2 ${
            state.isFocused
              ? "border-emerald-500 ring-2 ring-emerald-500/25"
              : "border-slate-200"
          }`,
        valueContainer: () => "gap-1",
        singleValue: () => "text-slate-900",
        input: () => "text-slate-900",
        placeholder: () => "text-slate-400 text-left",
        indicatorsContainer: () => "h-[34px]",
        menu: () => "mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-50",
        menuList: () => "p-1",
        option: (state) =>
          `text-left text-slate-900 px-3 py-2 rounded cursor-pointer ${
            state.isFocused ? "bg-slate-100" : ""
          }`,
        noOptionsMessage: () => "text-slate-500 text-left text-sm p-2",
        loadingMessage: () => "text-slate-500 text-left text-sm p-2",
      }}
      inputId="region-search"
      instanceId="region-search"
      value={selectValue}
      inputValue={inputValue}
      onInputChange={(val) => setInputValue(val)}
      loadOptions={loadOptions}
      cacheOptions
      isClearable
      components={{ ClearIndicator, LoadingIndicator, DropdownIndicator: () => null }}
      formatOptionLabel={formatOptionLabel}
      noOptionsMessage={() => (inputValue.length >= 2 ? "No regions found" : null)}
      loadingMessage={() => "Searching..."}
      placeholder="Search regions..."
      onChange={onSelectChange}
      menuIsOpen={inputValue.length >= 2 ? undefined : false}
      escapeClearsValue
      autoFocus
    />
  );
}
