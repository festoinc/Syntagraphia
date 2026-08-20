# Syntagraphia Agent Workflow — Atomic Feature Pipeline

Every feature is **atomic**: one feature = one user-facing capability.
Never combine multiple capabilities (e.g., "registration and onboarding" → two
separate features: "user registration", "user onboarding").

Each feature follows a **strict four-stage pipeline**:

```
FEATURE → VERIFICATIONS → TECH SPEC (conditional) → TASKS
```

Every stage must be confirmed and approved before the next one begins. Edits
and continuations always follow the same pipeline — determine where the
feature is, confirm existing stages, then proceed to the next.

Run every document command with `--project <project>` (use slug or numeric ID).

---

## 0. Before starting

Ensure the project exists and has a constitution:

```bash
syntagraphia project list
syntagraphia constitution show --project <project>
```

If the project or constitution is missing, stop and ask the user to create one
first.

---

## 1. FEATURE — Define an atomic, single-purpose feature

Always start here. Every feature must describe exactly **one** user-facing
capability. Split large features until each one is atomic.

### Create

```bash
syntagraphia doc create feature <slug> --project <project>
```

### Content requirements

Populate the feature document with:

- **Overview** — concise description of what this single feature does
- **User Stories** — who benefits and how (one story per line)
- **Acceptance Criteria** — observable, measurable conditions for "done"
- **Out of Scope** — explicitly list what is NOT included (prevents scope creep)

### Confirm

Review the feature content with the user. Only after confirmation:

```bash
syntagraphia doc set-status <feature-id> DONE --project <project>
```

---

## 2. VERIFICATIONS — Exhaustive positive and negative test criteria

Every feature must have **at least one verification document**. Verifications
must be extremely detailed, covering both **positive cases** (expected happy
paths) and **negative cases** (edge cases, error handling, invalid inputs,
failure modes).

### Create

```bash
syntagraphia doc create verification <slug> --project <project>
syntagraphia relate <feature-id> <verification-id> verifies --project <project>
```

A single feature may have **multiple verifications** (e.g., one for API
contract, one for UI behavior, one for security). Use many-to-many freely.

### Content requirements — mandatory structure

Each verification document **must** contain these sections:

#### Positive Cases (Happy Paths)
- Describe every expected successful interaction step by step
- Include expected inputs, actions, system responses, and observable outcomes
- Cover all user stories from the feature

#### Negative Cases (Failure Modes & Edge Cases)
- **Invalid inputs** — wrong types, missing fields, out-of-range values
- **Boundary conditions** — empty strings, maximum lengths, zero, negative numbers
- **Unauthorized access** — unauthenticated, wrong role, expired tokens
- **Conflict scenarios** — duplicate records, concurrent modifications
- **Absence/failure of dependencies** — database down, external API timeout
- **Malformed requests** — corrupted data, unexpected content types
- **Rate limiting and abuse** — repeated requests, oversized payloads
- **State transition errors** — trying to change status in wrong order

#### Expected System Responses for Each Case
- Status codes and response bodies
- Error messages and their exact wording
- Logging and monitoring expectations
- User-facing feedback (toasts, redirects, disabled states)

### Structured checklist

Add each verification case as a checklist item for tracking:

```bash
syntagraphia doc checklist add <verification-id> "Positive: user registers with valid email and password" --project <project>
syntagraphia doc checklist add <verification-id> "Negative: registration with duplicate email returns 409" --project <project>
syntagraphia doc checklist add <verification-id> "Negative: registration with password shorter than 8 chars returns 422" --project <project>
```

### Confirm

Review all verifications with the user. Ensure both positive and negative
cases are complete. After confirmation:

```bash
syntagraphia doc set-status <verification-id> DONE --project <project>
```

---

## 3. TECH SPEC — Conditional technical specification

A tech spec is **only needed when the feature introduces something new** to
the project:

- New database table, column, index, or migration
- New API endpoint or changed API contract
- New external dependency or service integration
- New architecture pattern or component
- Changes to authentication, authorization, or security model
- New configuration, environment variables, or infrastructure

**Skip this stage entirely if the feature can be built entirely with the
existing tech stack.** For example, a pure UI layout change that uses existing
components and APIs needs no tech spec.

### Assess

```bash
syntagraphia doc show <feature-id> --project <project>
```

Review the feature and verifications. If new tech is needed, create a spec.
If not, proceed directly to Tasks (stage 4).

### Create (only when needed)

```bash
syntagraphia doc create tech_spec <slug> --project <project>
syntagraphia relate <feature-id> <tech-spec-id> has_spec --project <project>
```

A feature can relate to **multiple tech specs** — e.g., one new spec for this
feature's additions, and one existing spec from a prior feature that this
task also modifies. Use many-to-many.

### Content requirements

- **Architecture** — system design, data models, API contracts
- **Decisions** — key technical choices and rationale
- **Dependencies** — new external services, libraries, migrations
- **Risks** — known risks and mitigations
- **Technical Checklist** — structured checks tracked via checklist items

### Confirm

Review the tech spec with the user. After confirmation:

```bash
syntagraphia doc set-status <tech-spec-id> DONE --project <project>
```

---

## 4. TASKS — Concrete implementation work

Tasks are created **last**, after the feature, verifications, and (if needed)
tech spec are all confirmed. Each task describes a focused, implementable unit
of work.

### Create

