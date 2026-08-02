# Syntagraphia — Agent Instructions

Syntagraphia keeps a machine's projects (each with features, tech specs, tasks, verifications)
structured and connected in a **single global SQLite DB** at `~/.syntagraphia/project-tracker.db`.
One install serves every repo on the PC. Every document's **content lives in the DB** — there are
no `.md` files on disk and no `features/`/`tasks/` directories.

A **project** is the scoping unit. Doc-level commands take a required `--project <id|slug>` so
Syntagraphia knows which project you mean. Create projects with `syntagraphia project create <name>`.

Run `npx syntagraphia --instructions` to print this file. Target projects need only one line in
their own `AGENTS.md`/`CLAUDE.md`:

> Run `npx syntagraphia --instructions` for the full doc-tracking workflow.

---

## Quick reference (all commands one-shot & support `--json`)

```
syntagraphia project create <name> [--constitution-file <path>] [--force]
    Create a project in the global DB and capture its constitution.
    Interactive in a TTY; use --constitution-file for non-interactive/agent-driven creation.
    Prints the new project's slug/id — use it as --project on the commands below.
    Refuses to duplicate an existing project with the same name; pass --force to re-capture the
    constitution of that existing project in place instead.

syntagraphia project list [--json]
    List all projects on this machine (id, slug, name, doc count).

syntagraphia --instructions | instructions
    Print this file.

syntagraphia doc list   --project <p> [--json] [--type <...>] [--status <...>]
syntagraphia doc show   <id|slug> --project <p> [--json]
syntagraphia doc create <type> <slug> --project <p> [--suffix <s>] [--status <STATUS>] [--json]
syntagraphia doc set-status <id> <DRAFT|IN_PROGRESS|REVIEW|DONE> --project <p> [--json]
syntagraphia doc checklist list <id|slug> --project <p> [--json]
syntagraphia doc checklist add <id|slug> <text> --project <p> [--status <STATUS>] [--commit <url>] [--json]
syntagraphia doc checklist update <item-id> --project <p> [--text <text>] [--status <STATUS>] [--commit <url>|--no-commit] [--json]
syntagraphia doc checklist remove <item-id> --project <p> [--json]
syntagraphia doc update <id|slug> <file.md> --project <p> [--json]
    Read a Markdown file and overwrite the document content in the DB. The file is only an input;
    document content remains stored in the DB.
syntagraphia doc write  <id|slug> --project <p> --file <path>|--stdin [--json]
    Legacy content overwrite command; use `doc update` for Markdown files.
syntagraphia doc edit   <id|slug> --project <p>
    Deprecated. Use `doc update` for CLI/agents or the web UI for human editing.

syntagraphia relate <source-id> <target-id> <has_spec|has_task|verifies|implements> --project <p> [--json]
    Both documents must belong to the same project; cross-project relations are rejected.

syntagraphia constitution show --project <p> [--json]

syntagraphia status --project <p> [--json]
    Dashboard: counts by type/status + orphan check (Rule 4), scoped to the project.

syntagraphia ui [--port 3001] [--no-open]
    Start the web UI (bundled SPA + API) against the global DB. Serves ALL projects — pick one
    from the dropdown in the header. The only long-running command.
```

`--project <id|slug>` is **required** on every doc-level command (no default/fallback). Project
slugs are derived from the name (lowercase, dashes) and de-duplicated on collision.
Document types: `feature`, `tech_spec`, `task`, `verification` (plus the singleton `constitution`).
Statuses: `DRAFT` → `IN_PROGRESS` → `REVIEW` → `DONE`.

Structured checklist labels: feature → `Acceptance Criteria`, task → `Subtasks`, tech_spec →
`Technical Checklist`, verification → `Validation Checklist`. Checklist item statuses are
independent from document statuses. Each item may include an optional HTTP(S) Git commit URL.
Checklist items are stored separately from Markdown content; existing Markdown checkbox lists are
not imported automatically.

---

## What goes where

All documents share a **common slug** (e.g. `user-authentication`). A feature `user-authentication`,
its spec, its tasks (`-backend`, `-frontend` suffixes), and its verification all use slug
`user-authentication`.

