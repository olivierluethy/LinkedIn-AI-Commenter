/**
 * LinkedIn AI Commenter — content.js
 * Injects AI-powered comment generation buttons into LinkedIn posts.
 */

(function () {
  "use strict";

  // ─── CONFIG ────────────────────────────────────────────────────────────────

  const SELECTORS = {
    postContainer: ".feed-shared-update-v2",
    postText:
      ".feed-shared-update-v2__description-wrapper, .update-components-text, .feed-shared-text",
    commentEditor: ".tiptap.ProseMirror._46f2fbf2._5c7d14c9.c8fc845c",
    commentBox:
      ".comments-comment-box, .comments-comment-texteditor, .comment-field",
  };

  const TONES = [
    { id: "thoughtful", label: "💡 Insightful", prompt: "thoughtful and insightful, adding real value" },
    { id: "professional", label: "💼 Professional", prompt: "professional and authoritative" },
    { id: "casual", label: "😊 Casual", prompt: "friendly and casual, conversational tone" },
    { id: "provocative", label: "🔥 Bold", prompt: "bold and slightly provocative, sparking discussion" },
    { id: "supportive", label: "🙌 Supportive", prompt: "warm, encouraging and supportive" },
  ];

  // ─── STATE ──────────────────────────────────────────────────────────────────

  let apiKey = "";
  let isLoading = false;

  // Load API key from storage
  chrome.storage.sync.get(["anthropicApiKey"], (result) => {
    apiKey = result.anthropicApiKey || "";
  });

  // Listen for API key updates from popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "API_KEY_UPDATED") {
      apiKey = message.key || "";
    }
  });

  // ─── UTILITIES ──────────────────────────────────────────────────────────────

  function getPostText(editorEl) {
    // Walk up from the comment editor to find the parent post container
    let node = editorEl;
    for (let i = 0; i < 20; i++) {
      node = node.parentElement;
      if (!node) break;

      // Try to find post text within this ancestor
      const textEl = node.querySelector(SELECTORS.postText);
      if (textEl) {
        return textEl.innerText.trim().slice(0, 1500); // Cap at 1500 chars
      }

      // Also check if we've reached the feed post root
      if (node.matches(SELECTORS.postContainer)) {
        const textEl2 = node.querySelector(SELECTORS.postText);
        if (textEl2) return textEl2.innerText.trim().slice(0, 1500);
        break;
      }
    }
    return "";
  }

  function detectLanguage(text) {
    // Simple heuristic: check for common German words
    const germanIndicators =
      /\b(und|der|die|das|ist|ich|Sie|wir|mit|von|für|auf|ein|eine|nicht|auch|an|zu|als|bei|nach|über|unter|durch)\b/gi;
    const matches = text.match(germanIndicators);
    if (matches && matches.length >= 3) return "German";
    // French indicators
    const frenchIndicators =
      /\b(le|la|les|de|du|un|une|est|sont|nous|vous|avec|pour|dans|sur|par|au|aux|je|tu|il|elle)\b/gi;
    const frMatches = text.match(frenchIndicators);
    if (frMatches && frMatches.length >= 3) return "French";
    // Spanish indicators
    const spanishIndicators =
      /\b(el|la|los|las|de|en|es|son|con|para|por|que|una|uno|también|como|se|su|más|pero)\b/gi;
    const esMatches = text.match(spanishIndicators);
    if (esMatches && esMatches.length >= 3) return "Spanish";
    return "English";
  }

  // ─── API CALL ───────────────────────────────────────────────────────────────

  async function generateComment(postText, tone, userDraft = "") {
    if (!apiKey) {
      showApiKeyPrompt();
      return null;
    }

    const language = detectLanguage(postText);
    const toneObj = TONES.find((t) => t.id === tone) || TONES[0];

    const systemPrompt = `You are a LinkedIn engagement expert. Generate a single, natural-sounding LinkedIn comment.
Rules:
- Write in ${language}
- Tone: ${toneObj.prompt}
- Length: 1–3 sentences, max 300 characters
- No hashtags, no emojis (unless very natural), no generic phrases like "Great post!"
- Sound like a real professional, not a bot
- Be specific to the post content
- Output ONLY the comment text, nothing else`;

    const userPrompt = userDraft
      ? `Post content: "${postText}"\n\nUser's draft to improve: "${userDraft}"\n\nImprove the draft to match the tone while keeping the user's intent.`
      : `Post content: "${postText}"\n\nGenerate a ${toneObj.prompt} comment for this post.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text?.trim() || "";
  }

  // ─── UI INJECTION ───────────────────────────────────────────────────────────

  function injectButtonsIntoEditor(editorEl) {
    const parent = editorEl.parentElement;
    if (!parent) return;
    if (parent.querySelector(".laic-toolbar")) return; // Already injected

    const toolbar = document.createElement("div");
    toolbar.className = "laic-toolbar";

    // Generate Comment button (primary)
    const generateBtn = createGenerateButton(editorEl, toolbar);
    toolbar.appendChild(generateBtn);

    // Tone selector (shown after first generation or on expand)
    const toneRow = createToneRow(editorEl, toolbar);
    toolbar.appendChild(toneRow);

    // Result preview area
    const preview = document.createElement("div");
    preview.className = "laic-preview hidden";
    toolbar.appendChild(preview);

    parent.appendChild(toolbar);
  }

  function createGenerateButton(editorEl, toolbar) {
    const btn = document.createElement("button");
    btn.className = "laic-btn laic-btn-primary";
    btn.innerHTML = `<span class="laic-btn-icon">✦</span> Generate Comment`;
    btn.setAttribute("data-laic", "generate");

    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const activeTone =
        toolbar.querySelector(".laic-tone-btn.active")?.dataset.tone ||
        "thoughtful";
      await runGeneration(editorEl, toolbar, activeTone, false);
    };

    return btn;
  }

  function createToneRow(editorEl, toolbar) {
    const row = document.createElement("div");
    row.className = "laic-tone-row";

    TONES.forEach((tone, i) => {
      const btn = document.createElement("button");
      btn.className = `laic-tone-btn ${i === 0 ? "active" : ""}`;
      btn.dataset.tone = tone.id;
      btn.textContent = tone.label;

      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Update active state
        row.querySelectorAll(".laic-tone-btn").forEach((b) =>
          b.classList.remove("active")
        );
        btn.classList.add("active");
        // Auto-regenerate if there's already content
        const preview = toolbar.querySelector(".laic-preview");
        if (preview && !preview.classList.contains("hidden")) {
          await runGeneration(editorEl, toolbar, tone.id, false);
        }
      };

      row.appendChild(btn);
    });

    return row;
  }

  async function runGeneration(editorEl, toolbar, tone, isImprove) {
    if (isLoading) return;
    isLoading = true;

    const btn = toolbar.querySelector("[data-laic='generate']");
    const preview = toolbar.querySelector(".laic-preview");

    // Loading state
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="laic-spinner"></span> Generating…`;
    }

    const postText = getPostText(editorEl);
    const userDraft = isImprove ? editorEl.innerText.trim() : "";

    try {
      if (!postText && !userDraft) {
        showPreviewError(preview, "Could not detect post text. Please scroll to the post.");
        return;
      }

      const comment = await generateComment(postText, tone, userDraft);
      if (!comment) return;

      showPreviewResult(preview, comment, editorEl, toolbar);
    } catch (err) {
      showPreviewError(preview, err.message || "Generation failed. Check your API key.");
    } finally {
      isLoading = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="laic-btn-icon">✦</span> Generate Comment`;
      }
    }
  }

  function showPreviewResult(preview, comment, editorEl, toolbar) {
    preview.classList.remove("hidden", "laic-error");
    preview.innerHTML = `
      <div class="laic-result-text">${escapeHtml(comment)}</div>
      <div class="laic-result-actions">
        <button class="laic-btn laic-btn-insert" data-laic="insert">↩ Use This</button>
        <button class="laic-btn laic-btn-ghost" data-laic="regenerate">↺ Regenerate</button>
        <button class="laic-btn laic-btn-ghost laic-btn-improve" data-laic="improve">✏ Improve Mine</button>
      </div>
    `;

    // Insert button
    preview.querySelector("[data-laic='insert']").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertTextIntoEditor(editorEl, comment);
      preview.classList.add("hidden");
    };

    // Regenerate button
    preview.querySelector("[data-laic='regenerate']").onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const activeTone =
        toolbar.querySelector(".laic-tone-btn.active")?.dataset.tone || "thoughtful";
      await runGeneration(editorEl, toolbar, activeTone, false);
    };

    // Improve my draft button
    preview.querySelector("[data-laic='improve']").onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const activeTone =
        toolbar.querySelector(".laic-tone-btn.active")?.dataset.tone || "thoughtful";
      await runGeneration(editorEl, toolbar, activeTone, true);
    };
  }

  function showPreviewError(preview, message) {
    preview.classList.remove("hidden");
    preview.classList.add("laic-error");
    preview.innerHTML = `<span>⚠ ${escapeHtml(message)}</span>`;
  }

  function insertTextIntoEditor(editorEl, text) {
    // Focus the editor
    editorEl.focus();

    // Clear existing content and insert new text
    // LinkedIn uses Quill, so we simulate input events
    editorEl.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = text;
    editorEl.appendChild(p);

    // Dispatch input events so LinkedIn's React picks up the change
    editorEl.dispatchEvent(new Event("input", { bubbles: true }));
    editorEl.dispatchEvent(new Event("change", { bubbles: true }));

    // Move cursor to end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function showApiKeyPrompt() {
    // Open popup by triggering a notification
    const el = document.createElement("div");
    el.className = "laic-api-notice";
    el.innerHTML = `
      <strong>LinkedIn AI Commenter</strong><br>
      Please add your Anthropic API key in the extension popup to get started.
      <button class="laic-notice-close">×</button>
    `;
    document.body.appendChild(el);
    el.querySelector(".laic-notice-close").onclick = () => el.remove();
    setTimeout(() => el.remove(), 6000);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── MUTATION OBSERVER ──────────────────────────────────────────────────────

  function scanAndInject() {
    document.querySelectorAll(SELECTORS.commentEditor).forEach((editor) => {
      // Only inject if the editor is visible and inside a comment area
      if (editor.offsetParent === null) return; // hidden
      injectButtonsIntoEditor(editor);
    });
  }

  // Observe DOM changes to catch dynamically loaded comment boxes
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          // Check if this node or its children contain comment editors
          if (
            node.matches?.(SELECTORS.commentEditor) ||
            node.querySelector?.(SELECTORS.commentEditor)
          ) {
            shouldScan = true;
            break;
          }
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) {
      // Small delay to let LinkedIn finish rendering
      setTimeout(scanAndInject, 150);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial scan
  setTimeout(scanAndInject, 1000);

  // Also listen for click events on comment buttons (LinkedIn opens comment box on click)
  document.addEventListener(
    "click",
    (e) => {
      // When user clicks the LinkedIn "Comment" button, wait for editor to appear
      const commentTrigger = e.target.closest(
        '[aria-label*="comment" i], [data-control-name*="comment" i], .comment-button'
      );
      if (commentTrigger) {
        setTimeout(scanAndInject, 300);
        setTimeout(scanAndInject, 700);
      }
    },
    true
  );

})();
