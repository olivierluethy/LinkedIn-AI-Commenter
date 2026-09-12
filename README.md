# LinkedIn AI Commenter

A Chrome extension that turns any text you select on LinkedIn into an AI-generated comment.
Highlight a post, trigger the extension, and get a ready-to-paste reply drafted by Claude —
independently of LinkedIn's changing DOM.

## Features

- Select any text on a LinkedIn page and generate a comment from it on the spot.
- Powered by the **Anthropic Claude API** (calls run from your browser with your own API key).
- API key is entered in the popup and stored locally via `chrome.storage` — nothing is sent
  to any third-party server besides Anthropic.
- Generated comments can be copied to the clipboard.
- Content script + styling injected only on `linkedin.com`, so it works even as LinkedIn's
  markup changes.

## Tech

- Chrome **Manifest V3** extension (content script + popup)
- Vanilla JavaScript, HTML, CSS
- Anthropic Claude API (`api.anthropic.com`)

## Install (developer mode)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer Mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Open the extension popup and paste your Anthropic API key (get one at
   [console.anthropic.com](https://console.anthropic.com/settings/keys)).

## Usage

1. Go to any LinkedIn page.
2. Select the text you want to respond to.
3. Use the extension to generate a comment, then copy it into the LinkedIn comment box.

## Permissions

`storage` (save your API key), `activeTab` and `clipboardWrite` (copy the result), plus host
access to `linkedin.com` and `api.anthropic.com`.
