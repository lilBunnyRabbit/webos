# Kernel inspector

**Date:** 2026-10-11
**Participants:** Owner, Claude

## Context

The Kernel app printed `to_string()` per service: raw, unstyled text that runs off the window. The owner wants a proper interface where each service defines what it shows and how, because most services have very specific data, so plain props wouldn't work. A toggle should switch between basic and detailed information.

## Topics

| Question | Decision | Rejected |
|----------|----------|----------|
| How a service provides its UI | `IService.inspector`: a lazy component in the service's folder | Registry in the Kernel app; glob by folder name |
| Basic vs detailed | One component with a `detailed` prop | `to_string()` as basic; two components |
| Toggle | Per service, plus expand all, persisted in app storage | Per service only; one global toggle |

## Key takeaways

1. Services own their inspector, so a swapped implementation (ADR-016) ships its own.
2. Inspectors only use the public service API.
3. Written up as [ADR-020](../adrs/020-service-inspectors.md).

## Action items

- [x] `InspectorProps` + `IService.inspector`
- [x] An inspector for each of the 8 services
- [x] Kernel app redesign: cards, chevrons, expand all, persisted expanded set
- [x] Reference pages: kernel.md, each service page, system-apps.md

## Next session topics

- Whether inspectors get actions (for example "check for updates", "close window") or stay read-only.
