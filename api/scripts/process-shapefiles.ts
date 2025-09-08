import fs from "fs";
import path from "path";

interface CountryFeature {
  type: string;
  properties: {
    [key: string]: any;
  };
  geometry: any;
}

interface CountryData {
  name: string;
  codes: {
    [key: string]: string;
  };
}

const GEOJSON_PATH = "../../countries.geojson";
const OUTPUT_PATH = "../../country-codes.json";
const COUNTRIES_DIR = "../../countries";

const analyzeGeoJSON = async (): Promise<{ countries: CountryData[]; features: CountryFeature[] }> => {
  console.log("Reading GeoJSON file...");

  const geojsonData = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
  const features: CountryFeature[] = geojsonData.features;

  console.log(`Found ${features.length} countries`);

  const countries: CountryData[] = [];

  for (const feature of features) {
    const props = feature.properties;

    const country: CountryData = {
      name: props.ADMIN || props.NAME || props.SOVEREIGNT || "Unknown",
      codes: {},
    };

    for (const [key, value] of Object.entries(props)) {
      if (typeof value === "string" && value.length <= 4) {
        country.codes[key] = value;
      }
    }

    countries.push(country);
  }

  return { countries, features };
};

const findBestCountryCodeField = (countries: CountryData[]): string => {
  console.log("Analyzing country code fields...");

  const fieldStats: { [key: string]: { count: number; examples: string[] } } = {};

  for (const country of countries) {
    for (const [field, code] of Object.entries(country.codes)) {
      if (!fieldStats[field]) {
        fieldStats[field] = { count: 0, examples: [] };
      }

      if (code && code.length === 2 && /^[A-Z]{2}$/.test(code)) {
        fieldStats[field].count++;
        if (fieldStats[field].examples.length < 5) {
          fieldStats[field].examples.push(code);
        }
      }
    }
  }

  console.log("\nTwo-letter country code field analysis:");
  for (const [field, stats] of Object.entries(fieldStats)) {
    if (stats.count > 0) {
      console.log(`${field}: ${stats.count} countries (examples: ${stats.examples.join(", ")})`);
    }
  }

  const bestField = Object.entries(fieldStats)
    .filter(([_, stats]) => stats.count > 0)
    .sort(([_, a], [__, b]) => b.count - a.count)[0];

  return bestField ? bestField[0] : "ISO_A2";
};

const extractCountryCodes = (countries: CountryData[], field: string): string[] => {
  console.log(`\nExtracting country codes using field: ${field}`);

  const codes: string[] = [];

  for (const country of countries) {
    const code = country.codes[field];
    if (code && code.length === 2 && /^[A-Z]{2}$/.test(code)) {
      codes.push(code);
    }
  }

  return codes.sort();
};

const createCountriesDirectory = (): void => {
  if (!fs.existsSync(COUNTRIES_DIR)) {
    fs.mkdirSync(COUNTRIES_DIR, { recursive: true });
    console.log(`Created directory: ${COUNTRIES_DIR}`);
  }
};

const filterProperties = (properties: { [key: string]: any }): { [key: string]: any } => {
  const allowedProperties = [
    "ADMIN",
    "NAME_LONG",
    "NAME",
    "BRK_NAME",
    "SUBUNIT",
    "GEOUNIT",
    "TYPE",
    "SOVEREIGNT",
    "SOV_A3",
    "ADM0_A3",
    "NE_ID",
    "ISO_A2_EH",
    "ISO_A3_EH",
  ];

  const filtered: { [key: string]: any } = {};
  for (const prop of allowedProperties) {
    if (properties[prop] !== undefined) {
      filtered[prop] = properties[prop];
    }
  }

  return filtered;
};

const getCountryFilename = (country: CountryFeature): string => {
  const props = country.properties;

  const name = props.ADMIN || props.NAME || props.SOVEREIGNT || "Unknown";

  // Use ISO_A2_EH only if TYPE === "Sovereign country", "Dependency", or "Country" && ISO_A2_EH !== "-99"
  if (
    (props.TYPE === "Sovereign country" || props.TYPE === "Dependency" || props.TYPE === "Country") &&
    props.ISO_A2_EH &&
    props.ISO_A2_EH !== "-99"
  ) {
    return `${props.ISO_A2_EH}.geojson`;
  }

  // Otherwise, use the name
  const sanitizedName = name
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${sanitizedName}.geojson`;
};

const splitCountries = async (countries: CountryFeature[]): Promise<void> => {
  console.log("\nSplitting countries into individual GeoJSON files...");

  createCountriesDirectory();

  let successCount = 0;
  let errorCount = 0;

  for (const feature of countries) {
    try {
      const filename = getCountryFilename(feature);
      const filepath = path.join(COUNTRIES_DIR, filename);

      // Create a clean feature with only the allowed properties
      const cleanFeature = {
        type: "Feature",
        properties: filterProperties(feature.properties),
        geometry: feature.geometry,
      };

      const countryGeoJSON = {
        type: "FeatureCollection",
        features: [cleanFeature],
      };

      fs.writeFileSync(filepath, JSON.stringify(countryGeoJSON, null, 2));
      successCount++;

      if (successCount % 50 === 0) {
        console.log(`Processed ${successCount} countries...`);
      }
    } catch (error) {
      console.error(`Error processing country: ${feature.properties.ADMIN || "Unknown"}`, error);
      errorCount++;
    }
  }

  console.log(`\nSplit complete!`);
  console.log(`✅ Successfully created: ${successCount} country files`);
  if (errorCount > 0) {
    console.log(`❌ Errors: ${errorCount} countries`);
  }
  console.log(`📁 Files saved to: ${COUNTRIES_DIR}`);

  const files = fs.readdirSync(COUNTRIES_DIR).filter((f) => f.endsWith(".geojson"));
  console.log(`📊 Total files in directory: ${files.length}`);
};

const main = async (): Promise<void> => {
  try {
    console.log("Processing Natural Earth country data...");

    const { countries, features } = await analyzeGeoJSON();
    const bestField = findBestCountryCodeField(countries);
    const countryCodes = extractCountryCodes(countries, bestField);

    console.log(`\nFound ${countryCodes.length} two-letter country codes:`);
    console.log(countryCodes.join(", "));

    console.log(`\nCountries without two-letter codes in ${bestField}:`);
    const countriesWithoutCodes = countries.filter((c) => !c.codes[bestField] || c.codes[bestField].length !== 2);
    countriesWithoutCodes.forEach((c) => {
      console.log(
        `- ${c.name}: ${c.codes[bestField] || "no code"} (available codes: ${Object.entries(c.codes)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")})`
      );
    });

    const output = {
      source: "Natural Earth 50m cultural boundaries",
      field: bestField,
      totalCountries: countries.length,
      twoLetterCodes: countryCodes.length,
      codes: countryCodes,
      countries: countries.map((c) => ({
        name: c.name,
        code: c.codes[bestField] || null,
        allCodes: c.codes,
      })),
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    console.log(`\nResults saved to: ${OUTPUT_PATH}`);
    console.log(`Best field for eBird-style codes: ${bestField}`);
    console.log(`Total two-letter codes found: ${countryCodes.length}`);

    await splitCountries(features);
  } catch (error) {
    console.error("Error processing shapefiles:", error);
    process.exit(1);
  }
};

main();
