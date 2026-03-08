// ============================================
// WA BULK SENDER — CONTENT SCRIPT (v2.1)
// Handles:
//   1) CLICK_SEND  — text flow (unchanged)
//   2) SEND_IMAGE  — FIXED: uses Attach button + file input
//
// FIX: ClipboardEvent("paste") can't carry real clipboardData
//      in Chrome (security restriction). New approach:
//      Click Attach → inject file into hidden <input> → trigger change
// ============================================

console.log("🟢 WA Bulk Sender: Content script loaded! (v2.1)");

// ===== MESSAGE LISTENER =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "PING") {
    sendResponse({ pong: true });
    return false;
  }

  if (message.type === "CLICK_SEND") {
    handleClickSend()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SEND_IMAGE") {
    handleSendImage(message.caption || "")
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

// ============================================
// ===== 1) TEXT FLOW: CLICK_SEND =============
// ===== (Your original code — unchanged) =====
// ============================================
async function handleClickSend() {
  try {
    console.log("📤 WA Bulk Sender: Looking for chat & send button...");

    const composeBox = await waitForElement(
      'div[contenteditable="true"][data-tab="10"][role="textbox"]',
      25000
    );

    if (!composeBox) {
      const popupError = checkForErrorPopup();
      if (popupError) return popupError;
      return { success: false, error: "Chat did not load — compose box not found" };
    }

    console.log("✅ Compose box found, chat loaded.");

    await humanDelay(2000, 4000);

    const popupError = checkForErrorPopup();
    if (popupError) return popupError;

    const hasText = composeBox.textContent.trim().length > 0;
    if (!hasText) {
      console.log("⚠️ Compose box is empty, waiting more...");
      await humanDelay(3000, 5000);
    }

    await simulateHumanBehavior();

    let sendButton = findSendButton();

    if (sendButton) {
      console.log("✅ Send button found! Clicking...");
      await humanDelay(500, 1500);

      simulateRealisticClick(sendButton);

      await humanDelay(300, 600);
      try { sendButton.click(); } catch(e) {}

      await humanDelay(200, 400);
      sendButton.focus();
      sendButton.dispatchEvent(new MouseEvent("click", {
        bubbles: true, cancelable: true, view: window
      }));

      await humanDelay(2000, 4000);

      console.log("✅ Send button clicked successfully!");
      return { success: true };

    } else {
      console.log("⚠️ Send button not found, trying Enter key...");

      composeBox.focus();
      await humanDelay(500, 1000);

      composeBox.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      }));

      await humanDelay(50, 100);

      composeBox.dispatchEvent(new KeyboardEvent("keyup", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      }));

      await humanDelay(2000, 3000);
      return { success: true };
    }

  } catch (err) {
    console.error("❌ handleClickSend error:", err);
    return { success: false, error: err.message };
  }
}

// ============================================
// ===== 2) IMAGE FLOW: SEND_IMAGE ============
// ============================================
//
// WHY PASTE DOESN'T WORK:
//   Chrome blocks synthetic ClipboardEvent from carrying
//   real clipboardData. The browser ignores the data for
//   security. So new ClipboardEvent("paste", { clipboardData })
//   results in an empty paste → WhatsApp ignores it.
//
// FIX — USE THE ATTACH BUTTON + FILE INPUT:
//   1. Wait for chat to load
//   2. Read image from chrome.storage.local
//   3. Convert base64 → File
//   4. Click the Attach (plus) button
//   5. Wait for the dropdown menu to appear
//   6. Find the hidden <input type="file"> for Photos & Videos
//   7. Inject our File into the input via DataTransfer
//   8. Dispatch "change" event → WhatsApp opens media preview
//   9. Type caption in the preview modal
//  10. Click Send in the modal

// ===== v2.3 — Fixed caption typing ===========
// ============================================

// ============================================
// ===== 2) IMAGE FLOW: SEND_IMAGE ============
// ===== v3.0 — Real Clipboard Paste ===========
// ============================================
//
// WHY THE OLD PASTE FAILED:
//   new ClipboardEvent("paste", { clipboardData }) ← Chrome STRIPS clipboardData
//   The synthetic event arrives empty → WhatsApp ignores it.
//
// WHY THIS WORKS:
//   1. navigator.clipboard.write() → writes image to REAL system clipboard
//   2. document.execCommand('paste') → reads from REAL clipboard
//   3. WhatsApp sees a real image paste → opens media preview modal
//
// This is fundamentally different — we're using the REAL clipboard,
// not faking a ClipboardEvent with synthetic data.
//
// Requires: "clipboardWrite" + "clipboardRead" in manifest.json
// ============================================

// ============================================
// ===== 2) IMAGE FLOW: SEND_IMAGE ============
// ===== v3.1 — Fixed Focus Issue =============
// ============================================

