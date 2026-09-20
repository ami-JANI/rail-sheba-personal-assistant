const fields = [
  "from",
  "to",
  "dateInput",
  "seatClass",
  "train",
  "coach",
  "passengerCount",
  "releaseAt",
  "preferredSeatNumbers",
  "tableSeatGroups",
  "dryRun",
];

const status = document.querySelector("#status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function splitSeats(value) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function readForm() {
  return {
    from: document.querySelector("#from").value.trim(),
    to: document.querySelector("#to").value.trim(),
    dateInput: document.querySelector("#dateInput").value.trim(),
    seatClass: document.querySelector("#seatClass").value,
    train: document.querySelector("#train").value.trim(),
    coach: document.querySelector("#coach").value.trim(),
    passengerCount: Number(document.querySelector("#passengerCount").value),
    releaseAt: document.querySelector("#releaseAt").value,
    preferredSeatNumbers: splitSeats(document.querySelector("#preferredSeatNumbers").value),
    tableSeatGroups: document
      .querySelector("#tableSeatGroups")
      .value.split(/\r?\n/)
      .map(splitSeats)
      .filter((group) => group.length),
    dryRun: document.querySelector("#dryRun").checked,
  };
}

function validate(config) {
  if (!config.from || !config.to || !config.dateInput || !config.seatClass) {
    throw new Error("From, To, journey date and class are required.");
  }
  if (!Number.isInteger(config.passengerCount) || config.passengerCount < 1 || config.passengerCount > 4) {
    throw new Error("Seats must be from 1 to 4.");
  }
}

function populate(config) {
  for (const field of fields) {
    const element = document.querySelector(`#${field}`);
    if (!element || config[field] == null) continue;
    if (field === "dryRun") element.checked = Boolean(config[field]);
    else if (field === "preferredSeatNumbers") element.value = config[field].join(", ");
    else if (field === "tableSeatGroups") {
      element.value = config[field].map((group) => group.join(", ")).join("\n");
    } else element.value = config[field];
  }
}

async function command(type) {
  try {
    const config = readForm();
    validate(config);
    setStatus("Working…");
    const response = await chrome.runtime.sendMessage({ type, config });
    if (!response?.ok) throw new Error(response?.error ?? "Unknown extension error.");
    if (type === "ARM") {
      setStatus(`Armed for ${new Date(response.armedFor).toLocaleString()}`);
    } else if (type === "RUN_NOW") {
      setStatus(response.result?.message ?? "Assistant started in the Rail Sheba tab.");
    } else setStatus(type === "SAVE_CONFIG" ? "Configuration saved." : "Schedule cleared.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.querySelector("#config-form").addEventListener("submit", (event) => {
  event.preventDefault();
  command("SAVE_CONFIG");
});
document.querySelector("#run-now").addEventListener("click", () => command("RUN_NOW"));
document.querySelector("#arm").addEventListener("click", () => command("ARM"));
document.querySelector("#disarm").addEventListener("click", () => command("DISARM"));

const initial = await chrome.runtime.sendMessage({ type: "GET_STATE" });
if (initial?.ok) {
  populate(initial.config);
  setStatus(
    initial.armedFor
      ? `Armed for ${new Date(initial.armedFor).toLocaleString()}`
      : "Not armed. Test with Dry run and Run now first.",
  );
} else {
  setStatus(initial?.error ?? "Could not load configuration.", true);
}
