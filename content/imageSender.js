// ============================================
// IMAGE-SENDER.JS — Send image via clipboard paste
// Falls back to Attach button method
// ============================================

/**
 * Main entry: Send image with optional caption
 */
async function handleImageSend(captionText) {
  try {
    console.log("🖼️ IMAGE SEND: Starting...");

    // ── Step 1: Wait for chat ──
    const { composeBox, error } = await waitForChatLoad(25000);
    if (error) return error;

    console.log("✅ Chat loaded.");

    const popupError = checkForErrorPopup();
    if (popupError) return popupError;

    await humanDelay(1000, 2000);

    // ── Step 2: Read image ──
    console.log("📦 Reading image from storage...");
    const imageResult = await readImageFromStorage();
    if (!imageResult) {
      return { success: false, error: "No image in storage" };
    }

    const { blob, mimeType } = imageResult;
    console.log(`✅ Image loaded: ${mimeType}, ${(blob.size / 1024).toFixed(1)} KB`);

    // ── Step 3: Convert to PNG ──
    let clipboardBlob = blob;
    if (mimeType !== "image/png") {
      console.log("🔄 Converting to PNG...");
      clipboardBlob = await convertToPng(blob);
      console.log(`✅ PNG: ${(clipboardBlob.size / 1024).toFixed(1)} KB`);
    }

    // ── Step 4: Ensure focus ──
    console.log("🎯 Ensuring document focus...");
    composeBox.focus();
    await humanDelay(100, 200);
    simulateRealisticClick(composeBox);
    await humanDelay(200, 400);
    composeBox.focus();
    await humanDelay(100, 200);

    if (!document.hasFocus()) {
      const main = document.querySelector("#main") || document.body;
      simulateRealisticClick(main);
      await humanDelay(300, 500);
      composeBox.focus();
      await humanDelay(200, 300);
    }

    // ── Step 5: Write to clipboard (3 attempts) ──
    console.log("📋 Writing image to clipboard...");
    let clipboardOK = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        composeBox.focus();
        await humanDelay(50, 100);

        if (!document.hasFocus()) {
          window.focus();
          composeBox.click();
          composeBox.focus();
          await humanDelay(200, 400);
        }

        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": clipboardBlob }),
        ]);

        console.log(`✅ Clipboard write succeeded (attempt ${attempt})`);
        clipboardOK = true;
        break;
      } catch (e) {
        console.log(`  Attempt ${attempt} failed: ${e.message}`);
        if (attempt < 3) {
          await humanDelay(500, 800);
          window.focus();
          simulateRealisticClick(composeBox);
          composeBox.focus();
          await humanDelay(300, 500);
        }
      }
    }

    if (!clipboardOK) {
      return { success: false, error: "Clipboard write failed after 3 attempts" };
    }

    // ── Step 6: Paste into chat ──
    console.log("📋 Pasting image...");
    composeBox.focus();
    await humanDelay(200, 400);
    simulateRealisticClick(composeBox);
    await humanDelay(200, 400);
    composeBox.focus();
    await humanDelay(100, 200);

    let modalAppeared = false;

    // Paste method 1: execCommand
    try {
      document.execCommand("paste");
    } catch (e) {}
    await humanDelay(800, 1200);
    modalAppeared = await checkModalAppeared(3000);

    // Paste method 2: Ctrl+V
    if (!modalAppeared) {
      composeBox.focus();
      await humanDelay(100, 200);
      composeBox.dispatchEvent(new KeyboardEvent("keydown", {
        key: "v", code: "KeyV", keyCode: 86, ctrlKey: true, bubbles: true, cancelable: true,
      }));
      composeBox.dispatchEvent(new KeyboardEvent("keyup", {
        key: "v", code: "KeyV", keyCode: 86, ctrlKey: true, bubbles: true, cancelable: true,
      }));
      await humanDelay(800, 1200);
      modalAppeared = await checkModalAppeared(3000);
    }

    // Paste method 3: Cmd+V (Mac)
    if (!modalAppeared) {
      composeBox.focus();
      await humanDelay(100, 200);
      composeBox.dispatchEvent(new KeyboardEvent("keydown", {
        key: "v", code: "KeyV", keyCode: 86, metaKey: true, bubbles: true, cancelable: true,
      }));
      composeBox.dispatchEvent(new KeyboardEvent("keyup", {
        key: "v", code: "KeyV", keyCode: 86, metaKey: true, bubbles: true, cancelable: true,
      }));
      await humanDelay(800, 1200);
      modalAppeared = await checkModalAppeared(3000);
    }

    // Paste method 4: ClipboardEvent with real data
    if (!modalAppeared) {
      try {
        const clipItems = await navigator.clipboard.read();
        if (clipItems.length > 0 && clipItems[0].types.includes("image/png")) {
          const imgBlob = await clipItems[0].getType("image/png");
          const file = new File([imgBlob], "image.png", { type: "image/png" });
          const dt = new DataTransfer();
          dt.items.add(file);

          composeBox.focus();
          await humanDelay(100, 200);

          composeBox.dispatchEvent(new ClipboardEvent("paste", {
            bubbles: true, cancelable: true, clipboardData: dt,
          }));
          await humanDelay(500, 800);

          if (!(await checkModalAppeared(1500))) {
            const main = document.querySelector("#main");
            if (main) {
              main.dispatchEvent(new ClipboardEvent("paste", {
                bubbles: true, cancelable: true, clipboardData: dt,
              }));
            }
          }
          await humanDelay(500, 800);
          modalAppeared = await checkModalAppeared(2000);
        }
      } catch (e) {
        console.log("  ClipboardEvent method failed:", e.message);
      }
    }

    if (!modalAppeared) {
      return { success: false, error: "Image paste failed — modal did not appear" };
    }

    console.log("✅ Modal appeared!");
    await humanDelay(2000, 3000);

    // ── Step 7: Type caption ──
    if (captionText && captionText.trim()) {
      console.log("✏️ Typing caption...");
      const captionInput = await findCaptionInput(8000);
      if (captionInput) {
        await typeInCaptionInput(captionInput, captionText);
        await humanDelay(800, 1200);
      } else {
        console.log("⚠️ Caption input not found — sending without caption");
      }
    }

    // ── Step 8: Click Send ──
    console.log("🔍 Finding modal send button...");
    await humanDelay(500, 800);

    let sendBtn = findModalSendButton();
    if (!sendBtn) {
      await humanDelay(1000, 2000);
      sendBtn = findModalSendButton();
    }

    if (sendBtn) {
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
    console.error("❌ handleImageSend error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Fallback: Send image via Attach button + file input
 */
async function handleImageSendViaAttach(captionText, blob, mimeType) {
  try {
    console.log("📎 Fallback: Attach button method...");

    let ext = "jpg";
    if (mimeType.includes("png")) ext = "png";
    else if (mimeType.includes("gif")) ext = "gif";
    else if (mimeType.includes("webp")) ext = "webp";

    const file = new File([blob], `image.${ext}`, { type: mimeType });

    // Click Attach
    const attachBtn = findAttachButton();
    if (!attachBtn) {
      return { success: false, error: "Fallback: Attach button not found" };
    }

    simulateRealisticClick(attachBtn);
    await humanDelay(200, 400);
    try { attachBtn.click(); } catch (e) {}
    await humanDelay(800, 1500);

    // Click "Photos & videos"
    let photosItem = await findPhotosMenuItem(5000);
    if (!photosItem) {
      simulateRealisticClick(attachBtn);
      await humanDelay(300, 500);
      try { attachBtn.click(); } catch (e) {}
      await humanDelay(1000, 2000);
      photosItem = await findPhotosMenuItem(5000);
    }

    if (!photosItem) {
      return { success: false, error: "Fallback: Photos & videos menu not found" };
    }

    simulateRealisticClick(photosItem);
    await humanDelay(200, 400);
    try { photosItem.click(); } catch (e) {}
    await humanDelay(800, 1500);

    // File input
    const fileInput = await findPhotoFileInput(5000);
    if (!fileInput) {
      return { success: false, error: "Fallback: File input not found" };
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Wait for modal
    const modalEl = await waitForAnyElement(
      [
        'img[alt="Preview"]',
        '[aria-label="Remove attachment"]',
        'div[role="button"][aria-label="Send"]',
      ],
      15000
    );

    if (!modalEl) {
      return { success: false, error: "Fallback: Modal did not appear" };
    }

    console.log("✅ Fallback: Modal appeared!");
    await humanDelay(2000, 3000);

    // Caption
    if (captionText && captionText.trim()) {
      const captionInput = await findCaptionInput(8000);
      if (captionInput) {
        await typeInCaptionInput(captionInput, captionText);
        await humanDelay(800, 1200);
      }
    }

    // Send
    await humanDelay(500, 800);
    const modalSendBtn = findModalSendButton();
    if (modalSendBtn) {
      const sent = await clickModalSend(modalSendBtn);
      if (sent) {
        console.log("✅ Fallback: Image sent!");
        await humanDelay(2000, 3000);
        return { success: true };
      }
    }

    return { success: false, error: "Fallback: Send failed" };
  } catch (err) {
    console.error("❌ Fallback error:", err);
    return { success: false, error: err.message };
  }
}

console.log("  ✅ imageSender.js loaded");