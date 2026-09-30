#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const NODE_URL = process.env.NODE_URL ?? "http://localhost:3000";
const RUST_URL = process.env.RUST_URL ?? "http://localhost:3001";
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const REPORTS_PASS = process.env.REPORTS_PASS ?? "";
const ORIGIN = process.env.PARITY_ORIGIN ?? "http://localhost:5173";
const REPORT_PATH = process.env.PARITY_REPORT;
const INCLUDE_EBIRD = process.env.PARITY_EBIRD !== "0";
const RUN_ID = Date.now().toString(36);

const COMPARED_HEADERS = [
  "content-type",
  "cache-control",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "vary",
  "www-authenticate",
];

function sqlite(db, query) {
  return execFileSync("sqlite3", [join(DATA_DIR, db), query], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);
}

function sample() {
  const busiestHotspots = sqlite("targets.db", "SELECT id FROM hotspots ORDER BY num_species DESC LIMIT 5");
  const scatteredHotspots = sqlite("targets.db", "SELECT id FROM hotspots WHERE rowid % 997 = 0 LIMIT 2500");
  const speciesCodes = sqlite("targets.db", "SELECT code FROM species ORDER BY taxon_order LIMIT 5");
  const h3Big = sqlite("targets.db", "SELECT printf('%x', h3) FROM h3_cells WHERE cell_ref % 97 = 0 LIMIT 3000");
  const h3Small = sqlite("targets.db", "SELECT printf('%x', h3) FROM h3_cells ORDER BY cell_ref LIMIT 7");
  const lifeListCodes = sqlite("occurrences.db", "SELECT code FROM species WHERE id % 3 = 0");
  const lifeListSci = sqlite("occurrences.db", "SELECT sci_name FROM species WHERE id % 3 = 1 LIMIT 400");
  const lifeListCommon = sqlite("occurrences.db", "SELECT name FROM species WHERE id % 3 = 2 LIMIT 400");
  const packId = sqlite("openbirding.db", "SELECT id FROM packs ORDER BY hotspots, id LIMIT 1")[0];
  return {
    busiestHotspots,
    scatteredHotspots,
    speciesCodes,
    h3Big,
    h3Small,
    packId,
    bigLifeList: [
      ...lifeListCodes.map((code) => ({ code })),
      ...lifeListSci,
      ...lifeListCommon.map((commonName) => ({ commonName })),
      { sciName: "Notabird notabird", commonName: "Imaginary Bird" },
      "Turdus migratorius migratorius",
    ],
    smallLifeList: ["Turdus migratorius", { code: "norcar" }, { commonName: "Blue Jay" }, { sciName: "Nope nope" }],
  };
}

