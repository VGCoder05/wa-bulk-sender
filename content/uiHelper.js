// ============================================
// UI-HELPERS.JS — Find WhatsApp UI elements
// ============================================

/**
 * Find the text-flow Send button (in footer)
 */
function findSendButton() {
  let btn = document.querySelector('button[aria-label="Send"]');
  if (btn) return btn;

  const sendIcon = document.querySelector(
    'span[data-icon="wds-ic-send-filled"]'
  );
  if (sendIcon) {
    btn = sendIcon.closest("button") || sendIcon;
    if (btn) return btn;
  }

  const tab11 = document.querySelector('button[data-tab="11"]');
  if (tab11 && tab11.getAttribute("aria-label") === "Send") return tab11;

  const legacy = document.querySelector(
    '[data-testid="send"], span[data-icon="send"]'
  );
  if (legacy) return legacy.closest("button") || legacy;

  return null;
}

/**
 * Find the Attach (plus) button
 */
function findAttachButton() {
  let btn = document.querySelector('button[aria-label="Attach"]');
  if (btn) return btn;

  const plusIcon = document.querySelector('span[data-icon="plus-rounded"]');
  if (plusIcon) {
    btn = plusIcon.closest("button");
    if (btn) return btn;
  }

  const tab10Buttons = document.querySelectorAll('button[data-tab="10"]');
  for (const b of tab10Buttons) {
    const label = (b.getAttribute("aria-label") || "").toLowerCase();
    if (label.includes("attach") || label.includes("plus")) return b;
    if (b.querySelector('span[data-icon="plus-rounded"]')) return b;
  }

  const footerBtns = document.querySelectorAll(
    '#main footer button[aria-haspopup="menu"], footer button[aria-haspopup="menu"]'
  );
  if (footerBtns.length > 0) return footerBtns[0];

  return null;
}

/**
 * Find "Photos & videos" menu item in Attach dropdown
 */
async function findPhotosMenuItem(timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Method 1: aria-label exact
    let item = document.querySelector(
      'div[role="menu"][aria-label="Photos & videos"]'
    );
    if (item) return item;

    // Method 2: menuitem label matching
    const allMenuItems = document.querySelectorAll('div[role="menuitem"]');

    for (const mi of allMenuItems) {
      const label = (mi.getAttribute("aria-label") || "").toLowerCase();
      if (label.includes("photos") && label.includes("videos")) return mi;
      if (label.includes("photo")) return mi;
    }

    // Method 3: text content
    for (const mi of allMenuItems) {
      const text = mi.textContent.toLowerCase().trim();
      if (text.includes("photos") && text.includes("videos")) return mi;
    }

    // Method 4: SVG icon title
    const svgTitles = document.querySelectorAll(
      'div[role="menuitem"] svg title'
    );
    for (const titleEl of svgTitles) {
      const t = titleEl.textContent.toLowerCase();
      if (t.includes("filter") || t.includes("photo") || t.includes("image")) {
        const menuItem = titleEl.closest('div[role="menuitem"]');
        if (menuItem) return menuItem;
      }
    }

    // Method 5: position-based (first safe item)
    if (allMenuItems.length > 0) {
      const skipWords = ["sticker", "document", "camera", "poll", "contact"];
      for (let i = 0; i < Math.min(2, allMenuItems.length); i++) {
        const label = (
          allMenuItems[i].getAttribute("aria-label") || ""
        ).toLowerCase();
        if (!skipWords.some((w) => label.includes(w))) return allMenuItems[i];
      }
    }

    await humanDelay(300, 500);
  }

  return null;
}

/**
 * Find the hidden file input for photos/videos
 */
async function findPhotoFileInput(timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const allInputs = document.querySelectorAll('input[type="file"]');

    for (const input of allInputs) {
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      if (accept.includes("image/") || accept.includes("image/*")) return input;
    }

    for (const input of allInputs) {
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      if (accept.includes("video/") || accept.includes("*/*") || accept === "")
        return input;
    }

    if (allInputs.length === 1) return allInputs[0];
    if (allInputs.length > 0) return allInputs[0];

    await humanDelay(300, 500);
  }

  return null;
}

/**
 * Find Send button inside the media preview modal
 * NOTE: It's a <div role="button">, NOT a <button>!
 */
