# Syntagraphia Agent Workflow

This project uses Syntagraphia for features, technical specifications, tasks,
and verifications. Before doing implementation work, make the work traceable
from user need to measurable evidence.

Replace `<project>` with the project slug or ID and `<slug>` with the shared
document slug. Run every document command with `--project <project>`.

## Before starting

Ensure the project exists and has a non-empty constitution:

```bash
syntagraphia project list
syntagraphia constitution show --project <project>
```

If there is no constitution, stop and ask the user to create or initialize the
project first.

## Designing a feature

### 1. Start with the feature

Describe the user problem, desired outcome, user stories, acceptance criteria,
and scope. Users need features; do not begin with an implementation task.

```bash
syntagraphia doc create feature <slug> --project <project>
```

### 2. Add detailed, testable verifications

Every feature must have at least one verification. Write criteria that are
observable and testable, including expected inputs, actions, and outcomes.

```bash
syntagraphia doc create verification <slug> --project <project>
syntagraphia relate <feature-id> <verification-id> verifies --project <project>
```

Add structured validation items when useful:

```bash
syntagraphia doc checklist add <verification-id> "The expected behavior is observable" \
  --project <project>
```

### 3. Record required technical decisions

Create a technical specification for architecture, data models, APIs, migrations,
dependencies, operational changes, or other implementation details. Keep the
spec focused on what is needed to deliver the feature.

```bash
syntagraphia doc create tech_spec <slug> --project <project>
syntagraphia relate <feature-id> <tech-spec-id> has_spec --project <project>
```

### 4. Create implementation tasks last

Tasks must describe concrete work needed to implement the feature and its
technical specification. Break large work into focused tasks with suffixes.

```bash
syntagraphia doc create task <slug> --suffix backend --project <project>
syntagraphia relate <feature-id> <task-id> has_task --project <project>
syntagraphia relate <task-id> <tech-spec-id> implements --project <project>
```

Every feature or technical specification must have at least one task and one
verification. Do not leave orphan tasks or verifications.

## Working on a task

1. Read the task, its parent feature, technical specification, and verification:

   ```bash
   syntagraphia doc show <task-id> --project <project>
   syntagraphia doc show <feature-id> --project <project>
   syntagraphia doc show <tech-spec-id> --project <project>
   syntagraphia doc show <verification-id> --project <project>
   ```

2. Mark the task as started:

   ```bash
   syntagraphia doc set-status <task-id> IN_PROGRESS --project <project>
   ```

3. Implement all required code, configuration, migrations, tests, and documentation.

4. Run every automated verification that is available. For checks that require
   the user, ask the user to perform them and record the result before closing
   the work.

5. Update checklist items as evidence becomes available:

   ```bash
   syntagraphia doc checklist update <item-id> \
     --project <project> --status DONE --commit <https-commit-url>
   ```

   If no commit URL applies, use `--no-commit` instead of inventing evidence:

   ```bash
   syntagraphia doc checklist update <item-id> \
     --project <project> --status DONE --no-commit
   ```

6. Mark the verification as done only after its success criteria pass:

   ```bash
   syntagraphia doc set-status <verification-id> DONE --project <project>
   ```

7. Mark the task and feature as done only when the implementation is complete,
   all applicable verification criteria pass, and no required user check remains:

   ```bash
   syntagraphia doc set-status <task-id> DONE --project <project>
   syntagraphia doc set-status <feature-id> DONE --project <project>
   ```

8. Confirm the final state and check for orphan documents:

   ```bash
   syntagraphia status --project <project>
   syntagraphia doc list --project <project>
   ```

Use `REVIEW` when implementation is ready but a user review or manual check is
still pending. Never mark work `DONE` merely because the code was written.

## Document status

Use statuses in this order when applicable:

```text
DRAFT -> IN_PROGRESS -> REVIEW -> DONE
```

Document content is stored in Syntagraphia’s database. Use the web UI for human
editing or update content from a Markdown file with:

```bash
syntagraphia doc update <id-or-slug> <file.md> --project <project>
```