async function handleSendImage(captionText) {
  try {
    console.log("🖼️ Starting image send (v3.1)...");

    // Step 1: Wait for chat
    const composeBox = await waitForElement(
      'div[contenteditable="true"][data-tab="10"][role="textbox"]',
      25000
    );

    if (!composeBox) {
      const popupError = checkForErrorPopup();
      if (popupError) return popupError;
      return { success: false, error: "Chat did not load" };
    }

    console.log("✅ Chat loaded.");

    const popupError = checkForErrorPopup();
    if (popupError) return popupError;

    await humanDelay(1000, 2000);

    // Step 2: Read image from storage
    console.log("📦 Reading image from storage...");
    const imageData = await new Promise(resolve => {
      chrome.storage.local.get(["campaignImage", "campaignImageMime"], resolve);
    });

    if (!imageData.campaignImage) {
      return { success: false, error: "No image in storage" };
    }

    const mimeType = imageData.campaignImageMime || "image/jpeg";
    console.log(`✅ Image loaded (${mimeType})`);

    // Step 3: Convert to blob
    const blob = await (await fetch(imageData.campaignImage)).blob();
    console.log(`✅ Blob: ${(blob.size / 1024).toFixed(1)} KB`);

    // Step 4: Convert to PNG for clipboard compatibility
    console.log("🔄 Converting to PNG...");
    let clipboardBlob = blob;
    if (mimeType !== "image/png") {
      clipboardBlob = await convertToPng(blob);
      console.log(`✅ PNG: ${(clipboardBlob.size / 1024).toFixed(1)} KB`);
    }

    // ===== CRITICAL: Ensure document focus before clipboard write =====
    console.log("🎯 Ensuring document focus...");
    
    // Click on compose box to get focus
    composeBox.focus();
    await humanDelay(100, 200);
    simulateRealisticClick(composeBox);
    await humanDelay(200, 400);
    composeBox.focus();
    await humanDelay(100, 200);
    
    // Double-check we have focus
    if (!document.hasFocus()) {
      console.log("⚠️ Document not focused, clicking window...");
      // Try clicking on main area
      const main = document.querySelector('#main') || document.body;
      simulateRealisticClick(main);
      await humanDelay(300, 500);
      composeBox.focus();
      await humanDelay(200, 300);
    }

    // Step 5: Write to clipboard with retry logic
    console.log("📋 Writing to clipboard...");
    
    let clipboardWriteSuccess = false;
    let lastClipboardError = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Ensure focus before each attempt
        composeBox.focus();
        await humanDelay(50, 100);
        
        if (!document.hasFocus()) {
          console.log(`  Attempt ${attempt}: No focus, clicking...`);
          window.focus();
          composeBox.click();
          composeBox.focus();
          await humanDelay(200, 400);
        }
        
        console.log(`  Attempt ${attempt}: Writing to clipboard...`);
        
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": clipboardBlob })
        ]);
        
        console.log(`✅ Clipboard write succeeded on attempt ${attempt}!`);
        clipboardWriteSuccess = true;
        break;
        
      } catch (clipErr) {
        lastClipboardError = clipErr;
        console.log(`  Attempt ${attempt} failed: ${clipErr.message}`);
        
        if (attempt < 3) {
          // Wait and regain focus
          await humanDelay(500, 800);
          window.focus();
          simulateRealisticClick(composeBox);
          composeBox.focus();
          await humanDelay(300, 500);
        }
      }
    }
    
    if (!clipboardWriteSuccess) {
      console.error("❌ All clipboard write attempts failed:", lastClipboardError?.message);
      return { success: false, error: "Clipboard write failed: " + (lastClipboardError?.message || "Unknown error") };
    }

    // Step 6: Paste into compose box
    console.log("📋 Pasting into chat...");
    
    composeBox.focus();
    await humanDelay(200, 400);
    simulateRealisticClick(composeBox);
    await humanDelay(200, 400);
    composeBox.focus();
    await humanDelay(100, 200);

    let modalAppeared = false;

    // Method 1: execCommand paste
    console.log("  Paste method 1: execCommand...");
    try { 
      const result = document.execCommand('paste');
      console.log(`  execCommand returned: ${result}`);
    } catch (e) {
      console.log(`  execCommand threw: ${e.message}`);
    }
    await humanDelay(800, 1200);
    modalAppeared = await checkModalAppeared(3000);

    // Method 2: Ctrl+V
    if (!modalAppeared) {
      console.log("  Paste method 2: Ctrl+V...");
      composeBox.focus();
      await humanDelay(100, 200);
      
      composeBox.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'v', code: 'KeyV', keyCode: 86,
        ctrlKey: true, bubbles: true, cancelable: true
      }));
      composeBox.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'v', code: 'KeyV', keyCode: 86,
        ctrlKey: true, bubbles: true, cancelable: true
      }));
      
      await humanDelay(800, 1200);
      modalAppeared = await checkModalAppeared(3000);
    }

    // Method 3: Cmd+V (Mac)
    if (!modalAppeared) {
      console.log("  Paste method 3: Cmd+V...");
      composeBox.focus();
      await humanDelay(100, 200);
      
      composeBox.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'v', code: 'KeyV', keyCode: 86,
        metaKey: true, bubbles: true, cancelable: true
      }));
      composeBox.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'v', code: 'KeyV', keyCode: 86,
        metaKey: true, bubbles: true, cancelable: true
      }));
      
      await humanDelay(800, 1200);
      modalAppeared = await checkModalAppeared(3000);
    }

    // Method 4: Paste event with clipboard data
    if (!modalAppeared) {
      console.log("  Paste method 4: ClipboardEvent...");
      try {
        const clipItems = await navigator.clipboard.read();
        if (clipItems.length > 0 && clipItems[0].types.includes('image/png')) {
          const imgBlob = await clipItems[0].getType('image/png');
          const file = new File([imgBlob], 'image.png', { type: 'image/png' });
          const dt = new DataTransfer();
          dt.items.add(file);

          composeBox.focus();
          await humanDelay(100, 200);

          const pasteEvt = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
          });

          // Try on compose box
          composeBox.dispatchEvent(pasteEvt);
          await humanDelay(500, 800);
          
          if (!await checkModalAppeared(1500)) {
            // Try on #main
            const main = document.querySelector('#main');
            if (main) {
              const pasteEvt2 = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dt
              });
              main.dispatchEvent(pasteEvt2);
            }
          }
          
          await humanDelay(500, 800);
          modalAppeared = await checkModalAppeared(2000);
        }
      } catch (e) {
        console.log(`  ClipboardEvent method failed: ${e.message}`);
      }
    }

    if (!modalAppeared) {
      return { success: false, error: "Image paste failed — modal did not appear" };
    }

    console.log("✅ Modal appeared!");
    await humanDelay(2000, 3000);

    // Step 7: Type caption
    if (captionText && captionText.trim()) {
      console.log("✏️ Finding caption input...");
      const captionInput = await findCaptionInput(8000);

      if (captionInput) {
        const typed = await typeInCaptionInput(captionInput, captionText);
        console.log(typed ? "✅ Caption typed!" : "⚠️ Caption may not have typed correctly");
        await humanDelay(800, 1200);
      } else {
        console.log("⚠️ Caption input not found");
      }
    }

    // Step 8: Click send
    console.log("🔍 Finding modal send button...");
    await humanDelay(500, 800);

    let sendBtn = findModalSendButton();
    if (!sendBtn) {
      await humanDelay(1000, 2000);
      sendBtn = findModalSendButton();
    }

    if (sendBtn) {
      console.log("✅ Send button found!");
      const sent = await clickModalSend(sendBtn);
      if (sent) {
        console.log("✅ Image sent!");
        await humanDelay(2000, 3000);
        return { success: true };
      }
      return { success: false, error: "Send click failed" };
    }

    return { success: false, error: "Send button not found in modal" };

  } catch (err) {
    console.error("❌ handleSendImage error:", err);
    return { success: false, error: err.message };
  }
}

