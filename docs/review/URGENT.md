# URGENT Review Issues

## URGENT — 2026-02-21

### `.gitignore:18` — `mockserver` pattern silently ignores all new files in `.fir/skills/e2e/mockserver/`

The `.gitignore` rule on line 18 is:
```
mockserver
```

Without a leading `/`, this pattern matches **any** file or directory named `mockserver` anywhere in the repository tree. As a result, the **entire `.fir/skills/e2e/mockserver/` directory** is treated as ignored for new files.

**Verified:** `git check-ignore -v .fir/skills/e2e/mockserver/main_test.go` confirms:
```
.gitignore:18:mockserver  .fir/skills/e2e/mockserver/main_test.go
```

**Impact:**
- `main_test.go` (288-line test file with 18 tests, written 2026-02-21) is silently invisible to git. It will never be committed unless the `.gitignore` is fixed.
- `main.go` remains tracked only because it was committed before this ignore rule was added.
- Any future file added inside `.fir/skills/e2e/mockserver/` will be silently dropped.

**Fix:** Change `.gitignore` line 18 from:
```
mockserver
```
to:
```
/mockserver
```

The leading `/` anchors the rule to the repo root, so it only ignores the compiled binary at `./mockserver` (the artifact that was the original intent) and does not affect `.fir/skills/e2e/mockserver/`.

After fixing `.gitignore`, stage the now-visible `main_test.go`:
```bash
git add .fir/skills/e2e/mockserver/main_test.go
git commit -m "fix: narrow mockserver gitignore to root; add test file"
```
