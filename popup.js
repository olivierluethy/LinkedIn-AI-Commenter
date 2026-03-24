// popup.js — Manages API key storage and UI state

const apiKeyInput = document.getElementById("apiKeyInput");
const saveBtn = document.getElementById("saveBtn");
const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("statusText");
const toggleVisibility = document.getElementById("toggleVisibility");
const toast = document.getElementById("toast");

let isVisible = false;

// ── Load stored key on open ────────────────────────────────────────────────
chrome.storage.sync.get(["anthropicApiKey"], (result) => {
  if (result.anthropicApiKey) {
    apiKeyInput.value = result.anthropicApiKey;
    setStatus(true);
  }
});

// ── Toggle key visibility ──────────────────────────────────────────────────
toggleVisibility.addEventListener("click", () => {
  isVisible = !isVisible;
  apiKeyInput.type = isVisible ? "text" : "password";
  toggleVisibility.textContent = isVisible ? "🙈" : "👁";
});

// ── Save key ───────────────────────────────────────────────────────────────
saveBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();

  if (!key) {
    showToast("⚠ Please enter an API key");
    apiKeyInput.classList.add("invalid");
    setTimeout(() => apiKeyInput.classList.remove("invalid"), 1500);
    return;
  }

  if (!key.startsWith("sk-ant-")) {
    showToast("⚠ Key should start with sk-ant-…");
    apiKeyInput.classList.add("invalid");
    setTimeout(() => apiKeyInput.classList.remove("invalid"), 1500);
    return;
  }

  chrome.storage.sync.set({ anthropicApiKey: key }, () => {
    apiKeyInput.classList.remove("invalid");
    apiKeyInput.classList.add("valid");
    setStatus(true);
    saveBtn.textContent = "✓ Saved!";
    saveBtn.classList.add("saved");
    showToast("✓ API key saved successfully");

    setTimeout(() => {
      saveBtn.textContent = "Save API Key";
      saveBtn.classList.remove("saved");
      apiKeyInput.classList.remove("valid");
    }, 2500);

    // Notify content scripts to reload key
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "API_KEY_UPDATED", key }).catch(() => {});
      }
    });
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────
function setStatus(connected) {
  statusBadge.className = `status-badge ${connected ? "connected" : "disconnected"}`;
  statusText.textContent = connected ? "Connected · Ready" : "No API key set";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}
