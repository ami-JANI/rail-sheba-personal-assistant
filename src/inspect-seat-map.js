import fs from "node:fs";
import path from "node:path";
import { launchRailBrowser, waitForEnter } from "./browser-helpers.js";

const context = await launchRailBrowser();
const page = context.pages()[0] ?? (await context.newPage());

try {
  await waitForEnter(
    "In the opened browser, sign in and navigate to a seat-selection page. Do not enter payment information.",
  );

  const candidates = await page.locator("button, [role='button'], [data-seat-no], [data-seat-number]").evaluateAll(
    (elements) =>
      elements.map((element, index) => ({
        index,
        tag: element.tagName,
        text: (element.textContent ?? "").trim().slice(0, 80),
        ariaLabel: element.getAttribute("aria-label"),
        title: element.getAttribute("title"),
        className: typeof element.className === "string" ? element.className : "",
        dataSeatNo: element.getAttribute("data-seat-no"),
        dataSeatNumber: element.getAttribute("data-seat-number"),
        disabled: "disabled" in element ? element.disabled : false,
      })),
  );

  const outputDir = path.resolve("artifacts");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "seat-map-elements.json");
  fs.writeFileSync(outputPath, JSON.stringify(candidates, null, 2));
  console.log(`Saved non-sensitive seat-element metadata to ${outputPath}`);
} finally {
  await context.close();
}
