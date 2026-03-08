// ============================================
// WA BULK SENDER — BACKGROUND SERVICE WORKER (v2)
// Handles: sending loop, navigation, alarms
// Survives popup close via chrome.alarms
// NEW: Image + caption support
// ============================================


// ============================================
// WA BULK SENDER — BACKGROUND SERVICE WORKER (v3)
// FIXED: Unified storage keys, switch-case message types,
//        image NOT deleted after campaign
// ============================================

console.log("🟢 WA Bulk Sender: Background worker started (v3)");

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
    minDelay: 25, maxDelay: 60, batchSize: 15,
    batchPause: 300, dailyLimit: 200, autoRetry: true
  },
  waTabId: null,
  logs: [],
  startTime: null,
  hasImage: false,
  hasText: true,
  // ★ NEW: sendMode determines which content script message to use
  // "text"         → SEND_TEXT (text only)
  // "image"        → SEND_IMAGE (image only, no caption)
  // "img_caption"  → SEND_IMG_CAPTION (image + text as caption)
  // "text_then_img"→ SEND_TEXT_THEN_IMG (text first, then image)
  sendMode: "text"
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

  switch (message.type) {

    case "START_CAMPAIGN":
      startCampaign(message.data).then(() => sendResponse({ ok: true }));
      return true;

    case "PAUSE_CAMPAIGN":
      pauseCampaign().then(() => sendResponse({ ok: true }));
      return true;

    case "RESUME_CAMPAIGN":
      resumeCampaign().then(() => sendResponse({ ok: true }));
      return true;

    case "STOP_CAMPAIGN":
      stopCampaign().then(() => sendResponse({ ok: true }));
      return true;

    case "GET_CAMPAIGN_STATE":
      chrome.storage.local.get("campaign", (data) => {
        sendResponse(data.campaign || DEFAULT_CAMPAIGN);
      });
      return true;

    default:
      return false;
  }
});

// ===== ALARM HANDLER =====
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "wa-send-next") {
    await processNextContact();
  }
  if (alarm.name === "wa-batch-resume") {
    await addLog("☕ Batch break over. Resuming...", "info");
    await scheduleNext(1);
  }
});

// ===== DETERMINE SEND MODE =====
// Based on what the user configured:
//   hasText + hasImage → image with caption (most common)
//   hasText + !hasImage → text only
//   !hasText + hasImage → image only (no caption)
function determineSendMode(hasText, hasImage) {
  if (hasText && hasImage)  return "img_caption";     // Image + text as caption
  if (hasText && !hasImage) return "text";             // Text only
  if (!hasText && hasImage) return "image";            // Image only
  return "text";                                        // Fallback
}

// ===== START CAMPAIGN =====
async function startCampaign(data) {
  // ★ Verify image exists in storage (using unified key)
  let hasImage = !!data.hasImage;
  if (hasImage) {
    const imgCheck = await chrome.storage.local.get(["campaignImage"]);
    if (!imgCheck.campaignImage) {
      await addLog("⚠️ Image flag set but no image in storage!", "warning");
      hasImage = false;
    }
  }

  const hasText = !!(data.message && data.message.trim());
  const sendMode = determineSendMode(hasText, hasImage);

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
    hasImage: hasImage,
    hasText: hasText,
    sendMode: sendMode,
  };

  await chrome.storage.local.set({ campaign });

  const modeLabels = {
    text: "📝 Text only",
    image: "🖼️ Image only (no caption)",
    img_caption: "🖼️📝 Image + caption",
    text_then_img: "📝→🖼️ Text first, then image"
  };

  await addLog(`🚀 Campaign started! Mode: ${modeLabels[sendMode]}`, "info");
  await addLog(`📊 ${campaign.contacts.length} contacts to process`, "info");
  await broadcastToPopup("CAMPAIGN_STARTED");

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

  if (!campaign.isRunning || campaign.isPaused) return;
  if (campaign.currentIndex >= campaign.contacts.length) {
    await finishCampaign(campaign);
    return;
  }

  // Daily limit
  if (campaign.sent >= campaign.settings.dailyLimit) {
    await addLog(`🛡️ Daily limit (${campaign.settings.dailyLimit}) reached!`, "warning");
    campaign.isRunning = false;
    await chrome.storage.local.set({ campaign });
    await broadcastToPopup("CAMPAIGN_COMPLETE");
    return;
  }

  // Batch break
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

  await addLog(
    `📤 [${idx + 1}/${campaign.contacts.length}] Sending to ${contact.name || contact.number}...`,
    "info"
  );
  await broadcastToPopup("SENDING_TO", { contact, index: idx });

  // Build message text
  let messageText = campaign.message;
  if (campaign.useVariants && campaign.variants.length > 0) {
    messageText = campaign.variants[Math.floor(Math.random() * campaign.variants.length)];
  }
  messageText = messageText
    .replace(/\{name\}/g, contact.name || "")
    .replace(/\{link\}/g, campaign.link);

  // ★★★ SWITCH-CASE: Send based on mode ★★★
  let success = false;

  switch (campaign.sendMode) {

    case "text":
      success = await sendTextMessage(campaign.waTabId, contact.number, messageText);
      break;

    case "image":
      success = await sendImageMessage(campaign.waTabId, contact.number, "");
      break;

    case "img_caption":
      success = await sendImageMessage(campaign.waTabId, contact.number, messageText);
      break;

    case "text_then_img":
      success = await sendTextThenImage(campaign.waTabId, contact.number, messageText);
      break;

    default:
      success = await sendTextMessage(campaign.waTabId, contact.number, messageText);
  }

  // Auto-retry
  if (!success && campaign.settings.autoRetry) {
    await addLog(`🔄 Retrying ${contact.name || contact.number}...`, "warning");
    await sleep(5000);

    switch (campaign.sendMode) {
      case "text":
        success = await sendTextMessage(campaign.waTabId, contact.number, messageText);
        break;
      case "image":
        success = await sendImageMessage(campaign.waTabId, contact.number, "");
        break;
      case "img_caption":
        success = await sendImageMessage(campaign.waTabId, contact.number, messageText);
        break;
      case "text_then_img":
        success = await sendTextThenImage(campaign.waTabId, contact.number, messageText);
        break;
      default:
        success = await sendTextMessage(campaign.waTabId, contact.number, messageText);
    }
  }

  // Update state
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

  // Check done
  if (campaign.currentIndex >= campaign.contacts.length) {
    await finishCampaign(campaign);
    return;
  }

  // Schedule next
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

  // ★ DO NOT delete campaignImage here!
  // User may want to run another campaign with same image.
  // Image is only deleted when user clicks "Remove Image" in popup.
}

