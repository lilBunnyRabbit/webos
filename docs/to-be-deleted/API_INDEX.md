# WebOS API Documentation Index

Complete documentation for the WebOS API architecture and implementation.

---

## 📚 Core Documentation

### [API Specification](./API_SPECIFICATION.md)
**Comprehensive technical specification for all WebOS APIs**

- Architecture overview (microkernel design)
- Complete interface definitions for all 11 services
- Type definitions and examples
- App development guide
- Best practices

**Read this for:** Complete API reference, interface contracts, type definitions

**Audience:** All developers

---

### [API Quick Reference](./API_QUICK_REFERENCE.md)
**One-page cheat sheet for quick lookup**

- Service access patterns
- Method signatures for all services
- Capability list
- Common code patterns
- Quick examples

**Read this for:** Fast lookup while coding, learning the API surface

**Audience:** Developers actively coding

---

### [API Design Decisions](./API_DESIGN_DECISIONS.md)
**Rationale behind architectural choices**

- Why microkernel architecture?
- Why capability-based security?
- Service naming rationale
- Windows vs Apps separation
- State management patterns
- Comparison with alternative approaches

**Read this for:** Understanding the "why" behind design choices, making architectural decisions

**Audience:** Tech leads, architects, senior developers

---

### [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md)
**Step-by-step implementation plan**

- 10-week implementation timeline
- Phase-by-phase breakdown
- Detailed task lists
- Dependencies and package requirements
- Risk mitigation strategies
- Success criteria

**Read this for:** Planning implementation, tracking progress, estimating effort

**Audience:** Project managers, team leads, implementers

---

## 🎯 Quick Navigation

### By Role

#### **I'm a new developer on the project**
1. Start with [API Quick Reference](./API_QUICK_REFERENCE.md) for overview
2. Read [API Specification](./API_SPECIFICATION.md) sections as needed
3. Check [Svelte Quick Reference](./SVELTE_QUICK_REFERENCE.md) for Svelte 5 patterns

#### **I'm implementing a service**
1. Read [API Specification](./API_SPECIFICATION.md) for the service interface
2. Check [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md) for tasks and dependencies
3. Reference [API Design Decisions](./API_DESIGN_DECISIONS.md) for context