function findModalSendButton() {
  // div[role="button"] with aria-label="Send"
  const sendDivs = document.querySelectorAll(
    'div[role="button"][aria-label="Send"]'
  );
  if (sendDivs.length > 0) return sendDivs[sendDivs.length - 1];

  // By icon
  const sendIcons = document.querySelectorAll(
    'span[data-icon="wds-ic-send-filled"]'
  );
  if (sendIcons.length > 0) {
    const lastIcon = sendIcons[sendIcons.length - 1];
    return (
      lastIcon.closest('div[role="button"]') ||
      lastIcon.closest("button") ||
      lastIcon.parentElement?.parentElement ||
      lastIcon
    );
  }

  // Legacy
  const legacyIcons = document.querySelectorAll('span[data-icon="send"]');
  if (legacyIcons.length > 0) {
    const lastIcon = legacyIcons[legacyIcons.length - 1];
    return (
      lastIcon.closest('div[role="button"]') ||
      lastIcon.closest("button") ||
      lastIcon
    );
  }

  // Regular <button>
  const sendButtons = document.querySelectorAll('button[aria-label="Send"]');
  if (sendButtons.length > 0) return sendButtons[sendButtons.length - 1];

  // data-testid
  return (
    document.querySelector(
      '[data-testid="send-btn-container"] div[role="button"]'
    ) ||
    document.querySelector('[data-testid="send-btn-container"] button') ||
    null
  );
}

/**
 * Check if media preview modal is visible
 */
function isModalStillOpen() {
  const indicators = [
    'img[alt="Preview"]',
    '[aria-label="Remove attachment"]',
    '[data-testid="media-caption-input-container"]',
  ];
  return indicators.some((sel) => document.querySelector(sel));
}

/**
 * Check if the media preview modal has appeared
 */
async function checkModalAppeared(timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const indicators = [
      'img[alt="Preview"]',
      '[aria-label="Remove attachment"]',
      'div[role="button"][aria-label="Send"]',
      'div[contenteditable="true"][data-tab="undefined"]',
    ];

    for (const sel of indicators) {
      if (document.querySelector(sel)) return true;
    }

    await humanDelay(200, 400);
  }
  return false;
}

/**
 * Wait for the modal to close (image uploading)
 */
async function waitForModalClose(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const overlay = document.querySelector(
      'div.overlay, ' +
        '[data-testid="media-caption-input-container"], ' +
        'div[data-animate-modal-popup="true"]'
    );
    if (!overlay) {
      console.log("✅ Modal closed — image upload complete");
      return true;
    }
    await humanDelay(500, 800);
  }
  return false;
}

/**
 * Click the modal Send button using all fallback methods
 */
async function clickModalSend(modalSendBtn) {
  // Method 1: Realistic mouse events
  simulateRealisticClick(modalSendBtn);
  await humanDelay(500, 800);
  if (!isModalStillOpen()) return true;

  // Method 2: Direct .click()
  try { modalSendBtn.click(); } catch (e) {}
  await humanDelay(500, 800);
  if (!isModalStillOpen()) return true;

  // Method 3: MouseEvent dispatch
  modalSendBtn.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    })
  );
  await humanDelay(500, 800);
  if (!isModalStillOpen()) return true;

  // Method 4: Click inner icon
  const innerIcon = modalSendBtn.querySelector(
    'span[data-icon="wds-ic-send-filled"]'
  );
  if (innerIcon) {
    simulateRealisticClick(innerIcon);
    await humanDelay(300, 500);
    try { innerIcon.click(); } catch (e) {}
    await humanDelay(500, 800);
    if (!isModalStillOpen()) return true;
  }

  // Method 5: Focus + Enter
  modalSendBtn.focus();
  await humanDelay(200, 400);
  modalSendBtn.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", keyCode: 13, bubbles: true,
    })
  );
  modalSendBtn.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Enter", code: "Enter", keyCode: 13, bubbles: true,
    })
  );
  await humanDelay(500, 800);
  if (!isModalStillOpen()) return true;

  // Method 6: React handler
  try { triggerReactClick(modalSendBtn); } catch (e) {}

  await waitForModalClose(15000);
  return !isModalStillOpen();
}

console.log("  ✅ uiHelpers.js loaded");