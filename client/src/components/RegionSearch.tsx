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
      styles={{
        input: (base) => ({
          ...base,
          outline: "none",
          "input:focus": { boxShadow: "none" },
        }),
        singleValue: (base) => ({
          ...base,
          color: "#1e293b",
        }),
        control: (base) => ({
          ...base,
          borderRadius: "6px",
          fontSize: "14px",
          minHeight: "36px",
          border: "solid 1px #e2e8f0",
          borderColor: "#e2e8f0 !important",
          outline: "none",
          boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
          backgroundColor: "#ffffff",
        }),
        valueContainer: (base) => ({
          ...base,
          padding: "0 8px",
        }),
        indicatorSeparator: () => ({
          display: "none",
        }),
        indicatorsContainer: (base) => ({
          ...base,
          height: "34px",
        }),
        menu: (base) => ({
          ...base,
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "6px",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
          zIndex: 50,
        }),
        menuList: (base) => ({
          ...base,
          padding: "4px",
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isFocused ? "#f1f5f9" : "transparent",
          color: "#1e293b",
          textAlign: "left",
          padding: "8px 12px",
          borderRadius: "4px",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: "#f1f5f9",
          },
        }),
        placeholder: (base) => ({
          ...base,
          color: "#94a3b8",
          textAlign: "left",
        }),
        noOptionsMessage: (base) => ({
          ...base,
          color: "#64748b",
          textAlign: "left",
          fontSize: "14px",
        }),
        loadingMessage: (base) => ({
          ...base,
          color: "#64748b",
          textAlign: "left",
          fontSize: "14px",
        }),
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
    />
  );
}
