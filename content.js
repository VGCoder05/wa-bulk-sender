// ============================================
// WA BULK SENDER — CONTENT SCRIPT (FIXED v1.2)
// Only job: Click the Send button when asked
// Selectors matched from actual WhatsApp Web HTML
// ============================================

console.log("🟢 WA Bulk Sender: Content script loaded!");

// ===== MESSAGE LISTENER =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Health check ping
  if (message.type === "PING") {
    sendResponse({ pong: true });
    return false;
  }

  // Main job: Click Send
  if (message.type === "CLICK_SEND") {
    handleClickSend()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async
  }

  return false;
});

// ===== CLICK SEND HANDLER =====
async function handleClickSend() {
  try {
    console.log("📤 WA Bulk Sender: Looking for chat & send button...");

    // Step 1: Wait for the compose box to appear (means chat loaded + message pre-filled)
    const composeBox = await waitForElement(
      'div[contenteditable="true"][data-tab="10"][role="textbox"]',
      25000
    );

    if (!composeBox) {
      // Check for invalid number popup
      const popupError = checkForErrorPopup();
      if (popupError) return popupError;
      return { success: false, error: "Chat did not load — compose box not found" };
    }

    console.log("✅ Compose box found, chat loaded.");

    // Step 2: Wait for message to be filled by the URL ?text= param
    await humanDelay(2000, 4000);

    // Step 3: Check if there's an error popup (invalid number, not on WhatsApp)
    const popupError = checkForErrorPopup();
    if (popupError) return popupError;

    // Step 4: Verify message text is actually in the compose box
    const hasText = composeBox.textContent.trim().length > 0;
    if (!hasText) {
      console.log("⚠️ Compose box is empty, waiting more...");
      await humanDelay(3000, 5000);
    }

    // Step 5: Simulate human behavior
    await simulateHumanBehavior();

    // Step 6: Find the SEND button using CORRECT selectors from actual WhatsApp HTML
    // Priority order based on YOUR HTML:
    //   1. button[aria-label="Send"]              — Most reliable
    //   2. span[data-icon="wds-ic-send-filled"]   — The icon inside button
    //   3. button[data-tab="11"]                  — Send button has data-tab="11"
    //   4. [data-testid="send"]                   — Legacy selector (may still work)

    let sendButton = null;

    // Try selector 1: button with aria-label "Send"
    sendButton = document.querySelector('button[aria-label="Send"]');

    // Try selector 2: icon inside button
    if (!sendButton) {
      const sendIcon = document.querySelector('span[data-icon="wds-ic-send-filled"]');
      if (sendIcon) {
        sendButton = sendIcon.closest("button") || sendIcon;
      }
    }

    // Try selector 3: data-tab="11" (Send button)
    if (!sendButton) {
      sendButton = document.querySelector('button[data-tab="11"]');
    }

    // Try selector 4: Legacy testid
    if (!sendButton) {
      const legacyIcon = document.querySelector('[data-testid="send"], span[data-icon="send"]');
      if (legacyIcon) {
        sendButton = legacyIcon.closest("button") || legacyIcon;
      }
    }

    // Step 7: Click the Send button
    if (sendButton) {
      console.log("✅ Send button found! Clicking...");
      await humanDelay(500, 1500);

      // Method 1: Realistic mouse event simulation
      simulateRealisticClick(sendButton);

      // Method 2: Direct .click() as backup (after a small delay)
      await humanDelay(300, 600);
      try { sendButton.click(); } catch(e) {}

      // Method 3: Focus and dispatch click event
      await humanDelay(200, 400);
      sendButton.focus();
      sendButton.dispatchEvent(new MouseEvent("click", {
        bubbles: true, cancelable: true, view: window
      }));

      // Wait for message to actually send
      await humanDelay(2000, 4000);

      console.log("✅ Send button clicked successfully!");
      return { success: true };

    } else {
      // ===== FALLBACK: Press Enter key on compose box =====
      console.log("⚠️ Send button not found, trying Enter key...");

      composeBox.focus();
      await humanDelay(500, 1000);

      // Dispatch Enter keydown event
      const enterDown = new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      });
      composeBox.dispatchEvent(enterDown);

      // Also dispatch keyup
      await humanDelay(50, 100);
      const enterUp = new KeyboardEvent("keyup", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      });
      composeBox.dispatchEvent(enterUp);

      await humanDelay(2000, 3000);

      console.log("✅ Enter key pressed on compose box.");
      return { success: true };
    }

  } catch (err) {
    console.error("❌ WA Bulk Sender handleClickSend error:", err);
    return { success: false, error: err.message };
  }
}

