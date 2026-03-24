# LinkedIn AI Commenter — Chrome Extension

Generate high-quality, context-aware LinkedIn comments instantly using Claude AI.

## Features

- **✦ AI Comment Generation** — One click generates a relevant comment for any LinkedIn post
- **🌍 Language Detection** — Automatically responds in the post's language (EN, DE, FR, ES, and more)
- **🎭 5 Tone Presets** — Insightful, Professional, Casual, Bold, Supportive
- **✏️ Improve Your Draft** — Paste your text and improve it with AI
- **⚡ Dynamic Injection** — Works with LinkedIn's infinite scroll, no page refresh needed
- **🔒 Private** — Your API key is stored locally, never sent anywhere except Anthropic's API

---

## Installation

### Step 1: Get an Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com/settings/keys)
2. Create an account and add a payment method
3. Generate a new API key (starts with `sk-ant-api03-…`)

### Step 2: Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select this folder: `linkedin-ai-commenter/`

### Step 3: Add Your API Key
1. Click the extension icon (✦) in your Chrome toolbar
2. Paste your Anthropic API key
3. Click **Save API Key**
4. The status badge should turn green: **Connected · Ready**

### Step 4: Use on LinkedIn
1. Go to [linkedin.com](https://www.linkedin.com/feed/)
2. Click the **Comment** button on any post
3. The AI toolbar appears below the comment box
4. Click **✦ Generate Comment** — done!

---

## How It Works

```
LinkedIn Post
      ↓
  Post text scraped
      ↓
  Language detected
      ↓
  Claude API called with tone + context
      ↓
  Comment generated (1–3 sentences)
      ↓
  Preview shown → one click to insert
```

### Tone Options
| Tone | Best for |
|------|----------|
| 💡 Insightful | Adding expertise, thought leadership |
| 💼 Professional | B2B, formal contexts |
| 😊 Casual | Personal posts, friendly engagement |
| 🔥 Bold | Sparking discussion, controversial topics |
| 🙌 Supportive | Celebrating achievements, encouragement |

---

## Cost Estimate
Using Claude Sonnet, each comment generation costs approximately **$0.001–$0.003** (less than half a cent).

---

## File Structure
```
linkedin-ai-commenter/
├── manifest.json       # Extension config
├── content.js          # Main injection logic + AI calls
├── content.css         # Injected styles (LinkedIn-matching)
├── popup.html          # Settings popup UI
├── popup.js            # Popup logic (API key management)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Troubleshooting

**Buttons don't appear?**
- Make sure you've clicked the Comment button to open the comment box first
- Try scrolling past the post and back
- Reload the LinkedIn tab

**"Could not detect post text"?**
- Some posts (polls, shared articles) may not have extractable text
- Try on a regular text post

**API errors?**
- Check your API key is correct in the popup
- Make sure your Anthropic account has available credits
