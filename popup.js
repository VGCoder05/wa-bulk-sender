// ============================================
// WA BULK SENDER — POPUP (UI Only)
// All sending logic is in background.js
// This just displays status and sends commands
// ============================================

let contacts = [];
let settings = {
  minDelay: 25, maxDelay: 60, batchSize: 15,
  batchPause: 300, dailyLimit: 200, autoRetry: true, keepAlive: true
};
let logEntries = [];

// ===== IMAGE GLOBALS =====
let imageBase64 = null;
let imageMimeType = null;
let imageFileName = null;

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initTabs();
  initContacts();
  initMessage();
  initImage();
  initSend();
  initSettings();
  syncCampaignState();
});

// Listen for real-time updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "LOG") {
    displayLog(message);
  }
  if (message.type === "CONTACT_DONE" || message.type === "SENDING_TO" ||
      message.type === "BATCH_BREAK" || message.type === "CAMPAIGN_COMPLETE" ||
      message.type === "CAMPAIGN_STARTED" || message.type === "CAMPAIGN_PAUSED" ||
      message.type === "CAMPAIGN_RESUMED" || message.type === "CAMPAIGN_STOPPED") {
    syncCampaignState();
  }
});

// ===== SYNC STATE FROM BACKGROUND =====
async function syncCampaignState() {
  try {
    const campaign = await chrome.runtime.sendMessage({ type: "GET_CAMPAIGN_STATE" });
    if (!campaign) return;

    document.getElementById("sentCount").textContent = campaign.sent || 0;
    document.getElementById("failedCount").textContent = campaign.failed || 0;
    document.getElementById("remainingCount").textContent =
      Math.max(0, (campaign.contacts?.length || 0) - (campaign.currentIndex || 0));

    const total = campaign.contacts?.length || 0;
    const done = (campaign.sent || 0) + (campaign.failed || 0);
    const progress = total > 0 ? (done / total) * 100 : 0;
    document.getElementById("progressFill").style.width = progress + "%";

    if (campaign.startTime && done > 0) {
      const elapsed = (Date.now() - campaign.startTime) / 1000;
      const rate = done / elapsed;
      const remaining = total - done;
      const eta = remaining / rate;
      document.getElementById("etaDisplay").textContent = formatTime(eta);
      document.getElementById("rateDisplay").textContent = (rate * 60).toFixed(1) + " msg/min";
    }

    if (campaign.isRunning) {
      document.getElementById("startBtn").disabled = true;
      document.getElementById("pauseBtn").disabled = false;
      document.getElementById("stopBtn").disabled = false;

      if (campaign.isPaused) {
        document.getElementById("pauseBtn").textContent = "▶️ Resume";
        updateStatus("paused", "⏸️", "Paused");
      } else {
        document.getElementById("pauseBtn").textContent = "⏸️ Pause";
        const idx = campaign.currentIndex || 0;
        const contact = campaign.contacts?.[idx];
        const name = contact ? (contact.name || contact.number) : "";
        updateStatus("sending", "📤", `Sending to ${name} (${idx + 1}/${total})`);
      }
    } else {
      document.getElementById("startBtn").disabled = false;
      document.getElementById("pauseBtn").disabled = true;
      document.getElementById("stopBtn").disabled = true;
      document.getElementById("pauseBtn").textContent = "⏸️ Pause";

      if (done > 0 && done >= total) {
        updateStatus("done", "✅", `Done! Sent: ${campaign.sent}, Failed: ${campaign.failed}`);
      } else if (done > 0) {
        updateStatus("error", "⏹️", `Stopped. Sent: ${campaign.sent}, Failed: ${campaign.failed}`);
      } else {
        updateStatus("ready", "⏳", "Ready to send");
      }
    }

    if (campaign.logs && campaign.logs.length > 0) {
      const logDiv = document.getElementById("activityLog");
      const currentCount = logDiv.children.length;
      const newLogs = campaign.logs.slice(currentCount);
      newLogs.forEach(entry => displayLog(entry));
    }

  } catch (e) {
    // Background not ready yet
  }
}

setInterval(syncCampaignState, 3000);

// ===== TABS =====
function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });
}

// ===== CONTACTS TAB =====
function initContacts() {
  document.getElementById("csvUpload").addEventListener("change", handleFileUpload);

  document.getElementById("addNumbersBtn").addEventListener("click", () => {
    const text = document.getElementById("numbersInput").value.trim();
    if (!text) return alert("Please enter some numbers!");
    parseAndAddContacts(text);
    document.getElementById("numbersInput").value = "";
  });

  document.getElementById("clearContactsBtn").addEventListener("click", () => {
    if (confirm("Clear all contacts?")) {
      contacts = [];
      updateContactUI();
      saveState();
    }
  });
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    parseAndAddContacts(event.target.result);
    addLocalLog("Imported file: " + file.name, "info");
  };
  reader.readAsText(file);
  e.target.value = "";
}