#### **I'm building an app**
1. Read [API Specification → App Development](./API_SPECIFICATION.md#app-development)
2. Check [API Quick Reference](./API_QUICK_REFERENCE.md) for service methods
3. Review example apps (when available)

#### **I'm making architectural decisions**
1. Read [API Design Decisions](./API_DESIGN_DECISIONS.md) for rationale
2. Review [API Specification → Architecture](./API_SPECIFICATION.md#architecture-overview)
3. Check [Implementation Roadmap → Risk Mitigation](./IMPLEMENTATION_ROADMAP.md#risk-mitigation)

---

## 📖 Documentation by Topic

### Architecture

| Topic | Document | Section |
|-------|----------|---------|
| Microkernel Design | [Design Decisions](./API_DESIGN_DECISIONS.md#1-microkernel-architecture) | #1 |
| Service Registry | [API Spec](./API_SPECIFICATION.md#kernel-api) | Kernel API |
| Service Isolation | [Design Decisions](./API_DESIGN_DECISIONS.md#1-microkernel-architecture) | #1 |

### Security

| Topic | Document | Section |
|-------|----------|---------|
| Capability System | [Design Decisions](./API_DESIGN_DECISIONS.md#2-capability-based-security) | #2 |
| Permission Enforcement | [API Spec](./API_SPECIFICATION.md#capabilities) | Core Concepts |
| Capability List | [Quick Ref](./API_QUICK_REFERENCE.md#capabilities) | Capabilities |

### Services

| Service | API Spec | Quick Ref | Design Decision |
|---------|----------|-----------|-----------------|
| Kernel | [§ Kernel API](./API_SPECIFICATION.md#kernel-api) | [§ Kernel](./API_QUICK_REFERENCE.md#kernel) | - |
| Windows | [§ Windows Service](./API_SPECIFICATION.md#windows-service) | [§ Windows](./API_QUICK_REFERENCE.md#windows-service) | [#4](./API_DESIGN_DECISIONS.md#4-separation-windows-vs-apps) |
| Apps | [§ Apps Service](./API_SPECIFICATION.md#apps-service) | [§ Apps](./API_QUICK_REFERENCE.md#apps-service) | [#4](./API_DESIGN_DECISIONS.md#4-separation-windows-vs-apps) |
| Files | [§ Files Service](./API_SPECIFICATION.md#files-service) | [§ Files](./API_QUICK_REFERENCE.md#files-service) | [#14](./API_DESIGN_DECISIONS.md#14-file-system-opfs--virtual-paths) |
| Tasks | [§ Tasks Service](./API_SPECIFICATION.md#tasks-service) | [§ Tasks](./API_QUICK_REFERENCE.md#tasks-service) | [#6](./API_DESIGN_DECISIONS.md#6-task-service-vs-tasks-api) |
| Notifications | [§ Notifications Service](./API_SPECIFICATION.md#notifications-service) | [§ Notifications](./API_QUICK_REFERENCE.md#notifications-service) | [#7](./API_DESIGN_DECISIONS.md#7-notifications-toast-vs-system) |
| Settings | [§ Settings Service](./API_SPECIFICATION.md#settings-service) | [§ Settings](./API_QUICK_REFERENCE.md#settings-service) | [#8](./API_DESIGN_DECISIONS.md#8-settings-namespaced-configuration) |
| Router | [§ Router Service](./API_SPECIFICATION.md#router-service) | [§ Router](./API_QUICK_REFERENCE.md#router-service) | [#9](./API_DESIGN_DECISIONS.md#9-router-deep-links--state-sharing) |
| Shortcuts | [§ Shortcuts Service](./API_SPECIFICATION.md#shortcuts-service) | [§ Shortcuts](./API_QUICK_REFERENCE.md#shortcuts-service) | [#10](./API_DESIGN_DECISIONS.md#10-shortcuts-conflict-resolution) |
| IPC | [§ IPC Service](./API_SPECIFICATION.md#ipc-service) | [§ IPC](./API_QUICK_REFERENCE.md#ipc-service) | [#11](./API_DESIGN_DECISIONS.md#11-ipc-channel-based-messaging) |
| Workers | [§ Workers Service](./API_SPECIFICATION.md#workers-service) | [§ Workers](./API_QUICK_REFERENCE.md#workers-service) | [#12](./API_DESIGN_DECISIONS.md#12-workers-transparent-cpu-offloading) |
| Shell | [§ Shell Service](./API_SPECIFICATION.md#shell-service) | [§ Shell](./API_QUICK_REFERENCE.md#shell-service) | [#13](./API_DESIGN_DECISIONS.md#13-shell-command-palette-as-first-class) |

### Implementation

| Topic | Document | Section |
|-------|----------|---------|
| Phase 1: Foundation | [Roadmap](./IMPLEMENTATION_ROADMAP.md#phase-1-foundation-week-1-2) | Phase 1 |
| Phase 2: Storage | [Roadmap](./IMPLEMENTATION_ROADMAP.md#phase-2-apps--storage-week-3-4) | Phase 2 |
| Phase 3: Execution | [Roadmap](./IMPLEMENTATION_ROADMAP.md#phase-3-background-execution-week-5-6) | Phase 3 |
| Phase 4: UX | [Roadmap](./IMPLEMENTATION_ROADMAP.md#phase-4-user-experience-week-7-8) | Phase 4 |
| Phase 5: Integration | [Roadmap](./IMPLEMENTATION_ROADMAP.md#phase-5-integration--polish-week-9-10) | Phase 5 |
| Dependencies | [Roadmap](./IMPLEMENTATION_ROADMAP.md#dependencies-summary) | Dependencies |
| Risk Mitigation | [Roadmap](./IMPLEMENTATION_ROADMAP.md#risk-mitigation) | Risks |

### App Development

| Topic | Document | Section |
|-------|----------|---------|
| App Manifest | [API Spec](./API_SPECIFICATION.md#app-manifest-structure) | App Development |
| App Component | [API Spec](./API_SPECIFICATION.md#app-component-structure) | App Development |
| Window Context | [API Spec](./API_SPECIFICATION.md#window-context) | App Development |
| Common Patterns | [Quick Ref](./API_QUICK_REFERENCE.md#common-patterns) | Common Patterns |

### Patterns & Best Practices

| Topic | Document | Section |
|-------|----------|---------|
| Svelte 5 Runes | [Design Decisions](./API_DESIGN_DECISIONS.md#16-svelte-5-runes-integration) | #16 |
| State Management | [Design Decisions](./API_DESIGN_DECISIONS.md#5-window-state-management) | #5 |
| Error Handling | [Design Decisions](./API_DESIGN_DECISIONS.md#17-error-handling-strategy) | #17 |
| Async vs Sync | [Design Decisions](./API_DESIGN_DECISIONS.md#18-async-vs-sync-apis) | #18 |
| Subscriptions | [Design Decisions](./API_DESIGN_DECISIONS.md#19-subscription-pattern) | #19 |
| Testing | [Design Decisions](./API_DESIGN_DECISIONS.md#20-testing-strategy) | #20 |

---

## 🔍 Find by Use Case

### "I want to..."

#### ...create a new window
- [Windows Service → open()](./API_SPECIFICATION.md#windows-service)
- [Quick Ref → Windows](./API_QUICK_REFERENCE.md#windows-service)

#### ...launch an app
- [Apps Service → launch()](./API_SPECIFICATION.md#apps-service)
- [Quick Ref → Apps](./API_QUICK_REFERENCE.md#apps-service)

#### ...read/write files
- [Files Service](./API_SPECIFICATION.md#files-service)
- [Quick Ref → Files](./API_QUICK_REFERENCE.md#files-service)

#### ...run a background task
- [Tasks Service → create()](./API_SPECIFICATION.md#tasks-service)
- [Quick Ref → Tasks](./API_QUICK_REFERENCE.md#tasks-service)

#### ...show a notification
- [Notifications Service → toast()](./API_SPECIFICATION.md#notifications-service)
- [Quick Ref → Notifications](./API_QUICK_REFERENCE.md#notifications-service)

#### ...store settings
- [Settings Service](./API_SPECIFICATION.md#settings-service)
- [Quick Ref → Settings](./API_QUICK_REFERENCE.md#settings-service)

#### ...handle keyboard shortcuts
- [Shortcuts Service](./API_SPECIFICATION.md#shortcuts-service)
- [Quick Ref → Shortcuts](./API_QUICK_REFERENCE.md#shortcuts-service)

#### ...communicate between apps
- [IPC Service](./API_SPECIFICATION.md#ipc-service)
- [Quick Ref → IPC](./API_QUICK_REFERENCE.md#ipc-service)

#### ...offload CPU-intensive work
- [Workers Service](./API_SPECIFICATION.md#workers-service)
- [Quick Ref → Workers](./API_QUICK_REFERENCE.md#workers-service)

#### ...add command palette commands
- [Shell Service](./API_SPECIFICATION.md#shell-service)
- [Quick Ref → Shell](./API_QUICK_REFERENCE.md#shell-service)

#### ...create deep links
- [Router Service](./API_SPECIFICATION.md#router-service)
- [Quick Ref → Router](./API_QUICK_REFERENCE.md#router-service)

---

## 📝 Code Examples

### Service Usage Example

```typescript
import { kernel } from '@/core/kernel';

// Get service
const windows = kernel.service<WindowsService>('windows');

// Use service
const windowId = windows.open({
  appId: 'text-editor',
  props: { file: '/documents/readme.txt' }
});
```

**Full examples in:**
- [API Specification → Examples](./API_SPECIFICATION.md#examples)
- [Quick Reference → Common Patterns](./API_QUICK_REFERENCE.md#common-patterns)

### App Component Example

```svelte
<script lang="ts">
  import { kernel } from '@/core/kernel';
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  let props: Props = $props();
  const window = useWindow();
  const files = kernel.service<FilesService>('files');
  
  let content = $state('');
  
  async function save() {
    await files.write(props.file, content);
  }
</script>
```

**Full examples in:**
- [API Specification → App Component Structure](./API_SPECIFICATION.md#app-component-structure)
- [Quick Reference → App Component](./API_QUICK_REFERENCE.md#app-component-structure)

---

## 🛠️ Implementation Checklist

Use this checklist to track implementation progress:

### Foundation (Week 1-2)
- [ ] Kernel service registry
- [ ] Capability system
- [ ] Type definitions
- [ ] Windows service migration
- [ ] Window context

**Detailed tasks:** [Roadmap → Phase 1](./IMPLEMENTATION_ROADMAP.md#phase-1-foundation-week-1-2)

### Storage (Week 3-4)
- [ ] Apps service
- [ ] Files service (OPFS)
- [ ] Settings service

**Detailed tasks:** [Roadmap → Phase 2](./IMPLEMENTATION_ROADMAP.md#phase-2-apps--storage-week-3-4)

### Execution (Week 5-6)
- [ ] Tasks service
- [ ] Workers service

**Detailed tasks:** [Roadmap → Phase 3](./IMPLEMENTATION_ROADMAP.md#phase-3-background-execution-week-5-6)

### User Experience (Week 7-8)
- [ ] Notifications service
- [ ] Shell service & command palette
- [ ] Router service
- [ ] Shortcuts service
- [ ] IPC service

**Detailed tasks:** [Roadmap → Phase 4](./IMPLEMENTATION_ROADMAP.md#phase-4-user-experience-week-7-8)

### Integration (Week 9-10)
- [ ] Bootstrap system
- [ ] Example apps
- [ ] System apps
- [ ] Documentation
- [ ] Testing

**Detailed tasks:** [Roadmap → Phase 5](./IMPLEMENTATION_ROADMAP.md#phase-5-integration--polish-week-9-10)

---

## 📦 Dependencies

### Required Packages

```bash
npm install @lilbunnyrabbit/task-manager cmdk
```

### Optional Packages

```bash
npm install tinykeys comlink regexparam lz-string
```

**Full details:** [Roadmap → Dependencies](./IMPLEMENTATION_ROADMAP.md#dependencies-summary)

---

## 🎓 Learning Path

### For New Developers

1. **Day 1:** Read [Quick Reference](./API_QUICK_REFERENCE.md)
2. **Day 2-3:** Skim [API Specification](./API_SPECIFICATION.md)
3. **Week 1:** Build a simple app using the API
4. **Week 2:** Read [Design Decisions](./API_DESIGN_DECISIONS.md) for deeper understanding

### For Implementers

1. **Week 0:** Read all documentation
2. **Week 1:** Review [Roadmap](./IMPLEMENTATION_ROADMAP.md) and plan
3. **Week 1-2:** Implement Phase 1 (Foundation)
4. **Week 3-4:** Implement Phase 2 (Storage)
5. **Week 5-6:** Implement Phase 3 (Execution)
6. **Week 7-8:** Implement Phase 4 (UX)
7. **Week 9-10:** Implement Phase 5 (Integration)

---

## 🔗 External Resources

### Svelte 5
- [Svelte 5 Runes Documentation](https://svelte-5-preview.vercel.app/)
- [Svelte 5 Migration Guide](https://svelte-5-preview.vercel.app/docs/migration-guide)

### Browser APIs
- [Origin Private File System (OPFS)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)

### Libraries
- [@lilbunnyrabbit/task-manager](https://github.com/lilbunnyrabbit/task-manager)
- [cmdk (Command Palette)](https://cmdk.paco.me/)
- [Comlink (Worker Communication)](https://github.com/GoogleChromeLabs/comlink)

---

## 🤝 Contributing

When contributing to the API:

1. **Read** [Design Decisions](./API_DESIGN_DECISIONS.md) to understand principles
2. **Check** [API Specification](./API_SPECIFICATION.md) for existing patterns
3. **Propose** changes with clear rationale
4. **Update** documentation when adding features

---

## 📄 Document Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| API Specification | ✅ Complete | Oct 27, 2025 |
| Quick Reference | ✅ Complete | Oct 27, 2025 |
| Design Decisions | ✅ Complete | Oct 27, 2025 |
| Implementation Roadmap | ✅ Complete | Oct 27, 2025 |

---

## 💡 Tips

### Quick Lookups

**"What methods does X service have?"**  
→ [Quick Reference → X Service](./API_QUICK_REFERENCE.md)

**"What does X method return?"**  
→ [API Spec → X Service](./API_SPECIFICATION.md)

**"Why was X designed this way?"**  
→ [Design Decisions → #X](./API_DESIGN_DECISIONS.md)

**"What do I implement next?"**  
→ [Roadmap → Current Phase](./IMPLEMENTATION_ROADMAP.md)

### VS Code Snippets

Add these to `.vscode/webos.code-snippets` for faster coding:

```json
{
  "Get Service": {
    "prefix": "svc",
    "body": "const ${1:service} = kernel.service<${2:Service}>('${1}');"
  },
  "App Manifest": {
    "prefix": "manifest",
    "body": "export const manifest: AppManifest = {\n  id: '${1:app-id}',\n  name: '${2:App Name}',\n  icon: '${3:icon}',\n  version: '1.0.0',\n  component: ${4:Component},\n  capabilities: [\n    $0\n  ]\n};"
  }
}
```

---

_For questions or suggestions, please open an issue or pull request._

---

**Navigation:**  
[📖 API Specification](./API_SPECIFICATION.md) | [⚡ Quick Reference](./API_QUICK_REFERENCE.md) | [🎯 Design Decisions](./API_DESIGN_DECISIONS.md) | [🗺️ Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md)


