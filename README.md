# PW Report Builder

AI-powered T-SQL report builder for Projectworks data in Metabase. Describe what you need in plain English — the assistant asks clarifying questions and writes production-ready SQL.

## Setup

**Requirements:** Node.js 18+

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the env template and add your Anthropic API key:
   ```
   cp .env.example .env
   ```
   Then open `.env` and replace `your-key-here` with your actual key.

3. Start the server:
   ```
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## How it works

- The Express server in `server.js` serves the static files and proxies all Anthropic API calls server-side — your API key never touches the browser.
- The system prompt (the Projectworks schema guidance) is read from `CLAUDE.md` at startup.
- Conversation history is maintained in memory in the browser and sent with each request so the model has full context.
- When the AI response contains a SQL block, it automatically appears in the right panel with syntax highlighting and a copy button.

## Azure Deployment

Deploy to Azure App Service (Node.js on Linux or Windows with IISNode). Set the following as **Application Settings** in the Azure portal — never commit real values to this repo.

**Required**
| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key — the app will not start AI chat without this |
| `SESSION_SECRET` | Random string used to sign session cookies |

**Database** (enables live schema introspection)
| Variable | Description |
|---|---|
| `DB_HOST` | SQL Server hostname |
| `DB_PORT` | Port (default `1433`) |
| `DB_USER` | SQL Server username |
| `DB_PASSWORD` | SQL Server password |
| `DB_NAME` | Database name |
| `DB_TRUST_CERT` | Set to `true` for self-signed certs (dev/staging only) |

**Embedding** (required when hosting inside the Projectworks product shell)
| Variable | Description |
|---|---|
| `ALLOWED_EMBED_DOMAINS` | Comma-separated domains allowed to iframe this app (e.g. `projectworks.com,projectworks.io`) |
| `REQUIRE_SIGNED_ORG_ID` | Set to `1` to reject unsigned tenant context — **must be on in production** |

The `.azure/` directory contains `web.config` (IISNode routing) and `deploy.sh` (Kudu deployment script).

## Files

| File | Purpose |
|---|---|
| `server.js` | Express server — static files + API proxy |
| `api.js` | Browser-side API client (calls `/api/*`) |
| `app.js` | UI logic and conversation state |
| `index.html` | App shell |
| `styles.css` | All styles |
| `CLAUDE.md` | System prompt — Projectworks schema, danger words, SQL rules |
| `.env` | Your API key (git-ignored) |