function parseAndAddContacts(text) {
  const lines = text.split(/[\n\r]+/).filter(l => l.trim());
  let added = 0;

  lines.forEach(line => {
    if (line.toLowerCase().includes("name") && line.toLowerCase().includes("phone")) return;
    if (line.toLowerCase().includes("number") && line.toLowerCase().includes("name")) return;

    let number = "";
    let name = "";

    const parts = line.split(/[,;\t]+/).map(p => p.trim());

    if (parts.length >= 2) {
      const p0digits = parts[0].replace(/\D/g, "").length;
      const p1digits = parts[1].replace(/\D/g, "").length;

      if (p0digits >= 7 && p0digits > p1digits) {
        number = parts[0];
        name = parts.slice(1).join(" ");
      } else if (p1digits >= 7) {
        name = parts[0];
        number = parts[1];
      } else {
        number = parts[0];
        name = parts.slice(1).join(" ");
      }
    } else {
      number = parts[0];
      name = "";
    }

    number = number.replace(/[\s\-\(\)\.]/g, "");
    if (!number.startsWith("+")) {
      number = number.replace(/^0+/, "");
    }
    number = number.replace(/^\+/, "");

    if (number.replace(/\D/g, "").length >= 7) {
      if (!contacts.find(c => c.number === number)) {
        contacts.push({ number, name: name.trim() });
        added++;
      }
    }
  });

  updateContactUI();
  saveState();
  addLocalLog(`Added ${added} new contacts (${contacts.length} total)`, "success");
}

function updateContactUI() {
  document.getElementById("contactCount").textContent = contacts.length;

  const preview = document.getElementById("contactPreview");
  if (contacts.length === 0) {
    preview.innerHTML = '<div style="text-align:center;padding:15px;color:#667781">No contacts loaded</div>';
    return;
  }

  const displayCount = Math.min(contacts.length, 50);
  let html = "";
  for (let i = 0; i < displayCount; i++) {
    const displayName = contacts[i].name || "(no name)";
    html += `<div class="contact-item">
      <span class="contact-name">${displayName}</span>
      <span class="contact-number">${contacts[i].number}</span>
    </div>`;
  }
  if (contacts.length > 50) {
    html += `<div class="contact-item" style="justify-content:center;color:#667781">... and ${contacts.length - 50} more</div>`;
  }
  preview.innerHTML = html;
}

// ===== MESSAGE TAB =====
function initMessage() {
  const templates = {
    community: `Hey {name}! 👋\n\nI've created an amazing community and I'd love for you to join! 🎉\n\n👉 Join here: {link}\n\nLooking forward to seeing you there! 🙌`,
    group: `Hi {name}! 😊\n\nYou're invited to join our WhatsApp group!\n\n🔗 Join: {link}\n\nSee you inside! 🚀`,
    announce: `Hello {name},\n\nWe have an exciting update to share with you! 📢\n\nCheck it out here: {link}\n\nStay tuned for more! ⭐`,
    custom: `🙏 Namaste Sir,

I'm from IFB Service Center, Abohar.

Kindly save this number for any future service needs of your IFB appliances: 🔹 Washing Machine 🔹 Microwave Oven 🔹 Dishwasher

📲 +919915967672 — Please save this number for future needs.

For quick updates & service tips, join our WhatsApp community: 🔗 https://chat.whatsapp.com/DGAY7BIdOG1Eyhar7RqzHR

Your satisfaction is our priority!`
  };

  document.querySelectorAll(".template-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".template-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tmpl = templates[btn.dataset.template];
      if (tmpl) document.getElementById("messageInput").value = tmpl;
      updatePreview();
    });
  });

  document.getElementById("messageInput").addEventListener("input", updatePreview);
  document.getElementById("inviteLink").addEventListener("input", updatePreview);
  document.getElementById("useVariants").addEventListener("change", (e) => {
    document.getElementById("variantsSection").style.display = e.target.checked ? "block" : "none";
  });
  updatePreview();
}

function updatePreview() {
  let msg = document.getElementById("messageInput").value || "Your message will appear here...";
  const link = document.getElementById("inviteLink").value || "https://chat.whatsapp.com/xxx";
  msg = msg.replace(/\{name\}/g, "John").replace(/\{link\}/g, link);
  document.getElementById("messagePreview").textContent = msg;
}

