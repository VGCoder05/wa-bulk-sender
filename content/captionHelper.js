// ============================================
// CAPTION-HELPER.JS — Type caption in Lexical editor
// 6 fallback methods for WhatsApp's rich text editor
// ============================================

/**
 * Find the caption input inside the media preview modal.
 * It's a contenteditable with data-tab="undefined" (literal string).
 */
async function findCaptionInput(timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Method 1: Exact match — data-tab="undefined"
    let el = document.querySelector(
      'div[contenteditable="true"][data-lexical-editor="true"][data-tab="undefined"]'
    );
    if (el) return el;

    // Method 2: Any Lexical editor that is NOT the main compose box
    const allEditable = document.querySelectorAll(
      'div[contenteditable="true"][data-lexical-editor="true"]'
    );
    for (const ed of allEditable) {
      if (ed.getAttribute("data-tab") === "10") continue;
      if (ed.closest("footer")) continue;
      return ed;
    }

    // Method 3: Any textbox that is NOT data-tab="10"
    const allTextboxes = document.querySelectorAll(
      'div[contenteditable="true"][role="textbox"]'
    );
    for (const tb of allTextboxes) {
      if (tb.getAttribute("data-tab") === "10") continue;
      if (tb.closest("footer")) continue;
      return tb;
    }

    // Method 4: testid based
    for (const sel of [
      '[data-testid="media-caption-input-container"] div[contenteditable="true"]',
      '[data-testid="media-caption-input"] div[contenteditable="true"]',
    ]) {
      el = document.querySelector(sel);
      if (el) return el;
    }

    // Method 5: Second contenteditable on page (last non-tab-10)
    const allCE = document.querySelectorAll(
      'div[contenteditable="true"][role="textbox"]'
    );
    if (allCE.length >= 2) {
      for (let i = allCE.length - 1; i >= 0; i--) {
        if (allCE[i].getAttribute("data-tab") !== "10") return allCE[i];
      }
    }

    await humanDelay(300, 500);
  }

  console.log("  ❌ Caption input not found after timeout");
  return null;
}

/**
 * Type text into a Lexical caption input using 6 fallback methods.
 * Returns true if text was successfully inserted.
 */
