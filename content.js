/**
 * LinkedIn AI Commenter — content.js v3
 *
 * Architecture: Selection-based, DOM-independent (Grammarly model)
 * ─────────────────────────────────────────────────────────────────
 *  • Listens to window.getSelection() — ZERO reliance on LinkedIn's class names
 *  • A floating trigger button appears above any selected text
 *  • Clicking it opens a compact panel: tone picker → generate → copy
 *  • All UI is injected into a Shadow DOM host so LinkedIn CSS cannot bleed in
 *  • Positioning uses Range.getBoundingClientRect() + scroll offsets
 *
 * Logging categories:
 *  [INIT] [SEL] [POS] [API] [UI] [COPY] [NAV] [WARN] [ERROR]
 */

(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════════════════════
     LOGGER
  ══════════════════════════════════════════════════════════════════════════ */

  const L = {
    _p: (cat, style, ...a) => console.log(`%c[LAIC:${cat}]`, style, ...a),
    init:  (...a) => L._p("INIT",  "color:#6366f1;font-weight:700", ...a),
    sel:   (...a) => L._p("SEL",   "color:#0ea5e9;font-weight:700", ...a),
    pos:   (...a) => L._p("POS",   "color:#94a3b8;font-weight:700", ...a),
    api:   (...a) => L._p("API",   "color:#10b981;font-weight:700", ...a),
    ui:    (...a) => L._p("UI",    "color:#3b82f6;font-weight:700", ...a),
    copy:  (...a) => L._p("COPY",  "color:#22c55e;font-weight:700", ...a),
    nav:   (...a) => L._p("NAV",   "color:#8b5cf6;font-weight:700", ...a),
    warn:  (...a) => console.warn(`%c[LAIC:WARN]`, "color:#f59e0b;font-weight:700", ...a),
    error: (...a) => console.error(`%c[LAIC:ERROR]`, "color:#ef4444;font-weight:700", ...a),
  };

  /* ══════════════════════════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════════════════════════ */

  const TONES = [
    { id: "insightful",   emoji: "💡", label: "Insightful",   prompt: "thoughtful and insightful, adding genuine expertise" },
    { id: "professional", emoji: "💼", label: "Professional", prompt: "polished and authoritative" },
    { id: "casual",       emoji: "😊", label: "Casual",       prompt: "friendly, warm, and conversational" },
    { id: "bold",         emoji: "🔥", label: "Bold",         prompt: "bold and slightly provocative, designed to spark discussion" },
    { id: "supportive",   emoji: "🙌", label: "Supportive",   prompt: "encouraging and genuinely supportive" },
  ];

  // Min chars to trigger the button (avoids noise from accidental tiny selections)
  const MIN_SELECTION_LENGTH = 20;

  // Offset above the selection range rect (px)
  const BUTTON_OFFSET_Y = 10;

  /* ══════════════════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════════════════ */

  let apiKey = "";
  let isGenerating = false;
  let activeTone = "insightful";
  let lastSelectedText = "";
  let hideTimer = null;
  let currentRoute = location.pathname;

  /* ══════════════════════════════════════════════════════════════════════════
     CHROME STORAGE
  ══════════════════════════════════════════════════════════════════════════ */

  chrome.storage.sync.get(["anthropicApiKey"], (r) => {
    apiKey = r.anthropicApiKey || "";
    L.init(apiKey ? "API key loaded ✓" : "No API key — user must add via popup");
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "API_KEY_UPDATED") {
      apiKey = msg.key || "";
      L.init(`API key updated via message. Present: ${!!apiKey}`);
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     SHADOW DOM HOST
     We mount everything inside a Shadow DOM so LinkedIn's stylesheet
     cannot touch our elements at all.
  ══════════════════════════════════════════════════════════════════════════ */

  const HOST_ID = "laic-shadow-host";

  function getOrCreateHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host.shadowRoot;

    host = document.createElement("div");
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: "fixed",
      top: "0", left: "0",
      width: "0", height: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      overflow: "visible",
    });

    const shadow = host.attachShadow({ mode: "open" });

    // Inject our CSS keyframes + utility classes into the shadow root
    const styleEl = document.createElement("style");
    styleEl.textContent = getShadowStyles();
    shadow.appendChild(styleEl);

    document.documentElement.appendChild(host);
    L.init("Shadow DOM host created.");
    return shadow;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SHADOW STYLES (self-contained — no external dependencies)
  ══════════════════════════════════════════════════════════════════════════ */

  function getShadowStyles() {
    return `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      /* ── Keyframes ── */
      @keyframes pop-in  {
        0%   { opacity: 0; transform: scale(0.65) translateY(6px); }
        65%  { transform: scale(1.06) translateY(-2px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes pop-out {
        0%   { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.7) translateY(4px); }
      }
      @keyframes panel-in {
        0%   { opacity: 0; transform: scale(0.93) translateY(-8px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes result-fade {
        0%   { opacity: 0; transform: translateY(5px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes pulse-ring {
        0%   { box-shadow: 0 0 0 0px rgba(10,102,194,0.5); }
        70%  { box-shadow: 0 0 0 7px rgba(10,102,194,0); }
        100% { box-shadow: 0 0 0 0px rgba(10,102,194,0); }
      }
      @keyframes shimmer {
        0%   { background-position: -300% center; }
        100% { background-position: 300% center; }
      }
      @keyframes checkmark {
        0%   { stroke-dashoffset: 20; }
        100% { stroke-dashoffset: 0; }
      }

      /* ── Trigger button ── */
      #laic-trigger {
        position: fixed;
        pointer-events: all;
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 10px 6px 8px;
        background: #0a66c2;
        color: #fff;
        border: none;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(10,102,194,0.45), 0 1px 4px rgba(0,0,0,0.15);
        transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        user-select: none;
        -webkit-user-select: none;
        transform-origin: center bottom;
        animation: pop-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      #laic-trigger:hover {
        background: #004182;
        box-shadow: 0 6px 20px rgba(10,102,194,0.55), 0 2px 6px rgba(0,0,0,0.18);
        transform: translateY(-1px);
      }
      #laic-trigger:active {
        transform: scale(0.93);
        box-shadow: 0 2px 8px rgba(10,102,194,0.4);
      }
      #laic-trigger.closing {
        animation: pop-out 0.14s ease forwards;
      }
      #laic-trigger .laic-icon {
        font-size: 13px;
        line-height: 1;
      }
      #laic-trigger .laic-pulse {
        animation: pulse-ring 2s ease-out infinite;
      }

      /* ── Panel ── */
      #laic-panel {
        position: fixed;
        pointer-events: all;
        width: 320px;
        background: #fff;
        border-radius: 14px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08);
        border: 1px solid rgba(0,0,0,0.07);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: panel-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        transform-origin: top center;
      }

      /* Panel header */
      .laic-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px 10px;
        border-bottom: 1px solid #f0f0f0;
      }
      .laic-panel-title {
        display: flex; align-items: center; gap: 6px;
        font-size: 12px; font-weight: 700;
        color: #0a66c2; letter-spacing: 0.3px;
        text-transform: uppercase;
      }
      .laic-panel-title svg { flex-shrink: 0; }
      .laic-close-btn {
        width: 22px; height: 22px;
        display: flex; align-items: center; justify-content: center;
        border: none; background: none;
        color: #9ca3af; cursor: pointer;
        border-radius: 50%; font-size: 16px; line-height: 1;
        transition: background 0.1s, color 0.1s;
      }
      .laic-close-btn:hover { background: #f3f4f6; color: #374151; }

      /* Context preview — scrollable selected text block */
      .laic-context {
        margin: 10px 14px 0;
        background: #f0f7ff;
        border: 1.5px solid #bfdbfe;
        border-radius: 10px;
        overflow: hidden;
      }
      .laic-context-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px 5px;
        background: #dbeafe;
        border-bottom: 1px solid #bfdbfe;
        gap: 6px;
      }
      .laic-context-label {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #1d4ed8;
      }
      .laic-context-label svg { flex-shrink: 0; opacity: 0.8; }
      .laic-context-char-count {
        font-size: 10px;
        font-weight: 500;
        color: #60a5fa;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .laic-context-scroll {
        padding: 8px 10px;
        max-height: 130px;
        overflow-y: auto;
        overflow-x: hidden;
        font-size: 12px;
        color: #1e3a5f;
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
        /* Custom scrollbar */
        scrollbar-width: thin;
        scrollbar-color: #93c5fd #dbeafe;
      }
      .laic-context-scroll::-webkit-scrollbar {
        width: 4px;
      }
      .laic-context-scroll::-webkit-scrollbar-track {
        background: #dbeafe;
        border-radius: 99px;
      }
      .laic-context-scroll::-webkit-scrollbar-thumb {
        background: #93c5fd;
        border-radius: 99px;
      }
      .laic-context-scroll::-webkit-scrollbar-thumb:hover {
        background: #3b82f6;
      }
      /* Fade-out gradient hint when content overflows */
      .laic-context-scroll-wrap {
        position: relative;
      }
      .laic-context-scroll-wrap::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 22px;
        background: linear-gradient(to bottom, transparent, #f0f7ff);
        pointer-events: none;
        border-radius: 0 0 8px 8px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .laic-context-scroll-wrap.overflows::after {
        opacity: 1;
      }

      /* Tone section */
      .laic-section-label {
        padding: 10px 14px 6px;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #9ca3af;
      }
      .laic-tones {
        display: flex; flex-wrap: wrap; gap: 5px;
        padding: 0 14px 10px;
      }
      .laic-tone {
        display: inline-flex; align-items: center; gap: 3px;
        padding: 3px 9px;
        border-radius: 20px;
        border: 1.5px solid #e5e7eb;
        background: transparent;
        font-size: 11.5px; font-weight: 500;
        color: #6b7280;
        cursor: pointer;
        transition: all 0.13s ease;
        font-family: inherit;
        white-space: nowrap;
        user-select: none;
      }
      .laic-tone:hover {
        border-color: #93c5fd;
        color: #1d4ed8;
        background: #eff6ff;
      }
      .laic-tone.active {
        border-color: #0a66c2;
        background: #eff6ff;
        color: #0a66c2;
        font-weight: 600;
        box-shadow: 0 0 0 2px rgba(10,102,194,0.12);
      }

      /* Generate button */
      .laic-generate-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        width: calc(100% - 28px);
        margin: 0 14px 12px;
        padding: 9px 16px;
        background: linear-gradient(135deg, #0a66c2, #1d7fdb);
        color: #fff;
        border: none; border-radius: 10px;
        font-family: inherit;
        font-size: 13px; font-weight: 700;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.12s, box-shadow 0.15s;
        box-shadow: 0 3px 12px rgba(10,102,194,0.35);
        letter-spacing: 0.1px;
        position: relative; overflow: hidden;
      }
      .laic-generate-btn::after {
        content: '';
        position: absolute; inset: 0;
        background: rgba(255,255,255,0);
        transition: background 0.15s;
      }
      .laic-generate-btn:hover::after { background: rgba(255,255,255,0.08); }
      .laic-generate-btn:active { transform: scale(0.97); }
      .laic-generate-btn:disabled {
        opacity: 0.65; cursor: not-allowed; transform: none;
      }

      /* Spinner */
      .laic-spinner {
        display: inline-block;
        width: 13px; height: 13px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
        flex-shrink: 0;
      }
      .laic-spinner-blue {
        border-color: rgba(10,102,194,0.2);
        border-top-color: #0a66c2;
      }

      /* Result area */
      .laic-result-area {
        margin: 0 14px 12px;
        border: 1.5px solid #bfdbfe;
        border-radius: 10px;
        background: #f0f7ff;
        overflow: hidden;
        animation: result-fade 0.18s ease forwards;
      }
      .laic-result-text {
        padding: 10px 12px;
        font-size: 13px;
        line-height: 1.55;
        color: #1e3a5f;
        max-height: 110px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(10,102,194,0.25) transparent;
      }
      .laic-result-text::-webkit-scrollbar { width: 3px; }
      .laic-result-text::-webkit-scrollbar-thumb {
        background: rgba(10,102,194,0.25);
        border-radius: 99px;
      }
      .laic-result-text.loading {
        background: linear-gradient(90deg, #dbeafe 25%, #e0eeff 50%, #dbeafe 75%);
        background-size: 300% auto;
        animation: shimmer 1.3s linear infinite;
        color: transparent;
        height: 52px;
        border-radius: 0;
      }
      .laic-result-actions {
        display: flex; gap: 6px; flex-wrap: wrap;
        padding: 8px 10px;
        border-top: 1px solid #bfdbfe;
        background: #e8f2ff;
      }
      .laic-action-btn {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 10px; border-radius: 20px;
        font-family: inherit; font-size: 11.5px; font-weight: 600;
        cursor: pointer; transition: all 0.13s;
        border: 1.5px solid transparent;
        white-space: nowrap;
      }
      .laic-action-btn.primary {
        background: #0a66c2; color: #fff; border-color: #0a66c2;
      }
      .laic-action-btn.primary:hover {
        background: #004182; border-color: #004182;
      }
      .laic-action-btn.secondary {
        background: transparent; color: #0a66c2; border-color: #93c5fd;
      }
      .laic-action-btn.secondary:hover {
        background: #dbeafe; border-color: #0a66c2;
      }
      .laic-action-btn.success {
        background: #057642; color: #fff; border-color: #057642;
        pointer-events: none;
      }

      /* SVG checkmark animation */
      .laic-check-path {
        stroke-dasharray: 20;
        stroke-dashoffset: 0;
        animation: checkmark 0.25s ease forwards;
      }

      /* Error state */
      .laic-error-box {
        margin: 0 14px 12px;
        padding: 9px 11px;
        border-radius: 10px;
        border: 1.5px solid #fca5a5;
        background: #fff1f1;
        font-size: 12px; color: #b91c1c;
        display: flex; align-items: flex-start; gap: 7px;
        line-height: 1.4;
        animation: result-fade 0.15s ease forwards;
      }

      /* Panel footer */
      .laic-panel-footer {
        padding: 7px 14px 10px;
        border-top: 1px solid #f3f4f6;
        font-size: 10px;
        color: #d1d5db;
        display: flex; align-items: center; gap: 4px;
      }

      /* "Improve" mode badge */
      .laic-mode-badge {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px; border-radius: 20px;
        font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
        background: #fef3c7; color: #92400e; border: 1px solid #fde68a;
        margin: 0 14px 2px;
      }
    `;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     POSITIONING UTILITIES
  ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Returns the bounding rect of the current selection range,
   * accounting for multi-line selections by using the first range.
   */
  function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return rect;
  }

  /**
   * Clamp a value so an element of `size` stays within the viewport.
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Positions `el` (fixed) above the selection rect.
   * Falls back to below if there's not enough room at the top.
   */
  function positionAboveSelection(el, selRect, offsetY = BUTTON_OFFSET_Y) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const elW = el.offsetWidth || 140;
    const elH = el.offsetHeight || 34;

    // Horizontal: centre on selection, clamped to viewport
    let left = selRect.left + selRect.width / 2 - elW / 2;
    left = clamp(left, 8, vw - elW - 8);

    // Vertical: above selection top, fallback below if clipped
    let top = selRect.top - elH - offsetY;
    if (top < 8) top = selRect.bottom + offsetY;

    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;

    L.pos(`Positioned at (${Math.round(left)}, ${Math.round(top)}) — selRect: [${Math.round(selRect.left)}, ${Math.round(selRect.top)}, ${Math.round(selRect.width)}×${Math.round(selRect.height)}]`);
  }

  /**
   * Positions the panel below the trigger button.
   * Falls back to above if not enough room.
   */
  function positionPanel(panel, triggerRect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = 320;
    const panelH = panel.offsetHeight || 300;
    const GAP = 8;

    let left = triggerRect.left + triggerRect.width / 2 - panelW / 2;
    left = clamp(left, 8, vw - panelW - 8);

    let top = triggerRect.bottom + GAP;
    if (top + panelH > vh - 8) top = triggerRect.top - panelH - GAP;

    panel.style.left = `${left}px`;
    panel.style.top  = `${top}px`;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LANGUAGE DETECTION
  ══════════════════════════════════════════════════════════════════════════ */

  function detectLanguage(text) {
    const checks = [
      { lang: "German",  re: /\b(und|der|die|das|ist|ich|wir|mit|von|für|auf|ein|eine|nicht|auch)\b/gi },
      { lang: "French",  re: /\b(le|la|les|de|du|un|une|est|sont|nous|vous|avec|pour|dans|sur)\b/gi },
      { lang: "Spanish", re: /\b(el|la|los|las|de|en|es|son|con|para|por|que|una|uno|también)\b/gi },
    ];
    for (const { lang, re } of checks) {
      if ((text.match(re) || []).length >= 3) {
        L.api(`Language detected: ${lang}`);
        return lang;
      }
    }
    return "English";
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ANTHROPIC API
  ══════════════════════════════════════════════════════════════════════════ */

  async function callAPI(selectedText, tone, isImprove) {
    if (!apiKey) {
      L.warn("No API key — cannot call Anthropic.");
      return null;
    }

    const toneObj = TONES.find(t => t.id === tone) || TONES[0];
    const language = detectLanguage(selectedText);
    const mode = isImprove ? "IMPROVE" : "GENERATE";

    L.api(`Calling Anthropic — mode: ${mode}, tone: ${toneObj.id}, lang: ${language}, chars: ${selectedText.length}`);

    const system = `You are a LinkedIn engagement expert. Your job is to ${isImprove ? "improve the user's draft comment" : "generate a natural LinkedIn comment"}.
Rules:
- Write in ${language}
- Tone: ${toneObj.prompt}
- Length: 1–3 sentences, max 280 characters
- No hashtags, no filler phrases like "Great post!"
- Sound like a thoughtful professional, not a bot
- Be specific to the provided text
- Output ONLY the comment text — no preamble, no quotes`;

    const user = isImprove
      ? `LinkedIn post context / user draft to improve:\n"${selectedText}"\n\nRewrite it with tone: ${toneObj.prompt}. Keep the intent but make it more polished.`
      : `LinkedIn post text (or excerpt):\n"${selectedText}"\n\nGenerate a ${toneObj.prompt} comment.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 180,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || `HTTP ${res.status}`;
      L.error(`Anthropic API error: ${msg}`);
      throw new Error(msg);
    }

    const data = await res.json();
    const comment = data.content?.[0]?.text?.trim() || "";
    if (comment) L.api(`Comment received (${comment.length} chars): "${comment.slice(0, 80)}…"`);
    else L.warn("Anthropic returned empty content.");
    return comment;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CLIPBOARD
  ══════════════════════════════════════════════════════════════════════════ */

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      L.copy(`Copied ${text.length} chars to clipboard ✓`);
      return true;
    } catch (e) {
      // Fallback for older contexts
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        L.copy("Clipboard copy via execCommand fallback ✓");
        return true;
      } catch (e2) {
        L.error(`Clipboard copy failed: ${e2.message}`);
        return false;
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     UI — TRIGGER BUTTON
  ══════════════════════════════════════════════════════════════════════════ */

  let triggerEl = null;
  let panelEl = null;

  function showTrigger(selRect, selectedText, isImproveMode) {
    const shadow = getOrCreateHost();

    // Remove existing trigger if any
    const existing = shadow.getElementById("laic-trigger");
    if (existing) existing.remove();
    if (panelEl) { panelEl.remove(); panelEl = null; }

    triggerEl = document.createElement("button");
    triggerEl.id = "laic-trigger";
    triggerEl.className = "laic-pulse";
    triggerEl.innerHTML = `
      <span class="laic-icon">✦</span>
      <span>${isImproveMode ? "Improve" : "Comment"}</span>
    `;

    triggerEl.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      L.ui(`Trigger clicked — mode: ${isImproveMode ? "improve" : "generate"}`);
      openPanel(selectedText, isImproveMode);
    };

    shadow.appendChild(triggerEl);

    // Position after layout
    requestAnimationFrame(() => {
      positionAboveSelection(triggerEl, selRect);
    });

    L.ui(`Trigger shown — "${selectedText.slice(0, 40)}…" (${isImproveMode ? "IMPROVE" : "GENERATE"} mode)`);
  }

  function hideTrigger() {
    if (!triggerEl) return;
    triggerEl.classList.add("closing");
    triggerEl.addEventListener("animationend", () => {
      triggerEl?.remove();
      triggerEl = null;
    }, { once: true });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     UI — PANEL
  ══════════════════════════════════════════════════════════════════════════ */

  function openPanel(selectedText, isImproveMode) {
    const shadow = getOrCreateHost();

    // Close existing panel
    if (panelEl) { panelEl.remove(); panelEl = null; }

    panelEl = document.createElement("div");
    panelEl.id = "laic-panel";

    renderPanelContent(panelEl, selectedText, isImproveMode, null, null);

    shadow.appendChild(panelEl);

    // Position relative to trigger
    requestAnimationFrame(() => {
      if (!triggerEl || !panelEl) return;
      const tRect = triggerEl.getBoundingClientRect();
      positionPanel(panelEl, tRect);
    });

    L.ui("Panel opened.");
  }

  function renderPanelContent(panel, selectedText, isImproveMode, resultText, errorMsg) {
    const toneObj = TONES.find(t => t.id === activeTone) || TONES[0];

    panel.innerHTML = `
      <!-- Header -->
      <div class="laic-panel-header">
        <div class="laic-panel-title">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L7.39 4.26L11 4.64L8.5 7.03L9.18 10.64L6 8.77L2.82 10.64L3.5 7.03L1 4.64L4.61 4.26L6 1Z"
              fill="#0a66c2" stroke="#0a66c2" stroke-width="0.5" stroke-linejoin="round"/>
          </svg>
          AI Commenter
        </div>
        <button class="laic-close-btn" id="laic-panel-close" title="Close">×</button>
      </div>

      <!-- Context preview — scrollable selected text -->
      <div class="laic-context">
        <div class="laic-context-header">
          <span class="laic-context-label">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 2h7M1.5 5h5M1.5 8h6" stroke="#1d4ed8" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            Selected text
          </span>
          <span class="laic-context-char-count">${selectedText.length} chars</span>
        </div>
        <div class="laic-context-scroll-wrap" id="laic-context-wrap">
          <div class="laic-context-scroll" id="laic-context-scroll">${escHtml(selectedText)}</div>
        </div>
      </div>

      ${isImproveMode ? `<div class="laic-mode-badge">✏ Improve mode</div>` : ""}

      <!-- Tone picker -->
      <div class="laic-section-label">Tone</div>
      <div class="laic-tones" id="laic-tones">
        ${TONES.map(t => `
          <button class="laic-tone ${t.id === activeTone ? "active" : ""}" data-tone="${t.id}">
            ${t.emoji} ${t.label}
          </button>
        `).join("")}
      </div>

      <!-- Generate button -->
      <button class="laic-generate-btn" id="laic-gen-btn">
        <span class="laic-icon">✦</span>
        ${isImproveMode ? "Improve My Comment" : "Generate Comment"}
      </button>

      <!-- Result area (conditionally rendered) -->
      ${resultText ? renderResultHTML(resultText) : ""}
      ${errorMsg  ? renderErrorHTML(errorMsg)  : ""}

      <!-- Footer -->
      <div class="laic-panel-footer">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="4.5" stroke="#e5e7eb"/>
          <path d="M5 2.5v3l2 1" stroke="#d1d5db" stroke-width="1" stroke-linecap="round"/>
        </svg>
        Powered by Claude Sonnet
      </div>
    `;

    // Wire up close button
    panel.querySelector("#laic-panel-close").onclick = (e) => {
      e.stopPropagation();
      L.ui("Panel closed by user.");
      panelEl?.remove(); panelEl = null;
    };

    // Wire up tone pills
    panel.querySelectorAll(".laic-tone").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        activeTone = btn.dataset.tone;
        L.ui(`Tone changed to: ${activeTone}`);
        panel.querySelectorAll(".laic-tone").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      };
    });

    // Wire up generate button
    panel.querySelector("#laic-gen-btn").onclick = async (e) => {
      e.stopPropagation();
      await runGeneration(panel, selectedText, isImproveMode);
    };

    // Detect overflow on context scroll area → show/hide fade gradient
    requestAnimationFrame(() => {
      const scrollEl = panel.querySelector("#laic-context-scroll");
      const wrapEl   = panel.querySelector("#laic-context-wrap");
      if (scrollEl && wrapEl) {
        const overflows = scrollEl.scrollHeight > scrollEl.clientHeight;
        if (overflows) {
          wrapEl.classList.add("overflows");
          L.ui(`Context preview overflows (scrollHeight: ${scrollEl.scrollHeight}px) — fade gradient shown.`);
        }
        // Remove fade when user scrolls to bottom
        scrollEl.addEventListener("scroll", () => {
          const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4;
          wrapEl.classList.toggle("overflows", !atBottom);
        }, { passive: true });
      }
    });

    // Wire up copy/regen buttons if result is already showing
    if (resultText) {
      wireResultButtons(panel, selectedText, isImproveMode, resultText);
    }
  }

  function renderResultHTML(text) {
    return `
      <div class="laic-result-area" id="laic-result-area">
        <div class="laic-result-text" id="laic-result-text">${escHtml(text)}</div>
        <div class="laic-result-actions" id="laic-result-actions">
          <button class="laic-action-btn primary" id="laic-copy-btn">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            Copy
          </button>
          <button class="laic-action-btn secondary" id="laic-regen-btn">↺ Regenerate</button>
        </div>
      </div>
    `;
  }

  function renderErrorHTML(msg) {
    return `
      <div class="laic-error-box">
        <span style="flex-shrink:0;font-size:14px">⚠</span>
        <span>${escHtml(msg)}</span>
      </div>
    `;
  }

  function wireResultButtons(panel, selectedText, isImproveMode, resultText) {
    const copyBtn  = panel.querySelector("#laic-copy-btn");
    const regenBtn = panel.querySelector("#laic-regen-btn");

    if (copyBtn) {
      copyBtn.onclick = async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(resultText);
        if (ok) {
          copyBtn.className = "laic-action-btn success";
          copyBtn.innerHTML = `
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path class="laic-check-path" d="M2 5.5l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Copied!
          `;
          setTimeout(() => {
            if (copyBtn.isConnected) {
              copyBtn.className = "laic-action-btn primary";
              copyBtn.innerHTML = `
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
                Copy
              `;
            }
          }, 2200);
        }
      };
    }

    if (regenBtn) {
      regenBtn.onclick = async (e) => {
        e.stopPropagation();
        L.ui("Regenerate clicked.");
        await runGeneration(panel, selectedText, isImproveMode);
      };
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     GENERATION FLOW
  ══════════════════════════════════════════════════════════════════════════ */

  async function runGeneration(panel, selectedText, isImproveMode) {
    if (isGenerating) {
      L.warn("Generation already running — ignoring.");
      return;
    }
    isGenerating = true;
    L.api(`runGeneration() start — tone: ${activeTone}, improve: ${isImproveMode}`);

    const genBtn = panel.querySelector("#laic-gen-btn");

    // Show loading state
    if (genBtn) {
      genBtn.disabled = true;
      genBtn.innerHTML = `<span class="laic-spinner"></span> Generating…`;
    }

    // Shimmer in result area
    let resultArea = panel.querySelector("#laic-result-area");
    if (!resultArea) {
      resultArea = document.createElement("div");
      resultArea.className = "laic-result-area";
      resultArea.id = "laic-result-area";
      resultArea.innerHTML = `<div class="laic-result-text loading" id="laic-result-text">&nbsp;</div>`;
      // Insert before footer
      const footer = panel.querySelector(".laic-panel-footer");
      const errorBox = panel.querySelector(".laic-error-box");
      if (errorBox) errorBox.remove();
      panel.insertBefore(resultArea, footer);
    } else {
      const txt = resultArea.querySelector("#laic-result-text");
      if (txt) { txt.className = "laic-result-text loading"; txt.textContent = "\u00a0"; }
      const acts = resultArea.querySelector("#laic-result-actions");
      if (acts) acts.remove();
    }

    // Reposition panel since height may change
    requestAnimationFrame(() => {
      if (!triggerEl || !panelEl) return;
      positionPanel(panelEl, triggerEl.getBoundingClientRect());
    });

    try {
      if (!selectedText.trim()) {
        throw new Error("No text selected — please select some text first.");
      }
      if (!apiKey) {
        throw new Error("No API key set. Click the extension icon to add your Anthropic API key.");
      }

      const comment = await callAPI(selectedText, activeTone, isImproveMode);
      if (!comment) throw new Error("API returned an empty response. Please try again.");

      // Render result
      const txt = resultArea.querySelector("#laic-result-text");
      if (txt) {
        txt.className = "laic-result-text";
        txt.textContent = comment;
      }

      // Add action buttons
      let acts = resultArea.querySelector("#laic-result-actions");
      if (!acts) {
        acts = document.createElement("div");
        acts.id = "laic-result-actions";
        acts.className = "laic-result-actions";
        resultArea.appendChild(acts);
      }
      acts.innerHTML = `
        <button class="laic-action-btn primary" id="laic-copy-btn">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M2 8V2h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Copy
        </button>
        <button class="laic-action-btn secondary" id="laic-regen-btn">↺ Regenerate</button>
      `;

      wireResultButtons(panel, selectedText, isImproveMode, comment);

      // Auto-copy and notify
      await copyToClipboard(comment);
      showCopiedHint(panel);

      L.api("Generation complete — comment shown and auto-copied.");

    } catch (err) {
      L.error(`Generation failed: ${err.message}`);

      // Remove shimmer result area if empty
      if (resultArea) resultArea.remove();

      // Show error box
      const existing = panel.querySelector(".laic-error-box");
      if (existing) existing.remove();

      const errBox = document.createElement("div");
      errBox.className = "laic-error-box";
      errBox.innerHTML = `<span style="flex-shrink:0;font-size:14px">⚠</span><span>${escHtml(err.message)}</span>`;
      const footer = panel.querySelector(".laic-panel-footer");
      panel.insertBefore(errBox, footer);
    } finally {
      isGenerating = false;
      if (genBtn) {
        genBtn.disabled = false;
        genBtn.innerHTML = `<span class="laic-icon">✦</span> ${isImproveMode ? "Improve My Comment" : "Generate Comment"}`;
      }
      // Reposition after content change
      requestAnimationFrame(() => {
        if (!triggerEl || !panelEl) return;
        positionPanel(panelEl, triggerEl.getBoundingClientRect());
      });
    }
  }

  function showCopiedHint(panel) {
    // Brief "Copied to clipboard" badge near the top of the panel
    const badge = document.createElement("div");
    badge.style.cssText = `
      position:absolute; top:8px; right:38px;
      background:#057642; color:#fff; font-size:10.5px; font-weight:700;
      padding:3px 9px; border-radius:20px;
      animation:result-fade 0.15s ease forwards;
      pointer-events:none;
      font-family:-apple-system,sans-serif;
    `;
    badge.textContent = "✓ Auto-copied!";
    panelEl.style.position = "fixed"; // ensure absolute children anchor correctly
    panelEl.appendChild(badge);
    setTimeout(() => badge.remove(), 2500);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     SELECTION HANDLER — the core DOM-independent entry point
  ══════════════════════════════════════════════════════════════════════════ */

  function handleSelectionChange() {
    clearTimeout(hideTimer);

    const sel = window.getSelection();
    const text = sel?.toString().trim() || "";

    if (text.length < MIN_SELECTION_LENGTH) {
      // Small or empty selection — schedule hide (short delay to avoid flicker)
      hideTimer = setTimeout(() => {
        hideTrigger();
        L.sel(`Selection cleared or too short (${text.length} chars) — trigger hidden.`);
      }, 200);
      return;
    }

    const selRect = getSelectionRect();
    if (!selRect) {
      L.warn("Selection present but getBoundingClientRect returned null.");
      return;
    }

    lastSelectedText = text;

    // Decide mode: if the selection looks like a draft comment (short, typed text)
    // vs a post excerpt (longer, read-only context).
    // Heuristic: selection inside a contenteditable = improve mode
    const anchorNode = sel.anchorNode;
    let isImproveMode = false;
    if (anchorNode) {
      let node = anchorNode.nodeType === 3 ? anchorNode.parentElement : anchorNode;
      while (node && node !== document.body) {
        if (node.isContentEditable) { isImproveMode = true; break; }
        node = node.parentElement;
      }
    }

    L.sel(`Selection: ${text.length} chars, mode: ${isImproveMode ? "IMPROVE" : "GENERATE"} — "${text.slice(0, 50)}…"`);

    showTrigger(selRect, text, isImproveMode);
  }

  // Debounce: wait for user to finish selecting before showing trigger
  let selectionDebounce = null;

  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(handleSelectionChange, 120);
  });

  /* ══════════════════════════════════════════════════════════════════════════
     DISMISS LOGIC
     Close panel/trigger when user clicks outside our shadow DOM.
  ══════════════════════════════════════════════════════════════════════════ */

  document.addEventListener("mousedown", (e) => {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    // If click is inside our host element, ignore
    if (host.contains(e.target)) return;
    // If click is on the host's shadow root children, ignore
    if (e.composedPath().some(n => n === host)) return;

    if (panelEl) {
      panelEl.remove();
      panelEl = null;
      L.ui("Panel dismissed (outside click).");
    }
    // Don't hide trigger on every mousedown — only hide on new selection change
  }, true);

  /* ══════════════════════════════════════════════════════════════════════════
     REPOSITION ON SCROLL / RESIZE
     Keep the trigger anchored to the selection even when the page moves.
  ══════════════════════════════════════════════════════════════════════════ */

  function reanchor() {
    if (!triggerEl) return;
    const selRect = getSelectionRect();
    if (!selRect) return;
    positionAboveSelection(triggerEl, selRect);
    if (panelEl) {
      positionPanel(panelEl, triggerEl.getBoundingClientRect());
    }
  }

  let reanchorRaf = null;
  const onScrollResize = () => {
    cancelAnimationFrame(reanchorRaf);
    reanchorRaf = requestAnimationFrame(reanchor);
  };

  window.addEventListener("scroll", onScrollResize, { passive: true, capture: true });
  window.addEventListener("resize", onScrollResize, { passive: true });

  /* ══════════════════════════════════════════════════════════════════════════
     SPA NAVIGATION (Feed ↔ Profile ↔ etc.)
  ══════════════════════════════════════════════════════════════════════════ */

  function patchHistory() {
    if (window.__laicHistoryPatched) return;
    window.__laicHistoryPatched = true;

    const wrap = (orig) => function (...args) {
      orig.apply(this, args);
      window.dispatchEvent(new CustomEvent("laic:nav", { detail: { path: location.pathname } }));
    };

    history.pushState    = wrap(history.pushState.bind(history));
    history.replaceState = wrap(history.replaceState.bind(history));
    L.nav("History methods patched for SPA navigation.");
  }

  window.addEventListener("laic:nav", (e) => {
    const newPath = e.detail?.path;
    if (newPath === currentRoute) return;
    L.nav(`Route: "${currentRoute}" → "${newPath}"`);
    currentRoute = newPath;
    // Clean up any floating UI on navigation
    if (panelEl) { panelEl.remove(); panelEl = null; }
    hideTrigger();
  });

  window.addEventListener("popstate", () => {
    const newPath = location.pathname;
    if (newPath === currentRoute) return;
    L.nav(`Popstate: "${currentRoute}" → "${newPath}"`);
    currentRoute = newPath;
    if (panelEl) { panelEl.remove(); panelEl = null; }
    hideTrigger();
  });

  /* ══════════════════════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════════════════════ */

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ══════════════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════════════ */

  function init() {
    L.init("══════════════════════════════════════════");
    L.init("  LinkedIn AI Commenter v3 — Selection UI  ");
    L.init("══════════════════════════════════════════");
    L.init(`Route: "${location.pathname}"`);
    L.init("Mode: DOM-independent selection trigger (Grammarly model)");
    L.init(`Min selection length: ${MIN_SELECTION_LENGTH} chars`);

    getOrCreateHost(); // pre-create shadow root
    patchHistory();

    L.init("Ready — waiting for text selections on linkedin.com");
  }

  init();

})();