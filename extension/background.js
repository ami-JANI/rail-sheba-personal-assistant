const HOME_URL = "https://eticket.railway.gov.bd/";
const ALARM_NAME = "rail-sheba-release";

const DEFAULT_CONFIG = {
  from: "Dhaka",
  to: "Chattogram",
  dateInput: "",
  seatClass: "S_CHAIR",
  train: "",
  coach: "",
  passengerCount: 4,
  releaseAt: "",
  preferredSeatNumbers: [],
  tableSeatGroups: [],
  dryRun: true,
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("assistantConfig");
  if (!stored.assistantConfig) {
    await chrome.storage.local.set({ assistantConfig: DEFAULT_CONFIG });
  }
});

function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Rail Sheba page did not finish loading."));
    }, 30000);

    function listener(updatedId, changeInfo) {
      if (updatedId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function prepareOfficialTab() {
  const tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
  let tab = tabs.find((candidate) => candidate.active) ?? tabs[0];

  if (!tab) {
    tab = await chrome.tabs.create({ url: HOME_URL, active: true });
    await waitForTab(tab.id);
    return tab;
  }

  await chrome.tabs.update(tab.id, { active: true });
  const currentUrl = new URL(tab.url ?? HOME_URL);
  if (currentUrl.pathname !== "/") {
    const loading = waitForTab(tab.id);
    tab = await chrome.tabs.update(tab.id, { url: HOME_URL, active: true });
    await loading;
  }
  return tab;
}

async function runAssistant() {
  const { assistantConfig = DEFAULT_CONFIG } = await chrome.storage.local.get("assistantConfig");
  const tab = await prepareOfficialTab();
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "RUN_ASSISTANT",
      config: assistantConfig,
    });
    if (!response?.ok) throw new Error(response?.error ?? "The page rejected the assistant run.");
    return response;
  } catch (error) {
    throw new Error(`The Rail Sheba helper could not start: ${error.message}`);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    await runAssistant();
  } catch (error) {
    console.error(error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "GET_STATE") {
      const { assistantConfig = DEFAULT_CONFIG } = await chrome.storage.local.get("assistantConfig");
      const alarm = await chrome.alarms.get(ALARM_NAME);
      return { ok: true, config: assistantConfig, armedFor: alarm?.scheduledTime ?? null };
    }

    if (message.type === "SAVE_CONFIG") {
      await chrome.storage.local.set({ assistantConfig: message.config });
      return { ok: true };
    }

    if (message.type === "ARM") {
      const releaseTime = Date.parse(message.config.releaseAt);
      if (!Number.isFinite(releaseTime) || releaseTime <= Date.now()) {
        throw new Error("Release time must be in the future and include the correct local time.");
      }
      await chrome.storage.local.set({ assistantConfig: message.config });
      await chrome.alarms.clear(ALARM_NAME);
      await chrome.alarms.create(ALARM_NAME, { when: releaseTime });
      return { ok: true, armedFor: releaseTime };
    }

    if (message.type === "DISARM") {
      await chrome.alarms.clear(ALARM_NAME);
      return { ok: true };
    }

    if (message.type === "RUN_NOW") {
      await chrome.storage.local.set({ assistantConfig: message.config });
      const result = await runAssistant();
      return { ok: true, result };
    }

    throw new Error("Unknown command.");
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