// ============================================
// ===== CONVERT BLOB TO PNG ==================
// ============================================
// Clipboard API works best with image/png
// This converts JPG/WEBP/GIF to PNG via canvas

function convertToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error("Canvas toBlob returned null"));
        }
      }, 'image/png');
    };
    img.onerror = () => reject(new Error("Failed to load image for conversion"));
    img.src = URL.createObjectURL(blob);
  });
}

// ============================================
// ===== CHECK IF MODAL APPEARED ==============
// ============================================

async function checkModalAppeared(timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const indicators = [
      'img[alt="Preview"]',
      '[aria-label="Remove attachment"]',
      'div[role="button"][aria-label="Send"]',
      // Also check for the caption input (data-tab="undefined")
      'div[contenteditable="true"][data-tab="undefined"]'
    ];

    for (const sel of indicators) {
      if (document.querySelector(sel)) return true;
    }

    await humanDelay(200, 400);
  }
  return false;
}

// ============================================
// ===== FALLBACK: ATTACH BUTTON METHOD =======
// ============================================
// If clipboard paste doesn't work, fall back to
// clicking Attach → Photos & videos → file input

async function handleSendImageViaAttach(captionText, blob, mimeType) {
  try {
    console.log("📎 Fallback: Using Attach button method...");

    let ext = "jpg";
    if (mimeType.includes("png")) ext = "png";
    else if (mimeType.includes("gif")) ext = "gif";
    else if (mimeType.includes("webp")) ext = "webp";

    const file = new File([blob], `image.${ext}`, { type: mimeType });

    // Click Attach button
    const attachBtn = findAttachButton();
    if (!attachBtn) {
      return { success: false, error: "Fallback: Attach button not found" };
    }

    simulateRealisticClick(attachBtn);
    await humanDelay(200, 400);
    try { attachBtn.click(); } catch (e) {}
    await humanDelay(800, 1500);

    // Click "Photos & videos" menu item
    const photosMenuItem = await findPhotosMenuItem(5000);

    if (!photosMenuItem) {
      // Retry
      simulateRealisticClick(attachBtn);
      await humanDelay(300, 500);
      try { attachBtn.click(); } catch (e) {}
      await humanDelay(1000, 2000);

      const retryItem = await findPhotosMenuItem(5000);
      if (!retryItem) {
        return { success: false, error: "Fallback: Photos & videos menu item not found" };
      }

      simulateRealisticClick(retryItem);
      await humanDelay(200, 400);
      try { retryItem.click(); } catch (e) {}
    } else {
      simulateRealisticClick(photosMenuItem);
      await humanDelay(200, 400);
      try { photosMenuItem.click(); } catch (e) {}
    }

    await humanDelay(800, 1500);

    // Find file input
    const fileInput = await findPhotoFileInput(5000);
    if (!fileInput) {
      return { success: false, error: "Fallback: File input not found" };
    }

    // Inject file
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Wait for modal
    const modalIndicatorSelectors = [
      'img[alt="Preview"]',
      '[aria-label="Remove attachment"]',
      'div[role="button"][aria-label="Send"]'
    ];

    const modalEl = await waitForAnyElement(modalIndicatorSelectors, 15000);
    if (!modalEl) {
      return { success: false, error: "Fallback: Media preview modal did not appear" };
    }

    console.log("✅ Fallback: Modal appeared!");
    await humanDelay(2000, 3000);

    // Type caption
    if (captionText && captionText.trim()) {
      const captionInput = await findCaptionInput(8000);
      if (captionInput) {
        await typeInCaptionInput(captionInput, captionText);
        await humanDelay(800, 1200);
      }
    }

    // Click send
    await humanDelay(500, 800);
    const modalSendBtn = findModalSendButton();
    if (modalSendBtn) {
      const sent = await clickModalSend(modalSendBtn);
      if (sent) {
        console.log("✅ Fallback: Image sent successfully!");
        await humanDelay(2000, 3000);
        return { success: true };
      }
    }

    return { success: false, error: "Fallback: Send failed" };

  } catch (err) {
    console.error("❌ Fallback handleSendImageViaAttach error:", err);
    return { success: false, error: err.message };
  }
}

// ============================================
// ===== CAPTION INPUT FINDER =================
// ============================================
// WhatsApp's media preview modal has a caption input that is a
// contenteditable div. It is SEPARATE from the main compose box
// (which has data-tab="10"). The caption input typically:
//   - Has contenteditable="true"
//   - Has role="textbox"
//   - Does NOT have data-tab="10"
//   - Has a placeholder like "Add a caption..." or "Type a message"
//   - Appears INSIDE the modal overlay

// ===== (v2.4) ==========
// ============================================
// From YOUR actual HTML the caption input is:
//   <div contenteditable="true"
//        data-lexical-editor="true"
//        data-tab="undefined"           ← KEY! Literal string "undefined"
//        role="textbox"
//        aria-placeholder="Type a message"
//        aria-label="Type a message"
//        style="max-height: 7.35em; ...">
//
// The MAIN compose box has data-tab="10"
// The CAPTION input has data-tab="undefined"
// ============================================

