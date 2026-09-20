import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

export const HOME_URL = "https://eticket.railway.gov.bd/";

function installedBrowserChannel() {
  const chromePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  if (chromePaths.some((candidate) => candidate && fs.existsSync(candidate))) return "chrome";

  const edgePaths = [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  if (edgePaths.some((candidate) => candidate && fs.existsSync(candidate))) return "msedge";

  return undefined;
}

export async function launchRailBrowser() {
  const profilePath = path.resolve(".rail-profile");
  const channel = installedBrowserChannel();
  return chromium.launchPersistentContext(profilePath, {
    ...(channel ? { channel } : {}),
    chromiumSandbox: true,
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });
}

export async function waitForEnter(message) {
  const prompt = readline.createInterface({ input, output });
  try {
    await prompt.question(`${message}\nPress Enter to continue... `);
  } finally {
    prompt.close();
  }
}

export async function ensureSignedIn(page) {
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  const loginLink = page.getByRole("link", { name: /^login$/i });
  if (await loginLink.isVisible().catch(() => false)) {
    console.log("Railway session is not signed in. Log in manually in the opened Chrome window.");
    await loginLink.click();
    await waitForEnter("Finish login, including any OTP or CAPTCHA.");
    if (await page.getByText(/verification failed/i).isVisible().catch(() => false)) {
      throw new Error(
        "Cloudflare rejected the automated browser. Close it and use the official site in a normal browser; this assistant will not bypass Cloudflare verification.",
      );
    }
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  }
}

export async function acceptDisclaimerIfPresent(page) {
  const agree = page.getByRole("button", { name: /^I AGREE$/i });
  if (await agree.isVisible().catch(() => false)) await agree.click();
}

export async function waitUntil(timestamp) {
  const target = new Date(timestamp).getTime();
  if (Number.isNaN(target)) throw new Error(`Invalid release timestamp: ${timestamp}`);

  let remaining = target - Date.now();
  while (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    process.stdout.write(`\rWaiting for release: ${seconds}s   `);
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000, remaining)));
    remaining = target - Date.now();
  }
  process.stdout.write("\rRelease time reached.             \n");
}

export async function fillAutocomplete(page, selector, value, optionSelector) {
  const inputLocator = page.locator(selector);
  await inputLocator.click();
  await inputLocator.fill(value);

  const exactOption = page.locator(optionSelector).filter({ hasText: value }).first();
  if (await exactOption.isVisible({ timeout: 2500 }).catch(() => false)) {
    await exactOption.click();
    return;
  }

  await inputLocator.press("ArrowDown");
  await inputLocator.press("Enter");
}

export function describePlan(plan) {
  const labels = plan.selected.map((seat) => seat.label).join(", ") || "none";
  return `strategy=${plan.strategy}; seats=${labels}; available=${plan.availableCount}`;
}
