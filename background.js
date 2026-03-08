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

// ============================================
// WA BULK SENDER — BACKGROUND SERVICE WORKER (v3.1)
// NEW: Track failed contacts with reasons
// ============================================

console.log("🟢 WA Bulk Sender: Background worker started (v3.1)");

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
  sendMode: "text",
  
  // ★ NEW: Track results
  failedContacts: [],      // Array of { number, name, reason, timestamp }
  successContacts: [],     // Array of { number, name, timestamp }
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

    // ★ NEW: Get failed contacts for download
    case "GET_FAILED_CONTACTS":
      chrome.storage.local.get("campaign", (data) => {
        const campaign = data.campaign || DEFAULT_CAMPAIGN;
        sendResponse({
          failedContacts: campaign.failedContacts || [],
          successContacts: campaign.successContacts || [],
          sent: campaign.sent || 0,
          failed: campaign.failed || 0,
          total: campaign.contacts?.length || 0
        });
      });
      return true;

    // ★ NEW: Clear results (optional - for fresh start)
    case "CLEAR_RESULTS":
      clearResults().then(() => sendResponse({ ok: true }));
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
function determineSendMode(hasText, hasImage) {
  if (hasText && hasImage)  return "img_caption";
  if (hasText && !hasImage) return "text";
  if (!hasText && hasImage) return "image";
  return "text";
}

// ===== START CAMPAIGN =====
async function startCampaign(data) {
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
    
    // ★ Reset results for new campaign
    failedContacts: [],
    successContacts: [],
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
  
  // ★ Log failed count
  if (campaign.failedContacts && campaign.failedContacts.length > 0) {
    await addLog(`📋 ${campaign.failedContacts.length} failed contacts ready to download`, "warning");
  }
  
  // ★ Notify popup to show download option
  await broadcastToPopup("CAMPAIGN_STOPPED", {
    failedCount: campaign.failedContacts?.length || 0,
    successCount: campaign.successContacts?.length || 0
  });
}

// ★ NEW: Clear results
async function clearResults() {
  const campaign = await getCampaign();
  campaign.failedContacts = [];
  campaign.successContacts = [];
  campaign.sent = 0;
  campaign.failed = 0;
  await chrome.storage.local.set({ campaign });
  await addLog("🗑️ Results cleared", "info");
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
    await broadcastToPopup("CAMPAIGN_COMPLETE", {
      failedCount: campaign.failedContacts?.length || 0,
      successCount: campaign.successContacts?.length || 0
    });
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

  // ★ Send and capture result with reason
  let result = { success: false, error: "Unknown error" };

  switch (campaign.sendMode) {
    case "text":
      result = await sendTextMessage(campaign.waTabId, contact.number, messageText);
      break;
    case "image":
      result = await sendImageMessage(campaign.waTabId, contact.number, "");
      break;
    case "img_caption":
      result = await sendImageMessage(campaign.waTabId, contact.number, messageText);
      break;
    case "text_then_img":
      result = await sendTextThenImage(campaign.waTabId, contact.number, messageText);
      break;
    default:
      result = await sendTextMessage(campaign.waTabId, contact.number, messageText);
  }

  // Auto-retry
  if (!result.success && campaign.settings.autoRetry) {
    await addLog(`🔄 Retrying ${contact.name || contact.number}...`, "warning");
    await sleep(5000);

    switch (campaign.sendMode) {
      case "text":
        result = await sendTextMessage(campaign.waTabId, contact.number, messageText);
        break;
      case "image":
        result = await sendImageMessage(campaign.waTabId, contact.number, "");
        break;
      case "img_caption":
        result = await sendImageMessage(campaign.waTabId, contact.number, messageText);
        break;
      case "text_then_img":
        result = await sendTextThenImage(campaign.waTabId, contact.number, messageText);
        break;
      default:
        result = await sendTextMessage(campaign.waTabId, contact.number, messageText);
    }
  }

  // ★ Update state with detailed tracking
  const timestamp = new Date().toISOString();
  
  if (result.success) {
    campaign.sent++;
    campaign.batchCount++;
    
    // ★ Track success
    campaign.successContacts.push({
      number: contact.number,
      name: contact.name || "",
      timestamp: timestamp
    });
    
    await addLog(`✅ Sent to ${contact.name || contact.number} (${contact.number})`, "success");
  } else {
    campaign.failed++;
    campaign.batchCount++;
    
    // ★ Track failure with reason
    campaign.failedContacts.push({
      number: contact.number,
      name: contact.name || "",
      reason: result.error || "Unknown error",
      timestamp: timestamp
    });
    
    await addLog(`❌ Failed: ${contact.name || contact.number} — ${result.error}`, "error");
  }

  campaign.currentIndex++;
  await chrome.storage.local.set({ campaign });
  
  await broadcastToPopup("CONTACT_DONE", { 
    success: result.success, 
    contact, 
    index: idx,
    error: result.error || null
  });

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
  
  if (campaign.failedContacts && campaign.failedContacts.length > 0) {
    await addLog(`📋 ${campaign.failedContacts.length} failed contacts ready to download`, "warning");
  }
  
  campaign.isRunning = false;
  await chrome.storage.local.set({ campaign });
  
  // ★ Notify popup with counts
  await broadcastToPopup("CAMPAIGN_COMPLETE", {
    failedCount: campaign.failedContacts?.length || 0,
    successCount: campaign.successContacts?.length || 0,
    sent: campaign.sent,
    failed: campaign.failed
  });
}

