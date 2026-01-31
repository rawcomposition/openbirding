import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import db from "../db/index.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

const reportsRoute = new Hono();

reportsRoute.use(
  "*",
  basicAuth({
    verifyUser: (username, password) => {
      return username === "admin" && password === process.env.REPORTS_PASS;
    },
  })
);

reportsRoute.get("/downloads", async (c) => {
  const downloads = await db
    .selectFrom("packDownloads")
    .leftJoin("regions", "packDownloads.packRegion", "regions.id")
    .select([
      "packDownloads.id",
      "packDownloads.packId",
      "packDownloads.packRegion",
      "regions.longName as packName",
      "packDownloads.method",
      "packDownloads.appVersion",
      "packDownloads.appPlatform",
      "packDownloads.appEnvironment",
      "packDownloads.userAgent",
      "packDownloads.createdAt",
    ])
    .orderBy("packDownloads.createdAt", "desc")
    .limit(500)
    .execute();

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Pack Downloads</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    tr:hover { background: #f9f9f9; }
  </style>
</head>
<body>
  <h1>Pack Downloads</h1>
  <p>Found ${downloads.length} results</p>
  <table>
    <tr>
      <th>ID</th>
      <th>Pack</th>
      <th>Method</th>
      <th>Version</th>
      <th>Platform</th>
      <th>Environment</th>
      <th>User Agent</th>
      <th>Created At</th>
    </tr>
    ${downloads
      .map(
        (d) => `
    <tr>
      <td>${d.id}</td>
      <td>${d.packName || d.packRegion}</td>
      <td>${d.method || "-"}</td>
      <td>${d.appVersion || "-"}</td>
      <td>${d.appPlatform || "-"}</td>
      <td>${d.appEnvironment || "-"}</td>
      <td>${d.userAgent || "-"}</td>
      <td>${dayjs(d.createdAt).tz("America/Los_Angeles").fromNow()}</td>
    </tr>`
      )
      .join("")}
  </table>
</body>
</html>`;

  return c.html(html);
});

export default reportsRoute;
