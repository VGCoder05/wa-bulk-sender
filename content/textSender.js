// ============================================
// TEXT-SENDER.JS — Send text message
// ============================================

async function handleTextSend() {
  try {
    console.log("📤 TEXT SEND: Looking for chat & send button...");

    const { composeBox, error } = await waitForChatLoad(25000);
    if (error) return error;

    console.log("✅ Compose box found.");
    await humanDelay(2000, 4000);

    const popupError = checkForErrorPopup();
    if (popupError) return popupError;

    const hasText = composeBox.textContent.trim().length > 0;
    if (!hasText) {
      console.log("⚠️ Compose box is empty, waiting more...");
      await humanDelay(3000, 5000);
    }

    await simulateHumanBehavior();

    // ── Try Send button first ──
    let sendButton = findSendButton();

    if (sendButton) {
      console.log("✅ Send button found! Clicking...");
      await humanDelay(500, 1500);

      simulateRealisticClick(sendButton);
      await humanDelay(300, 600);
      try { sendButton.click(); } catch (e) {}
      await humanDelay(200, 400);

      sendButton.focus();
      sendButton.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true, cancelable: true, view: window,
        })
      );

      await humanDelay(2000, 4000);
      console.log("✅ Send button clicked!");
      return { success: true };
    }

    // ── Fallback: Enter key ──
    console.log("⚠️ Send button not found, trying Enter key...");
    composeBox.focus();
    await humanDelay(500, 1000);

    composeBox.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      })
    );
    await humanDelay(50, 100);
    composeBox.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      })
    );

    await humanDelay(2000, 3000);
    return { success: true };
  } catch (err) {
    console.error("❌ handleTextSend error:", err);
    return { success: false, error: err.message };
  }
}

console.log("  ✅ textSender.js loaded");