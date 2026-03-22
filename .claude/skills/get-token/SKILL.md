---
name: get-token
description: Retrieve a game token or download training data from app.ainm.no using Playwright browser automation. Use when the user wants to play a challenge, get a token, start a game, download data, needs a fresh WebSocket URL, or says anything like "get token", "start game", "download data", "play easy/medium/hard/expert", or "connect to game".
---

# Get Token / Download Data

Retrieve a game token or navigate to the data download page on the NM i AI platform using Playwright browser automation.

## Prerequisites

- Playwright MCP must be available (configured in `.mcp.json`)
- User must have a Google account registered on app.ainm.no

## Steps

### 1. Navigate to the challenge page

Open `https://app.ainm.no/challenge` using Playwright.

### 2. Check authentication status

Look at the page snapshot for a "Sign in" link/button in the navigation bar.

- **If "Sign in" is visible**: The user is not logged in. Navigate to `https://app.ainm.no` and click "Sign in". If Google OAuth requires a human click in the browser, notify the user and wait.
- **If a user menu or avatar is visible**: The user is already logged in. Proceed.

### 3. Determine challenge type

Check which challenge the user wants to interact with:

**For WebSocket game challenges** (e.g., Astar Island):
- Select difficulty (Easy, Medium, Hard, Expert)
- Click Play to generate a game session
- Extract the WebSocket URL (`wss://game.ainm.no/ws?token=<jwt>`)
- Save to `.env` as `TOKEN=<url>`

**For offline ML challenges** (e.g., NorgesGruppen Data):
- Navigate to the Submit page for the challenge
- Look for download links for training data
- Inform the user of available downloads and their URLs
- The user will need to download manually (requires authentication)

### 4. Save to .env (if applicable)

For WebSocket game tokens, write to `.env`:
```
TOKEN=wss://game.ainm.no/ws?token=<the_extracted_token>
```

### 5. Proceed

The token is saved or download links are provided. Continue with the next step in the workflow.
