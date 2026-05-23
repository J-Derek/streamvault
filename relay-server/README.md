# StreamVault Relay Server

WebSocket relay for Watch Together real-time sync (chat, reactions, play/pause).

## Quick Start

```bash
cd relay-server
npm install
npm start
```

Runs on `ws://localhost:3001` by default. Set `PORT=3001` env var to change.

## Deploy to Production

### Railway (easiest, free tier)
```bash
npx railway login
npx railway init
npx railway up
```

### Render
1. Create a new Web Service
2. Set build command: `cd relay-server && npm install`
3. Set start command: `node relay-server/server.js`

### After deploying
Set `VITE_RELAY_URL=wss://your-app.railway.app` in your app's `.env.local`.

Then restart `npm run dev` and the app will connect to the deployed relay.

## How to test locally

```bash
# Terminal 1: Start the relay
cd relay-server && npm start

# Terminal 2: Start the app
cd .. && npm run dev
```

Open two browser tabs at `http://localhost:5173`:
- Tab 1: Click any movie → "Watch Together" → creates a room
- Tab 2: Open the invite link
- Chat and reactions sync in real-time between both tabs
