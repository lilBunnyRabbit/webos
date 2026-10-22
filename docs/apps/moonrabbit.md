# Moonrabbit

Id `moonrabbit` · Source: `src/lib/apps/user/moonrabbit/` · [brainstorm](../brainstorm/2026-10-22_moonrabbit.md) · [ADR-063](../adrs/063-moonrabbit-journal.md)

## What it does

A journal that is encrypted on the device and quick to write in. The first run makes a journal with a generated five-word master phrase and a recovery code, then offers a quick unlock for this device; after that the app opens on an unlock screen (master phrase, recovery code, or a per-device quick unlock: passkey, the "Carrot patch" hop path or a 6-digit PIN). Unlocked, a "today" box has focus: one line and Enter is an entry. There is a list newest first, an editor with inline photos, four templates, a rotating prompt, tags, search, several journals, Markdown and print export, and one daily reminder. A tap on one of five faces records the mood (alone it is an entry), with activities, energy and sleep if wanted; Calendar, Year (in pixels) and Insights views show them. While locked, the widget and the locked screen's "Add a quick line" seal a line or a mood into the journal's inbox with its public key; the next unlock merges them in.

## How it works

### Files

```
/home/Journal/{name}/
  journal.json      plain header (below)
  index.bin         encrypted index: one row per entry
  entries/{id}.bin  one encrypted entry
  media/{id}.bin    one encrypted photo (WebP bytes)
  inbox/{id}.bin    an item added while locked, until the next unlock merges it
```

`/home/Journal` is made by the first journal, not at boot (`create_journal_folder` in `store.ts`), so the files hierarchy (ADR-021) is unchanged. A taken journal name gets `name (1)` like any other folder. `{id}` is 128 random bits as hex (`random_id`), so file names say nothing about dates.

**`journal.json`**, pretty-printed and validated with zod on read (`HeaderSchema` in `journal.ts`):

```json
{ "version": 1, "id": "<32 hex>", "kdf": { "iterations": 600000, "salt": "<16 bytes b64>" },
  "wraps": { "phrase": { "iv": "…", "data": "…" }, "recovery": { "iv": "…", "data": "…" } },
  "inbox_public_key": "<raw X25519 b64>", "inbox_private_wrapped": { "iv": "…", "data": "…" } }
```

A folder whose `journal.json` doesn't parse shows "This journal can't be opened"; one without `journal.json` isn't listed.

**`.bin` files** (`seal` in `crypto.ts`): one version byte (`1`), the 12-byte IV, then AES-GCM ciphertext with its 16-byte tag. A different version byte is refused before decrypting.

**Index row** (`IndexEntrySchema`): `id, date (YYYY-MM-DD), created, updated, title, tags, words, media[], template?, mood?, activities?, energy?, sleep?`. **Entry** (`EntrySchema`): the same minus the derived fields, plus `body`. `mood` is 1 to 5, `activities` a list of activity ids, `energy` 0 to 10, `sleep` hours. The index document is `{ version, entries, activities? }`: `activities` is the journal's own activity list (`{ id, label, icon, hidden? }`), absent until the user edits one, and written under the same Web Lock as entries. Defaults have stable ids (`work`, `walk`, …), custom ones `c-{12 hex}`; a default added in a later version is appended to a stored list (`activity_list`).

**Body.** Plain text. A photo is the token `![photo](media:{id})` on its line (`media_token`); tags are `#word` anywhere; the title is the first non-empty line without leading `#`s.

### Keys

