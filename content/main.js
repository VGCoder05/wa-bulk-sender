// ============================================
// MAIN.JS — Entry point & message router
// ============================================
//
// MESSAGE TYPES (switch cases):
// ─────────────────────────────────────────────
//  "SEND_TEXT"          → Text only
//  "SEND_IMAGE"         → Image only (no caption)
//  "SEND_TEXT_THEN_IMG" → Text first, then image (2 separate messages)
//  "SEND_IMG_CAPTION"   → Image with text as caption (1 message)
//  "CLICK_SEND"         → Legacy: click the existing send button
//  "PING"               → Health check
// ============================================

console.log("🟢 WA Bulk Sender: Content script loaded! (v3.0 — Modular)");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;

  switch (type) {

    // ─── Health check ───
    case "PING":
      sendResponse({ pong: true });
      return false;

    // ─── Case 1: Text only ───
    case "SEND_TEXT":
    case "CLICK_SEND":
      handleTextSend()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // keep channel open for async

    // ─── Case 2: Image only (no caption) ───
    case "SEND_IMAGE":
      handleImageSend(message.caption || "")
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    // ─── Case 3: Text first, then Image (2 separate messages) ───
    case "SEND_TEXT_THEN_IMG":
      handleTextThenImage(message.caption || "")
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    // ─── Case 4: Image + Text as caption (1 combined message) ───
    case "SEND_IMG_CAPTION":
      handleImageSend(message.caption || "")
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    // ─── Unknown type ───
    default:
      console.warn(`⚠️ Unknown message type: "${type}"`);
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
      return false;
  }
});

// ============================================
// COMPOSITE FLOW: Text first, then Image
// ============================================
// Sends text message first, waits for delivery,
// then sends image as a second message.

async function handleTextThenImage(imageCaption) {
  try {
    console.log("📤 TEXT+IMG FLOW: Sending text first...");

    // ── Step 1: Send the text message ──
    const textResult = await handleTextSend();

    if (!textResult.success) {
      console.error("❌ Text send failed:", textResult.error);
      return {
        success: false,
        error: `Text send failed: ${textResult.error}`,
      };
    }

    console.log("✅ Text sent! Now waiting before sending image...");

    // ── Step 2: Wait for WhatsApp to settle ──
    // The chat needs time to process the sent message
    // and re-render the compose box
    await humanDelay(3000, 5000);

    // ── Step 3: Send the image ──
    console.log("🖼️ Now sending image...");
    const imageResult = await handleImageSend(imageCaption);

    if (!imageResult.success) {
      console.error("❌ Image send failed:", imageResult.error);
      return {
        success: false,
        error: `Text sent OK, but image failed: ${imageResult.error}`,
        textSent: true,
      };
    }

    console.log("✅ Both text and image sent!");
    return { success: true, textSent: true, imageSent: true };
  } catch (err) {
    console.error("❌ handleTextThenImage error:", err);
    return { success: false, error: err.message };
  }
}

console.log("🟢 WA Bulk Sender: Router ready! (v3.0)");