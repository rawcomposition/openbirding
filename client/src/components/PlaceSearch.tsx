import React from "react";
import AsyncSelect from "react-select/async";
import { components, type DropdownIndicatorProps, type SingleValue, type MultiValue } from "react-select";
import { MapPin as MapPinIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Highlighter from "react-highlight-words";
import debounce from "lodash/debounce";

type MapboxFeature = {
  id: string;
  type: string;
  place_type: string[];
  relevance: number;
  properties: {
    wikidata?: string;
    short_code?: string;
  };
  text: string;
  place_name: string;
  bbox: number[];
  center: number[];
  geometry: {
    type: string;
    coordinates: number[];
  };
  context: Array<{
    id: string;
    wikidata?: string;
    short_code?: string;
    text: string;
  }>;
};

type MapboxResponse = {
  type: string;
  query: string[];
  features: MapboxFeature[];
  attribution: string;
};

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
    <MapPinIcon className="h-5 w-5 opacity-80 mr-2" />
  </components.DropdownIndicator>
);

function formatOptionLabel({ label }: FormatOptionLabelProps, { inputValue }: FormatOptionLabelContext) {
  return <Highlighter searchWords={[inputValue]} textToHighlight={label} highlightTag="b" />;
}

export default function PlaceSearch({ onChange, pill, ...props }: SearchProps) {
  const [value, setValue] = React.useState<Option | null>(null);
  const navigate = useNavigate();

  const searchMapbox = async (inputValue: string): Promise<Option[]> => {
    const accessToken = import.meta.env.VITE_MAPBOX_KEY;

    if (!accessToken) {
      console.error("Mapbox access token not found. Please set VITE_MAPBOX_KEY in your environment variables.");
      return [];
    }

    try {
      const encodedQuery = encodeURIComponent(inputValue);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?access_token=${accessToken}&types=place,locality,neighborhood,address&limit=10`;

      const response = await fetch(url);
      const data: MapboxResponse = await response.json();

      return data.features.map((feature) => {
        const formattedName = feature.place_name.replace(", United States", ", US");
        return {
          value: `/place/${encodeURIComponent(formattedName)}/${feature.center[1]},${feature.center[0]}`,
          label: formattedName,
        };
      });
    } catch (error) {
      console.error("Mapbox search error:", error);
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

        const options = await searchMapbox(inputValue);
        callback(options);
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
      instanceId="place-search"
      value={value}
      loadOptions={loadOptions}
      cacheOptions
      autoFocus
      components={{ DropdownIndicator }}
      formatOptionLabel={formatOptionLabel}
      noOptionsMessage={({ inputValue }) => (inputValue ? "No places found" : "Search for a city or town")}
      loadingMessage={() => "Searching..."}
      placeholder="Find nearby hotspots..."
      onChange={onSelectChange}
      escapeClearsValue
      {...props}
    />
  );
}