| Key | What | Where it lives |
|-----|------|----------------|
| Data key | Random AES-GCM 256, encrypts every `.bin`, the inbox private key | Never stored raw. Wrapped in the header (twice) and per device (quick unlock). Unlocked: a non-extractable `CryptoKey` in the window's `JournalSession` |
| Phrase key | PBKDF2-HMAC-SHA256(NFKC phrase, 16-byte salt, `kdf.iterations`) → AES-GCM key-wrapping key | Derived on unlock, then dropped |
| Recovery key | HKDF-SHA256(128-bit code, salt = journal id, info `moonrabbit/recovery`) | Derived on unlock, then dropped |
| Inbox key pair | X25519, made with the journal | Public raw in the header; private PKCS #8 encrypted with the data key, imported non-extractable only to merge |
| Inbox item key | HKDF-SHA256(X25519(ephemeral, inbox public), salt = ephemeral public ‖ inbox public, info `moonrabbit/inbox`) → AES-GCM | Derived per item, never stored; the ephemeral private key is non-extractable and dropped |
| Device key | Non-extractable HMAC-SHA256 `CryptoKey` | IndexedDB `webos.moonrabbit` › `keys` › `device`, one per browser |
| Quick key | HKDF(HMAC(device key, PBKDF2(secret, salt, 600k))) for a path or PIN; HKDF(passkey PRF output) for a passkey | Derived on unlock, then dropped |

**Additional data.** Every encryption and wrap binds `moonrabbit/1/{journal id}/{item}` (`additional_data`): `wrap/phrase`, `wrap/recovery`, `wrap/quick/{method}`, `inbox-key`, `index`, `entry/{id}`, `media/{id}`, `inbox/{id}`. A file copied over another entry's name, into another journal, or read as a newer format fails its GCM tag. Tested in `crypto.test.ts` and `moonrabbit.browser.test.ts`.

**Rewrapping.** The in-memory data key can't be exported, and Web Crypto's `wrapKey` needs an extractable key. So every rewrap (change phrase, new recovery code, set up quick unlock, raise the iteration count) unwraps the data key again from a secret the user just typed, with `extractable: true`, wraps it and lets that copy go (`unlock.ts`). That is why each of those asks for the master phrase (or the recovery code). Changing the phrase writes only `kdf` and `wraps.phrase` with a new salt; entries are not re-encrypted.

**Iterations.** `kdf.iterations` is read on every unlock. When a stored count is below `PBKDF2_ITERATIONS`, the next phrase unlock rewraps at the current count with a new salt (`unlock_phrase`). Measured in headless Chromium on the owner's Mac (Apple silicon) via the browser test: 600,000 iterations take about 55 ms; creating a journal took 111 ms end to end in the UI. Phones are slower; unmeasured.

**Recovery code.** 16 random bytes plus a 12-bit SHA-256 checksum, as 28 Crockford base32 characters in seven groups of four (`format_recovery_code`). Parsing ignores case, spaces and dashes, reads O as 0 and I/L as 1, and a failed checksum says "typo" instead of "wrong code".

**Inbox check.** Every unlock decrypts the inbox private key and compares its public half (JWK `x`) with `inbox_public_key` (`verify_inbox_key`). A header edited to point the inbox at someone else's key refuses to open ("changed outside Moonrabbit").

### Quick unlock (per device)

One record per journal in IndexedDB `webos.moonrabbit` › `quick`, keyed by journal id (`device.ts`): `{ method, wrapped, salt, iterations, credential_id?, shuffle?, attempts, master_at, header_stamp }`.

