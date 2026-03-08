// ============================================
// WA BULK SENDER — BACKGROUND SERVICE WORKER (v2)
// Handles: sending loop, navigation, alarms
// Survives popup close via chrome.alarms
// NEW: Image + caption support
// ============================================

console.log("🟢 WA Bulk Sender: Background worker started (v2)");

// ===== DEFAULT STATE =====
const DEFAULT_CAMPAIGN = {
  isRunning: false,
  isPaused: false,
  contacts: [],
  currentIndex: 0,
  sent: 0,
  failed: 0,
  batchCount: 0,
  message: "",
  link: "",
  useVariants: false,
  variants: [],
  settings: {
    minDelay: 25,
    maxDelay: 60,
    batchSize: 15,
    batchPause: 300,
    dailyLimit: 200,
    autoRetry: true
  },
  waTabId: null,
  logs: [],
  startTime: null,
  hasImage: false          // NEW: flag for image campaign
};

// ===== ON INSTALL =====
chrome.runtime.onInstalled.addListener(() => {
  console.log("WA Bulk Sender installed!");
  chrome.storage.local.set({
    campaign: { ...DEFAULT_CAMPAIGN },
    settings: DEFAULT_CAMPAIGN.settings
  });
});

// ===== MESSAGE HANDLER (from popup) =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "START_CAMPAIGN") {
    startCampaign(message.data).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "PAUSE_CAMPAIGN") {
    pauseCampaign().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "RESUME_CAMPAIGN") {
    resumeCampaign().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "STOP_CAMPAIGN") {
    stopCampaign().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "GET_CAMPAIGN_STATE") {
    chrome.storage.local.get("campaign", (data) => {
      sendResponse(data.campaign || DEFAULT_CAMPAIGN);
    });
    return true;
  }

  return false;
});

// ===== ALARM HANDLER (processes one contact per alarm) =====
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "wa-send-next") {
    await processNextContact();
  }
  if (alarm.name === "wa-batch-resume") {
    await addLog("☕ Batch break over. Resuming...", "info");
    await scheduleNext(1);
  }
});

// ===== START CAMPAIGN =====
async function startCampaign(data) {
  // Verify image exists in storage if campaign has image
  if (data.hasImage) {
    const imgCheck = await chrome.storage.local.get(["campaignImage"]);
    if (!imgCheck.campaignImage) {
      await addLog("⚠️ Image flag set but no image found in storage!", "warning");
      data.hasImage = false;
    }
  }

  const campaign = {
    ...DEFAULT_CAMPAIGN,
    isRunning: true,
    isPaused: false,
    contacts: data.contacts,
    currentIndex: 0,
    sent: 0,
    failed: 0,
    batchCount: 0,
    message: data.message,
    link: data.link || "",
    useVariants: data.useVariants || false,
    variants: data.variants || [],
    settings: data.settings,
    waTabId: data.waTabId,
    logs: [],
    startTime: Date.now(),
    hasImage: !!data.hasImage       // NEW
  };

  await chrome.storage.local.set({ campaign });

  if (campaign.hasImage) {
    await addLog("🚀 Campaign started (with image + caption)!", "info");
  } else {
    await addLog("🚀 Campaign started!", "info");
  }

  await broadcastToPopup("CAMPAIGN_STARTED");

  // Start processing immediately
  await processNextContact();
}

// ===== PAUSE / RESUME / STOP =====
async function pauseCampaign() {
  const campaign = await getCampaign();
  campaign.isPaused = true;
  await chrome.storage.local.set({ campaign });
  chrome.alarms.clear("wa-send-next");
  chrome.alarms.clear("wa-batch-resume");
  await addLog("⏸️ Campaign paused", "warning");
  await broadcastToPopup("CAMPAIGN_PAUSED");
}

async function resumeCampaign() {
  const campaign = await getCampaign();
  campaign.isPaused = false;
  await chrome.storage.local.set({ campaign });
  await addLog("▶️ Campaign resumed", "info");
  await broadcastToPopup("CAMPAIGN_RESUMED");
  await processNextContact();
}

