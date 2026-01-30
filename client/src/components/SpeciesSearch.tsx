import React from "react";
import AsyncSelect from "react-select/async";
import {
  components,
  type ValueContainerProps,
  type ClearIndicatorProps,
  type SingleValue,
  type MultiValue,
} from "react-select";
import { Bird as BirdIcon, X as XIcon } from "lucide-react";
import Highlighter from "react-highlight-words";
import debounce from "lodash/debounce";
import { get } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type Species = {
  code: string;
  name: string;
  sciName: string;
};

type Option = {
  value: string;
  label: string;
  sciName: string;
};

type SearchProps = {
  pill?: boolean;
  onChange?: (code: string | null) => void;
  [key: string]: unknown;
};

type FormatOptionLabelContext = {
  inputValue: string;
};

const ValueContainer = ({ children, ...props }: ValueContainerProps<Option>) => (
  <components.ValueContainer {...props}>
    <BirdIcon className="h-5 w-5 opacity-60 flex-shrink-0 absolute left-1.5" />
    {children}
  </components.ValueContainer>
);

const ClearIndicator = (props: ClearIndicatorProps<Option>) => (
  <components.ClearIndicator {...props}>
    <XIcon className="h-4 w-4 opacity-60 hover:opacity-100" />
  </components.ClearIndicator>
);

const LoadingIndicator = () => null;

function formatOptionLabel(option: Option, { inputValue }: FormatOptionLabelContext) {
  return (
    <div>
      <Highlighter searchWords={[inputValue]} textToHighlight={option.label} highlightTag="b" />
      <span className="text-slate-500 text-sm ml-2">
        <Highlighter searchWords={[inputValue]} textToHighlight={option.sciName} highlightTag="b" />
      </span>
    </div>
  );
}

export default function SpeciesSearch({ onChange, pill, ...props }: SearchProps) {
  const [value, setValue] = React.useState<Option | null>(null);
  const [inputValue, setInputValue] = React.useState("");

  const searchSpecies = async (searchTerm: string): Promise<Option[]> => {
    try {
      const data = (await get("/targets/species/search", { q: searchTerm })) as { species: Species[] };

      return data.species.map((species) => ({
        value: species.code,
        label: species.name,
        sciName: species.sciName,
      }));
    } catch (error) {
      console.error("Species search error:", error);
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

        const options = await searchSpecies(inputValue);
        callback(options);
      }, 300),
    []
  );

  const loadOptions = (inputValue: string, callback: (options: Option[]) => void) => {
    debouncedSearch(inputValue, callback);
  };

  const onSelectChange = (newValue: SingleValue<Option> | MultiValue<Option>) => {
    if (!newValue) {
      setValue(null);
      onChange?.(null);
    } else if (!Array.isArray(newValue)) {
      setValue(newValue as Option);
      onChange?.((newValue as Option).value);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="species-search">Species</Label>
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
            fontWeight: "normal",
          }),
          control: (base) => ({
            ...base,
            borderRadius: pill ? "50px" : "8px",
            fontSize: "18px",
            fontWeight: "normal",
            padding: "0.5rem",
            paddingLeft: pill ? "1rem" : "0.5rem",
            border: "solid 1px #cbd5e1",
            borderColor: "#cbd5e1 !important",
            outline: "none",
            boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            backgroundColor: "#ffffff",
          }),
          valueContainer: (base) => ({
            ...base,
            paddingLeft: "2rem",
          }),
          indicatorSeparator: () => ({
            display: "none",
          }),
          menu: (base) => ({
            ...base,
            backgroundColor: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
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
            color: "#64748b",
            textAlign: "left",
          }),
          noOptionsMessage: (base) => ({
            ...base,
            color: "#64748b",
            textAlign: "left",
          }),
          loadingMessage: (base) => ({
            ...base,
            color: "#64748b",
            textAlign: "left",
          }),
        }}
        inputId="species-search"
        instanceId="species-search"
        value={value}
        inputValue={inputValue}
        onInputChange={(val) => setInputValue(val)}
        loadOptions={loadOptions}
        cacheOptions
        isClearable
        components={{ ValueContainer, ClearIndicator, LoadingIndicator, DropdownIndicator: () => null }}
        formatOptionLabel={formatOptionLabel}
        noOptionsMessage={() => (inputValue.length >= 2 ? "No species found" : null)}
        loadingMessage={() => "Searching..."}
        placeholder="Search for a species..."
        onChange={onSelectChange}
        menuIsOpen={inputValue.length >= 2 ? undefined : false}
        escapeClearsValue
        {...props}
      />
    </div>
  );
}
