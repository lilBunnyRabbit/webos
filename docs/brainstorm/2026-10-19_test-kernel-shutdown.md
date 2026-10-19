# Test kernel shutdown

**Date:** 2026-10-19
**Participants:** owner, Claude

## Context

`mounts.browser.test.ts` flaked under full parallel runs: ShellService starts a history save on every line without awaiting it, `boot_test_kernel().shutdown()` is sync, and the next `beforeEach` `clear_opfs()` hits `NoModificationAllowedError` on the still-open writable. The mounts suite now stubs `shell.remember`. `shell/service.browser.test.ts` hides the same race behind `await vi.waitFor(() => opfs.clear_opfs())`.

## Decisions

- **Async test shutdown.** `IService.destroy?()` may return a promise; `boot_test_kernel().shutdown()` becomes async and awaits each service's `destroy()`. ShellService's `destroy()` returns its pending history save. Production unchanged. The `waitFor` retry around `clear_opfs` goes.
- Rejected: a public `ShellService.idle()` (fixes only shell); leaving the retry.

## Action items

- [x] Implement, update kernel docs (`IService`), remove the retry.
