# SOPHIA BOT knowledge base: how to submit, verify and update campus information

**Sophia Bot is the AI & DS Department's assistant, hosted on the Sophia Forum website.** It is not a general PCE
chatbot. It answers first about Sophia Forum and the AI & DS Department, then about PCE as an institution, and only
in basic terms about other PCE departments. It answers **only from verified information**. If the information isn't in
its knowledge, it says so; it is never meant to guess. This guide is for the site owner and the department team who
supply and check that information.

**Status:** the knowledge foundation (Stage 1) is used by the chat backend and widget (Stages 2–3, off by default; see
[SOPHIA_BOT.md](SOPHIA_BOT.md)). No college facts have been collected yet: `knowledge/pce/` holds no documents.

## 1. Where the bot's knowledge comes from

| Source | What | Who maintains it | How it reaches the bot |
|---|---|---|---|
| **Sophia Forum CMS** | About text, forum history (milestones), mission/vision/objectives, institutional authorities, faculty, HOD message, team and committees, events, gallery | Admins, in **Admin** on the site | Read live, **published records only**. Drafts and unpublished records are never seen. Nothing to do here. |
| **Verified documents** | AI & DS Department information not on the site; PCE institutional information; basic information on other departments | Owner and department team, as files in `knowledge/pce/` | Checked and indexed by `npm run kb:build`, **verified and current documents only** |

Don't copy Sophia Forum site content into documents: edit it in Admin, and the bot follows the published version.

## 2. Knowledge priority and source rules

### 2.1 The three tiers

| Tier | Covers | Where it comes from | `scope` |
|---|---|---|---|
| **1. Primary**: Sophia Forum and the AI & DS Department | Forum history, vision and activities; faculty, HOD, leadership and team; committees and student participation; events, achievements and projects; department academics and facilities; official department documents | Sophia Forum CMS (published), plus verified AI & DS documents | `aids` (CMS records are always primary) |
| **2. Secondary**: PCE institutional information | College history and introduction, campus facilities, admissions and academics, official offices, notices and policies, other institutional information | Official PCE sources, or documents verified by the owner/team | `pce` |
| **3. Supporting**: other PCE departments | Basic department information, cross-campus activities, general student guidance | Official PCE or department sources, verified by the owner/team | `other-dept` |

### 2.2 Source rules

1. **The Sophia Forum CMS is authoritative for Sophia Forum content** (team, committees, events, gallery, forum
   history, faculty and HOD as shown on the site). Documents don't restate or override it.
2. **AI & DS information (`scope: aids`) comes from verified department sources**: official department pages,
   documents issued by the department, or information confirmed by the HOD or the department office. The verifier
   is the department.
3. **PCE-wide information (`scope: pce`) comes from official PCE sources** (the college website, official notices),
   or documents the owner/team has verified against such a source.
4. **Other departments (`scope: other-dept`)**: basic, official information only (programme names, where to ask,
   cross-campus activities). The bot doesn't speak for another department in detail; it points to that department's
   official page.
5. **When sources disagree**, the order of authority is: CMS (for Sophia Forum content), then AI & DS documents, then
   PCE documents, then other-department documents. A disagreement between documents is a verification error:
   re-check both against their sources and correct one.

### 2.3 General rules (every tier)

1. **Nothing is invented.** A document says only what its source says. No estimates and no "usually"; no fees, dates,
   timings, phone numbers or rules unless the source states them.
2. **Every document has a source** (`source_url`): an official page, or the published location of the document that
   was supplied (for example the notice on the college website). A document without one is never indexed.
3. **Every document is checked by a person** before it is used. The verifier records who checked it and when.
4. **Every verification expires.** `review_by` is at most 366 days after `verified_on`. From the day after
   `review_by`, the document is left out automatically until someone checks it again.
5. **Drafts are never used**, whatever they contain.
6. **No personal data.** No student contact details, roll numbers, marks or private phone numbers. Contacts documents
   list official office contacts only, exactly as the college publishes them.

### 2.4 How retrieval applies the priority

Search runs in two steps: relevance first, then priority (`src/lib/bot/knowledge/priority.ts`). Priority **favours**
Sophia Forum and AI & DS content without **hiding** relevant PCE-wide information:

- Each passage's relevance is weighted by its source: CMS ×1.3, AI & DS document ×1.2, PCE ×1.0, other department
  ×0.85. Primary content wins when relevance is comparable. A clearly more relevant PCE passage still ranks above a
  weak primary match.