- **Passkey.** Offered only when `PublicKeyCredential.getClientCapabilities()` reports `extension:prf`. Setup creates a credential with `prf.eval.first = salt`; a provider that returns the PRF output on create is used at once, one that only says `enabled` gets one `get()`, one that says neither gets "can't unlock a journal" and the new credential is reported back with `signalUnknownCredential` so it doesn't linger (`passkey.ts`). Unlock is a `get()` with the stored credential id.
- **Carrot patch.** 20 plots on a 4 × 5 meadow, each a Phosphor nature icon (carrot, clover, tulip, moon, …), 6 hops, the same plot again allowed. The secret is the sequence of plants (`taps:carrot,moon,…`), not positions, so "Shuffle the meadow" can move the plants every time without changing the path. Arrow keys, Home/End, Enter or Space hop, Backspace undoes.
- **PIN.** 6 digits, typed or tapped.
- **Gate** (`quick_gate`): open unless 5 wrong tries were used, more than 7 days passed since the last master phrase or recovery unlock on this device (or the clock went back), or `journal.json`'s `lastModified` differs from `header_stamp`. The app writes the header itself only through `write_header`, which updates the stamp; a backup restore stages and moves files, so the stamp changes and the master phrase is asked. A master unlock re-stamps, restarts the 7 days and clears the tries.
- **Wrong tries.** A wrong path, PIN or passkey fails the GCM unwrap; the count goes up; the fifth deletes the record.
- **One method per device.** The record holds one method; setting up another replaces it. The lock screen opens on it, with "Use phrase instead" beside it and "Use {method}" to come back.
- **Where it's offered.** One setup flow (`quick-setup.svelte`): big choice cards (passkey only when available), the honest note on what a path or PIN protects against, then the secret twice. It runs in three places: right after a new journal's recovery-code step ("Faster unlock on this device", with "Not now"), once after a master-phrase unlock on a device with no quick unlock, and in Journal settings › Quick unlock. The first two already hold the phrase the user just made or typed (in the component's state, dropped when the step ends), so they don't ask for it again; settings asks. "Not now" after a phrase unlock is remembered per device in `app.moonrabbit.quick-offer-declined` (journal ids, nothing secret); the first-run "Not now" isn't, so the next phrase unlock asks once more. Without a quick unlock the phrase field says "Set up a fingerprint, a hop path or a PIN after unlocking" (or "in Settings › Quick unlock" once declined).

### Session and locking

`JournalSession` (`session.svelte.ts`) is one unlocked journal in one window: the key, the decrypted index, a cache of decrypted entries and photo object URLs. Two windows unlock separately. `lock()` runs the editor's pending save first (each save captures the key before its first `await`, so it lands), then drops the key, clears the caches, revokes the URLs and the window falls back to the unlock screen. `journal lock` locks every session in the tab (`sessions.ts`).

Index writes take a Web Lock per journal (`moonrabbit:{id}`), re-read `index.bin` and apply one change, so two windows saving at once both land (tested). Every window re-reads the index when the journal folder's revision moves.

Auto-lock (`moonrabbit.app.svelte`): idle (no pointer, key, input or wheel in the window) for 5 minutes by default; hidden (`win.is_visible` false: minimized, the tab hidden, another app on top on a phone) for 1 minute on desktop and at once on a phone. Both adjustable in Journal settings (`app.moonrabbit.idle-minutes`, `app.moonrabbit.hidden-seconds`). The hidden-lock waits while the editor's own camera or device file chooser is open (`session.picking`): on a phone the camera hides the page, and locking then would lose the photo; the idle lock still runs. Closing the window locks.

**What never holds journal text:** session restore (the app takes no props and no window state; checked by dumping `session.json` after writing entries), the window title ("Moonrabbit · locked", or the date of the open entry or today), notifications and the reminder ("Time to write", nothing else), localStorage (the last journal's folder name, the two auto-lock numbers and the ids of journals whose quick-unlock offer was declined), the shell (only `journal lock`; no `ai` commands). The browser test writes a marker string into entries, tags and the template, changes the phrase and the recovery code, then reads every OPFS file byte by byte and every localStorage value: the marker, the phrase and its words appear nowhere.

### Adding while locked

Only reading needs a secret (`inbox.ts`, `seal_inbox` and `open_inbox` in `crypto.ts`).

- **Item.** `inbox/{id}.bin`: version byte `1`, the 32-byte ephemeral X25519 public key, a 12-byte IV, AES-GCM ciphertext and tag. Plaintext `{ date, created, body, mood? }` (zod). Activities, energy and sleep aren't offered while locked: the activity names are encrypted.
- **Writers.** The widget (`widget.svelte`): five faces, a tap seals a mood-only item at once and shows "Saved · Undo" for 6 s (Undo deletes the file if it hasn't been merged yet); "Write a line" opens the capture box. The capture box (`capture-dialog.svelte`, a system dialog through `dialogs.show` like Quick Notes'): a text field (Enter saves, Shift+Enter a new line), the faces, a journal picker when there are several. The locked screen's "Add a quick line" opens the same box. Both write to the journal last opened (`app.moonrabbit.journal`, shared with the widget). The text lives only in the dialog's state until it's sealed; no notification is shown.
- **Merge** (`JournalSession.merge_inbox`, under a Web Lock `moonrabbit:{id}:inbox`). Runs when the journal view opens and whenever the `inbox/` folder's revision moves while unlocked, so a widget tap shows up in an open journal. Each item decrypts with the inbox private key, becomes an entry with the item's id as entry id (sealed under the data key), the index takes them in one write, then the inbox files go. An item that fails its tag, its version byte or the schema stays in `inbox/`; the banner says how many couldn't be read. The count of merged entries shows as "N new entries since last unlock" until dismissed.
- Tested in `moonrabbit.browser.test.ts`: written with the header alone, merged, inbox emptied, a second merge is a no-op; a mood-only item; a flipped byte and an item renamed to another id both refused and left; an item copied into another journal refused; the plaintext scan covers inbox files (merged and waiting).

### Mood and views

- **Mood** (`mood.ts`, `mood-picker.svelte`). Five levels: Awful, Bad, Okay, Good, Great (Phosphor smileys). On the today box it's a toggle saved with the line; Save works with a mood and no text, and the entry is titled "Feeling good". In the editor it saves 300 ms after the tap. Buttons are 32 px, 44 px on touch.
- **Details** (`mood-details.svelte`, behind "Activities"): activity chips (hidden ones only when already on the entry), energy 0–10 and sleep 0–14 h in half hours. A slider stays unset ("–", dimmed) until moved; × clears it.
- **Day stats** (`day_stats`): per date, the entry count, the average of the entries' moods, energy and sleep, and the union of activities. Every view reads the index only; nothing is decrypted beyond it.
- **Calendar** (`calendar-view.svelte`): a month, Monday first, each day filled by its mood (`mood_fill` in `icons.ts`): `secondary` for awful, `secondary/45` bad, `foreground/30` okay, `primary/45` good, `primary` great, an outline for a day written without a mood, `foreground/6` for nothing. A diverging scale on theme tokens, neutral in the middle. Arrow keys move a roving focus; the selected day's entries list below.
- **Year in Pixels** (`year-view.svelte`): one cell per day. Below a 44 rem container the months are columns and the days scroll down (a phone); from 44 rem it turns, months as rows and days as square cells, so a year fits. Tap a day for its entries.
- **Insights** (`insights-view.svelte`, `mood-chart.svelte`): weekly average mood (a day weighs the same however many entries it has; `week_series`) as a 2 px line over a light area on a 1–5 scale, gaps where a week has no mood, over 3, 6 or 12 months; pointer or tap shows the week; a hidden table carries the numbers for screen readers. "Activities and your days" (`activity_stats`): for each activity on at least two days with a mood, the average day mood with it minus the average without it, as a diverging bar, plain averages. Sleep and energy: day mood at or above the median against below (`split_stat`, at least four days).
- **On This Day** (`on_this_day`): above the entry list, the same date in earlier years and the same day of the month in the eleven months before, up to four dates.

### Writing

- **Today box.** Focused when the journal opens. Enter saves the text as a new entry dated today; Shift+Enter is a new line. Its placeholder is the day's prompt.
- **Prompt.** `prompt_for(day, skip)`  rotates 12 prompts by day number; Skip prompt steps on, Answer opens a new entry headed with it.
- **Templates.** Morning, Evening, Gratitude 3, Brain dump (`TEMPLATES`), from New.
- **Editor** (`entry-editor.svelte`): a `contenteditable="plaintext-only"` box. Live formatting, live-preview style: `format_lines` (`format.ts`) splits the body into lines (`#`–`###` headings, `-`/`*`/`+`/`1.` list items, text) and inline runs (`**bold**`, `*italic*` or `_italic_` not inside words, `#tags`, photo tokens kept whole), keeping every character; `restyle` (`live-dom.ts`) renders them as spans (`md-h1`, `md-mark`, `md-bold`, …) only when the structure differs from what the browser already typed, reusing photo elements, and puts the caret back by character offset. So the stored body is still plain text with Markdown. Enter is handled by the editor: in a list item it starts the next item (numbers count up), on an empty item it ends the list; Shift+Enter is a plain newline. Re-rendering breaks native undo, so Mod+Z / Mod+Shift+Z (and the browser's undo input events) walk the editor's own history (`$kit/utils/history`, bursts of typing grouped after 700 ms, 200 steps or 2 MB), in memory only. The DOM is text nodes, styled spans and `<img data-media>`; reading it back (`read_body`) turns each image into its token. Saves 600 ms after typing stops, encrypted. A new entry isn't written until its first change; closing it untouched writes nothing, deleting it removes the photos it already stored. The date is editable.
- **Photos.** Paste, drop, or the photo button (camera on phones, this device, WebOS files). Each goes through `picture_data_url` (`$kit/utils/picture`: long edge 1200 px, WebP 0.8), and only the bytes are stored, encrypted, as `media/{id}.bin`. Shown through object URLs revoked on lock. A save drops photos the text no longer references.
- **Search** decrypts every entry into the session's memory on first use while unlocked, then matches all words; `#tag` matches tags only.
- **Days written this month** counts distinct dates with an entry (a mood alone counts), never a streak.
- **Export** (sheet): a date range, then Save Markdown… (each entry's mood, activities, energy and sleep as an italic line under its heading) (photos as `data:` URLs, through the save picker, with a "this file isn't encrypted" toast) or Print or PDF (`print_html`, light Markdown: `#` headings, lists, bold, italic; images only as `data:image/...;base64`). Runs inline: decrypting a month takes milliseconds; a year with many photos is unmeasured.
- **Reminder.** One scheduler job `moonrabbit:reminder`, daily at a chosen time, title "Time to write", no message; a click opens the app.
- **Several journals.** A picker on the unlock screen and in the toolbar; New journal runs the first-run flow again. Each journal has its own phrase, recovery code and quick unlock.
- **Rename and delete** (`manage.ts`, `rename_journal` / `delete_journal` in `unlock.ts`), from the lock screen without unlocking and from Journal settings. Neither asks for a secret: the name is the folder name, already shown, and anyone at the device can delete the folder in Files anyway, so a lost phrase mustn't trap a journal. Rename validates like creation (no `\ / : * ? " < > |`, no leading dot) and refuses another journal's name in any case. Everything is bound to the journal id, not the name (additional data, quick record, inbox, Web Locks), so nothing is re-encrypted. OPFS has no directory rename: `rename_entry` copies the folder, which gives `journal.json` a new `lastModified`; the quick record's `header_stamp` moves along only if it trusted the header before and the header text is the same after, so a rename doesn't read as a restore. Other windows with the journal unlocked are locked (`lock_journal`), the window that renamed keeps its session on the new path, and `app.moonrabbit.journal` follows the new name. Delete is a danger confirm, then typing the journal's name in a danger prompt (red button); it removes the folder for good (WebOS has no trash; same as deleting a folder in Files), this device's quick record and the declined flag, locks every window on it, and cancels the reminder when no journal is left (the reminder is one per app). A journal whose `journal.json` is damaged can be deleted from its error screen.

### Strength meter

`phrase_bits`: a word from the EFF list counts log2(7776) ≈ 12.9 bits, a repeated word nothing, any other token half its character-pool bits. Under 40 bits is weak and can't be used; 60 and up is strong. A generated phrase is 65 bits.

## Threat model

| Against | Holds? | Why |
|---------|--------|-----|
| Someone reading the files (a backup zip, a copied `/home`, another page on the `github.io` origin) | Yes, with a good phrase | Everything but the header is AES-GCM. A 5-word generated phrase is 65 bits behind 600k PBKDF2: out of reach. A weak own phrase is the weak point, which is why the meter refuses under 40 bits |
| The same, guessing a PIN or a path | Yes | The quick wraps aren't in the files or backups; they're in IndexedDB with the device key |
| Someone with a full copy of the browser profile | Partly | Non-extractable only stops page code from exporting the device key; Chrome keeps its material in the profile's IndexedDB files, so a profile copy carries it. Then a 6-digit PIN is 10^6 guesses and a path 20^6 ≈ 6.4 × 10^7, each a 600k PBKDF2: hours to days on a GPU, not years. The 5-try limit doesn't apply offline. Use a passkey or none on a machine you don't control |
| Someone at the unlocked journal | No | It's open. Auto-lock limits the window |
| Someone at the locked journal on this device | Yes, 5 tries | Then the quick wrap is gone and the master phrase is needed |
| Tampering with files | Detected | GCM tags and additional data; a swapped inbox key is caught at unlock |
| Someone who can write the files, adding entries | Partly | Anyone with `journal.json` can encrypt to the inbox key, so they can slip entries in; they arrive counted in "N new entries since last unlock". They can't read anything |
| Someone who can rewrite `journal.json`, swapping the inbox key | Until the next unlock | The locked writer can't check the public key without the data key, so lines captured while locked would be readable by whoever holds the swapped key. The next unlock refuses the header. Pinning the key per device is an open decision ([brainstorm](../brainstorm/2026-10-22_moonrabbit.md#follow-up-2026-10-22-part-2)) |
| Code running in the page (another WebOS app, a malicious extension) | No | Same origin and same JavaScript realm. WebOS has no isolation between apps (PRINCIPLES: capability system rejected) |
| Forgotten phrase and lost recovery code | Lost | Nothing can reset them |

What stays visible: how many entries and photos there are, their sizes and file times, the journal names, that the app is used.

## Data

| Store | Path or key | What |
|-------|-------------|------|
| OPFS | `/home/Journal/{name}/…` | The journal (above). In backups under Files, encrypted |
| IndexedDB | `webos.moonrabbit` › `keys`, `quick` | Device key; quick-unlock records. Not in backups. Uninstalling with "delete data" deletes the database (`on_uninstall_data` in `uninstall.ts`); journals in `/home/Journal` stay and still open with the phrase |
| localStorage | `app.moonrabbit.journal`, `.idle-minutes`, `.hidden-seconds`, `.quick-offer-declined` | Last journal's folder name; auto-lock settings; journal ids whose quick-unlock offer was turned down on this device |
| Scheduler | `moonrabbit:reminder` in `/var/lib/scheduler/jobs.json` | The reminder |
| Desktop | `/home/Desktop/{label}.widget` | The widget, when placed (no journal data in it) |

No props, no window state. Shell: `journal lock` (`commands.ts`). The widget (`widget_size` 3×2 to 5×3) works on the desktop and the phone home.

## Dependencies & licences

- Web Crypto (AES-GCM, PBKDF2, HKDF, HMAC, X25519), WebAuthn PRF, IndexedDB, Web Locks. No packages.
- `eff-large-wordlist.txt`: EFF's Large Wordlist for Passphrases, Creative Commons Attribution, loaded only when a phrase is made or rated. Source, hash and licence in `EFF-WORDLIST-LICENSE.md` beside it.

## Limits

- Phone timings for 600k PBKDF2 (unlock, PIN, path) are unmeasured.
- Live formatting covers headings, lists, bold, italic and tags; quotes, links and code show as typed. Undoing back past a deleted photo restores its token, but the photo file was removed on save, so it shows as "couldn't be opened".
- Activity correlations are plain averages over the chosen range, not statistics.
- The inbox key isn't pinned per device (threat model).
- Export runs inline, not as a task.
- A passkey that a provider deletes leaves its quick wrap until the next try fails with "cancelled"; Remove in settings clears it.
- Renaming or deleting while another window has the journal open locks that window; a save its editor flushes on the way out can race the folder copy.

## Decisions

- [Brainstorm 2026-10-22](../brainstorm/2026-10-22_moonrabbit.md): scope, unlock methods, storage, auto-lock, shell, no AI.
- [ADR-063](../adrs/063-moonrabbit-journal.md): format and key hierarchy, with the build's revision note.

Spellcheck is off in every Moonrabbit text box (`spellcheck=false`): Chrome's Enhanced spell check would otherwise send typed text to Google. The inbox key is not pinned per device, by the owner's call (threat model: the header can be swapped only by someone who can already write the files).