// =============================================
// ===== IMAGE UPLOAD & HANDLING (NEW) ========
// =============================================
function initImage() {
  const imageUpload = document.getElementById("imageUpload");
  const imagePreview = document.getElementById("imagePreview");
  const imagePreviewContainer = document.getElementById("imagePreviewContainer");
  const removeImageBtn = document.getElementById("removeImageBtn");
  const imageSizeLabel = document.getElementById("imageSizeLabel");

  imageUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // --- Validate type ---
    if (!file.type.startsWith("image/")) {
      alert("❌ Please select a valid image file (JPG, PNG, WEBP, GIF).");
      e.target.value = "";
      return;
    }

    // --- Validate size (WhatsApp max ~16MB) ---
    if (file.size > 16 * 1024 * 1024) {
      alert("❌ Image too large! WhatsApp allows up to 16MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      imageBase64 = event.target.result;   // Full data URL
      imageMimeType = file.type;
      imageFileName = file.name;

      // Show preview
      imagePreview.src = imageBase64;
      imagePreviewContainer.style.display = "block";

      // Show file size
      const sizeKB = (file.size / 1024).toFixed(1);
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      imageSizeLabel.textContent = file.size > 1024 * 1024
        ? `${sizeMB} MB`
        : `${sizeKB} KB`;

      addLocalLog(`📎 Image attached: ${file.name} (${imageSizeLabel.textContent})`, "info");

      // Save to unlimitedStorage
      saveState();
    };

    reader.onerror = () => {
      alert("❌ Failed to read the image file. Please try again.");
      e.target.value = "";
    };

    reader.readAsDataURL(file);
  });

  removeImageBtn.addEventListener("click", () => {
    clearImage();
    addLocalLog("🗑️ Image removed", "info");
  });

  // --- Restore saved image on popup open ---
  chrome.storage.local.get(["imageBase64", "imageMimeType", "imageFileName"], (data) => {
    if (data.imageBase64) {
      imageBase64 = data.imageBase64;
      imageMimeType = data.imageMimeType;
      imageFileName = data.imageFileName || "image";

      imagePreview.src = imageBase64;
      imagePreviewContainer.style.display = "block";

      // Estimate size from base64 length
      const estimatedBytes = Math.round((data.imageBase64.length * 3) / 4);
      const sizeKB = (estimatedBytes / 1024).toFixed(1);
      imageSizeLabel.textContent = estimatedBytes > 1024 * 1024
        ? `${(estimatedBytes / (1024 * 1024)).toFixed(2)} MB`
        : `${sizeKB} KB`;
    }
  });
}

function clearImage() {
  imageBase64 = null;
  imageMimeType = null;
  imageFileName = null;

  document.getElementById("imageUpload").value = "";
  document.getElementById("imagePreviewContainer").style.display = "none";
  document.getElementById("imageSizeLabel").textContent = "";

  // Remove from storage too
  chrome.storage.local.remove(["imageBase64", "imageMimeType", "imageFileName"]);
}

// ===== SEND TAB =====
function initSend() {
  document.getElementById("startBtn").addEventListener("click", startSending);
  document.getElementById("pauseBtn").addEventListener("click", togglePause);
  document.getElementById("stopBtn").addEventListener("click", stopSending);
  document.getElementById("exportLogBtn").addEventListener("click", exportLog);
}

