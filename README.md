# Syntagraphia

Open-source tool that helps you write better docs with AI — and keep them structured and connected.

Syntagraphia combines the Greek words σύνταξη (syntax, structure, arrangement) and γραφή (writing, description, representation), reflecting the project’s goal of turning information into a well-structured knowledge graph.

As vibe-coded projects grow, it's easy to lose context of what was built and why. Syntagraphia keeps
your **features, tech specs, tasks, and verifications** in a single local SQLite database by default, or a provisioned PostgreSQL database, linked by
explicit relations — so you (and your AI agents) always stay on the same page.

Syntagraphia is a **CLI** (with an optional web UI). Document content lives entirely in the DB; there
are no `.md` files or `features/`/`tasks/` directories to manage on disk.

---

## Demo

https://youtu.be/oc32Ddz28cE

## Install

```bash
# Use without installing (recommended for AI agents):
npx syntagraphia <command>

# Or install globally (nicer for humans running the UI repeatedly):
npm install -g syntagraphia
```

Requires **Node ≥ 22** (uses the built-in `node:sqlite`; PostgreSQL uses the pure-JavaScript `pg` client).

## Quick start

Syntagraphia keeps **every project on your machine** in a single global DB at
`~/.syntagraphia/project-tracker.db`. Create a project, then scope doc commands to it with
`--project <id|slug>`:

```bash
# 1. Create a project and capture its constitution
syntagraphia project create "My App"
#   → prints slug/id, e.g. my-app (id 1)

# 2. Print the agent-facing workflow + command reference
syntagraphia instructions

# 3. Create connected docs for a feature (all --project <slug>)
syntagraphia doc create feature user-auth --project my-app
syntagraphia doc create tech_spec user-auth --project my-app
syntagraphia doc create task user-auth --suffix backend --project my-app
syntagraphia doc create verification user-auth --project my-app
syntagraphia relate 1 2 has_spec --project my-app      # feature → spec
syntagraphia relate 1 3 has_task --project my-app      # feature → task
syntagraphia relate 1 4 verifies --project my-app      # feature → verification

# 4. View / edit
syntagraphia doc list --project my-app
syntagraphia doc show user-auth --project my-app
syntagraphia doc edit 1 --project my-app               # opens $EDITOR
syntagraphia doc write 1 --file ./notes.md --project my-app
syntagraphia doc checklist add user-auth "Login flow is documented" --project my-app
syntagraphia doc checklist update 1 --status DONE --commit https://github.com/org/repo/commit/abc123 --project my-app
syntagraphia status --project my-app

# 5. Web UI (bundled SPA + API, one process/port — serves ALL projects)
syntagraphia ui

# Optional: switch the machine-wide backend (no data migration)
syntagraphia db status
syntagraphia db use postgres --url postgres://user:password@host:5432/syntagraphia
syntagraphia db use sqlite
```

Switch repos? Just `project create` another one and pick it from the UI dropdown. The same install
tracks all of them.

Add one line to your project's `AGENTS.md` / `CLAUDE.md` so agents know the workflow:

> Run `npx syntagraphia instructions` for the full doc-tracking workflow.

## Commands

All one-shot commands support `--json` (machine-readable). Doc-level commands require
`--project <id|slug>` to scope which project they touch.

| Command | Description |
|---|---|
| `project create <name> [--constitution-file <path>] [--force]` | Create a project and capture its constitution; `--force` re-captures an existing same-named project's constitution |
| `project list` | List all projects on this machine |
| `db status` | Show the active SQLite/Postgres backend |
| `db use sqlite` | Switch to the local SQLite backend |
| `db use postgres --url <connection-string>` | Validate and switch to PostgreSQL |
| `instructions` / `--instructions` | Print agent-facing instructions |
| `doc list --project <p> [--type] [--status]` | List documents in a project |
| `doc show <id\|slug> --project <p>` | Show a document (content + relations) |
| `doc create <type> <slug> --project <p> [--suffix] [--status]` | Create a document from a template |
| `doc set-status <id> <STATUS> --project <p>` | Change status (`DRAFT\|IN_PROGRESS\|REVIEW\|DONE`) |
| `doc checklist list <id\|slug> --project <p>` | List a document's structured checklist |
| `doc checklist add <id\|slug> <text> --project <p> [--status] [--commit]` | Add a checklist item |
| `doc checklist update <item-id> --project <p> [--text] [--status] [--commit\|--no-commit]` | Update a checklist item |
| `doc checklist remove <item-id> --project <p>` | Remove a checklist item |
| `doc write <id> --project <p> --file <path>\|--stdin` | Overwrite content |
| `doc edit <id> --project <p>` | Edit content in `$EDITOR` |
| `relate <src> <tgt> <type> --project <p>` | Link documents (`has_spec\|has_task\|verifies\|implements`); same project only |
| `constitution show --project <p>` | Show the project's constitution |
| `status --project <p>` | Dashboard summary + orphan check |
| `ui [--port 3001] [--no-open]` | Start the web UI (long-running, serves all projects) |

Run `syntagraphia --help` for the full synopsis.

## How docs connect

All documents for a topic share a **slug** (e.g. `user-auth`). Relations tie them together:

- `has_spec` — feature → tech_spec
- `has_task` — feature → task
- `verifies` — feature → verification
- `implements` — task → tech_spec (optional)

## Structured checklists

Features, tasks, tech specs, and verifications have a structured checklist separate from their
Markdown content:

- features use **Acceptance Criteria**;
- tasks use **Subtasks**;
- tech specs use **Technical Checklist**;
- verifications use **Validation Checklist**.

Every item has its own status (`DRAFT`, `IN_PROGRESS`, `REVIEW`, or `DONE`) and may include an
optional HTTP(S) link to the Git commit that completed it. Checklist items are project-scoped and
keep their own order. Existing Markdown checkbox lists are not imported automatically.

`syntagraphia status` reports orphan tasks/verifications (those with no parent), enforcing the rule
that work should always trace back to a feature or spec.

## Stack

- **CLI / storage** — Node ≥ 22 + built-in `node:sqlite` or the pure-JavaScript `pg` client.
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
