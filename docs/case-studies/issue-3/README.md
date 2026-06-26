# Case Study: Issue #3 - CI/CD False Positives and Preview Failure

## Scope

Issue: https://github.com/konard/numbers-vectorization/issues/3

Pull request: https://github.com/konard/numbers-vectorization/pull/4

Branch: `issue-3-1dc8e615d8a2`

This investigation checked the reported CI/CD runs, preserved logs and
artifacts, compared this repository with the referenced pipeline templates, and
fixed the confirmed repository-local failures and false positives.

## Data Collected

- GitHub Actions logs:
  - `ci-logs/run-28250265337.log`
  - `ci-logs/run-28250265395.log`
- Run and job metadata:
  - `data/run-28250265337.json`
  - `data/run-28250265337-jobs.json`
  - `data/run-28250265395.json`
  - `data/run-28250265395-jobs.json`
- Screenshot failure artifact:
  - `artifacts/preview-regen-failure-28250265337.zip`
  - `artifacts/preview-regen-failure-28250265337/`
- Template workflow copies and diffs:
  - `data/templates/`
  - `data/template-diff-js-current-links.patch`
  - `data/template-diff-js-current-update-preview-images.patch`
- Reproduction and verification logs:
  - `data/reproducer-tests-before-fix.log`
  - `data/reproducer-tests-after-fix.log`
  - `data/lychee-final-clean-checkout-equivalent-output.md`
  - `data/update-preview-images-after-fix.log`

## Timeline

- 2026-06-26 16:10:35 UTC: `Example app` run
  `28250265337` and `Broken Link Checker` run `28250265395` started from
  `main` commit `70d4599ed0a2af9685898466adfca4e118b39e34`.
- 2026-06-26 16:10:48 UTC: `Broken Link Checker` completed successfully, but
  its lychee output contained a root-relative local HTML error.
- 2026-06-26 17:07:20 UTC: `Example app / Regenerate Preview Images` failed
  while waiting for a stale selector.
- 2026-06-26 17:07:21 UTC: the workflow uploaded
  `preview-regen-failure-28250265337`.
- 2026-06-26 17:24:57 UTC: issue #3 was opened.
- 2026-06-26 17:25:45 UTC: PR #4 branch placeholder commit was created.

## Finding 1: Preview Regeneration Was a Real Failure

Run `28250265337` failed only in the `Regenerate Preview Images` job. The
specific error is in `ci-logs/run-28250265337.log`:

- line 610: `locator.waitFor: Timeout 10000ms exceeded.`
- line 612: waiting for `locator('#calculator-title')` to be visible

The current React app renders `Numbers Vectorization` and uses current stable
elements such as `.app-shell`, `#result-title`, and `.analysis-grid`. It does
not render `#calculator-title`. The screenshot script still waited for the old
template app heading, so browser-commander waited until timeout and the job
failed.

The downloaded failure artifact confirmed that the previously committed
screenshots still showed the old `Universal Example App` template UI rather
than the current Numbers Vectorization app.

### Fix

`scripts/update-preview-images.mjs` now waits for current app readiness
selectors:

- `.app-shell`
- `#result-title`
- `.analysis-grid`

The script also closes the local static server when Chromium launch fails. This
cleanup was found during local verification when the workspace had Playwright
installed but the matching Chromium binary was not yet downloaded.

### Verification

- `data/reproducer-tests-before-fix.log`: the focused tests failed on the
  missing current selector expectation.
- `data/reproducer-tests-after-fix.log`: the focused tests passed.
- `data/update-preview-images-after-fix.log`: the preview script completed and
  wrote all screenshot variants at `1280x800`.
- `docs/screenshots/example-app/*.png`: regenerated to show the current Numbers
  Vectorization UI.

## Finding 2: Broken Link Checker Had a False-Positive Error

Run `28250265395` concluded successfully, but lychee reported an error while
checking raw source HTML:

- `ci-logs/run-28250265395.log` line 215:
  `Error building URL for "/favicon.svg"`
- line 247: `No broken URLs found in lychee output.`
- line 248: `all_archived=true`

The root cause was `examples/universal-app/index.html`, which is Vite source
HTML and intentionally contains root-relative app asset paths:

- `/favicon.svg`
- `/src/main.js`

Those paths are valid when Vite serves or builds the app, but lychee checks the
raw file in a repository checkout. That produced a noisy error even though the
workflow ended green because `fail: false` delegated final failure handling to
the Web Archive step.

### Fix

`.github/workflows/links.yml` now excludes
`examples/universal-app/index.html` from raw lychee checks. The built app is
still covered by the Example app workflow, while the link checker remains
focused on repository documentation links.

### Verification

Local lychee reproductions showed:

- `data/lychee-current-output.md`: current workflow arguments reproduce the
  root-relative HTML error.
- `data/lychee-exclude-app-index-output.md`: excluding the Vite source HTML
  removes the error.
- `data/lychee-final-clean-checkout-equivalent-output.md`: final arguments
  exit with `0`, `25 OK`, and `0 Errors`.

## Finding 3: Desktop Package Error Lines Were Log Echoes

Run `28250265337` also contained lines that looked like errors:

- `ci-logs/run-28250265337.log` line 895
- line 1232
- line 1582

Each line is the GitHub Actions shell echo of the guard command:

```sh
echo "::error::Desktop package output was not created at examples/universal-app/out"
```

The corresponding desktop package jobs all concluded `success` in
`data/run-28250265337-jobs.json`, so this was not an actual failing path. No
code change was needed for this item.

## Template Comparison

The referenced templates were checked and their workflow files were saved under
`data/templates/`.

| Repository                                                       | Relevant workflows                            | Result                                                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `link-foundation/js-ai-driven-development-pipeline-template`     | `example-app.yml`, `links.yml`, `release.yml` | Same workflow surface as this repository. Its app still has `#calculator-title`, so the screenshot selector is not stale there. Its Vite source HTML link-check surface is shared. |
| `link-foundation/rust-ai-driven-development-pipeline-template`   | `release.yml`                                 | No Vite example-app screenshot workflow or raw Vite source HTML link-check surface found.                                                                                          |
| `link-foundation/python-ai-driven-development-pipeline-template` | `docs.yml`, `release.yml`                     | No matching example-app screenshot workflow found.                                                                                                                                 |
| `link-foundation/csharp-ai-driven-development-pipeline-template` | `docs.yml`, `release.yml`                     | No matching example-app screenshot workflow found.                                                                                                                                 |

The JavaScript template shared the lychee false-positive risk, so a separate
template issue was filed:

https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/95

## Code Changes

- Added reproducing tests for:
  - current preview screenshot readiness selectors
  - raw lychee exclusion for Vite source HTML
  - preview script cleanup when Chromium launch fails
- Updated `scripts/update-preview-images.mjs` to use current app selectors and
  clean up the server on browser launch failure.
- Updated `.github/workflows/links.yml` to exclude
  `examples/universal-app/index.html`.
- Regenerated current example-app screenshots.
- Added a patch changeset.
- Replaced stale issue-3 case-study files that documented an unrelated
  template release-notes issue.

## Verification Summary

- `node --test --test-timeout=30000 tests/universal-app.test.js tests/workflow-reliability.test.js`
- `/tmp/lychee-v0.23.0/lychee ... --exclude-path examples/universal-app/index.html ...`
- `PREVIEW_VERBOSE=1 node scripts/update-preview-images.mjs`

Full repository checks were run after the case-study docs were updated and are
recorded in the pull request workflow results.