- **Relevant PCE information is never hidden.** If the best PCE (or other-department) passage scores at least 60 % of
  the best relevance but primary passages pushed it out of the results, it takes the last place.
- **Questions about the institution or another department are ranked on relevance alone.** A question naming the
  college or PCE ("college ki library", "PCE admission"), or another department ("mechanical lab"), gets no tier
  weighting, so AI & DS content isn't pushed onto it.
- On equal scores, the more authoritative source comes first (the order in §2.2, rule 5).
- Each result carries its tier and authority. From Stage 2, the model receives them with every source, so it can say
  where an answer comes from and apply the same conflict order.

The weights are starting values, to be tuned in Stage 4 against real questions in English, Hindi and Hinglish.

## 3. Folders

One Markdown file per topic, in the folder of its **category** (what the document is about). The **scope** field says
which tier it belongs to (§2.1), so the same folder holds AI & DS, PCE-wide and other-department documents. `pce/` is
the institution root: the AI & DS Department is part of PCE.

| Folder `knowledge/pce/…` | For example |
|---|---|
| `college/` | About PCE, introduction, history (as published) |
| `departments/` | AI & DS Department information not on the site (`aids`); basic information on other departments (`other-dept`) |
| `academics/` | Department academics (`aids`); academic calendar, examinations (`pce`) |
| `admissions/` | Admission process, eligibility, documents required, fees (official figures and year only) |
| `facilities/` | Department labs (`aids`); library, hostel, transport, canteen (`pce`) |
| `contacts/` | The department office (`aids`); official college offices and addresses (`pce`) |
| `campus/` | Campus life, student guidance, cross-campus activities |
| `policies/` | Official notices and policies: anti-ragging, attendance, code of conduct, grievance process |
| `events/` | Department achievements and projects not in the CMS (`aids`); college-level events (`pce`). Sophia Forum events are in the CMS |

**File names:** lowercase words joined by hyphens, ending in `.md` (`btech-admission-process.md`). A file's `category`
must match its folder. `README.md`, `.gitkeep` and files starting with `_` are ignored.

## 4. Document format

Start from [`knowledge/TEMPLATE.md`](../../knowledge/TEMPLATE.md). Each file starts with a metadata block between two
`---` lines, then the content:

```markdown
---
title: B.Tech admission process 2026-27
category: admissions
scope: pce
source_url: https://<official PCE page>
verified_by: AI & DS Department office
verified_on: 2026-11-12
review_by: 2027-06-30
status: verified
language: en
keywords: pravesh, admission kaise le, दाखिला
---
## Eligibility
<what the source says, in short paragraphs>

## Documents required
<…>
```

| Field | Required | Allowed values |
|---|---|---|
| `title` | yes | What the document answers, up to 200 characters |
| `category` | yes | `college`, `departments`, `academics`, `admissions`, `facilities`, `contacts`, `campus`, `policies`, `events` (same as the folder) |
| `scope` | yes | `aids` (primary: AI & DS Department / Sophia Forum), `pce` (secondary: PCE-wide), `other-dept` (supporting: another PCE department) |
| `source_url` | yes | `https://…` (official page or published document), or a page on this site (`/about`) |
| `verified_by` | yes, for verified | The office or team that checked it (a role or team name, not a personal phone or email) |
| `verified_on` | yes, for verified | `YYYY-MM-DD`, not in the future |
| `review_by` | yes, for verified | `YYYY-MM-DD`, after `verified_on`, at most 366 days later |
| `status` | yes | `draft` or `verified` |
| `language` | no | `en` (default) or `hi` |
| `keywords` | no | Comma-separated extra search words: Hinglish and Hindi spellings, abbreviations (up to 30) |

The format is strict: one `key: value` per line, no other fields, no field twice. Values may be wrapped in `"…"`.

**Content rules:**
- Plain Markdown: `##` headings, paragraphs, lists and links. No HTML.
- Links: `https://…`, a page on this site (`/events`), or official `mailto:` and `tel:` contacts.
- No placeholders in a verified document (`TODO`, `TBD`, `[insert …]`).
- At most 20,000 characters. Split bigger topics into several documents.
- Write one fact once. For figures, state the academic year they apply to.
- Hindi documents are welcome (`language: hi`). Keyword search already matches common campus words across English,
  Hindi and Hinglish (admission / pravesh / प्रवेश); add unusual spellings in `keywords`.

## 5. Workflow

### Submit
1. Copy the template into the right folder and fill it in from the source, with `status: draft`.
2. Put the official link in `source_url`. For a supplied document (a PDF or notice), it must first be published
   somewhere official (for example on the PCE website), and that address is the source.
