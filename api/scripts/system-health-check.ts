import "dotenv/config";
import { execSync } from "child_process";

const DISK_USAGE_THRESHOLD = 10;

type DiskUsage = { percent: number; usedGb: number; totalGb: number };

const getDiskUsage = (): DiskUsage => {
  const output = execSync("df -kP / | tail -1").toString();
  const cols = output.trim().split(/\s+/);
  const totalGb = Math.round(parseInt(cols[1], 10) / 1024 / 1024);
  const usedGb = Math.round(parseInt(cols[2], 10) / 1024 / 1024);
  const percent = parseInt(cols[4], 10);
  if (isNaN(percent)) throw new Error("Could not parse disk usage from df output");
  return { percent, usedGb, totalGb };
};

const notify = async (title: string, message: string, priority?: string) => {
  const topic = process.env.SYSTEM_ALERTS_NTFY_TOPIC;
  if (!topic) {
    console.warn("SYSTEM_ALERTS_NTFY_TOPIC not set, skipping notification");
    return;
  }

  const response = await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: {
      Title: title,
      ...(priority && { Priority: priority }),
    },
    body: message,
  });

  if (!response.ok) {
    throw new Error(`ntfy request failed: ${response.statusText}`);
  }
};

const checkDiskUsage = async () => {
  const { percent, usedGb, totalGb } = getDiskUsage();
  console.log(`Disk usage: ${usedGb}GB / ${totalGb}GB (${percent}%)`);

  if (percent >= DISK_USAGE_THRESHOLD) {
    console.log(`Disk usage ${percent}% exceeds ${DISK_USAGE_THRESHOLD}% threshold, sending alert`);
    await notify("OpenBirding Alert", `Disk usage is at ${usedGb}GB / ${totalGb}GB (${percent}%)`, "high");
  }
};

const main = async () => {
  console.log("Running system health checks...");
  await checkDiskUsage();
  console.log("Done.");
};

main().catch((err) => {
  console.error("System health check failed:", err);
  process.exit(1);
});
