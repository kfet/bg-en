---
name: release
description: Release a new version of the BG↔EN dictionary PWA. Confirms tests pass, updates VERSION and CHANGELOG.md, commits, tags, and pushes to trigger GitHub Pages deployment.
---

# Release Skill

Release a new version of the BG↔EN dictionary PWA.

## Version determination

If the user provides a version, use it. Otherwise, auto-determine:

1. Read the current version from `VERSION`.
2. Look at entries under `## [Unreleased]` in `CHANGELOG.md`.
3. If there are `### Added` or `### Removed` entries → **minor** bump (e.g. 1.2.0 → 1.3.0).
4. If there are only `### Fixed` or `### Changed` entries → **patch** bump (e.g. 1.2.0 → 1.2.1).
5. If the section is empty → ask the user whether to proceed or abort.

## Steps

1. **Type-check:**
   ```bash
   npx tsc --noEmit 2>&1; echo "EXIT:$?"
   ```
   Must exit 0.

2. **Unit tests:**
   ```bash
   npm test 2>&1; echo "EXIT:$?"
   ```
   All tests must pass. Data files (`public/data/*.json`) must exist — if missing, run `python3 scripts/build_data.py` first.

3. **Build:**
   ```bash
   npm run build 2>&1; echo "EXIT:$?"
   ```
   Must exit 0.

4. **Check CHANGELOG** — read `CHANGELOG.md` and confirm there are entries under `## [Unreleased]`. If empty, ask the user whether to proceed or abort.

5. **Determine version** — follow the version determination rules above. State the version and proceed.

6. **Update CHANGELOG** — rename `## [Unreleased]` to `## [VERSION] - YYYY-MM-DD` (today's date) and add a fresh empty `## [Unreleased]` section above it. Changelog is in reverse-chronological order: `[Unreleased]` first, then newest release, then older releases below. Do not reorder existing sections.

7. **Update VERSION** — write the new version to the `VERSION` file (one line, no trailing whitespace).

8. **Check git status:**
   ```bash
   git status 2>&1
   ```
   Confirm nothing unexpected is staged or modified.

9. **Commit** — stage all pending changes and commit:
   ```bash
   git add -A
   git commit -m "release: vVERSION"
   ```

10. **Tag:**
    ```bash
    git tag -a vVERSION -m "release: vVERSION"
    ```
    Always pass `-m` to avoid git opening an editor.

11. **Push** (if the user confirms):
    ```bash
    git push origin main --tags
    ```
    Pushing `main` triggers the GitHub Actions workflow which rebuilds data and deploys to GitHub Pages.

12. **Verify** — check the GitHub Actions run started:
    ```bash
    git log --oneline -3
    git tag -l | tail -5
    ```

## Important notes

- **Data files are NOT committed** (`public/data/*.json` is in `.gitignore`). The GitHub Actions workflow runs `python3 scripts/build_data.py` at deploy time to regenerate them.
- **Avoid interactive git**: always pass `-m` to `git tag -a` and `git commit`.
- **Moving tags**: if you need to retag after an additional commit: `git tag -d vVERSION` then recreate.
- **Don't push without asking** — confirm with the user before `git push`.

If any step fails, stop and report the error.