async function findCaptionInput(timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {

    // ===== Method 1 (BEST): Exact match from YOUR HTML =====
    // data-tab="undefined" is a LITERAL string — not a missing attribute
    let el = document.querySelector(
      'div[contenteditable="true"][data-lexical-editor="true"][data-tab="undefined"]'
    );
    if (el) {
      console.log('  ✅ Found caption input via data-tab="undefined"');
      return el;
    }

    // ===== Method 2: contenteditable with max-height 7.35em =====
    // Caption has max-height: 7.35em; Main compose has 11.76em
    const allEditable = document.querySelectorAll(
      'div[contenteditable="true"][data-lexical-editor="true"]'
    );
    for (const ed of allEditable) {
      if (ed.getAttribute('data-tab') === '10') continue; // Skip main compose
      if (ed.closest('footer')) continue; // Skip footer elements
      console.log('  ✅ Found caption input via non-tab-10 Lexical editor');
      return ed;
    }

    // ===== Method 3: Any contenteditable textbox that is NOT data-tab="10" =====
    const allTextboxes = document.querySelectorAll(
      'div[contenteditable="true"][role="textbox"]'
    );
    for (const tb of allTextboxes) {
      const tabVal = tb.getAttribute('data-tab');
      if (tabVal === '10') continue; // Skip main compose box
      if (tb.closest('footer')) continue;
      console.log(`  ✅ Found caption input via non-10 textbox (data-tab="${tabVal}")`);
      return tb;
    }

    // ===== Method 4: testid based =====
    const testIdSelectors = [
      '[data-testid="media-caption-input-container"] div[contenteditable="true"]',
      '[data-testid="media-caption-input"] div[contenteditable="true"]'
    ];
    for (const sel of testIdSelectors) {
      el = document.querySelector(sel);
      if (el) {
        console.log('  ✅ Found caption input via testid:', sel);
        return el;
      }
    }

    // ===== Method 5: Second contenteditable on page =====
    // When modal is open there are TWO contenteditable textboxes:
    //   [0] = main compose (data-tab="10")
    //   [1] = caption (data-tab="undefined")
    const allCE = document.querySelectorAll(
      'div[contenteditable="true"][role="textbox"]'
    );
    if (allCE.length >= 2) {
      for (let i = allCE.length - 1; i >= 0; i--) {
        if (allCE[i].getAttribute('data-tab') !== '10') {
          console.log(`  ✅ Found caption input as textbox [${i}] of ${allCE.length}`);
          return allCE[i];
        }
      }
    }

    await humanDelay(300, 500);
  }

  // ===== FINAL DEBUG: log everything for troubleshooting =====
  console.log('  ❌ Caption input not found after timeout. Debug info:');
  debugLogEditables();
  return null;
}

// ============================================
// ===== ROBUST CAPTION TYPING ================
// ============================================
// WhatsApp uses Facebook's Lexical editor.
// document.execCommand('insertText') doesn't always work.
// We try multiple methods and VERIFY the text was inserted.

// ===== (v2.4) =========
// ============================================
// WhatsApp uses Facebook's Lexical rich text editor.
// The caption input from YOUR HTML:
//   - Has class "lexical-rich-text-input" on parent
//   - Contains <p class="_aupe copyable-text ..."><br></p>
//   - data-lexical-editor="true"
//
// Key insight: We must NOT destroy the <p> element inside.
// Lexical expects its internal paragraph structure to remain.
// We click inside the <p>, then use execCommand to insert text.
// ============================================