async function stopCampaign() {
  const campaign = await getCampaign();
  campaign.isRunning = false;
  campaign.isPaused = false;
  await chrome.storage.local.set({ campaign });
  chrome.alarms.clear("wa-send-next");
  chrome.alarms.clear("wa-batch-resume");
  await addLog("⏹️ Campaign stopped", "error");
  await broadcastToPopup("CAMPAIGN_STOPPED");
}

// ===== PROCESS ONE CONTACT =====
async function processNextContact() {
  const campaign = await getCampaign();

  // Check if we should stop
  if (!campaign.isRunning || campaign.isPaused) return;
  if (campaign.currentIndex >= campaign.contacts.length) {
    await finishCampaign(campaign);
    return;
  }

  // Daily limit check
  if (campaign.sent >= campaign.settings.dailyLimit) {
    await addLog(`🛡️ Daily limit (${campaign.settings.dailyLimit}) reached!`, "warning");
    campaign.isRunning = false;
    await chrome.storage.local.set({ campaign });
    await broadcastToPopup("CAMPAIGN_COMPLETE");
    return;
  }

  // Batch break check
  if (campaign.batchCount > 0 && campaign.batchCount % campaign.settings.batchSize === 0) {
    campaign.batchCount = 0;
    await chrome.storage.local.set({ campaign });
    const breakSec = campaign.settings.batchPause;
    await addLog(`☕ Batch break for ${breakSec}s...`, "warning");
    await broadcastToPopup("BATCH_BREAK");
    chrome.alarms.create("wa-batch-resume", { delayInMinutes: breakSec / 60 });
    return;
  }

  const contact = campaign.contacts[campaign.currentIndex];
  const idx = campaign.currentIndex;

  await addLog(`📤 [${idx + 1}/${campaign.contacts.length}] Sending to ${contact.name || contact.number}...`, "info");
  await broadcastToPopup("SENDING_TO", { contact, index: idx });

  // Build message text (used as text OR as image caption)
  let messageText = campaign.message;
  if (campaign.useVariants && campaign.variants.length > 0) {
    messageText = campaign.variants[Math.floor(Math.random() * campaign.variants.length)];
  }
  messageText = messageText
    .replace(/\{name\}/g, contact.name || "")
    .replace(/\{link\}/g, campaign.link);

  // ===== SEND: IMAGE or TEXT =====
  let success = false;

  if (campaign.hasImage) {
    success = await sendImageMessage(campaign.waTabId, contact.number, messageText);
  } else {
    success = await sendTextMessage(campaign.waTabId, contact.number, messageText);
  }

  // Auto-retry once on failure
  if (!success && campaign.settings.autoRetry) {
    await addLog(`🔄 Retrying ${contact.name || contact.number}...`, "warning");
    await sleep(5000);

    if (campaign.hasImage) {
      success = await sendImageMessage(campaign.waTabId, contact.number, messageText);
    } else {
      success = await sendTextMessage(campaign.waTabId, contact.number, messageText);
    }
  }

  // Update campaign state
  if (success) {
    campaign.sent++;
    campaign.batchCount++;
    await addLog(`✅ Sent to ${contact.name || contact.number} (${contact.number})`, "success");
  } else {
    campaign.failed++;
    campaign.batchCount++;
    await addLog(`❌ Failed: ${contact.name || contact.number} (${contact.number})`, "error");
  }

  campaign.currentIndex++;
  await chrome.storage.local.set({ campaign });
  await broadcastToPopup("CONTACT_DONE", { success, contact, index: idx });

  // Check if done
  if (campaign.currentIndex >= campaign.contacts.length) {
    await finishCampaign(campaign);
    return;
  }

  // Schedule next with random delay
  const minD = campaign.settings.minDelay;
  const maxD = campaign.settings.maxDelay;
  const delaySec = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
  await addLog(`⏳ Next in ${delaySec}s...`, "info");
  await scheduleNext(delaySec);
}

// ===== FINISH CAMPAIGN =====
async function finishCampaign(campaign) {
  await addLog(`🏁 All done! Sent: ${campaign.sent}, Failed: ${campaign.failed}`, "success");
  campaign.isRunning = false;
  await chrome.storage.local.set({ campaign });
  await broadcastToPopup("CAMPAIGN_COMPLETE");

  // Cleanup campaign image from storage
  chrome.storage.local.remove(["campaignImage", "campaignImageMime"]);
}