3. Hand it over for review (a pull request to the private repository, or the file sent to the site owner).

### Verify (owner or department team)
Check every line against `source_url`:
- [ ] The source is official and currently online, and it fits the scope (§2.2): a department source for `aids`, an
      official PCE source for `pce`.
- [ ] It doesn't restate or contradict Sophia Forum content that the CMS already shows.
- [ ] Every statement, figure, date and contact is in the source, with the same values.
- [ ] Nothing is added from memory or guesswork.
- [ ] No personal data (see rule 6).
- [ ] Title, category and folder fit the content.

Then set `status: verified`, `verified_by`, `verified_on` (today) and `review_by` (the date the information should be
rechecked, such as the start of the next admission cycle: at most 366 days later).

### Publish
```
npm run kb:build      # checks every document and rewrites src/data/knowledge-index.json
```
Read the report: `+` documents are included, `-` documents are excluded with the reasons (section 6). The command fails
if a document marked verified has a problem. Commit the document together with the rebuilt `knowledge-index.json`;
the unit tests fail if the committed index is out of date (`npm run kb:check` checks the same without writing).

### Update
When the source changes, or `review_by` is near: edit the content, set new `verified_on` and `review_by`, and
rebuild. An expired document simply drops out of the index; it is not an error, but the topic has no answer until it's
re-verified.

### Retire
Delete the file (or set `status: draft`) and rebuild.

## 6. Reading the build report

| Reason | Meaning | Fix |
|---|---|---|
| `draft` | `status: draft` | Verify it, then set `status: verified` |
| `expired` | `review_by` has passed | Re-check against the source and update the dates |
| `missing-source` | No `source_url` | Add the official link. If there is none, the information can't be used |
| `invalid-metadata` | A field is missing, misspelled, has a wrong value, the dates don't fit, or the folder doesn't match | Follow the message printed under the file |
| `invalid-content` | Empty, too long, HTML, an unsafe link, or placeholder text | Follow the message printed under the file |

Dates are evaluated in India Standard Time. `--as-of YYYY-MM-DD` builds the index as it would be on another day
(`node scripts/build-knowledge-index.ts --as-of 2027-07-01`, for example, to see what expires before then).

## 7. Technical reference

| Part | File |
|---|---|
| Metadata format and checks | `src/lib/bot/knowledge/schema.ts` |
| Text normalization, Hindi/Hinglish vocabulary, spelling folding | `src/lib/bot/knowledge/text.ts` |
| Chunking (by heading, about 1,200 characters, links kept) | `src/lib/bot/knowledge/chunk.ts` |
| Index builder (deterministic; version = content hash) | `src/lib/bot/knowledge/index-builder.ts`, `scripts/build-knowledge-index.ts` |
| Keyword retrieval (BM25 with a spelling-tolerant tier) | `src/lib/bot/knowledge/retrieve.ts` |
| Source priority (tiers, authority, never-hide rule) | `src/lib/bot/knowledge/priority.ts` |
| CMS adapter (published records via `src/lib/cms/public.ts`) | `src/lib/bot/knowledge/cms-source.ts` |
| Generated index | `src/data/knowledge-index.json` |
| Tests | `tests/unit/bot/` |

- **The index** lists verified, current documents only, with their metadata (source, verifier, dates) and their
  chunks (heading path, text, links). There is no timestamp in it: the same documents always produce the same bytes,
  and `version` changes exactly when the indexed knowledge changes. Retrieval also re-checks `review_by` when a
  question is asked, so a document that expires after the build is still left out.
- **CMS knowledge** goes only through the site's public read functions (publishable key, no session, Row Level
  Security: published only). Nothing is written, there is no secret key, and in demo mode there is no CMS knowledge at
  all. Personal profile links and photos are left out. Each chunk cites the page that shows the record
  (`/team/<id>`, `/events/<id>`, `/about`, `/gallery`).
- **Retrieval** uses the `Retriever` interface. Stage 2 can add a semantic retriever (embeddings) next to the keyword
  one without changing callers. `PrioritizedRetriever` wraps any retriever, so priority (§2.4) applies to both. No AI
  service is called in Stage 1.
- **Known limits of keyword search:** a name typed in Devanagari doesn't match the same name stored in Latin letters
  (and the other way round), and paraphrases with no shared words aren't found. Both are for the Stage 2 semantic
  retriever.
- Record and document text is **data, not instructions**. Stage 2 must pass it to the model as quoted source material.