async function typeInCaptionInput(captionInput, text) {

  console.log(`  Caption input details: tag=${captionInput.tagName} data-tab="${captionInput.getAttribute('data-tab')}" data-lexical="${captionInput.getAttribute('data-lexical-editor')}"`);
  console.log(`  Text to type: "${text.substring(0, 50)}..." (${text.length} chars)`);

  // ===== STEP A: Focus properly =====
  // Click into the <p> inside the editor, NOT the editor div itself
  const paragraph = captionInput.querySelector('p') || captionInput;

  // Simulate clicking inside the input
  captionInput.focus();
  await humanDelay(200, 400);

  simulateRealisticClick(paragraph);
  await humanDelay(300, 500);

  // Make sure it's focused
  captionInput.focus();
  await humanDelay(200, 300);

  // Verify focus
  const isFocused = document.activeElement === captionInput ||
                    captionInput.contains(document.activeElement);
  console.log(`  Focus status: ${isFocused ? '✅ focused' : '❌ NOT focused'}`);

  if (!isFocused) {
    // Force focus
    captionInput.click();
    captionInput.focus();
    await humanDelay(300, 500);
  }

  // ===== STEP B: Try Method 1 — execCommand line by line =====
  console.log('  Trying Method 1: execCommand insertText...');

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      // Shift+Enter for new line in WhatsApp
      const shiftEnterDown = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      captionInput.dispatchEvent(shiftEnterDown);
      await humanDelay(50, 100);

      const shiftEnterUp = new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      captionInput.dispatchEvent(shiftEnterUp);
      await humanDelay(50, 100);
    }

    // Insert this line's text
    if (lines[i].length > 0) {
      document.execCommand('insertText', false, lines[i]);
    }
    await humanDelay(30, 60);
  }

  await humanDelay(500, 800);

  // Check if it worked
  if (verifyCaption(captionInput, text)) {
    console.log('  ✅ Method 1 (execCommand) worked!');
    return true;
  }

  console.log(`  ⚠️ Method 1 result: "${captionInput.textContent.substring(0, 50)}"`);
  console.log('  Trying Method 2: InputEvent...');

  // ===== STEP C: Method 2 — InputEvent API =====
  // First clear what Method 1 might have done
  captionInput.focus();
  await humanDelay(200, 300);
  document.execCommand('selectAll');
  await humanDelay(100, 200);
  document.execCommand('delete');
  await humanDelay(300, 500);

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      // New line via InputEvent
      captionInput.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertLineBreak',
        bubbles: true,
        cancelable: true,
        composed: true
      }));
      captionInput.dispatchEvent(new InputEvent('input', {
        inputType: 'insertLineBreak',
        bubbles: true,
        cancelable: false,
        composed: true
      }));
      await humanDelay(50, 100);
    }

    if (lines[i].length > 0) {
      // Insert text via InputEvent
      captionInput.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: lines[i],
        bubbles: true,
        cancelable: true,
        composed: true
      }));
      captionInput.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText',
        data: lines[i],
        bubbles: true,
        cancelable: false,
        composed: true
      }));
    }
    await humanDelay(30, 60);
  }

  await humanDelay(500, 800);

  if (verifyCaption(captionInput, text)) {
    console.log('  ✅ Method 2 (InputEvent) worked!');
    return true;
  }

  console.log(`  ⚠️ Method 2 result: "${captionInput.textContent.substring(0, 50)}"`);
  console.log('  Trying Method 3: character-by-character...');

  // ===== STEP D: Method 3 — Character by character =====
  captionInput.focus();
  await humanDelay(200, 300);
  document.execCommand('selectAll');
  await humanDelay(100, 200);
  document.execCommand('delete');
  await humanDelay(300, 500);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\n') {
      // Shift+Enter
      captionInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13,
        shiftKey: true, bubbles: true, cancelable: true
      }));
      await humanDelay(30, 50);

      document.execCommand('insertLineBreak');

      captionInput.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13,
        shiftKey: true, bubbles: true, cancelable: true
      }));
    } else {
      // Single character
      const keyCode = char.charCodeAt(0);

      captionInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: char, keyCode: keyCode, bubbles: true
      }));

      document.execCommand('insertText', false, char);

      captionInput.dispatchEvent(new KeyboardEvent('keyup', {
        key: char, keyCode: keyCode, bubbles: true
      }));
    }

    // Small delay every 5 chars (human-like)
    if (i % 5 === 0) await humanDelay(10, 25);
  }

  await humanDelay(500, 800);

  if (verifyCaption(captionInput, text)) {
    console.log('  ✅ Method 3 (char-by-char) worked!');
    return true;
  }

  console.log(`  ⚠️ Method 3 result: "${captionInput.textContent.substring(0, 50)}"`);
  console.log('  Trying Method 4: Clipboard paste...');

  // ===== STEP E: Method 4 — Clipboard API (real clipboard write + paste) =====
  // This is the nuclear option — write to actual clipboard, then trigger paste
  captionInput.focus();
  await humanDelay(200, 300);
  document.execCommand('selectAll');
  await humanDelay(100, 200);
  document.execCommand('delete');
  await humanDelay(300, 500);

  try {
    // Write text to actual system clipboard
    await navigator.clipboard.writeText(text);
    await humanDelay(200, 400);

    // Now trigger Ctrl+V / Cmd+V paste
    captionInput.focus();
    await humanDelay(100, 200);

    // Dispatch Ctrl+V keydown
    captionInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'v',
      code: 'KeyV',
      keyCode: 86,
      which: 86,
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    }));

    // Also try execCommand paste
    document.execCommand('paste');

    await humanDelay(500, 800);

    if (verifyCaption(captionInput, text)) {
      console.log('  ✅ Method 4 (clipboard paste) worked!');
      return true;
    }
  } catch (clipErr) {
    console.log('  Clipboard API not available:', clipErr.message);
  }

  console.log(`  ⚠️ Method 4 result: "${captionInput.textContent.substring(0, 50)}"`);
  console.log('  Trying Method 5: Direct DOM + Lexical reconcile...');

  // ===== STEP F: Method 5 — Direct DOM manipulation for Lexical =====
  // Lexical stores its state internally, but it reconciles from DOM on certain events.
  // We directly set the paragraph content, then trigger Lexical's reconciliation.

  captionInput.focus();
  await humanDelay(200, 300);

  // Lexical uses <p> elements for paragraphs
  // The initial state is: <p class="_aupe copyable-text ..."><br></p>
  // We need to replace the content while keeping the <p> wrapper

  const existingP = captionInput.querySelector('p');

  if (existingP) {
    // Build content: each line as text, separated by <br> for multi-line
    // For Lexical, each paragraph should ideally be its own <p>
    // But for a single block, we can use <br> within one <p>

    // Clear the paragraph
    existingP.innerHTML = '';

    // Build the HTML content
    const htmlLines = text.split('\n');
    for (let i = 0; i < htmlLines.length; i++) {
      if (i > 0) {
        existingP.appendChild(document.createElement('br'));
      }
      if (htmlLines[i].length > 0) {
        existingP.appendChild(document.createTextNode(htmlLines[i]));
      }
    }
  } else {
    // No <p> found — just set textContent
    captionInput.textContent = text;
  }

  // Now trigger events to make Lexical pick up the change
  // Lexical listens for 'input' events on the contenteditable
  captionInput.dispatchEvent(new Event('input', { bubbles: true }));
  await humanDelay(100, 200);
  captionInput.dispatchEvent(new Event('change', { bubbles: true }));
  await humanDelay(100, 200);

  // Also dispatch a compositionend (Lexical uses this for IME)
  captionInput.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  captionInput.dispatchEvent(new CompositionEvent('compositionend', {
    data: text,
    bubbles: true
  }));
  await humanDelay(200, 300);

  // Try to trigger Lexical's internal update via React props
  try {
    const propsKey = Object.keys(captionInput).find(k => k.startsWith('__reactProps$'));
    if (propsKey && captionInput[propsKey]) {
      const props = captionInput[propsKey];
      if (typeof props.onInput === 'function') {
        props.onInput({ target: captionInput, currentTarget: captionInput });
      }
      if (typeof props.onCompositionEnd === 'function') {
        props.onCompositionEnd({ target: captionInput, data: text });
      }
    }
  } catch (e) {}

  await humanDelay(500, 800);

  if (verifyCaption(captionInput, text)) {
    console.log('  ✅ Method 5 (DOM + Lexical) worked!');
    return true;
  }

  console.log(`  ⚠️ Method 5 result: "${captionInput.textContent.substring(0, 50)}"`);
  console.log('  Trying Method 6: Selection + insertText...');

  // ===== STEP G: Method 6 — Selection API + execCommand =====
  // Set caret position explicitly, then insert

  captionInput.focus();
  await humanDelay(200, 300);

  // Select all existing content and delete
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(captionInput);
  selection.removeAllRanges();
  selection.addRange(range);
  await humanDelay(100, 200);
  document.execCommand('delete');
  await humanDelay(300, 500);

  // Now place cursor at start
  const newRange = document.createRange();
  const targetNode = captionInput.querySelector('p') || captionInput;
  newRange.setStart(targetNode, 0);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);
  await humanDelay(100, 200);

  // Insert text
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      document.execCommand('insertLineBreak');
      await humanDelay(50, 100);
    }
    if (lines[i].length > 0) {
      document.execCommand('insertText', false, lines[i]);
    }
    await humanDelay(30, 60);
  }

  await humanDelay(500, 800);

  if (verifyCaption(captionInput, text)) {
    console.log('  ✅ Method 6 (Selection API) worked!');
    return true;
  }

  // ===== ALL METHODS FAILED =====
  console.log('  ❌ ALL caption typing methods failed.');
  console.log(`  Final captionInput.textContent: "${captionInput.textContent}"`);
  console.log(`  Final captionInput.innerHTML: "${captionInput.innerHTML.substring(0, 200)}"`);
  debugLogEditables();

  return false;
}

