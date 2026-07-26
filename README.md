# Syntagraphia

Open-source tool that helps you write better docs with AI — and keep them structured and connected.

Syntagraphia combines the Greek words σύνταξη (syntax, structure, arrangement) and γραφή (writing, description, representation), reflecting the project’s goal of turning information into a well-structured knowledge graph.

As vibe-coded projects grow, it's easy to lose context of what was built and why. Syntagraphia keeps
your **features, tech specs, tasks, and verifications** in a single local SQLite database, linked by
explicit relations — so you (and your AI agents) always stay on the same page.

Syntagraphia is a **CLI** (with an optional web UI). Document content lives entirely in the DB; there
are no `.md` files or `features/`/`tasks/` directories to manage on disk.

---

## Demo

[![Syntagraphia: Escaping Vibe Coding Chaos](https://img.youtube.com/vi/oc32Ddz28cE/maxresdefault.jpg)](https://youtu.be/oc32Ddz28cE)

## Install

```bash
# Use without installing (recommended for AI agents):
npx syntagraphia <command>

# Or install globally (nicer for humans running the UI repeatedly):
npm install -g syntagraphia
```

Requires **Node ≥ 22** (uses the built-in `node:sqlite`).

## Quick start

From your project's root:

```bash
# 1. Initialize: creates project-tracker.db and captures your constitution
syntagraphia init

# 2. Print the agent-facing workflow + command reference
syntagraphia instructions

# 3. Create connected docs for a feature
syntagraphia doc create feature user-auth
syntagraphia doc create tech_spec user-auth
syntagraphia doc create task user-auth --suffix backend
syntagraphia doc create verification user-auth
syntagraphia relate 1 2 has_spec      # feature → spec
syntagraphia relate 1 3 has_task      # feature → task
syntagraphia relate 1 4 verifies      # feature → verification

# 4. View / edit
syntagraphia doc list
syntagraphia doc show user-auth
syntagraphia doc edit 1               # opens $EDITOR
syntagraphia doc write 1 --file ./notes.md
syntagraphia status

# 5. Web UI (bundled SPA + API, one process/port)
syntagraphia ui
```

Add one line to your project's `AGENTS.md` / `CLAUDE.md` so agents know the workflow:

> Run `npx syntagraphia instructions` for the full doc-tracking workflow.

## Commands

All one-shot commands support `--json` (machine-readable) and `--dir <path>` (or `SYNTAGRAPHIA_DIR`).

| Command | Description |
|---|---|
| `init [--constitution-file <path>] [--force]` | Create the DB and capture the constitution |
| `instructions` / `--instructions` | Print agent-facing instructions |
| `doc list [--type] [--status]` | List documents |
| `doc show <id\|slug>` | Show a document (content + relations) |
| `doc create <type> <slug> [--suffix] [--status]` | Create a document from a template |
| `doc set-status <id> <STATUS>` | Change status (`DRAFT\|IN_PROGRESS\|REVIEW\|DONE`) |
| `doc write <id> --file <path>\|--stdin` | Overwrite content |
| `doc edit <id>` | Edit content in `$EDITOR` |
| `relate <src> <tgt> <type>` | Link documents (`has_spec\|has_task\|verifies\|implements`) |
| `constitution show` | Show the constitution |
| `status` | Dashboard summary + orphan check |
| `ui [--port 3001] [--no-open]` | Start the web UI (long-running) |

Run `syntagraphia --help` for the full synopsis.

## How docs connect

All documents for a topic share a **slug** (e.g. `user-auth`). Relations tie them together:

- `has_spec` — feature → tech_spec
- `has_task` — feature → task
- `verifies` — feature → verification
- `implements` — task → tech_spec (optional)

`syntagraphia status` reports orphan tasks/verifications (those with no parent), enforcing the rule
that work should always trace back to a feature or spec.

## Stack

- **CLI / storage** — Node ≥ 22 + built-in `node:sqlite` (no native bindings).
- **Web UI** — React + Vite, built and bundled into the package; served by the same Express process
  as the API.
- **Distribution** — npm. `npx syntagraphia` works with zero install step.

## Contributing (working on Syntagraphia itself)

```bash
git clone https://github.com/festoinc/Syntagraphia.git
cd Syntagraphia
npm install
npm run dev      # API server (:3001, DB-backed) + Vite UI (:5173, proxies /api → :3001)
```

The `dev` script runs the new DB-backed server (`syntagraphia ui --no-open`) plus Vite's dev server
with HMR. Build the bundled SPA with `npm run build:ui` (also runs on `prepack`/`prepublishOnly`).

## License

MIT © Anatolii Fesiuk