// ===== CHECK FOR ERROR POPUP =====
function checkForErrorPopup() {
  const selectors = [
    '[data-testid="popup-container"]',
    '[data-testid="confirm-popup"]',
    'div[data-animate-modal-popup="true"]',
    'div[role="dialog"]'
  ];

  for (const sel of selectors) {
    const popup = document.querySelector(sel);
    if (popup) {
      const text = popup.textContent.toLowerCase();
      if (text.includes("invalid") || text.includes("doesn't have") ||
          text.includes("not on whatsapp") || text.includes("phone number shared via url is not valid")) {
        console.log("❌ Invalid number popup detected");
        // Try to close the popup
        const btn = popup.querySelector("button");
        if (btn) btn.click();
        return { success: false, error: "Number not on WhatsApp" };
      }
    }
  }
  return null; // No error popup
}

// ===== WAIT FOR ELEMENT =====
function waitForElement(selector, timeout = 15000) {
  return new Promise((resolve) => {
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

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    }, timeout);
  });
}

// ===== HUMAN DELAY =====
function humanDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ===== SIMULATE HUMAN BEHAVIOR =====
async function simulateHumanBehavior() {
  // Random mouse movement
  document.dispatchEvent(new MouseEvent("mousemove", {
    clientX: Math.floor(Math.random() * window.innerWidth),
    clientY: Math.floor(Math.random() * window.innerHeight),
    bubbles: true
  }));
  await humanDelay(200, 600);

  // Occasional random scroll
  if (Math.random() > 0.6) {
    window.scrollBy(0, Math.random() * 30 - 15);
    await humanDelay(200, 400);
  }
}

// ===== REALISTIC CLICK =====
function simulateRealisticClick(element) {
  // Scroll into view first
  element.scrollIntoView({ behavior: "smooth", block: "center" });

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + (Math.random() * 6 - 3);
  const y = rect.top + rect.height / 2 + (Math.random() * 6 - 3);

  const opts = {
    clientX: x, clientY: y,
    bubbles: true, cancelable: true, view: window, button: 0
  };

  // Full realistic mouse event chain
  element.dispatchEvent(new PointerEvent("pointerenter", opts));
  element.dispatchEvent(new MouseEvent("mouseenter", opts));
  element.dispatchEvent(new PointerEvent("pointerover", opts));
  element.dispatchEvent(new MouseEvent("mouseover", opts));
  element.dispatchEvent(new PointerEvent("pointermove", opts));
  element.dispatchEvent(new MouseEvent("mousemove", opts));
  element.dispatchEvent(new PointerEvent("pointerdown", opts));
  element.dispatchEvent(new MouseEvent("mousedown", opts));
  element.dispatchEvent(new PointerEvent("pointerup", opts));
  element.dispatchEvent(new MouseEvent("mouseup", opts));
  element.dispatchEvent(new MouseEvent("click", opts));
}

// ===== KEEP ALIVE =====
setInterval(() => {
  document.dispatchEvent(new MouseEvent("mousemove", {
    clientX: Math.random() * 500,
    clientY: Math.random() * 500,
    bubbles: true
  }));
}, 120000);

console.log("🟢 WA Bulk Sender: Ready!");