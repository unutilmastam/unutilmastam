# Unutilmas Ta'm AI Sales HQ — instructions for Claude Code

This folder (`ai-sales-hq/`) is a separate application inside the `unutilmastam/unutilmastam` repo.

## Golden rules
- Read `docs/spec/SPEC_AMENDMENTS.md` FIRST, then `docs/spec/MASTER_SPEC.md`. Where they conflict, SPEC_AMENDMENTS wins.
- Work ONLY inside `ai-sales-hq/`. Never modify, move or delete anything at the repo root (`index.html`, `sw.js`, `manifest.webmanifest`, `lims/`, icons, `UnutilmasTam.apk`, `firebase.json`) — that is the live production PWA.
- Root-level `.github/workflows/` may be added for this app, but every workflow must use `paths: ['ai-sales-hq/**']` and `working-directory: ai-sales-hq`.
- One phase per pull request. Each phase ends with a green GitHub Actions run.
- Owner has no computer: never ask him to run commands locally.
- User-facing text: Uzbek Latin. Code and technical docs: English.
- Never commit secrets. Firestore access is read-only.