async function startSending() {
  // --- Validation ---
  if (contacts.length === 0) return alert("❌ No contacts loaded! Go to Contacts tab first.");

  const msg = document.getElementById("messageInput").value.trim();
  if (!msg && !imageBase64) return alert("❌ No message or image! Go to Message tab first.");

  // --- Find WhatsApp Web tab ---
  const [waTab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (!waTab) return alert("❌ Please open web.whatsapp.com first!");

  const link = document.getElementById("inviteLink").value.trim();
  const useVariants = document.getElementById("useVariants").checked;
  const variants = document.getElementById("variantsInput").value.split("\n").filter(v => v.trim());

  // --- Build campaign data ---
  const campaignData = {
    contacts: contacts,
    message: msg,
    link: link,
    useVariants: useVariants,
    variants: variants,
    settings: settings,
    waTabId: waTab.id,
    hasImage: !!imageBase64   // Flag — actual image is read from storage
  };

  // --- If image exists, save it to storage first so background can access it ---
  if (imageBase64) {
    await chrome.storage.local.set({
      campaignImage: imageBase64,
      campaignImageMime: imageMimeType
    });
    addLocalLog(`📎 Image saved for campaign: ${imageFileName}`, "info");
  } else {
    await chrome.storage.local.remove(["campaignImage", "campaignImageMime"]);
  }

  // --- Send START command to background ---
  chrome.runtime.sendMessage({
    type: "START_CAMPAIGN",
    data: campaignData
  });

  // --- UI Update ---
  document.getElementById("startBtn").disabled = true;
  document.getElementById("pauseBtn").disabled = false;
  document.getElementById("stopBtn").disabled = false;
  document.getElementById("remainingCount").textContent = contacts.length;
  updateStatus("sending", "🚀", "Starting campaign...");
}

async function togglePause() {
  const campaign = await chrome.runtime.sendMessage({ type: "GET_CAMPAIGN_STATE" });
  if (campaign && campaign.isPaused) {
    chrome.runtime.sendMessage({ type: "RESUME_CAMPAIGN" });
    document.getElementById("pauseBtn").textContent = "▶️ Resume";
  } else {
    chrome.runtime.sendMessage({ type: "PAUSE_CAMPAIGN" });
    document.getElementById("pauseBtn").textContent = "▶️ Resume";
  }
}

function stopSending() {
  if (confirm("Stop sending?")) {
    chrome.runtime.sendMessage({ type: "STOP_CAMPAIGN" });
    document.getElementById("startBtn").disabled = false;
    document.getElementById("pauseBtn").disabled = true;
    document.getElementById("stopBtn").disabled = true;
    document.getElementById("pauseBtn").textContent = "⏸️ Pause";
    updateStatus("error", "⏹️", "Stopped by user");
  }
}

function updateStatus(type, icon, text) {
  const card = document.getElementById("statusCard");
  card.className = "status-card " + type;
  document.getElementById("statusIcon").textContent = icon;
  document.getElementById("statusText").textContent = text;
}

// ===== SETTINGS =====
function initSettings() {
  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    settings.minDelay = parseInt(document.getElementById("minDelay").value) || 25;
    settings.maxDelay = parseInt(document.getElementById("maxDelay").value) || 60;
    settings.batchSize = parseInt(document.getElementById("batchSize").value) || 15;
    settings.batchPause = parseInt(document.getElementById("batchPause").value) || 300;
    settings.dailyLimit = parseInt(document.getElementById("dailyLimit").value) || 200;
    settings.autoRetry = document.getElementById("autoRetry").checked;
    settings.keepAlive = document.getElementById("keepAlive").checked;
    if (settings.minDelay < 10) settings.minDelay = 10;
    if (settings.maxDelay < settings.minDelay) settings.maxDelay = settings.minDelay + 10;
    saveState();
    alert("Settings saved!");
  });

  document.getElementById("resetSettingsBtn").addEventListener("click", () => {
    if (confirm("Reset to defaults?")) {
      settings = { minDelay: 25, maxDelay: 60, batchSize: 15, batchPause: 300, dailyLimit: 200, autoRetry: true, keepAlive: true };
      populateSettings();
      saveState();
    }
  });

  populateSettings();
}

function populateSettings() {
  document.getElementById("minDelay").value = settings.minDelay;
  document.getElementById("maxDelay").value = settings.maxDelay;
  document.getElementById("batchSize").value = settings.batchSize;
  document.getElementById("batchPause").value = settings.batchPause;
  document.getElementById("dailyLimit").value = settings.dailyLimit;
  document.getElementById("autoRetry").checked = settings.autoRetry;
  document.getElementById("keepAlive").checked = settings.keepAlive;
}

// ===== LOG =====
function displayLog(entry) {
  const log = document.getElementById("activityLog");
  if (!log) return;
  const div = document.createElement("div");
  div.className = "log-entry " + (entry.type || "info");
  div.textContent = `[${entry.time}] ${entry.message}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 200) log.removeChild(log.firstChild);
  logEntries.push(entry);
}

function addLocalLog(message, type = "info") {
  displayLog({ time: new Date().toLocaleTimeString(), message, type });
}

function exportLog() {
  if (logEntries.length === 0) return alert("No logs to export!");
  const text = logEntries.map(e => `[${e.time}] [${e.type.toUpperCase()}] ${e.message}`).join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wa-bulk-log-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== HELPERS =====
function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m ${secs}s`;
}

function saveState() {
  // Save contacts, settings, and image data — all to unlimitedStorage
  const data = { contacts, settings };

  // Only save image data if it exists
  if (imageBase64) {
    data.imageBase64 = imageBase64;
    data.imageMimeType = imageMimeType;
    data.imageFileName = imageFileName;
  }

  chrome.storage.local.set(data);
}

function loadState() {
  chrome.storage.local.get(["contacts", "settings"], (data) => {
    if (data.contacts) { contacts = data.contacts; updateContactUI(); }
    if (data.settings) { settings = { ...settings, ...data.settings }; populateSettings(); }
  });
  // Image is loaded separately in initImage()
}