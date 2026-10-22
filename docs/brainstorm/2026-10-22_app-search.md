# App search in plain sentences
**Date:** 2026-10-22
**Participants:** owner, Claude

## Context
Owner: "since there are so many apps i want a way to search them, so that we would be able to parse 'tool that allows me to make pixelart' or 'daily notes logging', and power this with ai where possible".

One ranker serves the start menu / Mod+K, the mobile drawer, the App Library and Settings (`core/utils/search.ts:68`, `services/apps/search.ts:34`). Every query word must match (`utils/search.ts:52-62`), no stop words, no stemming; it searches name, id, keywords, description and category, not the pitch. Measured on all 93 apps: 8 of 11 sample sentences returned nothing ("my", "for", "that", "like" match no app); 6 of 20 unseen queries found a right app in the top 3. The metadata is fine; the matching rule isn't.

Prototypes against the real catalogue: a weighted ranker (name 6, keywords 3, description 2, pitch 1; rare words count more; simple stemming; joined keywords) reached 11/11 and 19/20; keeping today's strict ranker first kept every name and typo query (8/8). A full-catalogue Nano prompt is ~3.4k tokens (too close to Nano's window, ADR-054); embeddings would be a multi-MB dependency.

## Decisions
- **Ranker:** today's strict matches first, then a "Related" group from a lazy-loaded weighted ranker (stop words, stemming, weighted fields incl. the pitch, rare words count more, adjacent-word joins like "to do" → "todo", a score cutoff ~40% of the top). 0 KB in the boot chunk. Rejected: one loosened ranker (8/11, 18/20).
- **AI:** an "AI suggests" row for sentences (3+ words) when on-device AI is ready: Nano rewrites the sentence into keywords fed to the weighted ranker, arriving ~1 s later in the start menu and App Library; never on phones; debounced and aborted on new keystrokes. Rejected: no AI; AI re-ranking the shortlist; the full catalogue in the prompt; embeddings.
- **Settings search:** unchanged (strict ranker) for now. Rejected: one ranker everywhere.
- **Shell:** `app find <sentence>` yielding `app` values, tagged `ai: "read"` so Ask can answer "which app lets me…". Rejected: no command; command without Ask.
- App Library keeps relevance order for a search (today it re-sorts by name inside categories).

## Action items
- [ ] One builder: weighted ranker + Related group (start menu, drawer, App Library), AI suggests row, `app find`, tests on the sample and unseen query sets.