async function typeInCaptionInput(captionInput, text) {
  const lines = text.split("\n");

  // ─── Helper: Focus properly ───
  async function ensureFocus() {
    const paragraph = captionInput.querySelector("p") || captionInput;
    captionInput.focus();
    await humanDelay(200, 400);
    simulateRealisticClick(paragraph);
    await humanDelay(300, 500);
    captionInput.focus();
    await humanDelay(200, 300);

    if (
      document.activeElement !== captionInput &&
      !captionInput.contains(document.activeElement)
    ) {
      captionInput.click();
      captionInput.focus();
      await humanDelay(300, 500);
    }
  }

  // ─── Helper: Clear the input ───
  async function clearInput() {
    captionInput.focus();
    await humanDelay(200, 300);
    document.execCommand("selectAll");
    await humanDelay(100, 200);
    document.execCommand("delete");
    await humanDelay(300, 500);
  }

  // ─── Helper: Shift+Enter for newline ───
  async function insertNewline() {
    captionInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        shiftKey: true, bubbles: true, cancelable: true,
      })
    );
    await humanDelay(50, 100);
    captionInput.dispatchEvent(
      new KeyboardEvent("keyup", {
        key: "Enter", code: "Enter", keyCode: 13, which: 13,
        shiftKey: true, bubbles: true, cancelable: true,
      })
    );
    await humanDelay(50, 100);
  }

  // ─── Verify text was inserted ───
  function verify() {
    return verifyCaption(captionInput, text);
  }

  // ═══════════════════════════════════════════
  // METHOD 1: execCommand insertText line-by-line
  // ═══════════════════════════════════════════
  console.log("  Caption Method 1: execCommand insertText...");
  await ensureFocus();

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) await insertNewline();
    if (lines[i].length > 0) document.execCommand("insertText", false, lines[i]);
    await humanDelay(30, 60);
  }

  await humanDelay(500, 800);
  if (verify()) { console.log("  ✅ Method 1 worked!"); return true; }

  // ═══════════════════════════════════════════
  // METHOD 2: InputEvent API
  // ═══════════════════════════════════════════
  console.log("  Caption Method 2: InputEvent...");
  await clearInput();

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      captionInput.dispatchEvent(new InputEvent("beforeinput", {
        inputType: "insertLineBreak", bubbles: true, cancelable: true, composed: true,
      }));
      captionInput.dispatchEvent(new InputEvent("input", {
        inputType: "insertLineBreak", bubbles: true, cancelable: false, composed: true,
      }));
      await humanDelay(50, 100);
    }
    if (lines[i].length > 0) {
      captionInput.dispatchEvent(new InputEvent("beforeinput", {
        inputType: "insertText", data: lines[i], bubbles: true, cancelable: true, composed: true,
      }));
      captionInput.dispatchEvent(new InputEvent("input", {
        inputType: "insertText", data: lines[i], bubbles: true, cancelable: false, composed: true,
      }));
    }
    await humanDelay(30, 60);
  }

  await humanDelay(500, 800);
  if (verify()) { console.log("  ✅ Method 2 worked!"); return true; }

  // ═══════════════════════════════════════════
  // METHOD 3: Character-by-character
  // ═══════════════════════════════════════════
  console.log("  Caption Method 3: Char-by-char...");
  await clearInput();

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\n") {
      captionInput.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13, shiftKey: true, bubbles: true, cancelable: true,
      }));
      await humanDelay(30, 50);
      document.execCommand("insertLineBreak");
      captionInput.dispatchEvent(new KeyboardEvent("keyup", {
        key: "Enter", code: "Enter", keyCode: 13, shiftKey: true, bubbles: true, cancelable: true,
      }));
    } else {
      captionInput.dispatchEvent(new KeyboardEvent("keydown", {
        key: char, keyCode: char.charCodeAt(0), bubbles: true,
      }));
      document.execCommand("insertText", false, char);
      captionInput.dispatchEvent(new KeyboardEvent("keyup", {
        key: char, keyCode: char.charCodeAt(0), bubbles: true,
      }));
    }
    if (i % 5 === 0) await humanDelay(10, 25);
  }

  await humanDelay(500, 800);
  if (verify()) { console.log("  ✅ Method 3 worked!"); return true; }

  // ═══════════════════════════════════════════
  // METHOD 4: Clipboard writeText + paste
  // ═══════════════════════════════════════════
  console.log("  Caption Method 4: Clipboard paste...");
  await clearInput();

  try {
    await navigator.clipboard.writeText(text);
    await humanDelay(200, 400);
    captionInput.focus();
    await humanDelay(100, 200);

    captionInput.dispatchEvent(new KeyboardEvent("keydown", {
      key: "v", code: "KeyV", keyCode: 86, which: 86,
      ctrlKey: true, bubbles: true, cancelable: true,
    }));
    document.execCommand("paste");
    await humanDelay(500, 800);

    if (verify()) { console.log("  ✅ Method 4 worked!"); return true; }
  } catch (e) {
    console.log("  Clipboard API error:", e.message);
  }

  // ═══════════════════════════════════════════
  // METHOD 5: Direct DOM + Lexical reconciliation
  // ═══════════════════════════════════════════
  console.log("  Caption Method 5: DOM + Lexical reconcile...");
  captionInput.focus();
  await humanDelay(200, 300);

  const existingP = captionInput.querySelector("p");
  if (existingP) {
    existingP.innerHTML = "";
    const htmlLines = text.split("\n");
    for (let i = 0; i < htmlLines.length; i++) {
      if (i > 0) existingP.appendChild(document.createElement("br"));
      if (htmlLines[i].length > 0)
        existingP.appendChild(document.createTextNode(htmlLines[i]));
    }
  } else {
    captionInput.textContent = text;
  }

  captionInput.dispatchEvent(new Event("input", { bubbles: true }));
  await humanDelay(100, 200);
  captionInput.dispatchEvent(new Event("change", { bubbles: true }));
  await humanDelay(100, 200);
  captionInput.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  captionInput.dispatchEvent(new CompositionEvent("compositionend", { data: text, bubbles: true }));
  await humanDelay(200, 300);

  try {
    const propsKey = Object.keys(captionInput).find((k) =>
      k.startsWith("__reactProps$")
    );
    if (propsKey && captionInput[propsKey]) {
      const props = captionInput[propsKey];
      if (typeof props.onInput === "function")
        props.onInput({ target: captionInput, currentTarget: captionInput });
      if (typeof props.onCompositionEnd === "function")
        props.onCompositionEnd({ target: captionInput, data: text });
    }
  } catch (e) {}

  await humanDelay(500, 800);
  if (verify()) { console.log("  ✅ Method 5 worked!"); return true; }

  // ═══════════════════════════════════════════
  // METHOD 6: Selection API + execCommand
  // ═══════════════════════════════════════════
  console.log("  Caption Method 6: Selection API...");
  captionInput.focus();
  await humanDelay(200, 300);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(captionInput);
  selection.removeAllRanges();
  selection.addRange(range);
  await humanDelay(100, 200);
  document.execCommand("delete");
  await humanDelay(300, 500);

  const newRange = document.createRange();
  const targetNode = captionInput.querySelector("p") || captionInput;
  newRange.setStart(targetNode, 0);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);
  await humanDelay(100, 200);

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      document.execCommand("insertLineBreak");
      await humanDelay(50, 100);
    }
    if (lines[i].length > 0)
      document.execCommand("insertText", false, lines[i]);
    await humanDelay(30, 60);
  }

  await humanDelay(500, 800);
  if (verify()) { console.log("  ✅ Method 6 worked!"); return true; }

  console.log("  ❌ ALL caption typing methods failed");
  return false;
}

/**
 * Verify that caption text was typed correctly
 */
function verifyCaption(captionInput, expectedText) {
  const actual = captionInput.textContent.trim();
  if (actual.length === 0) return false;

  const firstLine = expectedText.split("\n")[0].trim();
  const checkStr = firstLine.substring(0, Math.min(15, firstLine.length));
  if (checkStr.length > 0 && actual.includes(checkStr)) return true;
  if (actual.length >= expectedText.trim().length * 0.3) return true;

  return false;
}

console.log("  ✅ captionHelper.js loaded");