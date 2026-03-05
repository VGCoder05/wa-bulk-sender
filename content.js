// ===== WA BULK SENDER — CONTENT SCRIPT =====
// This script runs on web.whatsapp.com and controls the WhatsApp Web interface

console.log("🟢 WA Bulk Sender: Content script loaded!");

// ===== MESSAGE LISTENER =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SEND_MESSAGE") {
    handleSendMessage(message.number, message.message)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === "CHECK_READY") {
    const ready = !!document.querySelector('[data-testid="chat-list"]');
    sendResponse({ ready });
    return true;
  }
});

// ===== MAIN SEND FUNCTION =====
async function handleSendMessage(number, messageText) {
  try {
    console.log(`📤 Sending to: ${number}`);

    // Step 1: Open chat via URL (works for unsaved numbers too!)
    const url = `https://web.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(messageText)}`;
    console.log("url: ", url)

    window.location.href = url;

    // Step 2: Wait for chat to load
    await waitForElement('[data-testid="conversation-panel-wrapper"]', 25000);
    await humanDelay(2000, 4000);

    // Step 3: Check if number is valid (look for error/invalid indicators)
    const invalidIndicator = document.querySelector('[data-testid="popup-container"]');
    if (invalidIndicator) {
      const popupText = invalidIndicator.textContent.toLowerCase();
      if (popupText.includes("invalid") || popupText.includes("doesn't have") || popupText.includes("not on whatsapp")) {
        // Close popup
        const okBtn = invalidIndicator.querySelector("button");
        if (okBtn) okBtn.click();
        await humanDelay(500, 1000);
        return { success: false, error: "Number not on WhatsApp" };
      }
    }

    // Step 4: Find the input field / message box
    const inputBox = await waitForElement(
      '[data-testid="conversation-compose-box-input"], div[contenteditable="true"][data-tab="10"]',
      15000
    );

    if (!inputBox) {
      return { success: false, error: "Could not find message input box" };
    }

    // Step 5: The URL method usually pre-fills the message
    // Just need to verify and hit send
    await humanDelay(1500, 3000);

    // Step 6: Simulate human-like mouse movement
    await simulateHumanBehavior();

    // Step 7: Find and click the Send button
    const sendButton = await waitForElement('[data-testid="send"], [data-testid="compose-btn-send"], span[data-icon="send"]', 10000);

    if (sendButton) {
      await humanDelay(500, 1500);

      // Click with realistic mouse events
      simulateRealisticClick(sendButton);

      // Wait for message to be sent
      await humanDelay(2000, 4000);

      // Verify message was sent (check for tick marks)
      const messageSent = await verifyMessageSent();

      console.log(`✅ Message sent to ${number}`);
      return { success: true };
    } else {
      // Try pressing Enter as fallback
      if (inputBox) {
        inputBox.focus();
        await humanDelay(300, 600);
        const enterEvent = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true
        });
        inputBox.dispatchEvent(enterEvent);
        await humanDelay(2000, 3000);
        console.log(`✅ Message sent to ${number} (via Enter key)`);
        return { success: true };
      }
      return { success: false, error: "Send button not found" };
    }

  } catch (err) {
    console.error(`❌ Error sending to ${number}:`, err);
    return { success: false, error: err.message };
  }
}

// ===== WAIT FOR ELEMENT =====
function waitForElement(selector, timeout = 15000) {
  return new Promise((resolve) => {
    // Check if already exists
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}

// ===== HUMAN-LIKE DELAYS =====
function humanDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ===== SIMULATE HUMAN BEHAVIOR =====
async function simulateHumanBehavior() {
  // Random scroll
  if (Math.random() > 0.5) {
    window.scrollBy(0, Math.random() * 50 - 25);
    await humanDelay(200, 500);
  }

  // Random mouse movement
  const randomX = Math.floor(Math.random() * window.innerWidth);
  const randomY = Math.floor(Math.random() * window.innerHeight);
  document.dispatchEvent(new MouseEvent("mousemove", {
    clientX: randomX,
    clientY: randomY,
    bubbles: true
  }));
  await humanDelay(100, 300);
}

// ===== REALISTIC CLICK =====
function simulateRealisticClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + (Math.random() * 6 - 3);
  const y = rect.top + rect.height / 2 + (Math.random() * 6 - 3);

  const events = [
    new MouseEvent("mouseenter", { clientX: x, clientY: y, bubbles: true }),
    new MouseEvent("mouseover", { clientX: x, clientY: y, bubbles: true }),
    new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }),
    new MouseEvent("mousedown", { clientX: x, clientY: y, bubbles: true, button: 0 }),
    new MouseEvent("mouseup", { clientX: x, clientY: y, bubbles: true, button: 0 }),
    new MouseEvent("click", { clientX: x, clientY: y, bubbles: true, button: 0 })
  ];

  events.forEach((event, i) => {
    setTimeout(() => element.dispatchEvent(event), i * (30 + Math.random() * 50));
  });
}

// ===== VERIFY MESSAGE SENT =====
async function verifyMessageSent() {
  await humanDelay(1000, 2000);
  // Look for message status indicators (single tick, double tick)
  const ticks = document.querySelectorAll('[data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-testid="msg-check"], [data-testid="msg-dblcheck"]');
  return ticks.length > 0;
}

// ===== KEEP ALIVE =====
setInterval(() => {
  // Prevent WhatsApp Web from going idle
  document.dispatchEvent(new MouseEvent("mousemove", {
    clientX: Math.random() * 500,
    clientY: Math.random() * 500,
    bubbles: true
  }));
}, 120000); // Every 2 minutes

console.log("🟢 WA Bulk Sender: Ready and waiting for commands!");