// ===== VERIFY CAPTION WAS TYPED =====
function verifyCaption(captionInput, expectedText) {
  const actual = captionInput.textContent.trim();
  if (actual.length === 0) return false;

  // Check if first 15 chars of first line are present
  const firstLine = expectedText.split('\n')[0].trim();
  const checkStr = firstLine.substring(0, Math.min(15, firstLine.length));

  if (checkStr.length > 0 && actual.includes(checkStr)) return true;

  // Check length: at least 30% of expected
  if (actual.length >= expectedText.trim().length * 0.3) return true;

  return false;
}

// ===== DEBUG: Log all editables on page =====
function debugLogEditables() {
  const allEditable = document.querySelectorAll('div[contenteditable="true"]');
  console.log(`  DEBUG: Found ${allEditable.length} contenteditable elements:`);
  allEditable.forEach((el, i) => {
    const tab = el.getAttribute('data-tab');
    const role = el.getAttribute('role');
    const lexical = el.getAttribute('data-lexical-editor');
    const ariaLabel = el.getAttribute('aria-label');
    const ariaPlaceholder = el.getAttribute('aria-placeholder');
    const maxH = el.style.maxHeight;
    const inFooter = el.closest('footer') ? 'IN_FOOTER' : '';
    const text = el.textContent.substring(0, 30);
    console.log(
      `    [${i}] data-tab="${tab}" role="${role}" lexical=${lexical} ` +
      `aria-label="${ariaLabel}" placeholder="${ariaPlaceholder}" ` +
      `maxH="${maxH}" ${inFooter} text="${text}"`
    );
  });
}

// ============================================
// ===== CLICK MODAL SEND (all methods) =======
// ============================================

async function clickModalSend(modalSendBtn) {

  // Method 1: Realistic mouse events
  simulateRealisticClick(modalSendBtn);
  console.log("  → Click method 1 (realistic) done");
  await humanDelay(500, 800);
  if (!isModalStillOpen()) return true;

  // Method 2: Direct .click()
  try { modalSendBtn.click(); } catch (e) {}
  console.log("  → Click method 2 (direct) done");
  await humanDelay(500, 800);
  if (!isModalStillOpen()) return true;

  // Method 3: MouseEvent dispatch
  modalSendBtn.dispatchEvent(new MouseEvent("click", {
    bubbles: true, cancelable: true, view: window
  }));
  console.log("  → Click method 3 (MouseEvent) done");
  await humanDelay(500, 800);
  if (!isModalStillOpen()) return true;

  // Method 4: Click inner icon
  const innerIcon = modalSendBtn.querySelector('span[data-icon="wds-ic-send-filled"]');
  if (innerIcon) {
    simulateRealisticClick(innerIcon);
    await humanDelay(300, 500);
    try { innerIcon.click(); } catch (e) {}
    console.log("  → Click method 4 (icon) done");
    await humanDelay(500, 800);
    if (!isModalStillOpen()) return true;
  }

  // Method 5: Focus + Enter
  modalSendBtn.focus();
  await humanDelay(200, 400);
  modalSendBtn.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter", code: "Enter", keyCode: 13, bubbles: true
  }));
  modalSendBtn.dispatchEvent(new KeyboardEvent("keyup", {
    key: "Enter", code: "Enter", keyCode: 13, bubbles: true
  }));
  console.log("  → Click method 5 (Enter) done");
  await humanDelay(500, 800);
  if (!isModalStillOpen()) return true;

  // Method 6: React handler
  try {
    triggerReactClick(modalSendBtn);
    console.log("  → Click method 6 (React) done");
  } catch (e) {
    console.log("  → Click method 6 failed:", e.message);
  }

  // Final wait
  await waitForModalClose(15000);
  return !isModalStillOpen();
}

// ============================================
// ===== IMAGE HELPER FUNCTIONS ===============
// ============================================

// ===== FIND ATTACH (PLUS) BUTTON =====
// From your HTML: button[aria-label="Attach"] with span[data-icon="plus-rounded"]
function findAttachButton() {
  // Method 1: aria-label
  let btn = document.querySelector('button[aria-label="Attach"]');
  if (btn) return btn;

  // Method 2: plus icon
  const plusIcon = document.querySelector('span[data-icon="plus-rounded"]');
  if (plusIcon) {
    btn = plusIcon.closest('button');
    if (btn) return btn;
  }

  // Method 3: The attach button has data-tab="10" but is NOT the compose box
  // (compose box is a div, attach is a button)
  const tab10Buttons = document.querySelectorAll('button[data-tab="10"]');
  for (const b of tab10Buttons) {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('attach') || label.includes('plus')) return b;
    // Check if it contains the plus icon
    if (b.querySelector('span[data-icon="plus-rounded"]')) return b;
  }

  // Method 4: First button in the footer with aria-haspopup="menu"
  const footerBtns = document.querySelectorAll('#main footer button[aria-haspopup="menu"], footer button[aria-haspopup="menu"]');
  if (footerBtns.length > 0) return footerBtns[0];

  return null;
}

// ============================================
// ===== FIND "Photos & videos" MENU ITEM =====
// ============================================
// After clicking the Attach (plus) button, a dropdown menu appears with items:
//   - Photos & videos     ← WE WANT THIS ONE
//   - Camera
//   - Document
//   - Contact
//   - New sticker         ← This was being clicked by mistake!
//   - Poll
//
// From YOUR HTML:
//   <div aria-label="Photos &amp; videos" role="menuitem">
//     <span>Photos &amp; videos</span>
//   </div>
//
// The old code skipped this menu entirely and looked for <input type="file">
// directly, which either didn't exist yet or picked the wrong one.
// ============================================