// ===========================================================
// ===== SEND TEXT MESSAGE (your original flow, unchanged) ====
// ===========================================================
async function sendTextMessage(tabId, number, messageText) {
  try {
    // Step 1: Navigate to WhatsApp send URL (text pre-filled via URL)
    const url = `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(messageText)}`;
    await navigateTab(tabId, url);

    // Step 2: Wait for page to settle
    await sleep(4000);

    // Step 3: Wait for content script to be ready
    const alive = await waitForContentScript(tabId, 12);
    if (!alive) {
      console.error("Content script not ready");
      return false;
    }

    // Step 4: Wait extra time for chat + message to load
    await sleep(3000);

    // Step 5: Tell content script to click Send
    const response = await sendToContentWithRetry(tabId, { type: "CLICK_SEND" }, 3);
    return response && response.success;

  } catch (err) {
    console.error("sendTextMessage error:", err);
    return false;
  }
}

// ===========================================================
// ===== SEND IMAGE MESSAGE (NEW flow) ========================
// ===========================================================
// Strategy:
//   1) Navigate to chat (NO &text= param — we type caption manually)
//   2) Wait for content script
//   3) Tell content script: "SEND_IMAGE" with caption text
//   4) Content script reads image from chrome.storage.local
//      (avoids message size limits for large base64 strings)
//   5) Content script pastes image → types caption → clicks send
// ===========================================================
async function sendImageMessage(tabId, number, captionText) {
  try {
    // Step 1: Navigate to chat WITHOUT text param
    const url = `https://web.whatsapp.com/send?phone=${number}`;
    await navigateTab(tabId, url);

    // Step 2: Wait for page to settle (image flow needs more time)
    await sleep(5000);

    // Step 3: Wait for content script
    const alive = await waitForContentScript(tabId, 15);
    if (!alive) {
      console.error("Content script not ready for image send");
      return false;
    }

    // Step 4: Extra settle time for chat to fully load
    await sleep(3000);

    // Step 5: Tell content script to handle image
    // NOTE: We do NOT send imageBase64 in the message (too large!)
    // Content script will read it from chrome.storage.local
    const response = await sendToContentWithRetry(tabId, {
      type: "SEND_IMAGE",
      caption: captionText || ""
    }, 2);

    return response && response.success;

  } catch (err) {
    console.error("sendImageMessage error:", err);
    return false;
  }
}

// ===== TAB NAVIGATION =====
function navigateTab(tabId, url) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url });
  });
}

// ===== WAIT FOR CONTENT SCRIPT =====
async function waitForContentScript(tabId, maxRetries = 12) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (response && response.pong) return true;
    } catch (e) {
      // Not ready yet
    }
    await sleep(2000);
  }
  return false;
}

// ===== SEND TO CONTENT WITH RETRY =====
async function sendToContentWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (e) {
      if (i === maxRetries - 1) return { success: false, error: e.message };
      await sleep(3000);
    }
  }
}

// ===== SCHEDULE NEXT CONTACT =====
async function scheduleNext(delaySec) {
  if (delaySec < 30) {
    setTimeout(() => processNextContact(), delaySec * 1000);
  } else {
    chrome.alarms.create("wa-send-next", { delayInMinutes: delaySec / 60 });
  }
  // Backup alarm in case setTimeout gets killed
  chrome.alarms.create("wa-send-next", { delayInMinutes: Math.max(delaySec / 60, 0.5) });
}

// ===== HELPERS =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCampaign() {
  return new Promise((resolve) => {
    chrome.storage.local.get("campaign", (data) => {
      resolve(data.campaign || { ...DEFAULT_CAMPAIGN });
    });
  });
}

async function addLog(message, type = "info") {
  const time = new Date().toLocaleTimeString();
  const entry = { time, message, type };

  const campaign = await getCampaign();
  campaign.logs.push(entry);
  if (campaign.logs.length > 500) campaign.logs = campaign.logs.slice(-500);
  await chrome.storage.local.set({ campaign });

  await broadcastToPopup("LOG", entry);
}

async function broadcastToPopup(type, data = {}) {
  try {
    chrome.runtime.sendMessage({ type, ...data });
  } catch (e) {
    // Popup not open — that's fine
  }
}