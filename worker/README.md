# AI booking assistant: backend

Cloudflare Worker that powers the chat widget (`assets/chat/widget.js`).

## What it does
- Receives the chat history from the widget (`POST /chat`).
- Asks the AI model, using the company's approved knowledge (`knowledge.js`).
- When the guest's request is complete, the model calls `save_request`; the worker sends the request card to the team (webhook and/or Telegram).
- Only websites listed in `ALLOWED_ORIGINS` can use it.

## Launch (about 15 minutes)
1. Create an API key with the model provider (Anthropic Console) and a free Cloudflare account.
2. In this folder: `npm install -g wrangler` (or use `npx wrangler`), then `npx wrangler login`.
3. `npx wrangler secret put ANTHROPIC_API_KEY` and paste the key.
4. Optional notifications: `npx wrangler secret put NOTIFY_WEBHOOK` (Slack, Make, Zapier, Google Apps Script URL) or set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
5. Edit `ALLOWED_ORIGINS` in `wrangler.toml` to the client's website, then `npx wrangler deploy`. Wrangler prints the worker URL.
6. On the website, before the widget script:
   ```html
   <script>window.AmpliteiaChat = { apiUrl: "https://<your-worker>.workers.dev/chat", brand: "Dubai Relax Tours" };</script>
   <script src="https://elhakobyan.github.io/ampliteia/assets/chat/widget.js" defer></script>
   ```

## Before going live for a client
- Replace the text in `knowledge.js` with the client's real tours, inclusions and policies.
- Turn on Cloudflare rate limiting for the worker and set a monthly spend limit on the API key.
- Test with the client's real questions, including ones the assistant should NOT answer.
- Show a privacy notice in the chat if the client collects personal data.
