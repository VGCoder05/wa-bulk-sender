// ============================================
// UTILS.JS — Shared utility functions
// ============================================

/**
 * Human-like random delay
 * @param {number} min - Minimum ms
 * @param {number} max - Maximum ms
 */
function humanDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Wait for a single DOM element to appear
 */
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

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    }, timeout);
  });
}

/**
 * Wait for ANY of several selectors to appear
 */
function waitForAnyElement(selectors, timeout = 15000) {
  return new Promise((resolve) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return resolve(el);
    }

    let resolved = false;

    const observer = new MutationObserver(() => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && !resolved) {
          resolved = true;
          observer.disconnect();
          resolve(el);
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return resolve(el);
        }
        resolve(null);
      }
    }, timeout);
  });
}

/**
 * Simulate realistic mouse click with full event chain
 */
function simulateRealisticClick(element) {
  try {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {}

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + (Math.random() * 6 - 3);
  const y = rect.top + rect.height / 2 + (Math.random() * 6 - 3);

  const opts = {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
  };

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

/**
 * Random mouse movement + optional scroll (anti-detection)
 */
async function simulateHumanBehavior() {
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      clientX: Math.floor(Math.random() * window.innerWidth),
      clientY: Math.floor(Math.random() * window.innerHeight),
      bubbles: true,
    })
  );
  await humanDelay(200, 600);

  if (Math.random() > 0.6) {
    window.scrollBy(0, Math.random() * 30 - 15);
    await humanDelay(200, 400);
  }
}

/**
 * Check for "invalid number" popups from WhatsApp
 */
function checkForErrorPopup() {
  const selectors = [
    '[data-testid="popup-container"]',
    '[data-testid="confirm-popup"]',
    'div[data-animate-modal-popup="true"]',
    'div[role="dialog"]',
  ];

  for (const sel of selectors) {
    const popup = document.querySelector(sel);
    if (popup) {
      const text = popup.textContent.toLowerCase();
      if (
        text.includes("invalid") ||
        text.includes("doesn't have") ||
        text.includes("not on whatsapp") ||
        text.includes("phone number shared via url is not valid")
      ) {
        console.log("❌ Invalid number popup detected");
        const btn = popup.querySelector("button");
        if (btn) btn.click();
        return { success: false, error: "Number not on WhatsApp" };
      }
    }
  }
  return null;
}

/**
 * Wait for the chat compose box to load
 * @returns {HTMLElement|null}
 */
async function waitForChatLoad(timeout = 25000) {
  const composeBox = await waitForElement(
    'div[contenteditable="true"][data-tab="10"][role="textbox"]',
    timeout
  );

  if (!composeBox) {
    const popupError = checkForErrorPopup();
    if (popupError) return { error: popupError };
    return { error: { success: false, error: "Chat did not load — compose box not found" } };
  }

  return { composeBox };
}

/**
 * Convert any image blob to PNG (required for clipboard API)
 */
function convertToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (pngBlob) => {
          if (pngBlob) resolve(pngBlob);
          else reject(new Error("Canvas toBlob returned null"));
        },
        "image/png"
      );
    };
    img.onerror = () =>
      reject(new Error("Failed to load image for conversion"));
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Read stored image from chrome.storage.local
 * @returns {{ blob: Blob, mimeType: string } | null}
 */
async function readImageFromStorage() {
  const imageData = await new Promise((resolve) => {
    chrome.storage.local.get(
      ["campaignImage", "campaignImageMime"],
      resolve
    );
  });

  if (!imageData.campaignImage) return null;

  const mimeType = imageData.campaignImageMime || "image/jpeg";
  const blob = await (await fetch(imageData.campaignImage)).blob();

  return { blob, mimeType };
}

/**
 * Try to trigger React's internal onClick handler
 */
function triggerReactClick(element) {
  const reactKey = Object.keys(element).find(
    (key) =>
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$") ||
      key.startsWith("__reactProps$")
  );

  if (reactKey) {
    let fiber = element[reactKey];
    let maxDepth = 15;

    while (fiber && maxDepth-- > 0) {
      if (
        fiber.memoizedProps &&
        typeof fiber.memoizedProps.onClick === "function"
      ) {
        fiber.memoizedProps.onClick(
          new MouseEvent("click", { bubbles: true })
        );
        return true;
      }
      if (
        fiber.pendingProps &&
        typeof fiber.pendingProps.onClick === "function"
      ) {
        fiber.pendingProps.onClick(
          new MouseEvent("click", { bubbles: true })
        );
        return true;
      }
      fiber = fiber.return || fiber._debugOwner;
    }
  }

  const propsKey = Object.keys(element).find((k) =>
    k.startsWith("__reactProps$")
  );
  if (propsKey) {
    const props = element[propsKey];
    if (props && typeof props.onClick === "function") {
      props.onClick(new MouseEvent("click", { bubbles: true }));
      return true;
    }
  }

  throw new Error("No React click handler found on element");
}

// ===== Keep-alive heartbeat =====
setInterval(() => {
  document.dispatchEvent(
    new MouseEvent("mousemove", {
      clientX: Math.random() * 500,
      clientY: Math.random() * 500,
      bubbles: true,
    })
  );
}, 120000);

console.log("  ✅ utils.js loaded");