```bash
syntagraphia doc create task <slug> --suffix <scope> --project <project>
syntagraphia relate <feature-id> <task-id> has_task --project <project>
```

If a tech spec exists for this feature, also link:

```bash
syntagraphia relate <task-id> <tech-spec-id> implements --project <project>
```

A feature can have **many tasks**. Use suffixes to distinguish scope
(e.g., `--suffix backend`, `--suffix frontend`, `--suffix migration`).

### Content requirements

- **Summary** — one-line description of what this task implements
- **Subtasks** — step-by-step implementation checklist (tracked via checklist items)
- **References** — links to the parent feature, verifications, and tech spec

### Implementation workflow

For each task:

1. **Read context** — review the task, its parent feature, verifications, and tech spec:

   ```bash
   syntagraphia doc show <task-id> --project <project>
   syntagraphia doc show <feature-id> --project <project>
   ```

2. **Start work**:

   ```bash
   syntagraphia doc set-status <task-id> IN_PROGRESS --project <project>
   ```

3. **Implement** — write code, configuration, migrations, tests.

4. **Verify** — run automated checks. For manual checks, ask the user and
   record results:

   ```bash
   syntagraphia doc checklist update <item-id> --status DONE --commit <commit-url> --project <project>
   ```

   If no commit applies:

   ```bash
   syntagraphia doc checklist update <item-id> --status DONE --no-commit --project <project>
   ```

5. **Complete** — mark done only when all checks pass:

   ```bash
   syntagraphia doc set-status <task-id> DONE --project <project>
   ```

---

## 5. Continuing work on a feature

When a user asks to continue work on a feature, determine where it is in the
pipeline by inspecting its existing relations:

```bash
syntagraphia doc show <feature-id> --project <project>
```

### Decision matrix

| What exists                          | Next step                            |
|--------------------------------------|--------------------------------------|
| Feature only (no relations)          | Confirm feature → create verifications |
| Feature + verifications (no spec, no tasks) | Confirm verifications → assess tech spec need → create tasks |
| Feature + verifications + tech spec + no tasks | Confirm tech spec → create tasks |
| Feature + verifications + no tech spec + no tasks | Verifications done, no spec needed → create tasks |
| Feature + verifications + spec + some tasks | Review existing tasks, create missing ones, continue implementation |
| All stages exist, some incomplete    | Resume from the first incomplete stage downward |

### Editing existing stages

If the user wants to revise a completed stage:

1. Set the stage document back to `DRAFT` or `IN_PROGRESS`
2. Edit the content
3. Re-confirm with the user
4. Re-mark as `DONE`

If a relation needs to be removed:

```bash
syntagraphia unrelate <source-id> <target-id> --project <project>
```

---

## 6. Document status lifecycle

Use statuses in this order (seeded defaults):

```
DRAFT → IN_PROGRESS → REVIEW → DONE
```

- **DRAFT** — document created, content being written
- **IN_PROGRESS** — content stable, work actively underway
- **REVIEW** — ready for user review, awaiting confirmation
- **DONE** — confirmed and approved (do not mark DONE until user agrees)

Never mark work `DONE` merely because code was written. Use `REVIEW` when
implementation is ready but user confirmation is still pending.

Statuses are a global, user-defined vocabulary. Inspect it with
`syntagraphia status list`, and add/rename/remove with:

```bash
syntagraphia status add <CODE> --label "<Label>"
syntagraphia status rename <OLD> <NEW> --label "<Label>"
syntagraphia status remove <CODE>
```

Renaming a status updates every document and checklist item that uses it.
Removal is refused while any document or checklist item still uses the status.

---

## 7. Checking project health

```bash
syntagraphia status --project <project>
```

This shows:
- Total documents by type and status
- Relation count
- Orphan detection (tasks/verifications without a parent feature)

Fix orphans by creating proper relations or removing stray documents.

---

## 8. Managing relations — many-to-many

Relations are **many-to-many** by design. A single feature can have:

- 1 verification document (or 3, or 10)
- 1 new tech spec + 1 existing tech spec from a prior feature
- 5 tasks (backend, frontend, migration, tests, docs)

### Creating relations

```bash
# Feature → verification
syntagraphia relate <feature-id> <verification-id> verifies --project <project>

# Feature → tech spec
syntagraphia relate <feature-id> <tech-spec-id> has_spec --project <project>

# Feature → task
syntagraphia relate <feature-id> <task-id> has_task --project <project>

# Task → tech spec (task implements a spec)
syntagraphia relate <task-id> <tech-spec-id> implements --project <project>
```

### Removing relations

```bash
syntagraphia unrelate <source-id> <target-id> --project <project>
```

### Relation reference

| From       | To             | Relation type | Meaning                          |
|------------|----------------|---------------|----------------------------------|
| feature    | verification   | `verifies`    | verification validates feature   |
| feature    | tech_spec      | `has_spec`    | feature has this tech spec       |
| feature    | task           | `has_task`    | feature has this task            |
| task       | tech_spec      | `implements`  | task implements this tech spec   |

---

## 9. Content editing

From a Markdown file:

```bash
syntagraphia doc update <id-or-slug> <file.md> --project <project>
```

From stdin:

```bash
syntagraphia doc write <id-or-slug> --stdin --project <project> < file.md
```

Document content is stored in the database. Use the web UI for human editing:

```bash
syntagraphia ui
```
