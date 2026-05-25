# Claude Code notes

## Versioning

Do NOT manually edit the `"version"` field in `package.json` or add entries to `CHANGELOG.md`.
Version bumps and changelog entries are automated via GitHub label-based workflows on PRs.

## Ownership

The user owns this library (node-chargepoint). If a bug or missing feature is identified while working in a downstream repo (e.g. Sunkeep) and the fix belongs here, do NOT implement it in the downstream repo. Instead, provide the user with a single self-contained prompt they can paste into a new Claude Code session opened on this repository to make the fix here.
