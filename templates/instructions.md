# Syntagraphia — Agent Instructions

Syntagraphia keeps a project's docs (features, tech specs, tasks, verifications) structured and
connected in a single SQLite DB (`project-tracker.db`) at the project root. Every document's
**content lives in the DB** — there are no `.md` files on disk and no `features/`/`tasks/` directories.

Run `npx syntagraphia --instructions` to print this file. Target projects need only one line in
their own `AGENTS.md`/`CLAUDE.md`:

> Run `npx syntagraphia --instructions` for the full doc-tracking workflow.

---

## Quick reference (all commands one-shot & support `--json`)

```
syntagraphia init [--dir <path>] [--force] [--constitution-file <path>]
    Create project-tracker.db at the target dir and capture the constitution.
    Interactive in a TTY; use --constitution-file for non-interactive/agent-driven init.

syntagraphia --instructions | instructions
    Print this file.

syntagraphia doc list   [--dir <path>] [--json] [--type <...>] [--status <...>]
syntagraphia doc show   <id|slug> [--dir <path>] [--json]
syntagraphia doc create <type> <slug> [--suffix <s>] [--status <STATUS>] [--dir <path>] [--json]
syntagraphia doc set-status <id> <DRAFT|IN_PROGRESS|REVIEW|DONE> [--dir <path>] [--json]
syntagraphia doc write  <id> --file <path>|--stdin [--dir <path>] [--json]
syntagraphia doc edit   <id> [--dir <path>]      # opens $EDITOR, saves back to DB

syntagraphia relate <source-id> <target-id> <has_spec|has_task|verifies|implements> [--dir <path>] [--json]

syntagraphia constitution show [--dir <path>] [--json]

syntagraphia status [--dir <path>] [--json]
    Dashboard: counts by type/status + orphan check (Rule 4).

syntagraphia ui [--dir <path>] [--port 3001] [--no-open]
    Start the web UI (bundled SPA + API) against the target DB. The only long-running command.
```

`--dir` resolves the project root (default: cwd). Also honors `SYNTAGRAPHIA_DIR` env var.
Document types: `feature`, `tech_spec`, `task`, `verification` (plus the singleton `constitution`).
Statuses: `DRAFT` → `IN_PROGRESS` → `REVIEW` → `DONE`.

---

## What goes where

All documents share a **common slug** (e.g. `user-authentication`). A feature `user-authentication`,
its spec, its tasks (`-backend`, `-frontend` suffixes), and its verification all use slug
`user-authentication`.

| Type | Purpose | How to create |
|---|---|---|
| `feature` | Problem definition, user value, scope | `doc create feature <slug>` |
| `tech_spec` | Architecture, data models, API contracts, trade-offs | `doc create tech_spec <slug>` |
| `task` | Actionable work items with acceptance criteria | `doc create task <slug> --suffix backend` |
| `verification` | Measurable success criteria (feature & spec) | `doc create verification <slug>` |

### Relations

| relation_type | From → To | Meaning |
|---|---|---|
| `has_spec` | feature → tech_spec | Feature has a technical specification |
| `has_task` | feature → task | Feature is broken into tasks |
| `verifies` | feature → verification | Verification covers this feature |
| `implements` | task → tech_spec | Task implements a spec (optional) |

Useful: `syntagraphia status` and `syntagraphia doc list`.

---

## Mandatory Rules

### Rule 1: Constitution First

Before creating any feature, ensure `syntagraphia init` has been run and the constitution is
non-empty. If `syntagraphia constitution show` is empty/missing, stop and ask the user to run
`syntagraphia init` first.

### Rule 2: Features Require Tasks and Verifications

When creating a **feature**, also create:

1. `doc create feature <slug>` — the feature document
2. At least one `doc create task <slug> --suffix <s>` — concrete work items
3. `doc create verification <slug>` — measurable success criteria
4. `relate` the feature → each task (`has_task`) and → the verification (`verifies`).

Do not proceed with feature work unless tasks and verifications are in place.

### Rule 3: Specs Require Tasks and Verifications

When creating a **tech spec**, also create:

1. `doc create tech_spec <slug>` — the specification
2. At least one `doc create task <slug> --suffix <s>`
3. `doc create verification <slug>` — append spec criteria if a verification for this slug exists
4. `relate` spec → task (`implements`), and link the spec to the feature (`has_spec`) if one exists.

### Rule 4: No Orphan Tasks or Verifications

If asked to work on a **task** or **verification** not connected to a feature or spec via relations,
discourage it:

> "This task/verification doesn't have a parent feature or spec. Tasks and verifications should
> always be tied to a feature or tech spec so we can trace why we're doing the work. Would you like
> to create the parent document first?"

`syntagraphia status` reports orphans automatically.

---

## Workflow Summary

```
User request
    │
    ├─ New feature? ─── Constitution exists? ─── No ──▶ Ask user to run `syntagraphia init`
    │                                              Yes
    │                                  create feature + tasks + verification
    │                                  relate them; set statuses as you go
    │
    ├─ New spec? ──────── create spec + tasks + verification
    │                       relate spec → feature (has_spec) if one exists
    │
    ├─ Work on task? ──── `doc show <id>` → read content → do the work
    │                       `doc set-status <id> IN_PROGRESS` / `DONE`
    │                       `doc write <id> --file <notes.md>` to record progress
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
## Out of Scope
```

### Tech Spec
```markdown
# Tech Spec — <slug>
## Architecture
## Decisions
## Dependencies
## Risks
```

### Task
```markdown
# Task — <slug> (<suffix>)
## Summary
## Acceptance Criteria
- [ ]
## References
```

### Verification
```markdown
# Verification — <slug>
## Feature Success Criteria
- [ ]
## Spec Success Criteria
- [ ]
## Related
```
