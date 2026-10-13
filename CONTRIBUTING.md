# Git workflow

- `main` contains released, stable versions. The initial commit only establishes repository rules.
- `develop` integrates the next version.
- Create `codex/feature-<name>` from `develop`; open a pull request targeting `develop`.
- Create `codex/release-<version>` from `develop` when a release is ready. Merge through a PR into `main`, tag the approved release, and merge release fixes back into `develop`.
- Create `codex/hotfix-<name>` from `main` for urgent release fixes. Merge through PRs into `main` and `develop`.
- Do not push application changes directly to `main` or `develop`. Do not merge PRs without user approval.
- Before opening a PR, run `npm.cmd run typecheck` and `npm.cmd run lint`. For runtime changes, also verify the iOS bundle and relevant device scenarios.
- PR descriptions must explain the behavior, validation, and remaining limitations. Keep demo data explicitly labelled.
- Never commit credentials, `.env` files, `node_modules`, `.expo`, or build output.

These are working conventions; repository branch protection is configured separately.
