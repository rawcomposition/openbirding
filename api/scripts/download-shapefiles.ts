import fs from "fs";
import path from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import unzipper from "unzipper";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const DOWNLOAD_URL = "https://naturalearth.s3.amazonaws.com/50m_cultural/ne_50m_admin_0_countries.zip";
const ZIP_FILE = "ne_50m_admin_0_countries.zip";
const OUTPUT_DIR = "../../";
const GEOJSON_FILE = "countries.geojson";

const downloadFile = async (url: string, outputPath: string): Promise<void> => {
  console.log(`Downloading ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const fileStream = createWriteStream(outputPath);
  await pipeline(response.body as any, fileStream);

  console.log(`Downloaded to ${outputPath}`);
};

const extractZip = async (zipPath: string, extractDir: string): Promise<void> => {
  console.log(`Extracting ${zipPath}...`);

  await fs.promises.mkdir(extractDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .on("close", () => {
        console.log("Extraction complete");
        resolve();
      })
      .on("error", reject);
  });
};

const convertShapefileToGeoJSON = async (shapefilePath: string, outputPath: string): Promise<void> => {
  console.log(`Converting ${shapefilePath} to GeoJSON...`);

  const command = `npx mapshaper "${shapefilePath}" -o format=geojson "${outputPath}"`;

  try {
    await execAsync(command);
    console.log(`GeoJSON saved to ${outputPath}`);
  } catch (error) {
    throw new Error(`Failed to convert shapefile: ${error}`);
  }
};

const main = async (): Promise<void> => {
  try {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), "temp-"));
    const zipPath = path.join(tempDir, ZIP_FILE);
    const extractDir = path.join(tempDir, "extracted");
    const outputPath = path.join(OUTPUT_DIR, GEOJSON_FILE);

    console.log("Starting Natural Earth 50m cultural boundaries download...");

    await downloadFile(DOWNLOAD_URL, zipPath);
    await extractZip(zipPath, extractDir);

    const shapefilePath = path.join(extractDir, "ne_50m_admin_0_countries.shp");

    if (!fs.existsSync(shapefilePath)) {
      throw new Error("No shapefile found in extracted files");
    }

    await convertShapefileToGeoJSON(shapefilePath, outputPath);

    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log("Natural Earth data processing completed successfully!");
    console.log(`GeoJSON file saved to: ${outputPath}`);
  } catch (error) {
    console.error("Error processing Natural Earth data:", error);
    process.exit(1);
  }
};

main();
