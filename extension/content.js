const SELECTORS = {
  from: "#dest_from",
  to: "#dest_to",
  date: "#doj",
  seatClass: "#choose_class",
  stationOption:
    ".ui-autocomplete .ui-menu-item > a, .ui-menu-item > a, [role='option'], .autocomplete-result, .suggestion-item",
  searchButton: "button",
  trainCard: "app-train-card, .train-card, .single-trip, .train-item, [data-train-name]",
  trainAction: "button",
  coachTab: ".seat-floor-btn, [role='tab'], .coach-tab, button[data-coach]",
  seat: "button.btn-seat, button[ticketid][routeid], [data-seat-no], [data-seat-number], button.seat, .seat-item button",
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const SEARCH_PATH = "/booking/train/search";

function searchConfigFromLocation() {
  if (location.pathname !== SEARCH_PATH) return null;
  const params = new URLSearchParams(location.search);
  const from = params.get("fromcity")?.trim();
  const to = params.get("tocity")?.trim();
  const dateInput = params.get("doj")?.trim();
  const seatClass = params.get("class")?.trim();
  return from && to && dateInput && seatClass ? { from, to, dateInput, seatClass } : null;
}

function trainNamesFromPage() {
  if (location.pathname !== SEARCH_PATH) return [];
  const candidates = [
    ...[...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
      (heading) => heading.textContent?.trim() ?? "",
    ),
    ...(document.body?.innerText.split(/\r?\n/) ?? []),
  ];
  const names = candidates
    .map((text) => text.match(/^(.+?)\s*\(\d+\)\s*$/)?.[1]?.trim())
    .filter((name) => name && name.length <= 80 && /[A-Za-z]/.test(name));
  return [...new Map(names.map((name) => [normalize(name), name])).values()];
}

function showStatus(message, error = false) {
  let panel = document.querySelector("#rail-assistant-status");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "rail-assistant-status";
    Object.assign(panel.style, {
      position: "fixed",
      zIndex: "2147483647",
      top: "16px",
      right: "16px",
      maxWidth: "390px",
      padding: "12px 15px",
      borderRadius: "8px",
      boxShadow: "0 5px 20px rgba(0,0,0,.25)",
      font: "600 14px/1.45 system-ui, sans-serif",
      whiteSpace: "pre-wrap",
    });
    document.documentElement.appendChild(panel);
  }
  panel.style.background = error ? "#fee9e7" : "#e6f4ef";
  panel.style.color = error ? "#8b1d16" : "#164f3d";
  panel.textContent = message;
}

function officialPageIsBlocked() {
  const text = document.body?.innerText ?? "";
  return /verification failed|cloudflare|error code:\s*600010/i.test(text);
}