async function findPhotosMenuItem(timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {

    // ===== Method 1 (BEST): aria-label exact match =====
    // In HTML entities: "Photos &amp; videos" but in DOM it's "Photos & videos"
    let item = document.querySelector('div[role="menu"][aria-label="Photos & videos"]');
    console.log(`In findPhotosMenuItem document.querySelector('div[role="menuitem"]: `, document.querySelector('div[role="menuitem"]'))
    console.log("In findPhotosMenuItem item: ", item)
    if (item) {
      console.log('  Found via aria-label="Photos & videos"');
      return item;
    }
    
    // ===== Method 2: aria-label partial match (different WhatsApp languages) =====
    const allMenuItems = document.querySelectorAll('div[role="menuitem"]');
    console.log("In findPhotosMenuItem allMenuItems: ", allMenuItems)

    for (const mi of allMenuItems) {
      const label = (mi.getAttribute('aria-label') || '').toLowerCase();

      // English
      if (label.includes('photos') && label.includes('videos')) {
        console.log(`  Found via label contains photos+videos: "${label}"`);
        return mi;
      }

      // Match by label containing "photo" (covers "Photos & videos", "Photo", etc.)
      if (label.includes('photo')) {
        console.log(`  Found via label contains photo: "${label}"`);
        return mi;
      }
    }

    // ===== Method 3: Find by inner text content =====
    for (const mi of allMenuItems) {
      const text = mi.textContent.toLowerCase().trim();

      if (text.includes('photos') && text.includes('videos')) {
        console.log(`  Found via text content: "${text}"`);
        return mi;
      }

      if (text === 'photos & videos' || text === 'photos and videos') {
        console.log(`  Found via exact text: "${text}"`);
        return mi;
      }
    }

    // ===== Method 4: Find by the SVG icon title =====
    // "Photos & videos" has <title>ic-filter-filled</title>
    // "New sticker" has <title>wds-ic-sticker-plus-create-filled</title>
    const svgTitles = document.querySelectorAll('div[role="menuitem"] svg title');
    for (const titleEl of svgTitles) {
      const titleText = titleEl.textContent.toLowerCase();
      if (titleText.includes('filter') || titleText.includes('photo') || titleText.includes('image')) {
        const menuItem = titleEl.closest('div[role="menuitem"]');
        if (menuItem) {
          console.log(`  Found via SVG title: "${titleText}"`);
          return menuItem;
        }
      }
    }

    // ===== Method 5: Position-based — "Photos & videos" is typically the FIRST menu item =====
    if (allMenuItems.length > 0) {
      // Check first item — skip if it's "New sticker" or "Document"
      const firstLabel = (allMenuItems[0].getAttribute('aria-label') || '').toLowerCase();
      if (!firstLabel.includes('sticker') && !firstLabel.includes('document') &&
          !firstLabel.includes('camera') && !firstLabel.includes('poll') &&
          !firstLabel.includes('contact')) {
        console.log(`  Using first menu item (assumed Photos): "${firstLabel}"`);
        return allMenuItems[0];
      }

      // Check second item
      if (allMenuItems.length > 1) {
        const secondLabel = (allMenuItems[1].getAttribute('aria-label') || '').toLowerCase();
        if (!secondLabel.includes('sticker') && !secondLabel.includes('document') &&
            !secondLabel.includes('camera') && !secondLabel.includes('poll') &&
            !secondLabel.includes('contact')) {
          console.log(`  Using second menu item (assumed Photos): "${secondLabel}"`);
          return allMenuItems[1];
        }
      }
    }

    await humanDelay(300, 500);
  }

  // Debug: log all menu items found
  const allItems = document.querySelectorAll('div[role="menuitem"]');
  console.log(`  ❌ Photos & videos not found. ${allItems.length} menu items on page:`);
  allItems.forEach((item, i) => {
    console.log(`    [${i}] aria-label="${item.getAttribute('aria-label')}" text="${item.textContent.trim().substring(0, 30)}"`);
  });

  return null;
}

// ===== FIND PHOTO/VIDEO FILE INPUT =====
// When Attach menu is open, WhatsApp creates hidden <input type="file"> elements.
// The one for Photos & Videos accepts "image/*,video/mp4,..." etc.
// ===== FIND FILE INPUT (after clicking "Photos & videos") =====
// Now that we've clicked the correct menu item, WhatsApp creates
// a hidden <input type="file"> specifically for photos/videos.
// We just need to find it.

async function findPhotoFileInput(timeout = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {

    const allInputs = document.querySelectorAll('input[type="file"]');
console.log(allInputs)
    // Strategy 1: Find input that accepts images
    for (const input of allInputs) {
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      if (accept.includes('image/') || accept.includes('image/*')) {
        console.log(`  Found file input with accept="${accept}"`);
        return input;
      }
    }

    // Strategy 2: Find input that accepts video too (Photos & videos)
    for (const input of allInputs) {
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      if (accept.includes('video/') || accept.includes('*/*') || accept === '') {
        console.log(`  Found file input with accept="${accept}"`);
        return input;
      }
    }

    // Strategy 3: If only one file input exists, use it
    if (allInputs.length === 1) {
      console.log("  Found single file input");
      return allInputs[0];
    }

    // Strategy 4: Use any file input
    if (allInputs.length > 0) {
      console.log(`  Found ${allInputs.length} file inputs, using first`);
      return allInputs[0];
    }

    await humanDelay(300, 500);
  }

  return null;
}

// ===== FIND SEND BUTTON IN MODAL =====
// ===== FIND SEND BUTTON IN MODAL (FIXED for div[role="button"]) =====
// From YOUR actual HTML:
//   <div role="button" aria-label="Send" class="x78zum5 x6s0dn4...">
//     <span data-icon="wds-ic-send-filled">
//       <svg>...</svg>
//     </span>
//   </div>
// KEY: It's a DIV with role="button", NOT a <button> element!

