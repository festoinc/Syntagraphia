# AGENTS.md

Instructions for AI agents working within this project.

---

## Project Structure

```
product-design/
├── project-tracker.db          ← SQLite database: file status & relationships
├── schema.sql                  ← Database schema definition
├── PROJECT-CONSTITUTION.md     ← Ground rules & project boundaries
├── features/                   ← What we build and why (user value)
├── tech-spec/                  ← How we build it (architecture, decisions)
├── tasks/                      ← Concrete work items to execute
└── verifications/              ← Success criteria for features AND specs
```

### What goes where

| Folder | Purpose | Naming |
|---|---|---|
| `features/` | Problem definition, user value, scope | `features/<slug>.md` |
| `tech-spec/` | Architecture, data models, API contracts, trade-offs | `tech-spec/<slug>.md` |
| `tasks/` | Actionable work items with acceptance criteria | `tasks/<slug>-<suffix>.md` |
| `verifications/` | Measurable success criteria (feature & spec) | `verifications/<slug>.md` |

All documents related to the same topic share a **common slug** (e.g. `user-authentication`).

### Database (`project-tracker.db`)

The database is the **single source of truth** for file tracking and relationships.

**`file_status`** — every `.md` file with its current status (`DRAFT` → `IN_PROGRESS` → `REVIEW` → `DONE`).

**`relations`** — how documents connect to each other:

| relation_type | From → To | Meaning |
|---|---|---|
| `has_spec` | feature → tech_spec | Feature has a technical specification |
| `has_task` | feature → task | Feature is broken into tasks |
| `verifies` | feature → verification | Verification covers this feature |
| `implements` | task → tech_spec | Task implements a spec (optional) |

**Useful views:**
- `v_relation_map` — full relation graph
- `v_status_dashboard` — all files with status, ordered by slug

Always query the database to understand existing context before creating or modifying documents.

---

## Mandatory Rules

### Rule 1: Constitution First

Before creating any feature, verify that `PROJECT-CONSTITUTION.md` is **not empty** and contains meaningful content. If it is empty or a placeholder, stop and ask the user to define the project constitution first.

### Rule 2: Features Require Tasks and Verifications

When a user wants to discuss or create a **feature**, you **must** also create:

1. **`features/<slug>.md`** — the feature document itself
2. **At least one `tasks/<slug>-<suffix>.md`** — concrete work items
3. **`verifications/<slug>.md`** — measurable success criteria

Do not proceed with feature work unless tasks and verifications are in place.

### Rule 3: Specs Require Tasks and Verifications

When a user wants to create a **tech spec**, you **must** also create:

1. **`tech-spec/<slug>.md`** — the specification document
2. **At least one `tasks/<slug>-<suffix>.md`** — concrete work items
3. **`verifications/<slug>.md`** — measurable success criteria

If a verification file for this slug already exists (from the feature), append spec criteria to it rather than creating a duplicate.

### Rule 4: No Orphan Tasks or Verifications

If a user asks to work on a **task** or **verification** that is **not connected** to a feature or spec via the database relations, **discourage** it with a message like:

> "This task/verification doesn't have a parent feature or spec. Tasks and verifications should always be tied to a feature or tech spec so we can trace why we're doing the work. Would you like to create the parent document first?"

Do not create orphan documents.

---

## Workflow Summary

```
User request
    │
    ├─ New feature? ──── Constitution exists? ─── No ──▶ Ask user to fill PROJECT-CONSTITUTION.md
    │                                              Yes
    │                                     Create feature + tasks + verification
    │                                     Register everything in project-tracker.db
    │
    ├─ New spec? ──────── Create spec + tasks + verification
    │                       Register everything in project-tracker.db
    │                       Link spec to feature if one exists
    │
    ├─ Work on task? ──── Check DB for parent feature/spec
    │                       No parent? ──▶ Discourage
    │
    └─ Work on verification? ── Check DB for parent feature/spec
                                No parent? ──▶ Discourage
```

---

## File Templates

When creating new documents, use these sections as starting points:

### Feature
```markdown
# Feature — <Title>

## Overview
## User Stories
## Out of Scope
```

### Tech Spec
```markdown
# Tech Spec — <Title>

## Architecture
## Decisions
## Dependencies
## Risks
```

### Task
```markdown
# Task — <Title>

## Summary
## Acceptance Criteria
- [ ]
## References
```

### Verification
```markdown
# Verification — <Title>

## Feature Success Criteria
- [ ]
## Spec Success Criteria
- [ ]
## Related
```
