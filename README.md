# Syntagraphia

Open-source tool that helps you write better docs with AI.

As vibe-coded projects grow, it's easy to lose context of what was built and why. Syntagraphia keeps everything structured and connected — so you (and your AI agents) always stay on the same page.

---

## Quick Start

```bash
npm install
npm run dev
```

- **API server** → http://localhost:3001
- **Web UI** → http://localhost:5173

## Stack

- **Backend** — Express + SQLite (better-sqlite3)
- **Frontend** — React + Vite
- **Storage** — Local `.md` files + `project-tracker.db`
