// Background service worker - handles extension lifecycle
chrome.runtime.onInstalled.addListener(() => {
  console.log("WA Bulk Sender installed successfully!");
  chrome.storage.local.set({
    settings: {
      minDelay: 25,
      maxDelay: 60,
      batchSize: 15,
      batchPause: 300,
      dailyLimit: 200,
      autoRetry: true
    },
    stats: {
      totalSent: 0,
      totalFailed: 0,
      lastReset: new Date().toDateString()
    }
  });
});

// Listen for messages from popup/content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TAB_ID") {
    sendResponse({ tabId: sender.tab?.id });
  }
  return true;
});