function signedIn() {
  return !document.querySelector('a[href="/login"]');
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForSelector(selector, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const element = document.querySelector(selector);
    if (element) return element;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${selector}`);
}

async function waitForCondition(predicate, errorMessage, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error(errorMessage);
}

async function fillAutocomplete(selector, value) {
  const input = await waitForSelector(selector);
  input.click();
  await waitForCondition(
    () => !input.readOnly,
    `Rail Sheba did not activate the station field for "${value}".`,
    3000,
  );
  input.focus();
  setNativeValue(input, "");
  setNativeValue(input, value);
  const wanted = value.trim().toLowerCase();
  let match;
  await waitForCondition(() => {
    const options = [...document.querySelectorAll(SELECTORS.stationOption)].filter(
      (option) => option.offsetParent !== null,
    );
    const exact = options.find((option) => option.textContent?.trim().toLowerCase() === wanted);
    const partial = options.find((option) => option.textContent?.trim().toLowerCase().includes(wanted));
    match = exact ?? partial;
    return Boolean(match);
  }, `Rail Sheba did not offer a station matching "${value}".`, 5000);
  match.click();
  await waitForCondition(
    () => input.value.trim().toLowerCase() === wanted,
    `Rail Sheba did not accept the station "${value}".`,
    3000,
  );
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function parseJourneyDate(value) {
  const text = value.trim();
  let match = text.match(/^(\d{1,2})[-/]([A-Za-z]{3,9})[-/](\d{4})$/);
  if (match) {
    const month = MONTHS.findIndex((name) => name.startsWith(match[2].toLowerCase()));
    if (month >= 0) return { day: Number(match[1]), month, year: Number(match[3]) };
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return { day: Number(match[1]), month: Number(match[2]) - 1, year: Number(match[3]) };

  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return { day: Number(match[3]), month: Number(match[2]) - 1, year: Number(match[1]) };

  throw new Error(`Journey date "${value}" must look like 21-Sep-2026, 21/09/2026, or 2026-09-21.`);
}

function validDateParts({ day, month, year }) {
  const candidate = new Date(year, month, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month &&
    candidate.getDate() === day
  );
}

async function selectJourneyDate(value) {
  const target = parseJourneyDate(value);
  if (!validDateParts(target)) throw new Error(`Journey date "${value}" is not a valid calendar date.`);

  const input = await waitForSelector(SELECTORS.date);
  input.focus();
  input.click();
  const picker = await waitForSelector("#ui-datepicker-div", 5000);
  await waitForCondition(
    () => picker.offsetParent !== null,
    "Rail Sheba's journey calendar did not open.",
    5000,
  );

  const targetIndex = target.year * 12 + target.month;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const monthName = picker.querySelector(".ui-datepicker-month")?.textContent?.trim().toLowerCase();
    const year = Number(picker.querySelector(".ui-datepicker-year")?.textContent?.trim());
    const month = MONTHS.indexOf(monthName);
    if (month < 0 || !Number.isInteger(year)) {
      throw new Error("Could not read Rail Sheba's journey calendar.");
    }

    const currentIndex = year * 12 + month;
    if (currentIndex === targetIndex) break;
    const direction = currentIndex < targetIndex ? ".ui-datepicker-next" : ".ui-datepicker-prev";
    const control = picker.querySelector(direction);
    if (!control || control.classList.contains("ui-state-disabled")) {
      throw new Error(`Journey date "${value}" is outside Rail Sheba's selectable range.`);
    }
    control.click();
    await delay(80);
  }

  const dayLinks = [...picker.querySelectorAll(
    `td[data-handler="selectDay"][data-year="${target.year}"][data-month="${target.month}"] a`,
  )];
  const dayLink = dayLinks.find((link) => Number(link.textContent?.trim()) === target.day);
  if (!dayLink) throw new Error(`Journey date "${value}" is not currently selectable on Rail Sheba.`);
  dayLink.click();

  await waitForCondition(
    () => input.value.trim().length > 0 && picker.offsetParent === null,
    `Rail Sheba did not accept journey date "${value}".`,
    3000,
  );
}

function visibleButtons() {
  return [...document.querySelectorAll("button")].filter(
    (button) => button.offsetParent !== null && !button.disabled,
  );
}

function buttonByText(pattern, root = document) {
  return [...root.querySelectorAll("button")].find(
    (button) => button.offsetParent !== null && pattern.test(button.textContent?.trim() ?? ""),
  );
}