| Type | Purpose | How to create |
|---|---|---|
| `feature` | Problem definition, user value, scope | `doc create feature <slug> --project <p>` |
| `tech_spec` | Architecture, data models, API contracts, trade-offs | `doc create tech_spec <slug> --project <p>` |
| `task` | Actionable work items with structured subtasks | `doc create task <slug> --suffix backend --project <p>` |
| `verification` | Measurable success criteria (feature & spec) | `doc create verification <slug> --project <p>` |

### Relations

| relation_type | From → To | Meaning |
|---|---|---|
| `has_spec` | feature → tech_spec | Feature has a technical specification |
| `has_task` | feature → task | Feature is broken into tasks |
| `verifies` | feature → verification | Verification covers this feature |
| `implements` | task → tech_spec | Task implements a spec (optional) |

Useful: `syntagraphia status --project <p>` and `syntagraphia doc list --project <p>`.

---

## Mandatory Rules

### Rule 1: Constitution First

Before creating any feature, ensure the project exists and its constitution is non-empty. If
`syntagraphia constitution show --project <p>` is empty/missing, stop and ask the user to run
`syntagraphia project create <name>` (re-creating the project, or providing a constitution file)
first.

### Rule 2: Features Require Tasks and Verifications

When creating a **feature**, also create:

1. `doc create feature <slug> --project <p>` — the feature document
2. At least one `doc create task <slug> --suffix <s> --project <p>` — concrete work items
3. `doc create verification <slug> --project <p>` — measurable success criteria
4. `relate` the feature → each task (`has_task`) and → the verification (`verifies`), all `--project <p>`.

Do not proceed with feature work unless tasks and verifications are in place.

### Rule 3: Specs Require Tasks and Verifications

When creating a **tech spec**, also create:

1. `doc create tech_spec <slug> --project <p>` — the specification
2. At least one `doc create task <slug> --suffix <s> --project <p>`
3. `doc create verification <slug> --project <p>` — append spec criteria if a verification for this slug exists
4. `relate` spec → task (`implements`), and link the spec to the feature (`has_spec`) if one exists, all `--project <p>`.

### Rule 4: No Orphan Tasks or Verifications

If asked to work on a **task** or **verification** not connected to a feature or spec via relations,
discourage it:

> "This task/verification doesn't have a parent feature or spec. Tasks and verifications should
> always be tied to a feature or tech spec so we can trace why we're doing the work. Would you like
> to create the parent document first?"

`syntagraphia status --project <p>` reports orphans automatically.

---

## Workflow Summary

```
User request
    │
    ├─ New project? ─── `project create <name>` (capture constitution)
    │
    ├─ New feature? ─── Constitution exists? ─── No ──▶ Ask user to run `project create`
    │                                              Yes
    │                                  create feature + tasks + verification (--project <p>)
    │                                  relate them; set statuses as you go
    │
    ├─ New spec? ──────── create spec + tasks + verification (--project <p>)
    │                       relate spec → feature (has_spec) if one exists
    │
    ├─ Work on task? ──── `doc show <id> --project <p>` → read content → do the work
    │                       `doc set-status <id> IN_PROGRESS --project <p>` / `DONE`
    │                       `doc checklist update <item-id> --status DONE --project <p>`
    │                       `doc write <id> --file <notes.md> --project <p>` to record progress
    │
    ├─ Update a document? ── prepare a Markdown file → `doc update <id|slug> <file.md> --project <p>`
    │
    └─ Work on verification? ── check parent feature/spec exists (Rule 4)
```

---

## Document templates (created automatically by `doc create`)

### Feature
```markdown
# Feature — <slug>
## Overview
## User Stories
## Acceptance Criteria
## Out of Scope
```

### Tech Spec
```markdown
# Tech Spec — <slug>
## Architecture
## Decisions
## Dependencies
## Risks
## Technical Checklist
```

### Task
```markdown
# Task — <slug> (<suffix>)
## Summary
## Subtasks
## References
```

### Verification
```markdown
# Verification — <slug>
## Validation Notes
## Success Criteria
## Related
```