const bearer = { Authorization: `Bearer ${CRON_SECRET}` };
const basic = (user, pass) => ({ Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` });

function corpus(s) {
  const [loc1, loc2, loc3] = s.busiestHotspots;
  const cases = [];
  const add = (name, method, path, extra = {}) => cases.push({ name, method, path, ...extra });
  const get = (name, path, extra) => add(name, "GET", path, extra);
  const post = (name, path, body, extra) => add(name, "POST", path, { body, ...extra });

  get("404 unknown route", "/api/v1/nope");
  get("404 trailing slash", "/api/v1/regions/");
  post("404 wrong method", "/api/v1/regions", {});
  add("cors preflight", "OPTIONS", "/api/v1/targets/h3", {
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type , x-custom" },
  });
  add("cors preflight unknown path", "OPTIONS", "/api/v1/whatever", { headers: { Origin: "https://evil.example" } });
  get("cors allowed origin", "/api/v1/best-hotspots/status", { headers: { Origin: ORIGIN } });
  get("cors disallowed origin", "/api/v1/best-hotspots/status", { headers: { Origin: "https://evil.example" } });
  get("cors echoes request vary", "/api/v1/nope", { headers: { Origin: ORIGIN, Vary: "Accept" } });

  get("regions all", "/api/v1/regions");
  get("regions search", "/api/v1/regions/search?q=cal");
  get("regions search multiword", "/api/v1/regions/search?q=new%20york");
  get("regions search short", "/api/v1/regions/search?q=c");
  get("regions search missing", "/api/v1/regions/search");
  get("regions search quotes", "/api/v1/regions/search?q=%22san%20*(");

  get("species search", "/api/v1/species/search?q=robin");
  get("species search sci", "/api/v1/species/search?q=Turdus%20mig");
  get("species search short", "/api/v1/species/search?q=%20r%20");
  get("species search specials only", "/api/v1/species/search?q=((**");
  get("species unknown subpath", "/api/v1/species/nope");

  get("targets region", "/api/v1/targets/region/US-CA?months=1,2");
  get("targets region county", "/api/v1/targets/region/US-CA-085");
  get("targets region multi dedupe", "/api/v1/targets/region/us-ca,US-CA-085,CR");
  get("targets region empty months", "/api/v1/targets/region/CR?months=");
  get("targets region fractional month", "/api/v1/targets/region/CR?months=1.5");
  get("targets region unknown", "/api/v1/targets/region/ZZ");
  get("targets region invalid", "/api/v1/targets/region/USA");
  get("targets region bad months", "/api/v1/targets/region/US?months=13");
  get("targets region too many", `/api/v1/targets/region/${Array.from({ length: 21 }, (_, i) => `US-${i}`).join(",")}`);
  post("targets h3 small", "/api/v1/targets/h3", { cells: s.h3Small, months: [5, "6"] });
  post("targets h3 3000 cells", "/api/v1/targets/h3", { cells: s.h3Big });
  post("targets h3 unknown cells", "/api/v1/targets/h3", { cells: ["8f0000000000000"] });
  post("targets h3 empty", "/api/v1/targets/h3", { cells: [] });
  post("targets h3 bad cell", "/api/v1/targets/h3", { cells: ["zz"] });
  post("targets h3 too many", "/api/v1/targets/h3", { cells: [...s.h3Big, "8f0000000000001"] });
  post("targets h3 months string", "/api/v1/targets/h3", { cells: s.h3Small, months: "5" });
  post("targets h3 months empty", "/api/v1/targets/h3", { cells: s.h3Small, months: [] });
  post("targets h3 invalid json", "/api/v1/targets/h3", "{nope", { raw: true });
  post("targets locations", "/api/v1/targets/locations", { locationIds: [loc1, loc2.toLowerCase(), ` ${loc3} `, "L1"], months: [1, 2] });
  post("targets locations all months", "/api/v1/targets/locations", { locationIds: s.busiestHotspots });
  post("targets locations too many", "/api/v1/targets/locations", { locationIds: Array.from({ length: 501 }, (_, i) => `L${i + 1}`) });
  post("targets locations empty", "/api/v1/targets/locations", { locationIds: [] });
  post("targets locations bad id", "/api/v1/targets/locations", { locationIds: ["X1"] });
  post("targets locations missing", "/api/v1/targets/locations", {});
  get("targets location", `/api/v1/targets/location/${loc1}`);
  get("targets location lowercase", `/api/v1/targets/location/%20${loc2.toLowerCase()}%20`);
  get("targets location missing", "/api/v1/targets/location/L999999999");
  get("targets location invalid", "/api/v1/targets/location/abc");

  get("hotspots bbox", "/api/v1/hotspots?bbox=-122.6,37.2,-121.8,37.9");
  get("hotspots bbox filtered", "/api/v1/hotspots?bbox=-122.6,37.2,-121.8,37.9&minChecklists=10&minSpecies=100");
  get("hotspots bbox missing", "/api/v1/hotspots");
  get("hotspots bbox invalid", "/api/v1/hotspots?bbox=1,2,3");
  get("hotspots bbox too big", "/api/v1/hotspots?bbox=-180,-90,180,90");
  get("hotspots bbox negative min", "/api/v1/hotspots?bbox=-1,-1,1,1&minSpecies=-1");
  get("hotspots region", "/api/v1/hotspots/region/US-CA-085");
  get("hotspots region multi", "/api/v1/hotspots/region/us-ca-085,US-CA-081");
  get("hotspots region invalid", "/api/v1/hotspots/region/nope1");
  get("hotspots species year", "/api/v1/hotspots/species/amerob?region=US-CA&limit=20");
  get("hotspots species month", "/api/v1/hotspots/species/AMEROB?month=5&limit=15&minObservations=5");
  get("hotspots species bbox", "/api/v1/hotspots/species/amerob?bbox=-122.6,37.2,-121.8,37.9");
  get("hotspots species multi region breadcrumbs", "/api/v1/hotspots/species/norcar?region=US,MX&limit=30");
  get("hotspots species unknown", "/api/v1/hotspots/species/zzzzzz?region=nope1");
  get("hotspots species bad region", "/api/v1/hotspots/species/amerob?region=nope1");
  get("hotspots species bad limit", "/api/v1/hotspots/species/amerob?limit=0");
  get("hotspots species bad month", "/api/v1/hotspots/species/amerob?month=13");
  post("hotspots species post best months", "/api/v1/hotspots/species/amerob", { region: "US-CA", limit: 25, months: [5, 6], sortBy: "best" });
  post("hotspots species post freq months", "/api/v1/hotspots/species/amerob", { region: "US-NY", months: [12, "1"], sortBy: "frequency", minObservations: 3 });
  post("hotspots species post year default", "/api/v1/hotspots/species/amerob", { region: "CR", limit: "10" });
  post("hotspots species post year best", "/api/v1/hotspots/species/amerob", { sortBy: "best", limit: 10, bbox: { minLng: -123, minLat: 37, maxLng: -121, maxLat: 38 } });
  post("hotspots species post locationIds", "/api/v1/hotspots/species/amerob", { locationIds: s.busiestHotspots, months: [4] });
  post("hotspots species post month singular", "/api/v1/hotspots/species/amerob", { month: 5 });
  post("hotspots species post bad months", "/api/v1/hotspots/species/amerob", { months: [13] });
  post("hotspots species post bad sort", "/api/v1/hotspots/species/amerob", { sortBy: "x" });
  post("hotspots species post invalid json", "/api/v1/hotspots/species/amerob", "", { raw: true });
  get("hotspots location", `/api/v1/hotspots/location/${loc1}`);
  get("hotspots location missing", "/api/v1/hotspots/location/L999999999");
  get("hotspots location invalid", "/api/v1/hotspots/location/nope");
  post("hotspots lookup", "/api/v1/hotspots/lookup", { ids: [loc1, loc2.toLowerCase(), " ", "L999999999", loc1] }, { unordered: ["items"] });
  post("hotspots lookup chunked", "/api/v1/hotspots/lookup", { ids: s.scatteredHotspots }, { unordered: ["items"] });
  post("hotspots lookup empty", "/api/v1/hotspots/lookup", { ids: [] });
  post("hotspots lookup invalid", "/api/v1/hotspots/lookup", { ids: [1] });

  get("best status", "/api/v1/best-hotspots/status");
  const liferBase = { species: s.bigLifeList };
  post("best hotspots big list", "/api/v1/best-hotspots/hotspots", liferBase);
  post("best hotspots filtered", "/api/v1/best-hotspots/hotspots", { ...liferBase, frequency: 10, minChecklists: 50, limit: 25, region: "US-CA" });
  post("best hotspots antimeridian", "/api/v1/best-hotspots/hotspots", { species: s.smallLifeList, bbox: { minLng: 170, maxLng: -170, minLat: -50, maxLat: 0 }, limit: 500 });
  post("best hotspots region array", "/api/v1/best-hotspots/hotspots", { species: s.smallLifeList, region: ["US", "CA"] });
  post("best hotspots region number", "/api/v1/best-hotspots/hotspots", { species: s.smallLifeList, region: 5 });
  post("best hotspots bad frequency", "/api/v1/best-hotspots/hotspots", { species: s.smallLifeList, frequency: -1 });
  post("best hotspots bad limit", "/api/v1/best-hotspots/hotspots", { species: s.smallLifeList, limit: 501 });
  post("best hotspots empty species", "/api/v1/best-hotspots/hotspots", { species: [] });
  post("best hotspots bad species entry", "/api/v1/best-hotspots/hotspots", { species: [3] });
  post("best hotspots bad token", "/api/v1/best-hotspots/hotspots", { listToken: "nope" });
  post("best hotspots unknown token", "/api/v1/best-hotspots/hotspots", { listToken: "00000000-0000-0000-0000-000000000000" });
  post("best hotspot lifers", `/api/v1/best-hotspots/hotspot/${loc1}`, { species: s.smallLifeList, frequency: 0.2 });
  post("best hotspot lifers big list", `/api/v1/best-hotspots/hotspot/${loc2.toLowerCase()}`, liferBase);
  post("best hotspot lifers invalid", "/api/v1/best-hotspots/hotspot/nope", liferBase);
  post("best grid", "/api/v1/best-hotspots/grid", { ...liferBase, resolution: 4, bbox: { minLng: -125, minLat: 30, maxLng: -110, maxLat: 45 } });
  post("best grid antimeridian", "/api/v1/best-hotspots/grid", { species: s.smallLifeList, resolution: 3, bbox: { minLng: 160, minLat: -60, maxLng: -150, maxLat: 10 } });
  post("best grid bad resolution", "/api/v1/best-hotspots/grid", { ...liferBase, resolution: 5, bbox: { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 } });
  post("best grid no bbox", "/api/v1/best-hotspots/grid", { ...liferBase, resolution: 4 });
  post("best grid scale", "/api/v1/best-hotspots/grid-scale", liferBase);
  post("best grid scale small", "/api/v1/best-hotspots/grid-scale", { species: s.smallLifeList });
  post("best cells empty", "/api/v1/best-hotspots/cells", { ...liferBase, cells: [] });
  post("best cells bad", "/api/v1/best-hotspots/cells", { ...liferBase, cells: ["XYZ"] });
  post("best list invalid species", "/api/v1/best-hotspots/list", { species: "nope" });
  get("best list bad token", "/api/v1/best-hotspots/list/nope");
  get("best list unknown token", "/api/v1/best-hotspots/list/00000000-0000-0000-0000-000000000000");

  post("android notify invalid", "/api/v1/android-notify", { email: "nope" });
  post("android notify invalid json leaks nothing", "/api/v1/android-notify", "{", { raw: true });

  add("admin no auth", "POST", "/api/v1/admin/swap-targets-db");
  add("admin wrong key", "POST", "/api/v1/admin/swap-targets-db?key=wrong");
  get("admin unknown path no auth", "/api/v1/admin/nope");
  get("admin unknown path authed", "/api/v1/admin/nope", { headers: bearer });
  get("admin wrong method authed", "/api/v1/admin/swap-targets-db", { headers: bearer });
  add("backups create no auth", "POST", "/api/v1/backups/create");
  get("backups list no auth", "/api/v1/backups/list?key=wrong");
  get("reports no auth", "/api/v1/reports/downloads");
  get("reports wrong pass", "/api/v1/reports/android", { headers: basic("admin", "wrong") });
  get("reports unknown authed", "/api/v1/reports/nope", { headers: basic("admin", REPORTS_PASS) });
  get("reports downloads", "/api/v1/reports/downloads", { headers: basic("admin", REPORTS_PASS), text: true });
  get("reports android", "/api/v1/reports/android", { headers: basic("admin", REPORTS_PASS), text: true });

  get("packs list", "/api/v1/packs");
  post("packs log download bad id", "/api/v1/packs/abc/log-download", {});
  post("packs log download missing", "/api/v1/packs/99999999/log-download", {});
  post("packs log download", `/api/v1/packs/${s.packId}/log-download`, {}, { headers: { "App-Version": "1.2.3", "App-Platform": "ios" } });
  if (INCLUDE_EBIRD) {
    get("packs download", `/api/v1/packs/${s.packId}`, { headers: { "Download-Method": "parity" } });
    get("taxonomy", "/api/v1/taxonomy");
  }
  return cases;
}

async function call(base, testCase) {
  const headers = { ...(testCase.headers ?? {}) };
  let body;
  if (testCase.body !== undefined) {
    body = testCase.raw ? testCase.body : JSON.stringify(testCase.body);
    headers["Content-Type"] ??= "application/json";
  }
  const started = performance.now();
  const response = await fetch(base + testCase.path, { method: testCase.method, headers, body });
  const text = await response.text();
  const elapsed = performance.now() - started;
  const picked = Object.fromEntries(COMPARED_HEADERS.map((h) => [h, response.headers.get(h)]));
  let json;
  if (!testCase.text) {
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {}
  }
  return { status: response.status, headers: picked, text, json, elapsed };
}

function normalizeHeaders(headers) {
  const out = { ...headers };
  if (out["content-type"]) out["content-type"] = out["content-type"].replace(/;\s*charset=utf-8/i, "").toLowerCase();
  return out;
}

function sortUnordered(value, paths) {
  if (!value || typeof value !== "object") return value;
  const copy = structuredClone(value);
  for (const path of paths ?? []) {
    const list = copy[path];
    if (Array.isArray(list)) list.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return copy;
}

function diff(a, b, path, ignore, out) {
  if (out.length >= 10) return;
  if (typeof a === "number" && typeof b === "number") {
    if (!(a === b || (Number.isNaN(a) && Number.isNaN(b)))) out.push(`${path}: ${a} != ${b}`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return void out.push(`${path}: array mismatch`);
    if (a.length !== b.length) out.push(`${path}: length ${a.length} != ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, ignore, out);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (ignore.has(key)) continue;
      if (!(key in a)) out.push(`${path}.${key}: missing on node`);
      else if (!(key in b)) out.push(`${path}.${key}: missing on rust`);
      else diff(a[key], b[key], `${path}.${key}`, ignore, out);
    }
    return;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 120)} != ${JSON.stringify(b)?.slice(0, 120)}`);
}

async function compare(testCase) {
  const node = await call(NODE_URL, testCase);
  const rust = await call(RUST_URL, testCase);
  const problems = [];
  if (node.status !== rust.status) problems.push(`status ${node.status} != ${rust.status}`);
  const nodeHeaders = normalizeHeaders(node.headers);
  const rustHeaders = normalizeHeaders(rust.headers);
  for (const header of COMPARED_HEADERS) {
    if (header === "content-type" && node.status === 204) continue;
    if (nodeHeaders[header] !== rustHeaders[header]) problems.push(`header ${header}: ${nodeHeaders[header]} != ${rustHeaders[header]}`);
  }
  const ignore = new Set(["queryTime", ...(testCase.ignore ?? [])]);
  if (node.status >= 500 && rust.status >= 500) {
    if (rust.json?.message !== "Internal Server Error") problems.push(`rust 500 leaks detail: ${rust.text.slice(0, 120)}`);
  } else if (node.json !== undefined || rust.json !== undefined) {
    diff(sortUnordered(node.json, testCase.unordered), sortUnordered(rust.json, testCase.unordered), "$", ignore, problems);
  } else if (node.text !== rust.text) {
    problems.push(`body text differs (${node.text.length} vs ${rust.text.length} chars)`);
  }
  return { name: testCase.name, method: testCase.method, path: testCase.path.slice(0, 100), ok: problems.length === 0, problems, node, rust };
}

async function statefulFlows(s, results) {
  const record = (name, node, rust, ignore = []) => {
    const problems = [];
    if (node.status !== rust.status) problems.push(`status ${node.status} != ${rust.status}`);
    diff(node.json, rust.json, "$", new Set(["queryTime", ...ignore]), problems);
    results.push({ name, method: "FLOW", path: "", ok: problems.length === 0, problems, node, rust });
  };
  const both = (testCaseFor) => Promise.all([call(NODE_URL, testCaseFor("node")), call(RUST_URL, testCaseFor("rust"))]);

  const [nodeSignup, rustSignup] = await both((who) => ({ method: "POST", path: "/api/v1/android-notify", body: { email: ` Parity-${who}-${RUN_ID}@Example.com ` } }));
  record("android notify new", nodeSignup, rustSignup);
  const [nodeRepeat, rustRepeat] = await both((who) => ({ method: "POST", path: "/api/v1/android-notify", body: { email: `parity-${who}-${RUN_ID}@example.com` } }));
  record("android notify repeat", nodeRepeat, rustRepeat);

  const listBody = { species: s.bigLifeList, fileName: "x".repeat(250) };
  const [nodeList, rustList] = await both(() => ({ method: "POST", path: "/api/v1/best-hotspots/list", body: listBody }));
  record("life list create", nodeList, rustList, ["token"]);
  const tokens = { node: nodeList.json?.token, rust: rustList.json?.token };

  const [nodeCross, rustCross] = await Promise.all([
    call(NODE_URL, { method: "GET", path: `/api/v1/best-hotspots/list/${tokens.rust}` }),
    call(RUST_URL, { method: "GET", path: `/api/v1/best-hotspots/list/${tokens.node}` }),
  ]);
  record("life list read across servers", nodeCross, rustCross, ["token", "createdAt", "updatedAt"]);

  const [nodeHotspots, rustHotspots] = await both((who) => ({ method: "POST", path: "/api/v1/best-hotspots/hotspots", body: { listToken: tokens[who], limit: 50 } }));
  record("life list hotspots via token", nodeHotspots, rustHotspots);
  const [nodeGrid, rustGrid] = await both((who) => ({
    method: "POST",
    path: "/api/v1/best-hotspots/grid",
    body: { listToken: tokens[who], resolution: 3, bbox: { minLng: -130, minLat: 20, maxLng: -60, maxLat: 55 } },
  }));
  record("life list grid via token", nodeGrid, rustGrid);

  const cells = (nodeGrid.json?.cells ?? []).slice(0, 20).map((c) => c.h3);
  const [nodeCells, rustCells] = await both((who) => ({
    method: "POST",
    path: "/api/v1/best-hotspots/cells",
    body: { listToken: tokens[who], resolution: 3, cells: [...cells, cells[0], "830000fffffffff"] },
  }));
  record("life list cells via token", nodeCells, rustCells);

  const [nodeUpdate, rustUpdate] = await both((who) => ({
    method: "POST",
    path: "/api/v1/best-hotspots/list",
    body: { token: tokens[who], species: s.smallLifeList, fileName: "small.csv" },
  }));
  record("life list update", nodeUpdate, rustUpdate, ["token"]);
  if (nodeUpdate.json?.token !== tokens.node || rustUpdate.json?.token !== tokens.rust) {
    results.push({ name: "life list update keeps token", method: "FLOW", path: "", ok: false, problems: ["token changed on update"] });
  }
  const [nodeAfter, rustAfter] = await both((who) => ({
    method: "POST",
    path: `/api/v1/best-hotspots/hotspot/${s.busiestHotspots[0]}`,
    body: { listToken: tokens[who] },
  }));
  record("life list lifers after update (cache invalidation)", nodeAfter, rustAfter);

  const [nodeDelete, rustDelete] = await both((who) => ({ method: "DELETE", path: `/api/v1/best-hotspots/list/${tokens[who]}` }));
  record("life list delete", nodeDelete, rustDelete);
  const [nodeGone, rustGone] = await both((who) => ({ method: "POST", path: "/api/v1/best-hotspots/hotspots", body: { listToken: tokens[who] } }));
  record("life list hotspots after delete", nodeGone, rustGone);

  const [nodeBackup, rustBackup] = await both(() => ({ method: "POST", path: `/api/v1/backups/create?key=${CRON_SECRET}` }));
  record("backups create", nodeBackup, rustBackup, ["path", "timestamp"]);
  const [nodeBackups, rustBackups] = await both(() => ({ method: "GET", path: "/api/v1/backups/list", headers: bearer }));
  record("backups list", nodeBackups, rustBackups, ["backups"]);
}

async function main() {
  const s = sample();
  const results = [];
  for (const testCase of corpus(s)) {
    try {
      results.push(await compare(testCase));
    } catch (err) {
      results.push({ name: testCase.name, ok: false, problems: [String(err)] });
    }
  }
  await statefulFlows(s, results);

  let failures = 0;
  for (const result of results) {
    if (result.ok) {
      console.log(`ok    ${result.name}`);
    } else {
      failures++;
      console.log(`FAIL  ${result.name}`);
      for (const problem of result.problems) console.log(`        ${problem}`);
    }
  }
  const timed = results.filter((r) => r.node?.elapsed && r.rust?.elapsed);
  const total = (who) => timed.reduce((sum, r) => sum + r[who].elapsed, 0);
  console.log(`\n${results.length - failures}/${results.length} matched; total latency node ${total("node").toFixed(0)} ms, rust ${total("rust").toFixed(0)} ms`);
  if (REPORT_PATH) {
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        results.map(({ node, rust, ...r }) => ({ ...r, nodeStatus: node?.status, rustStatus: rust?.status, nodeMs: node?.elapsed, rustMs: rust?.elapsed })),
        null,
        2
      )
    );
  }
  process.exitCode = failures ? 1 : 0;
}

main();
