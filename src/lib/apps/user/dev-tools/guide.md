Pick a tool from the side list (a tab row on a narrow window). Results update as you type, and everything runs on your device; nothing is sent anywhere.

## Good to know

- **Use as input** in Base64 swaps the result into the input and flips the direction.
- **Hashes** and **Certificate** read a file too: **Choose file** picks one from WebOS, **From device** (Hashes) from your device.
- **JWT** accepts a token with its `Bearer` prefix. Type the secret to check an HS256, HS384 or HS512 signature; the secret is never saved.
- **Time** takes a Unix timestamp (seconds, milliseconds, micro- or nanoseconds, told apart by length), a date, or nothing for now, and shows it in any time zone you pick.
- Your inputs are kept, and a new window opens on the last tool you used. Texts over 20,000 characters aren't kept.

## In the Terminal

The same tools work as commands, and take piped input:

- `b64` encodes (`-d` decodes), `hash` hashes files or text, `uuid` generates ids (`-n 5`, `-v v7`).
- `jwt` decodes a token, `ts` converts a timestamp or date, `cron` describes an expression and lists its next runs, `cert` reads certificate files.
