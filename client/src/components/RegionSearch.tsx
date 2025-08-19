import React from "react";
import AsyncSelect from "react-select/async";
import { components, type DropdownIndicatorProps, type SingleValue, type MultiValue } from "react-select";
import { Search as SearchIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Highlighter from "react-highlight-words";
import { debounce } from "lodash";
import { get } from "@/lib/utils";

type Option = {
  value: string;
  label: string;
};

type SearchProps = {
  pill?: boolean;
  onChange?: () => void;
  [key: string]: unknown;
};

type FormatOptionLabelProps = {
  label: string;
};

type FormatOptionLabelContext = {
  inputValue: string;
};

const DropdownIndicator = ({ ...props }: DropdownIndicatorProps<Option>) => (
  <components.DropdownIndicator {...props}>
    <SearchIcon className="h-5 w-5 opacity-80 mr-2" />
  </components.DropdownIndicator>
);

function formatOptionLabel({ label }: FormatOptionLabelProps, { inputValue }: FormatOptionLabelContext) {
  return <Highlighter searchWords={[inputValue]} textToHighlight={label} highlightTag="b" />;
}

export default function Search({ onChange, pill, ...props }: SearchProps) {
  const [value, setValue] = React.useState<Option | null>(null);
  const navigate = useNavigate();

  const debouncedSearch = React.useMemo(
    () =>
      debounce(async (inputValue: string, callback: (options: Option[]) => void) => {
        try {
          const json = await get("/search", { q: inputValue });
          callback((json.results as Option[]) || []);
        } catch (error) {
          console.error("Search error:", error);
          callback([]);
        }
      }, 300),
    []
  );

  const loadOptions = (inputValue: string, callback: (options: Option[]) => void) => {
    debouncedSearch(inputValue, callback);
  };

  const handleChange = (option: Option) => {
    setValue(null);
    navigate(option.value);
    onChange?.();
  };

  const onSelectChange = (newValue: SingleValue<Option> | MultiValue<Option>) => {
    if (newValue && !Array.isArray(newValue)) {
      handleChange(newValue as Option);
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
          color: "#555",
          fontWeight: "normal",
        }),
        control: (base) => ({
          ...base,
          borderRadius: pill ? "50px" : "8px",
          fontSize: "18px",
          fontWeight: "normal",
          padding: "0.5rem",
          paddingLeft: pill ? "1rem" : "0.5rem",
          border: "solid 1px #efefef",
          borderColor: "#efefef !important",
          outline: "none",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)",
        }),
        indicatorSeparator: () => ({
          display: "none",
        }),
        menu: (base) => ({
          ...base,
          backgroundColor: "#1e293b",
          border: "1px solid #475569",
          borderRadius: "8px",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        }),
        menuList: (base) => ({
          ...base,
          padding: "4px",
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isFocused ? "#334155" : "transparent",
          color: "#f1f5f9",
          textAlign: "left",
          padding: "8px 12px",
          borderRadius: "4px",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: "#334155",
          },
        }),
        placeholder: (base) => ({
          ...base,
          color: "#94a3b8",
          textAlign: "left",
        }),
        noOptionsMessage: (base) => ({
          ...base,
          color: "#94a3b8",
          textAlign: "left",
        }),
        loadingMessage: (base) => ({
          ...base,
          color: "#94a3b8",
          textAlign: "left",
        }),
      }}
      instanceId="main-search"
      value={value}
      loadOptions={loadOptions}
      cacheOptions
      autoFocus
      components={{ DropdownIndicator }}
      formatOptionLabel={formatOptionLabel}
      noOptionsMessage={({ inputValue }) => (inputValue ? "No results found" : "Find a region...")}
      loadingMessage={() => "Loading..."}
      placeholder="Find a region..."
      onChange={onSelectChange}
      escapeClearsValue
      {...props}
    />
  );
}
