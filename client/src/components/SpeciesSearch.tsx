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
import { useBirdFinderStore } from "@/stores/birdFinderStore";

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

// Normalize text for matching: treat hyphens as spaces and lowercase
const sanitize = (text: string) => text.replace(/-/g, " ").toLowerCase();

function formatOptionLabel(option: Option, { inputValue }: FormatOptionLabelContext) {
  const searchWords = inputValue.split(/\s+/).filter(Boolean);
  return (
    <div>
      <Highlighter searchWords={searchWords} sanitize={sanitize} textToHighlight={option.label} highlightTag="b" />
      <span className="text-slate-500 text-sm ml-2">
        <Highlighter searchWords={searchWords} sanitize={sanitize} textToHighlight={option.sciName} highlightTag="b" />
      </span>
    </div>
  );
}

export default function SpeciesSearch({ pill, ...props }: SearchProps) {
  const { species, setSpecies } = useBirdFinderStore();
  const [inputValue, setInputValue] = React.useState("");

  // Convert store value to Option format
  const value: Option | null = species ? { value: species.code, label: species.name, sciName: species.sciName } : null;

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
      setSpecies(null);
    } else if (!Array.isArray(newValue)) {
      const opt = newValue as Option;
      setSpecies({ code: opt.value, name: opt.label, sciName: opt.sciName });
    }
  };

  return (
    <AsyncSelect
      unstyled
      classNames={{
        control: (state) =>
          `${pill ? "rounded-full pl-4" : "rounded-lg pl-2"} text-lg font-normal p-3 border bg-white shadow-xs ${
            state.isFocused
              ? "border-emerald-500 ring-2 ring-emerald-500/25"
              : "border-slate-300"
          }`,
        valueContainer: () => "pl-8",
        singleValue: () => "text-slate-900 font-normal",
        input: () => "text-slate-900",
        placeholder: () => "text-slate-500 text-left",
        clearIndicator: (state) =>
          state.isFocused ? "opacity-60 hover:opacity-100" : "opacity-30 hover:opacity-60",
        menu: () => "mt-1 bg-white border border-slate-300 rounded-lg shadow-lg",
        menuList: () => "p-1",
        option: (state) =>
          `text-left text-slate-900 px-3 py-2 rounded cursor-pointer ${
            state.isFocused ? "bg-slate-100" : ""
          }`,
        noOptionsMessage: () => "text-slate-500 text-left p-2",
        loadingMessage: () => "text-slate-500 text-left p-2",
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
  );
}