// ===========================================================
// SEND TEXT MESSAGE — ★ Now returns { success, error }
// ===========================================================
async function sendTextMessage(tabId, number, messageText) {
  try {
    const url = `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(messageText)}`;
    await navigateTab(tabId, url);
    await sleep(4000);

    const alive = await waitForContentScript(tabId, 12);
    if (!alive) {
      return { success: false, error: "Content script not responding" };
    }

    await sleep(3000);

    const response = await sendToContentWithRetry(tabId, { type: "SEND_TEXT" }, 3);
    
    if (response && response.success) {
      return { success: true };
    } else {
      return { success: false, error: response?.error || "Send failed" };
    }

  } catch (err) {
    console.error("sendTextMessage error:", err);
    return { success: false, error: err.message };
  }
}

// ===========================================================
// SEND IMAGE MESSAGE — ★ Now returns { success, error }
// ===========================================================
async function sendImageMessage(tabId, number, captionText) {
  try {
    const url = `https://web.whatsapp.com/send?phone=${number}`;
    await navigateTab(tabId, url);
    await sleep(5000);

    const alive = await waitForContentScript(tabId, 15);
    if (!alive) {
      return { success: false, error: "Content script not responding" };
    }

    await sleep(3000);

    const response = await sendToContentWithRetry(tabId, {
      type: "SEND_IMG_CAPTION",
      caption: captionText || ""
    }, 2);

    if (response && response.success) {
      return { success: true };
    } else {
      return { success: false, error: response?.error || "Image send failed" };
    }

  } catch (err) {
    console.error("sendImageMessage error:", err);
    return { success: false, error: err.message };
  }
}

// ===========================================================
// SEND TEXT THEN IMAGE — ★ Now returns { success, error }
// ===========================================================
async function sendTextThenImage(tabId, number, messageText) {
  try {
    const url = `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(messageText)}`;
    await navigateTab(tabId, url);
    await sleep(4000);

    const alive = await waitForContentScript(tabId, 12);
    if (!alive) {
      return { success: false, error: "Content script not responding" };
    }

    await sleep(3000);

    const textResult = await sendToContentWithRetry(tabId, { type: "SEND_TEXT" }, 3);
    if (!textResult || !textResult.success) {
      return { success: false, error: textResult?.error || "Text send failed" };
    }

    await sleep(4000);

    const imgResult = await sendToContentWithRetry(tabId, {
      type: "SEND_IMAGE",
      caption: ""
    }, 2);

    if (imgResult && imgResult.success) {
      return { success: true };
    } else {
      return { success: false, error: imgResult?.error || "Image send failed (text was sent)" };
    }

  } catch (err) {
    console.error("sendTextThenImage error:", err);
    return { success: false, error: err.message };
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