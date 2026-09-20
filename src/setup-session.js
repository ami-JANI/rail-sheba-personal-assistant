import { acceptDisclaimerIfPresent, HOME_URL, launchRailBrowser, waitForEnter } from "./browser-helpers.js";

const context = await launchRailBrowser();
const page = context.pages()[0] ?? (await context.newPage());

try {
  await page.goto(`${HOME_URL}login`, { waitUntil: "domcontentloaded" });
  console.log("Sign in manually. The login session is stored only in .rail-profile on this computer.");
  await waitForEnter("When the Railway home page shows that you are signed in, return here.");
  if (await page.getByText(/verification failed/i).isVisible().catch(() => false)) {
    throw new Error(
      "Cloudflare rejected the automated browser. Do not retry rapidly. Use the official site in a normal browser; the assistant will not bypass Cloudflare verification.",
    );
  }
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await acceptDisclaimerIfPresent(page);
  console.log("Session profile saved. Passwords are not stored in config.json.");
} finally {
  await context.close();
}
