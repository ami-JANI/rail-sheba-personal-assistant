import { loadConfig } from "./config.js";
import {
  acceptDisclaimerIfPresent,
  describePlan,
  ensureSignedIn,
  fillAutocomplete,
  HOME_URL,
  launchRailBrowser,
  waitForEnter,
  waitUntil,
} from "./browser-helpers.js";
import { planSeats } from "./seat-planner.js";

const cliDryRun = process.argv.includes("--dry-run");
const { config, absolutePath } = loadConfig();
const dryRun = cliDryRun || config.execution.dryRun;
const context = await launchRailBrowser();
const page = context.pages()[0] ?? (await context.newPage());

async function chooseConfiguredTrain() {
  if (!config.journey.train) {
    await waitForEnter("Choose the train manually in Chrome, then open its seat map.");
    return;
  }

  const card = page
    .locator(config.selectors.trainCard)
    .filter({ hasText: config.journey.train })
    .first();
  await card.waitFor({ state: "visible", timeout: 15000 });
  await card.locator(config.selectors.trainAction).first().click();
}

async function chooseConfiguredCoach() {
  if (!config.journey.coach) return;
  const coach = page
    .locator(config.selectors.coachTab)
    .filter({ hasText: config.journey.coach })
    .first();
  if (await coach.isVisible({ timeout: 5000 }).catch(() => false)) await coach.click();
}

async function readSeats() {
  const seatLocator = page.locator(config.selectors.seat);
  await seatLocator.first().waitFor({ state: "visible", timeout: 15000 });

  return seatLocator.evaluateAll((elements) =>
    elements.map((element, index) => {
      const classText = typeof element.className === "string" ? element.className.toLowerCase() : "";
      const label =
        element.getAttribute("data-seat-no") ??
        element.getAttribute("data-seat-number") ??
        element.getAttribute("aria-label") ??
        element.getAttribute("title") ??
        (element.textContent ?? "").trim();
      const unavailable =
        classText.includes("booked") ||
        classText.includes("unavailable") ||
        classText.includes("disabled") ||
        element.getAttribute("aria-disabled") === "true" ||
        ("disabled" in element && element.disabled);

      return {
        _index: index,
        label,
        available: !unavailable,
        coach: element.getAttribute("data-coach") ?? "ACTIVE",
        row: element.getAttribute("data-row") ?? "",
      };
    }),
  );
}

try {
  console.log(`Using ${absolutePath}`);
  console.log(dryRun ? "DRY RUN: no seats will be clicked." : "LIVE ASSIST: one search and one seat-selection pass.");

  await ensureSignedIn(page);
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await acceptDisclaimerIfPresent(page);

  await fillAutocomplete(
    page,
    config.selectors.from,
    config.journey.from,
    config.selectors.stationOption,
  );
  await fillAutocomplete(
    page,
    config.selectors.to,
    config.journey.to,
    config.selectors.stationOption,
  );
  await page.locator(config.selectors.date).fill(config.journey.dateInput);
  await page.locator(config.selectors.seatClass).selectOption(config.journey.seatClass);

  await waitUntil(config.release.at);
  await page.locator(config.selectors.searchButton).click();
  await chooseConfiguredTrain();
  await chooseConfiguredCoach();

  const seats = await readSeats();
  const plan = planSeats(seats, {
    passengerCount: config.journey.passengerCount,
    preferredSeatNumbers: config.seatPreferences.preferredSeatNumbers,
    tableSeatGroups: config.seatPreferences.tableSeatGroups,
    allowPartial: config.seatPreferences.allowPartial,
  });
  console.log(`Seat plan: ${describePlan(plan)}`);

  if (!plan.selected.length) {
    throw new Error(`No acceptable seat plan was found (${plan.strategy}).`);
  }

  if (!dryRun) {
    const seatLocator = page.locator(config.selectors.seat);
    for (const seat of plan.selected) {
      await seatLocator.nth(seat._index).click();
    }
  }

  console.log("Selection is ready. Review it in Chrome.");
  console.log("Complete CAPTCHA, reservation confirmation and payment yourself.");
  await waitForEnter("The assistant intentionally stops before reservation/payment.");
} catch (error) {
  console.error(`Assistant stopped: ${error.message}`);
  console.error("Run npm run inspect-seats on a seat page if the configured selectors need calibration.");
  process.exitCode = 1;
} finally {
  await context.close();
}