function findModalSendButton() {

  // Method 1 (BEST): div[role="button"] with aria-label="Send"
  // This is EXACTLY what your HTML shows
  const sendDivs = document.querySelectorAll('div[role="button"][aria-label="Send"]');
  if (sendDivs.length > 0) {
    // If multiple, pick the last one (likely the modal's, not the chat's)
    console.log(`  Found ${sendDivs.length} div[role="button"][aria-label="Send"]`);
    return sendDivs[sendDivs.length - 1];
  }

  // Method 2: Find by the icon inside
  const sendIcons = document.querySelectorAll('span[data-icon="wds-ic-send-filled"]');
  if (sendIcons.length > 0) {
    console.log(`  Found ${sendIcons.length} wds-ic-send-filled icons`);
    const lastIcon = sendIcons[sendIcons.length - 1];
    // Walk up to find the clickable container
    const parent = lastIcon.closest('div[role="button"]') ||
                   lastIcon.closest('button') ||
                   lastIcon.parentElement?.parentElement;
    return parent || lastIcon;
  }

  // Method 3: Legacy icon name
  const legacyIcons = document.querySelectorAll('span[data-icon="send"]');
  if (legacyIcons.length > 0) {
    const lastIcon = legacyIcons[legacyIcons.length - 1];
    return lastIcon.closest('div[role="button"]') ||
           lastIcon.closest('button') ||
           lastIcon;
  }

  // Method 4: Any button with aria-label="Send" (regular <button>)
  const sendButtons = document.querySelectorAll('button[aria-label="Send"]');
  if (sendButtons.length > 0) {
    return sendButtons[sendButtons.length - 1];
  }

  // Method 5: data-testid based
  const testIdSend = document.querySelector('[data-testid="send-btn-container"] div[role="button"]') ||
                     document.querySelector('[data-testid="send-btn-container"] button');
  if (testIdSend) return testIdSend;

  console.log("  ❌ No send button found by any method");
  return null;
}

// ===== INSERT MULTI-LINE TEXT =====
function insertMultilineText(el, text) {
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      // Shift+Enter for new line in WhatsApp
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        shiftKey: true, bubbles: true, cancelable: true
      }));
    }
    try {
      document.execCommand('insertText', false, lines[i]);
    } catch (e) {
      el.textContent += lines[i];
    }
  }
}

// ===== WAIT FOR MODAL TO CLOSE =====
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
  console.log("⚠️ Modal still open after timeout — image may still be uploading");
  return false;
}

// ============================================
// ===== SHARED UTILITIES =====================
// ============================================

// ===== FIND SEND BUTTON (for text flow) =====
function findSendButton() {
  let btn = null;

  btn = document.querySelector('button[aria-label="Send"]');
  if (btn) return btn;

  const sendIcon = document.querySelector('span[data-icon="wds-ic-send-filled"]');
  if (sendIcon) {
    btn = sendIcon.closest("button") || sendIcon;
    if (btn) return btn;
  }

  const tab11 = document.querySelector('button[data-tab="11"]');
  if (tab11 && tab11.getAttribute("aria-label") === "Send") {
    return tab11;
  }

  const legacyIcon = document.querySelector('[data-testid="send"], span[data-icon="send"]');
  if (legacyIcon) {
    btn = legacyIcon.closest("button") || legacyIcon;
    if (btn) return btn;
  }

  return null;
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
        const btn = popup.querySelector("button");
        if (btn) btn.click();
        return { success: false, error: "Number not on WhatsApp" };
      }
    }
  }
  return null;
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

// ===== WAIT FOR ANY ELEMENT =====
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

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

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

// ===== HUMAN DELAY =====
function humanDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ===== SIMULATE HUMAN BEHAVIOR =====
async function simulateHumanBehavior() {
  document.dispatchEvent(new MouseEvent("mousemove", {
    clientX: Math.floor(Math.random() * window.innerWidth),
    clientY: Math.floor(Math.random() * window.innerHeight),
    bubbles: true
  }));
  await humanDelay(200, 600);

  if (Math.random() > 0.6) {
    window.scrollBy(0, Math.random() * 30 - 15);
    await humanDelay(200, 400);
  }
}

// ===== REALISTIC CLICK =====
function simulateRealisticClick(element) {
  try {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {}

  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + (Math.random() * 6 - 3);
  const y = rect.top + rect.height / 2 + (Math.random() * 6 - 3);

  const opts = {
    clientX: x, clientY: y,
    bubbles: true, cancelable: true, view: window, button: 0
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

// ===== KEEP ALIVE =====
setInterval(() => {
  document.dispatchEvent(new MouseEvent("mousemove", {
    clientX: Math.random() * 500,
    clientY: Math.random() * 500,
    bubbles: true
  }));
}, 120000);

console.log("🟢 WA Bulk Sender: Ready! (v2.1)");

// ===== CHECK IF MODAL IS STILL OPEN =====
function isModalStillOpen() {
  // Check for elements that only exist when the media preview is showing
  const indicators = [
    'img[alt="Preview"]',
    '[aria-label="Remove attachment"]',
    '[data-testid="media-caption-input-container"]'
  ];

  for (const sel of indicators) {
    if (document.querySelector(sel)) return true;
  }

  return false;
}

// ===== TRIGGER REACT CLICK (last resort) =====
// WhatsApp uses React. Sometimes simulated DOM events don't trigger
// React's synthetic event system. This tries to find and call
// the React onClick handler directly.
function triggerReactClick(element) {
  // React 16+ stores handlers on __reactFiber$ or __reactInternalInstance$
  const reactKey = Object.keys(element).find(key =>
    key.startsWith('__reactFiber$') ||
    key.startsWith('__reactInternalInstance$') ||
    key.startsWith('__reactProps$')
  );

  if (reactKey) {
    const reactProps = element[reactKey];

    // Try to find onClick in the props chain
    let fiber = reactProps;
    let maxDepth = 15;

    while (fiber && maxDepth-- > 0) {
      // Check memoizedProps for onClick
      if (fiber.memoizedProps && typeof fiber.memoizedProps.onClick === 'function') {
        console.log("  Found React onClick handler!");
        fiber.memoizedProps.onClick(new MouseEvent("click", { bubbles: true }));
        return true;
      }

      // Check pendingProps
      if (fiber.pendingProps && typeof fiber.pendingProps.onClick === 'function') {
        console.log("  Found React onClick handler (pendingProps)!");
        fiber.pendingProps.onClick(new MouseEvent("click", { bubbles: true }));
        return true;
      }

      // Walk up the fiber tree
      fiber = fiber.return || fiber._debugOwner;
    }
  }

  // Also try __reactProps$ directly
  const propsKey = Object.keys(element).find(key => key.startsWith('__reactProps$'));
  if (propsKey) {
    const props = element[propsKey];
    if (props && typeof props.onClick === 'function') {
      console.log("  Found React onClick via __reactProps$!");
      props.onClick(new MouseEvent("click", { bubbles: true }));
      return true;
    }
  }

  throw new Error("No React click handler found on element");
}