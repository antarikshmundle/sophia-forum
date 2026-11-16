# SOPHIA BOT knowledge

Verified campus documents that SOPHIA BOT may answer from. One Markdown file per topic, in `pce/<category>/`.

- Sophia Bot is the AI & DS Department's assistant. `scope` sets the priority: `aids` (primary), `pce` (secondary),
  `other-dept` (supporting). See section 2 of the guide.
- Categories: `college`, `departments`, `academics`, `admissions`, `facilities`, `contacts`, `campus`, `policies`, `events`.
- Start from [`TEMPLATE.md`](TEMPLATE.md). Drafts, expired documents and documents without a source are never indexed.
- Check and rebuild the index with `npm run kb:build` (writes `src/data/knowledge-index.json`).

The full submission, verification and update process is in
[`docs/sophia-bot/KNOWLEDGE_BASE.md`](../docs/sophia-bot/KNOWLEDGE_BASE.md).

Published site content (About, faculty, HOD message, team, events, gallery) is **not** copied here: the bot reads it
live from the CMS, published records only.
