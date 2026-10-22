# ADR-063: Moonrabbit Journal Encryption
**Date:** 2026-10-22
**Status:** Accepted

## Context
Moonrabbit is a password-protected journal built for quick entries ([brainstorm](../brainstorm/2026-10-22_moonrabbit.md)). WebOS has no backend and no secure hardware of its own: anything stored in OPFS can be copied with the profile, a backup zip or another page on the shared origin, and then attacked offline. Terminal history, session restore, scheduler jobs and window titles are stored or shown in plain text.

## Decision
**Layout.** Each journal is a folder `/home/Journal/{name}/`:
- `journal.json`: plain header `{ version, id, kdf: { iterations, salt }, wraps: { phrase, recovery }, inbox_public_key, inbox_private_wrapped }`.
- `index.bin`: encrypted index (entry id, date, mood, activities, tags, word count).
- `entries/{random}.bin`, `media/{random}.bin`: one encrypted blob per entry or attachment.
- `inbox/{random}.bin`: entries added while locked.

**Keys.**
- A random 256-bit AES-GCM **data key** encrypts everything (random 96-bit IV per write; additional data = journal id, item id, format version).
- The header wraps the data key twice: with a key derived from the **master phrase** (PBKDF2-HMAC-SHA256, 600,000 iterations, stored so it can rise) and with a 128-bit **recovery code** (HKDF). Changing the phrase rewraps only the data key.
- After unlock the data key is a non-extractable `CryptoKey` in memory only; locking drops it. Never in session, window state, localStorage or files.

**Quick unlock per device (optional).** Stored in IndexedDB, outside `/home` and outside backups:
- a passkey via WebAuthn PRF (`prf.eval.first` → HKDF → wrap), offered only when the provider returns a PRF result;
- otherwise a rabbit tap sequence or a 6-digit PIN: wrap key = HMAC(device key, PBKDF2(canonical input, salt, 600k)), the device key a non-extractable HMAC `CryptoKey` in IndexedDB.
- Five wrong attempts delete the quick wrap; the master phrase is required every 7 days and after a restore.

**Adding while locked.** The header holds an X25519 public key; its private key is wrapped by the data key. The widget and capture dialog encrypt with an ephemeral X25519 key pair → HKDF → AES-GCM into `inbox/`. Unlock merges the inbox into entries under the data key.

**No leaks.** Window titles stay generic ("Moonrabbit · locked" or a date); notifications and the reminder job never quote entries; no shell command reads or adds (only `journal lock`); no `ai: "read"` commands and no model use; session/window state holds no entry text.

**Auto-lock.** 5 min idle, 1 min hidden on desktop, immediately when hidden on a phone; adjustable.

## Alternatives Considered
- Argon2 via WASM: a new dependency; Chrome's Web Crypto doesn't ship Argon2.
- A single `.journal` container: atomic, but every save rewrites it.
- Mood and dates readable while locked: leaks feelings per day.
- A shell flag to keep `journal add` out of history: rejected by the owner; no shell add at all.
- Picture passwords, rhythm, drawn shapes: unstable input, low entropy.

## Consequences
- Forgotten phrase and lost recovery code = the journal is unreadable.
- Short quick-unlock secrets protect only against casual use of this browser; a full profile copy makes them attackable offline. The master phrase is the real protection.
- Entry count, sizes and file times are visible.
- Passkey quick unlock depends on the passkey provider supporting PRF.
