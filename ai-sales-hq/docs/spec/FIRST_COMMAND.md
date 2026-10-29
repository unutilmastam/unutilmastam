Repo: unutilmastam/unutilmastam
Project folder: ai-sales-hq/

Read ai-sales-hq/CLAUDE.md, then ai-sales-hq/docs/spec/SPEC_AMENDMENTS.md, then ai-sales-hq/docs/spec/MASTER_SPEC.md. SPEC_AMENDMENTS wins on any conflict.

Do PHASE 0 ONLY (repository + hosting inspection). Do not write application code yet.

1. Inspect this repo: root PWA (index.html, lims/, sw.js, manifest, firebase.json). Find how Firestore is used: collection names and field structure for products (retail + wholesale prices), stores/customers, orders, debts. Read-only, change nothing at repo root.
2. Inspect unutilmastam/Smyagent and decide what can be reused (agent lifecycle, virtual office UI). Record the decision.
3. Check the root PWA for exposed secrets (API keys, tokens) and list them with risk level. Note: Firebase web config is public by design; flag only real secrets and weak Firestore rules if visible.
4. Write a hosting checklist for the owner (Uzbek Latin, step by step for cPanel at hostmaster.uz from a phone): Node.js App versions available, MySQL/PostgreSQL availability, cron minimum interval, max execution time, memory limit, outbound HTTPS. He will send back the answers.

Create in ai-sales-hq/docs/:
- PROJECT_AUDIT.md
- IMPLEMENTATION_PLAN.md (phases 0–10 from SPEC_AMENDMENTS A12, MVP = 0–7, with checkboxes)
- ARCHITECTURE.md
- DECISIONS.md
- HOSTING_CHECKLIST_UZ.md

Open ONE pull request titled "Phase 0: audit and plan". In the PR description list: findings, blockers, and exactly what you need from the owner (in Uzbek Latin). Then stop and wait for owner approval before Phase 1.