function normalize(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function classAction(card, seatClass) {
  const wanted = normalize(seatClass);
  const labels = [...card.querySelectorAll("*")]
    .filter((candidate) => candidate.offsetParent !== null && normalize(candidate.textContent) === wanted)
    .sort((a, b) => a.children.length - b.children.length);

  const candidates = [];
  for (const label of labels) {
    let ancestor = label;
    for (let depth = 0; ancestor && ancestor !== card && depth < 6; depth += 1) {
      const action = buttonByText(/book|view seats|select/i, ancestor);
      if (action) candidates.push({ action, size: ancestor.textContent.length });
      ancestor = ancestor.parentElement;
    }
  }
  return candidates.sort((a, b) => a.size - b.size)[0]?.action ?? null;
}

function seatRecord(element, index) {
  const classText = String(element.className ?? "").toLowerCase();
  const label =
    element.getAttribute("data-seat-no") ??
    element.getAttribute("data-seat-number") ??
    element.getAttribute("title") ??
    element.getAttribute("aria-label") ??
    element.textContent?.trim() ??
    "";
  const normalized = normalize(label);
  const numericMatch = normalized.match(/(\d+)(?!.*\d)/);
  const labelRow = numericMatch
    ? normalized.slice(0, numericMatch.index).replace(/[-_/]+$/g, "")
    : normalized;
  const seatBlock = element.closest(".seat-in-row");
  const seatBlockIndex = seatBlock
    ? [...document.querySelectorAll(".seat-in-row")].indexOf(seatBlock)
    : -1;
  const row = seatBlockIndex >= 0 ? `BLOCK-${seatBlockIndex}` : labelRow;
  const unavailable =
    classText.includes("booked") ||
    classText.includes("unavailable") ||
    classText.includes("disabled") ||
    classText.includes("request_pending") ||
    classText.includes("in-progress") ||
    classText.includes("seat-hidden") ||
    classText.includes("seat-selected") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.disabled;
  const railwaySeat = element.classList.contains("btn-seat");
  return {
    element,
    index,
    label,
    normalized,
    row,
    number: Number(numericMatch?.[1] ?? Number.NaN),
    coach: normalize(element.getAttribute("data-coach") ?? "ACTIVE"),
    available: railwaySeat ? element.classList.contains("seat-available") && !unavailable : !unavailable,
  };
}

function runsOf(seats) {
  const groups = new Map();
  for (const seat of seats) {
    const key = `${seat.coach}|${seat.row}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(seat);
  }
  const runs = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.number - b.number || a.normalized.localeCompare(b.normalized));
    let run = [];
    for (const seat of group) {
      const previous = run.at(-1);
      if (previous && Number.isFinite(seat.number) && seat.number === previous.number + 1) run.push(seat);
      else {
        if (run.length) runs.push(run);
        run = [seat];
      }
    }
    if (run.length) runs.push(run);
  }
  return runs.sort((a, b) => b.length - a.length);
}

function exactLabels(seats, labels) {
  const map = new Map(seats.map((seat) => [seat.normalized, seat]));
  const result = labels.map((label) => map.get(normalize(label))).filter(Boolean);
  return result.length === labels.length ? result : [];
}

function planSeats(seats, config) {
  const available = seats.filter((seat) => seat.available && seat.label);
  const count = config.passengerCount;

  for (const group of config.tableSeatGroups ?? []) {
    if (group.length < count) continue;
    const match = exactLabels(available, group.slice(0, count));
    if (match.length === count) return { strategy: "table", selected: match };
  }

  if ((config.preferredSeatNumbers ?? []).length >= count) {
    const match = exactLabels(available, config.preferredSeatNumbers.slice(0, count));
    if (match.length === count) return { strategy: "preferred", selected: match };
  }

  const runs = runsOf(available);
  const exact = runs.find((run) => run.length >= count);
  if (exact) return { strategy: "adjacent", selected: exact.slice(0, count) };

  const selected = [...(runs[0] ?? []).slice(0, count)];
  const used = new Set(selected.map((seat) => seat.index));
  for (const seat of available) {
    if (selected.length >= count) break;
    if (!used.has(seat.index)) selected.push(seat);
  }
  return {
    strategy: selected.length === count ? "max-adjacent-plus-any" : "insufficient",
    selected: selected.length === count ? selected : [],
  };
}

function currentSeatElement(label) {
  const wanted = normalize(label);
  return [...document.querySelectorAll(SELECTORS.seat)].find((element) => {
    const candidate =
      element.getAttribute("data-seat-no") ??
      element.getAttribute("data-seat-number") ??
      element.getAttribute("title") ??
      element.getAttribute("aria-label") ??
      element.textContent?.trim() ??
      "";
    return normalize(candidate) === wanted;
  });
}

function seatConfirmed(label, fallbackElement) {
  const tile = currentSeatElement(label) ?? fallbackElement;
  if (tile?.classList.contains("seat-selected")) return true;
  return [...document.querySelectorAll(".single-selected-seat-btn")].some(
    (selected) => normalize(selected.textContent) === normalize(label),
  );
}

async function waitForSeatReservation(seat) {
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (seatConfirmed(seat.label, seat.element)) return;
    const tile = currentSeatElement(seat.label) ?? seat.element;
    const pending = tile?.classList.contains("request_pending");
    const rejected =
      tile?.classList.contains("seat-booked") ||
      (tile?.disabled && !tile?.classList.contains("seat-selected"));
    if (rejected && !pending) {
      throw new Error(`Rail Sheba did not reserve ${seat.label}; it is no longer available.`);
    }
    await delay(100);
  }
  throw new Error(`Rail Sheba did not confirm reservation of ${seat.label} within 12 seconds.`);
}

async function chooseTrain(config) {
  if (!config.train) {
    showStatus("Search submitted. Select a train manually because no train name is configured.");
    return false;
  }
  const wanted = config.train.trim().toLowerCase();
  await waitForCondition(
    () => document.body?.innerText.toLowerCase().includes(wanted),
    `Train not found after the search: ${config.train}`,
    20000,
  );

  const cards = [...document.querySelectorAll(SELECTORS.trainCard)].filter(
    (candidate) => candidate.offsetParent !== null && candidate.textContent?.toLowerCase().includes(wanted),
  );
  let card = cards.sort((a, b) => a.textContent.length - b.textContent.length)[0];

  if (!card) {
    const labels = [...document.querySelectorAll("h1, h2, h3, h4, h5, strong, b, p, span, div")]
      .filter((candidate) => candidate.offsetParent !== null)
      .filter((candidate) => candidate.textContent?.trim().toLowerCase().includes(wanted))
      .sort((a, b) => a.textContent.length - b.textContent.length);
    const candidates = [];
    for (const label of labels.slice(0, 20)) {
      let ancestor = label;
      for (let depth = 0; ancestor && depth < 8; depth += 1, ancestor = ancestor.parentElement) {
        if (buttonByText(/book|view seats|select/i, ancestor)) candidates.push(ancestor);
      }
    }
    card = candidates.sort((a, b) => a.textContent.length - b.textContent.length)[0];
  }

  if (!card) throw new Error(`Found ${config.train}, but could not identify its result card.`);
  const action = classAction(card, config.seatClass) ?? buttonByText(/book|view seats|select/i, card);
  if (!action) throw new Error(`No seat-selection button found for ${config.train}.`);
  action.click();
  return true;
}

async function run(config) {
  config = { ...config, ...searchConfigFromLocation() };
  if (officialPageIsBlocked()) throw new Error("Cloudflare verification failed. Use the normal login page manually.");
  if (!signedIn()) throw new Error("Log in normally before running the assistant.");
  if (location.pathname === "/") {
    showStatus("Preparing journey…");
    await fillAutocomplete(SELECTORS.from, config.from);
    await fillAutocomplete(SELECTORS.to, config.to);
    await selectJourneyDate(config.dateInput);

    const classSelect = await waitForSelector(SELECTORS.seatClass);
    setNativeValue(classSelect, config.seatClass);

    const search = buttonByText(/search trains/i) ?? visibleButtons().find((button) => button.type === "submit");
    if (!search) throw new Error("Search Trains button was not found.");
    await waitForCondition(
      () => !search.disabled && search.getAttribute("aria-disabled") !== "true",
      "Rail Sheba kept Search Trains disabled. Recheck the selected From, To, journey date and class.",
      5000,
    );
    showStatus("Submitting one journey search…");
    search.click();
  } else if (location.pathname === SEARCH_PATH) {
    showStatus(`Using the open ${config.from} → ${config.to} search…`);
  } else {
    throw new Error("Open the Rail Sheba home page or a train search-results page before running.");
  }

  if (!(await chooseTrain(config))) return { message: "Search submitted; choose a train manually." };

  if (config.coach) {
    await waitForSelector(SELECTORS.coachTab, 10000).catch(() => null);
    const coach = [...document.querySelectorAll(SELECTORS.coachTab)].find((candidate) =>
      candidate.textContent?.toLowerCase().includes(config.coach.toLowerCase()),
    );
    coach?.click();
  }

  await waitForSelector(SELECTORS.seat, 15000);
  const seatElements = [...document.querySelectorAll(SELECTORS.seat)];
  const plan = planSeats(seatElements.map(seatRecord), config);
  if (!plan.selected.length) throw new Error("No acceptable set of available seats was found.");

  const labels = plan.selected.map((seat) => seat.label).join(", ");
  if (config.dryRun) {
    showStatus(
      `Dry run only—no seats were clicked.\nWould select: ${labels}\nStrategy: ${plan.strategy}`,
    );
    return { message: `Dry run only; would select: ${labels}` };
  }

  for (const seat of plan.selected) seat.element.click();
  const confirmations = await Promise.allSettled(plan.selected.map(waitForSeatReservation));
  const failures = confirmations
    .map((result, index) => (result.status === "rejected" ? plan.selected[index].label : null))
    .filter(Boolean);
  if (failures.length) {
    const confirmed = plan.selected
      .filter((_seat, index) => confirmations[index].status === "fulfilled")
      .map((seat) => seat.label);
    throw new Error(
      `Rail Sheba confirmed ${confirmed.join(", ") || "no seats"}; failed: ${failures.join(", ")}. Review the seat map before continuing.`,
    );
  }
  showStatus(
    `Seats reserved on this page: ${labels}\nStrategy: ${plan.strategy}\nClick CONTINUE PURCHASE manually; passenger confirmation, CAPTCHA and payment are not automated.`,
  );
  return { message: `Seats reserved on this page: ${labels}` };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse({
      ok: true,
      pageSearch: searchConfigFromLocation(),
      trainNames: trainNamesFromPage(),
    });
    return false;
  }
  if (message.type !== "RUN_ASSISTANT") return false;
  run(message.config)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      showStatus(error.message, true);
      sendResponse({ ok: false, error: error.message });
    });
  return true;
});
