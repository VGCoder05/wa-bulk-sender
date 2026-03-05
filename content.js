// ===== WA BULK SENDER — CONTENT SCRIPT (FIXED) =====
// This script ONLY handles clicking Send button.
// Navigation is handled by popup.js via chrome.tabs.update()

console.log("🟢 WA Bulk Sender: Content script loaded on", window.location.href);

// ===== MESSAGE LISTENER =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Health check — popup pings this to know content script is alive
  if (message.type === "PING") {
    sendResponse({ pong: true });
    return false; // Synchronous — no need to keep channel open
  }

  // Main job: Click the send button
  if (message.type === "CLICK_SEND") {
    handleClickSend()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  return false;
});

// ===== CLICK SEND HANDLER =====
async function handleClickSend() {
  try {
    console.log("📤 WA Bulk Sender: Waiting for chat to load...");

    // Step 1: Wait for the conversation panel to appear
    const chatPanel = await waitForElement(
      '[data-testid="conversation-panel-wrapper"]',
      20000
    );

    if (!chatPanel) {
      // Check if there's an "invalid number" popup
      const popup = document.querySelector('[data-testid="popup-container"]');
      if (popup) {
        const text = popup.textContent.toLowerCase();
        if (text.includes("invalid") || text.includes("doesn't") || text.includes("not on whatsapp")) {
          const okBtn = popup.querySelector("button");
          if (okBtn) okBtn.click();
          return { success: false, error: "Number not on WhatsApp" };
        }
      }
      return { success: false, error: "Chat panel did not load" };
    }

    // Step 2: Wait extra time for the message to be pre-filled by the URL ?text= param
    await humanDelay(2000, 4000);

    // Step 3: Check for invalid number popup again (sometimes appears late)
    const latePopup = document.querySelector('[data-testid="popup-container"]');
    if (latePopup) {
      const text = latePopup.textContent.toLowerCase();
      if (text.includes("invalid") || text.includes("doesn't") || text.includes("not on whatsapp")) {
        const okBtn = latePopup.querySelector("button");
        if (okBtn) okBtn.click();
        return { success: false, error: "Number not on WhatsApp" };
      }
    }

    // Step 4: Simulate human behavior
    await simulateHumanBehavior();

    // Step 5: Find the Send button
    const sendButton = await waitForElement(
      '[data-testid="send"], [data-testid="compose-btn-send"], span[data-icon="send"]',
      15000
    );

    if (sendButton) {
      // Get the actual clickable button element
      const clickTarget = sendButton.closest("button") || sendButton;

      await humanDelay(500, 1500);

      // Click with realistic mouse events
      simulateRealisticClick(clickTarget);

      // Wait and verify
      await humanDelay(2000, 4000);

      console.log("✅ WA Bulk Sender: Send button clicked!");
      return { success: true };

    } else {
      // Fallback: Try pressing Enter on the input box
      console.log("⚠️ Send button not found, trying Enter key fallback...");

      const inputBox = document.querySelector(
        '[data-testid="conversation-compose-box-input"], div[contenteditable="true"][data-tab="10"]'
      );

      if (inputBox) {
        inputBox.focus();
        await humanDelay(300, 600);

        inputBox.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));

        await humanDelay(2000, 3000);

        console.log("✅ WA Bulk Sender: Enter key pressed!");
        return { success: true };
      }

      return { success: false, error: "No send button or input box found" };
    }

  } catch (err) {
    console.error("❌ WA Bulk Sender error:", err);
    return { success: false, error: err.message };
  }
}

// ===== WAIT FOR ELEMENT (with MutationObserver) =====
function waitForElement(selector, timeout = 15000) {
  return new Promise((resolve) => {
    // Check immediately
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    let resolved = false;

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el && !resolved) {
        resolved = true;
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve(document.querySelector(selector)); // Could be null
      }
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
  document.dispatchEvent(new MouseEvent("mousemove", {
    clientX: Math.floor(Math.random() * window.innerWidth),
    clientY: Math.floor(Math.random() * window.innerHeight),
    bubbles: true
  }));
  await humanDelay(200, 500);
}

// ===== REALISTIC CLICK =====
function simulateRealisticClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + (Math.random() * 6 - 3);
  const y = rect.top + rect.height / 2 + (Math.random() * 6 - 3);

  const commonProps = {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0
  };

  // Fire events synchronously with small offsets
  element.dispatchEvent(new MouseEvent("mouseenter", commonProps));
  element.dispatchEvent(new MouseEvent("mouseover", commonProps));
  element.dispatchEvent(new MouseEvent("mousemove", commonProps));
  element.dispatchEvent(new MouseEvent("mousedown", commonProps));
  element.dispatchEvent(new MouseEvent("mouseup", commonProps));
  element.dispatchEvent(new MouseEvent("click", commonProps));

  // Also try .click() as absolute fallback
  try { element.click(); } catch(e) {}
}

// ===== KEEP ALIVE =====
setInterval(() => {
  document.dispatchEvent(new MouseEvent("mousemove", {
    clientX: Math.random() * 500,
    clientY: Math.random() * 500,
    bubbles: true
  }));
}, 120000);

console.log("🟢 WA Bulk Sender: Ready and listening for commands!");