// ===========================================================
// SEND TEXT MESSAGE
// ===========================================================
async function sendTextMessage(tabId, number, messageText) {
  try {
    const url = `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(messageText)}`;
    await navigateTab(tabId, url);
    await sleep(4000);

    const alive = await waitForContentScript(tabId, 12);
    if (!alive) return false;

    await sleep(3000);

    const response = await sendToContentWithRetry(tabId, { type: "SEND_TEXT" }, 3);
    return response && response.success;

  } catch (err) {
    console.error("sendTextMessage error:", err);
    return false;
  }
}

// ===========================================================
// SEND IMAGE MESSAGE (image only or image + caption)
// ===========================================================
async function sendImageMessage(tabId, number, captionText) {
  try {
    // Navigate WITHOUT text param — caption will be typed in modal
    const url = `https://web.whatsapp.com/send?phone=${number}`;
    await navigateTab(tabId, url);
    await sleep(5000);

    const alive = await waitForContentScript(tabId, 15);
    if (!alive) return false;

    await sleep(3000);

    // Content script reads image from chrome.storage.local (key: "campaignImage")
    const response = await sendToContentWithRetry(tabId, {
      type: "SEND_IMG_CAPTION",     // ★ Uses the switch-case in content/main.js
      caption: captionText || ""
    }, 2);

    return response && response.success;

  } catch (err) {
    console.error("sendImageMessage error:", err);
    return false;
  }
}

// ===========================================================
// SEND TEXT FIRST, THEN IMAGE (two separate messages)
// ===========================================================
async function sendTextThenImage(tabId, number, messageText) {
  try {
    // Step 1: Send text via URL pre-fill
    const url = `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(messageText)}`;
    await navigateTab(tabId, url);
    await sleep(4000);

    const alive = await waitForContentScript(tabId, 12);
    if (!alive) return false;

    await sleep(3000);

    // Click send for the text
    const textResult = await sendToContentWithRetry(tabId, { type: "SEND_TEXT" }, 3);
    if (!textResult || !textResult.success) return false;

    // Step 2: Wait, then send image (no caption since text already sent)
    await sleep(4000);

    const imgResult = await sendToContentWithRetry(tabId, {
      type: "SEND_IMAGE",
      caption: ""
    }, 2);

    return imgResult && imgResult.success;

  } catch (err) {
    console.error("sendTextThenImage error:", err);
    return false;
  }
}

// ===========================================================
// TAB NAVIGATION
// ===========================================================
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
    } catch (e) {}
    await sleep(2000);
  }
  return false;
}

// ===== SEND TO CONTENT WITH RETRY =====
async function sendToContentWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      if (i === maxRetries - 1) return { success: false, error: e.message };
      await sleep(3000);
    }
  }
}

// ===== SCHEDULE NEXT =====
async function scheduleNext(delaySec) {
  if (delaySec < 30) {
    setTimeout(() => processNextContact(), delaySec * 1000);
  }
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
  } catch (e) {}
}