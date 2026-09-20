const SELECTORS = {
  from: "#dest_from",
  to: "#dest_to",
  date: "#doj",
  seatClass: "#choose_class",
  stationOption: "[role='option'], .autocomplete-result, .suggestion-item",
  searchButton: "button",
  trainCard: ".train-card, .single-trip, [data-train-name]",
  trainAction: "button",
  coachTab: "[role='tab'], .coach-tab, button[data-coach]",
  seat: "[data-seat-no], [data-seat-number], button.seat, .seat-item button",
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

async function fillAutocomplete(selector, value) {
  const input = await waitForSelector(selector);
  input.focus();
  setNativeValue(input, value);
  await delay(450);

  const options = [...document.querySelectorAll(SELECTORS.stationOption)];
  const exact = options.find((option) => option.textContent?.trim().toLowerCase() === value.toLowerCase());
  const partial = options.find((option) => option.textContent?.toLowerCase().includes(value.toLowerCase()));
  const match = exact ?? partial;
  if (match) match.click();
  else {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }
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

function seatRecord(element, index) {
  const classText = String(element.className ?? "").toLowerCase();
  const label =
    element.getAttribute("data-seat-no") ??
    element.getAttribute("data-seat-number") ??
    element.getAttribute("aria-label") ??
    element.getAttribute("title") ??
    element.textContent?.trim() ??
    "";
  const normalized = normalize(label);
  const numericMatch = normalized.match(/(\d+)(?!.*\d)/);
  const row = numericMatch
    ? normalized.slice(0, numericMatch.index).replace(/[-_/]+$/g, "")
    : normalized;
  const unavailable =
    classText.includes("booked") ||
    classText.includes("unavailable") ||
    classText.includes("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.disabled;
  return {
    element,
    index,
    label,
    normalized,
    row,
    number: Number(numericMatch?.[1] ?? Number.NaN),
    coach: normalize(element.getAttribute("data-coach") ?? "ACTIVE"),
    available: !unavailable,
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

async function chooseTrain(config) {
  if (!config.train) {
    showStatus("Search submitted. Select a train manually because no train name is configured.");
    return false;
  }
  await waitForSelector(SELECTORS.trainCard, 20000);
  const cards = [...document.querySelectorAll(SELECTORS.trainCard)];
  const card = cards.find((candidate) =>
    candidate.textContent?.toLowerCase().includes(config.train.toLowerCase()),
  );
  if (!card) throw new Error(`Train not found: ${config.train}`);
  const action = buttonByText(/book|view seats|select/i, card);
  if (!action) throw new Error(`No seat-selection button found for ${config.train}.`);
  action.click();
  return true;
}

async function run(config) {
  if (officialPageIsBlocked()) throw new Error("Cloudflare verification failed. Use the normal login page manually.");
  if (!signedIn()) throw new Error("Log in normally before running the assistant.");
  if (location.pathname !== "/") throw new Error("Open the Rail Sheba home page before running.");

  showStatus("Preparing journey…");
  await fillAutocomplete(SELECTORS.from, config.from);
  await fillAutocomplete(SELECTORS.to, config.to);
  setNativeValue(await waitForSelector(SELECTORS.date), config.dateInput);

  const classSelect = await waitForSelector(SELECTORS.seatClass);
  setNativeValue(classSelect, config.seatClass);

  const search = buttonByText(/search trains/i) ?? visibleButtons().find((button) => button.type === "submit");
  if (!search) throw new Error("Search Trains button was not found.");
  showStatus("Submitting one journey search…");
  search.click();

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
  if (!config.dryRun) {
    for (const seat of plan.selected) seat.element.click();
  }
  const prefix = config.dryRun ? "Dry run" : "Seats selected";
  showStatus(`${prefix}: ${labels}\nStrategy: ${plan.strategy}\nReview manually; CAPTCHA, confirmation and payment are not automated.`);
  return { message: `${prefix}: ${labels}` };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "RUN_ASSISTANT") return false;
  run(message.config)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      showStatus(error.message, true);
      sendResponse({ ok: false, error: error.message });
    });
  return true;
});
