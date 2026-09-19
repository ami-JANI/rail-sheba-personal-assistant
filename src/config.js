import fs from "node:fs";
import path from "node:path";

export function loadConfig(configPath = "config.json") {
  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Missing ${absolutePath}. Copy config.example.json to config.json and edit your journey details.`,
    );
  }

  const config = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  validateConfig(config);
  return { config, absolutePath };
}

function validateConfig(config) {
  const journey = config?.journey ?? {};
  for (const key of ["from", "to", "dateInput", "seatClass"]) {
    if (!String(journey[key] ?? "").trim()) {
      throw new Error(`journey.${key} is required.`);
    }
  }

  const passengerCount = Number(journey.passengerCount);
  if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 4) {
    throw new Error("journey.passengerCount must be an integer from 1 to 4.");
  }

  if (!config?.release?.at || Number.isNaN(Date.parse(config.release.at))) {
    throw new Error("release.at must be a valid ISO-8601 timestamp with timezone.");
  }

  const attempts = Number(config?.execution?.maxSearchAttempts ?? 1);
  if (attempts !== 1) {
    throw new Error("maxSearchAttempts is intentionally limited to 1.");
  }

  if (config?.execution?.stopBeforeReservation !== true) {
    throw new Error("stopBeforeReservation must remain true.");
  }
}
