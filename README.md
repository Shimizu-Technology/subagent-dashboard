# Sub-Agent Dashboard

A real-time monitoring dashboard for Jerry's sub-agents. Track active sessions, view transcripts, and monitor costs.

## Features

- 📊 **Session Overview** — See all sessions with message count, tokens, and cost
- 🏷️ **Sub-Agent Detection** — Automatically identifies and filters sub-agent sessions
- 📝 **Transcript Viewer** — View full conversation history with markdown rendering
- 🔄 **Auto-Refresh** — Updates every 10 seconds (configurable)
- 🌙 **Dark Mode** — Proper dark theme (not pure black)
- 📱 **Responsive** — Works on mobile and half-screen desktop
- ⚡ **Performance** — Pagination for large sessions, instant click feedback

## Quick Start

```bash
# Install dependencies
npm install

# Start both API and frontend
npm run dev

# Frontend: http://localhost:5173
# API: http://localhost:3001
```

## Architecture

```
├── server/
│   └── index.ts        # Express API that reads OpenClaw session files
├── src/
│   └── App.tsx         # React dashboard with Tailwind + Framer Motion
└── scripts/
    └── jerry-menubar.sh  # SwiftBar plugin for macOS menu bar
```

### API Endpoints

- `GET /api/sessions` — List all sessions with stats
- `GET /api/sessions/:id` — Get full transcript for a session

### Data Source

Reads session JSONL files from: `~/.openclaw/agents/main/sessions/`

## Menu Bar Widget (SwiftBar)

Monitor Jerry's status from your macOS menu bar!

### Installation

1. **Install SwiftBar:**
   ```bash
   brew install --cask swiftbar
   ```

2. **Create plugins folder and add script:**
   ```bash
   mkdir -p ~/Library/Application\ Support/SwiftBar/Plugins
   
   curl -o ~/Library/Application\ Support/SwiftBar/Plugins/jerry.30s.sh \
     https://raw.githubusercontent.com/Shimizu-Technology/subagent-dashboard/main/scripts/jerry-menubar.sh
   
   chmod +x ~/Library/Application\ Support/SwiftBar/Plugins/jerry.30s.sh
   ```

3. **Open SwiftBar:**
   ```bash
   open -a SwiftBar
   ```
   
   When prompted, select: `~/Library/Application Support/SwiftBar/Plugins`

### What You'll See

- **🟢 2** — 2 active sessions (green = activity)
- **🤖** — Jerry idle (gray)
- Click to see details and open full dashboard

## Remote Access

The dashboard runs on the Mac Mini and is accessible via Tailscale:

- **Dashboard:** http://100.116.235.105:5173
- **API:** http://100.116.235.105:3001

## Development

```bash
# Run frontend only
npm run dev:client

# Run API only  
npm run dev:server

# Build for production
npm run build
```

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS v4
- **Animations:** Framer Motion
- **Backend:** Express + TypeScript
- **Icons:** Lucide React
- **Markdown:** react-markdown

## License

Private — Shimizu Technology
