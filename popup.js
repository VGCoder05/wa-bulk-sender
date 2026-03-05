// ===== STATE =====
let contacts = [];
let settings = {
  minDelay: 25,
  maxDelay: 60,
  batchSize: 15,
  batchPause: 300,
  dailyLimit: 200,
  autoRetry: true,
  keepAlive: true
};
let isSending = false;
let isPaused = false;
let logEntries = [];

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initTabs();
  initContacts();
  initMessage();
  initSend();
  initSettings();
});

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
  // CSV Upload
  document.getElementById("csvUpload").addEventListener("change", handleFileUpload);

  // Manual add
  document.getElementById("addNumbersBtn").addEventListener("click", () => {
    const text = document.getElementById("numbersInput").value.trim();
    if (!text) return alert("Please enter some numbers!");
    parseAndAddContacts(text);
    document.getElementById("numbersInput").value = "";
  });

  // Clear all
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
    const text = event.target.result;
    parseAndAddContacts(text);
    addLog("Imported file: " + file.name, "info");
  };
  reader.readAsText(file);
  e.target.value = "";
}

function parseAndAddContacts(text) {
  const lines = text.split(/[\n\r]+/).filter(l => l.trim());
  let added = 0;

  lines.forEach(line => {
    // Skip header lines
    if (line.toLowerCase().includes("name") && line.toLowerCase().includes("phone")) return;
    if (line.toLowerCase().includes("number") && line.toLowerCase().includes("name")) return;

    // Parse: could be "number, name" or "name, number" or just "number"
    let number = "";
    let name = "";

    const parts = line.split(/[,;\t]+/).map(p => p.trim());

    if (parts.length >= 2) {
      // Figure out which part is the number
      if (/[\d+]/.test(parts[0]) && parts[0].replace(/\D/g, "").length >= 7) {
        number = parts[0];
        name = parts.slice(1).join(" ");
      } else if (/[\d+]/.test(parts[1]) && parts[1].replace(/\D/g, "").length >= 7) {
        name = parts[0];
        number = parts[1];
      } else {
        number = parts[0];
        name = parts[1];
      }
    } else {
      number = parts[0];
    }

    // Clean number
    number = number.replace(/[\s\-\(\)\.]/g, "");
    if (!number.startsWith("+")) {
      number = number.replace(/^0+/, "");
    }
    number = number.replace(/^\+/, "");

    if (number.replace(/\D/g, "").length >= 7) {
      // Check duplicate
      if (!contacts.find(c => c.number === number)) {
        contacts.push({ number, name: name || "Unknown" });
        added++;
      }
    }
  });

  updateContactUI();
  saveState();
  addLog(`Added ${added} new contacts (${contacts.length} total)`, "success");
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
    html += `<div class="contact-item">
      <span class="contact-name">${contacts[i].name}</span>
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
    community: `Hey {name}! 👋

I've created an amazing community and I'd love for you to join! 🎉

👉 Join here: {link}

Looking forward to seeing you there! 🙌`,
    group: `Hi {name}! 😊

You're invited to join our WhatsApp group!

🔗 Join: {link}

See you inside! 🚀`,
    announce: `Hello {name},

We have an exciting update to share with you! 📢

Check it out here: {link}

Stay tuned for more! ⭐`,
    custom: ""
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

// ===== SEND TAB =====
function initSend() {
  document.getElementById("startBtn").addEventListener("click", startSending);
  document.getElementById("pauseBtn").addEventListener("click", togglePause);
  document.getElementById("stopBtn").addEventListener("click", stopSending);
  document.getElementById("exportLogBtn").addEventListener("click", exportLog);
}

async function startSending() {
  if (contacts.length === 0) return alert("No contacts loaded! Go to Contacts tab first.");
  const msg = document.getElementById("messageInput").value.trim();
  if (!msg) return alert("No message! Go to Message tab first.");

  // Check if WhatsApp Web tab is open
  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (!tab) return alert("Please open web.whatsapp.com first!");

  isSending = true;
  isPaused = false;

  // UI Updates
  document.getElementById("startBtn").disabled = true;
  document.getElementById("pauseBtn").disabled = false;
  document.getElementById("stopBtn").disabled = false;
  updateStatus("sending", "🚀", "Sending messages...");

  const link = document.getElementById("inviteLink").value.trim();
  const useVariants = document.getElementById("useVariants").checked;
  const variants = document.getElementById("variantsInput").value.split("\n").filter(v => v.trim());

  let sent = 0;
  let failed = 0;
  let remaining = contacts.length;
  const startTime = Date.now();

  document.getElementById("remainingCount").textContent = remaining;

  for (let i = 0; i < contacts.length; i++) {
    if (!isSending) break;

    // Pause handling
    while (isPaused && isSending) {
      updateStatus("paused", "⏸️", "Paused...");
      await sleep(1000);
    }
    if (!isSending) break;

    updateStatus("sending", "📤", `Sending to ${contacts[i].name} (${i + 1}/${contacts.length})`);

    // Build message
    let currentMsg = msg;
    if (useVariants && variants.length > 0) {
      currentMsg = variants[Math.floor(Math.random() * variants.length)];
    }
    currentMsg = currentMsg
      .replace(/\{name\}/g, contacts[i].name || "")
      .replace(/\{link\}/g, link);

    // Send via content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "SEND_MESSAGE",
        number: contacts[i].number,
        message: currentMsg
      });

      if (response && response.success) {
        sent++;
        addLog(`✅ Sent to ${contacts[i].name} (${contacts[i].number})`, "success");
      } else {
        failed++;
        addLog(`❌ Failed: ${contacts[i].name} - ${response?.error || "Unknown error"}`, "error");
      }
    } catch (err) {
      failed++;
      addLog(`❌ Error: ${contacts[i].name} - ${err.message}`, "error");
    }

    remaining = contacts.length - i - 1;

    // Update UI
    document.getElementById("sentCount").textContent = sent;
    document.getElementById("failedCount").textContent = failed;
    document.getElementById("remainingCount").textContent = remaining;

    const progress = ((i + 1) / contacts.length) * 100;
    document.getElementById("progressFill").style.width = progress + "%";

    // ETA calculation
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (i + 1) / elapsed;
    const eta = remaining / rate;
    document.getElementById("etaDisplay").textContent = formatTime(eta);
    document.getElementById("rateDisplay").textContent = (rate * 60).toFixed(1) + " msg/min";

    // Batch pause
    if ((i + 1) % settings.batchSize === 0 && i < contacts.length - 1) {
      addLog(`☕ Batch break (${settings.batchPause}s)...`, "warning");
      updateStatus("paused", "☕", `Batch break... ${settings.batchPause}s`);

      for (let s = settings.batchPause; s > 0 && isSending; s--) {
        updateStatus("paused", "☕", `Batch break... ${s}s remaining`);
        await sleep(1000);
      }
    }

    // Random delay
    if (i < contacts.length - 1 && isSending) {
      const delay = randomDelay(settings.minDelay, settings.maxDelay);
      addLog(`⏳ Waiting ${delay}s...`, "info");

      for (let s = delay; s > 0 && isSending && !isPaused; s--) {
        updateStatus("sending", "⏳", `Next message in ${s}s...`);
        await sleep(1000);
      }
    }

    // Daily limit check
    if (sent >= settings.dailyLimit) {
      addLog(`🛡️ Daily limit (${settings.dailyLimit}) reached! Stopping.`, "warning");
      break;
    }
  }

  // Done
  isSending = false;
  document.getElementById("startBtn").disabled = false;
  document.getElementById("pauseBtn").disabled = true;
  document.getElementById("stopBtn").disabled = true;
  updateStatus("done", "✅", `Done! Sent: ${sent}, Failed: ${failed}`);
  addLog(`🏁 Completed! Sent: ${sent}, Failed: ${failed}`, "success");
  saveState();
}

function togglePause() {
  isPaused = !isPaused;
  document.getElementById("pauseBtn").textContent = isPaused ? "▶️ Resume" : "⏸️ Pause";
  addLog(isPaused ? "⏸️ Paused by user" : "▶️ Resumed", "warning");
}

function stopSending() {
  if (confirm("Stop sending?")) {
    isSending = false;
    isPaused = false;
    document.getElementById("startBtn").disabled = false;
    document.getElementById("pauseBtn").disabled = true;
    document.getElementById("stopBtn").disabled = true;
    document.getElementById("pauseBtn").textContent = "⏸️ Pause";
    updateStatus("error", "⏹️", "Stopped by user");
    addLog("⏹️ Stopped by user", "error");
  }
}

function updateStatus(type, icon, text) {
  const card = document.getElementById("statusCard");
  card.className = "status-card " + type;
  document.getElementById("statusIcon").textContent = icon;
  document.getElementById("statusText").textContent = text;
}

// ===== SETTINGS TAB =====
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
    addLog("⚙️ Settings saved!", "info");
    alert("Settings saved!");
  });

  document.getElementById("resetSettingsBtn").addEventListener("click", () => {
    if (confirm("Reset all settings to default?")) {
      settings = { minDelay: 25, maxDelay: 60, batchSize: 15, batchPause: 300, dailyLimit: 200, autoRetry: true, keepAlive: true };
      populateSettings();
      saveState();
      addLog("🔄 Settings reset to default", "info");
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
function addLog(message, type = "info") {
  const time = new Date().toLocaleTimeString();
  const entry = { time, message, type };
  logEntries.push(entry);

  const log = document.getElementById("activityLog");
  if (log) {
    const div = document.createElement("div");
    div.className = "log-entry " + type;
    div.textContent = `[${time}] ${message}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
}

function exportLog() {
  if (logEntries.length === 0) return alert("No log entries to export!");

  const text = logEntries.map(e => `[${e.time}] [${e.type.toUpperCase()}] ${e.message}`).join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wa-bulk-sender-log-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== HELPERS =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }
  return `${mins}m ${secs}s`;
}

// ===== STATE PERSISTENCE =====
function saveState() {
  chrome.storage.local.set({ contacts, settings });
}

function loadState() {
  chrome.storage.local.get(["contacts", "settings"], (data) => {
    if (data.contacts) {
      contacts = data.contacts;
      updateContactUI();
    }
    if (data.settings) {
      settings = { ...settings, ...data.settings };
      populateSettings();
    }
  });
}