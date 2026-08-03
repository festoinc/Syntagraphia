# Installation

Syntagraphia requires **Node.js 22 or newer** and npm. It uses Node's built-in
`node:sqlite` module for the default local database. PostgreSQL is optional.

## Install from npm

To install the CLI globally:

```bash
npm install --global syntagraphia
syntagraphia --version
```

For a one-time invocation without a global install:

```bash
npx syntagraphia --version
```

## Clean reinstall

To completely remove the npm-installed CLI and install it again:

```bash
npm uninstall --global syntagraphia
npm install --global syntagraphia
syntagraphia --version
```

Removing the npm package does not remove Syntagraphia data. Projects and
backend settings are stored in `~/.syntagraphia/`. Keep that directory if you
want to preserve existing projects; back it up before removing it if you need
a completely empty local database.

## Create a project

Create a constitution file, then pass it to the first project command. This
works in both interactive and non-interactive shells:

```bash
cat > CONSTITUTION.md <<'EOF'
# Project Constitution

## Purpose
Describe the purpose of this project.

## Principles
Describe the principles that guide implementation.
EOF

syntagraphia project create "My App" \
  --constitution-file ./CONSTITUTION.md
syntagraphia project list
```

The command prints the new project's slug and ID. Use that slug with document
commands:

```bash
syntagraphia doc create feature user-auth --project my-app
syntagraphia doc list --project my-app
syntagraphia ui
```

When running directly in a terminal, `project create` can capture the
constitution interactively if `--constitution-file` is omitted. In scripts or
CI, provide `--constitution-file` because stdin is non-interactive.