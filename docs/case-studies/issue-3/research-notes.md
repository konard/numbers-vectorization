# Research Notes for Issue #3

## Primary Evidence

- Issue #3: https://github.com/konard/numbers-vectorization/issues/3
- PR #4: https://github.com/konard/numbers-vectorization/pull/4
- Failing run: https://github.com/konard/numbers-vectorization/actions/runs/28250265337
- Noisy successful run: https://github.com/konard/numbers-vectorization/actions/runs/28250265395

The downloaded logs are the source of truth for the CI behavior in this case
study. The important log line references are:

- `ci-logs/run-28250265337.log:610` - preview screenshot timeout
- `ci-logs/run-28250265337.log:612` - stale `#calculator-title` selector
- `ci-logs/run-28250265395.log:215` - lychee root-relative `/favicon.svg`
  error
- `ci-logs/run-28250265395.log:247` - Web Archive script found no broken URLs
- `ci-logs/run-28250265395.log:248` - `all_archived=true`

## Local Reproductions

Two focused tests were added before the implementation fix:

- `tests/universal-app.test.js` asserts that the preview script waits for
  selectors that exist in the current app and no longer waits for
  `#calculator-title`.
- `tests/workflow-reliability.test.js` asserts that raw lychee checks exclude
  `examples/universal-app/index.html`.

`data/reproducer-tests-before-fix.log` shows both tests failing before the
implementation changes. `data/reproducer-tests-after-fix.log` shows both tests
passing after the fix.

Local lychee experiments showed that `--root-dir` alone only changes the
symptom. The raw Vite source file still contains app asset paths that are meant
to be resolved by Vite, so excluding `examples/universal-app/index.html` is the
minimal reliable fix for this workflow.

## Template Research

Workflow files were downloaded from:

- https://github.com/link-foundation/js-ai-driven-development-pipeline-template
- https://github.com/link-foundation/rust-ai-driven-development-pipeline-template
- https://github.com/link-foundation/python-ai-driven-development-pipeline-template
- https://github.com/link-foundation/csharp-ai-driven-development-pipeline-template

The JavaScript template has the same workflow surface as this repository. Its
React app still defines `#calculator-title`, so its screenshot script is
internally consistent. Its raw Vite `examples/universal-app/index.html` and
link-check workflow can produce the same lychee false-positive path, so issue
95 was filed there.

The Rust, Python, and C# templates do not have the same Vite example-app
screenshot workflow surface.

## External References

- Lychee command-line parameters:
  https://github.com/lycheeverse/lychee#commandline-parameters
- Vite static asset handling:
  https://vite.dev/guide/assets.html

These references support the distinction between raw local-file HTML checking
and Vite-served or Vite-built app asset resolution.
