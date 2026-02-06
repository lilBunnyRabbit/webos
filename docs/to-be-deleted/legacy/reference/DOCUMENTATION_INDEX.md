# Documentation Index

> **Navigation Guide:** Find the right documentation for your needs

---

## 📚 Complete Documentation Catalog

This project has **layered documentation** designed for different audiences and use cases. Use this index to find exactly what you need.

---

## 🎯 I Want To...

### Understand What This Project Is
**Read:** [README.md](../../README.md) (5 min) → [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) (10 min)

### Get Started Developing
**Read:** [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) → [DOCUMENTATION.md](../DOCUMENTATION.md) "Development Patterns" section

### Add a New Feature
**Read:** [DOCUMENTATION.md](../DOCUMENTATION.md) "How to Add New Features" → Check similar apps in `src/apps/`

### Understand the Architecture
**Read:** [DOCUMENTATION.md](../DOCUMENTATION.md) "Technical Architecture" section

### Work with the File System
**Read:** [src/core/api/README.md](../../src/core/api/README.md) → [src/core/api/HOOKS.md](../../src/core/api/HOOKS.md)

### See the Roadmap
**Read:** [ROADMAP.md](../planning/ROADMAP.md) (visual) → [PLAN.md](../planning/PLAN.md) (detailed)

### Fix a Bug
**Read:** [DOCUMENTATION.md](../DOCUMENTATION.md) relevant system section → Check [TODO.md](../planning/TODO.md)

### Use This with an LLM/AI
**Read:** [AI_ASSISTANT_GUIDE.md](../guides/AI_ASSISTANT_GUIDE.md)

---

## 📖 Documentation Files by Category

### General Documentation

#### [README.md](../../README.md)
- **Purpose:** Project overview and quick start
- **Audience:** Everyone - first-time visitors, potential contributors
- **Length:** ~10 min read
- **Contents:**
  - What is WebOS
  - Feature highlights
  - Quick start guide
  - Tech stack overview
  - Links to detailed docs

#### [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) ⭐ START HERE
- **Purpose:** Quick context for understanding the project
- **Audience:** Developers, AI assistants needing fast onboarding
- **Length:** ~10 min read
- **Contents:**
  - TL;DR project summary
  - Current status (what's done/in-progress)
  - Architecture overview
  - Tech stack
  - Common patterns
  - Quick reference

#### [DOCUMENTATION.md](../DOCUMENTATION.md) ⭐ COMPREHENSIVE
- **Purpose:** Complete project documentation
- **Audience:** Developers implementing features, understanding systems
- **Length:** ~60 min full read, can be used as reference
- **Contents:**
  - Vision and goals
  - Complete feature list
  - Detailed architecture
  - Core systems deep dive
  - Development patterns
  - How to add features
  - Technology stack details
  - Project structure
  - Roadmap summary

### Planning & Roadmap

#### [PLAN.md](../planning/PLAN.md)
- **Purpose:** Master development plan
- **Audience:** Project managers, developers planning work
- **Length:** 1600+ lines, reference document
- **Contents:**
  - 9 phases of development (detailed)
  - Feature specifications
  - Priority matrix
  - Timeline estimates
  - Technology recommendations
  - Keyboard shortcuts reference
  - Success metrics

#### [ROADMAP.md](../planning/ROADMAP.md)
- **Purpose:** Visual project timeline
- **Audience:** Anyone wanting big picture view
- **Length:** Quick skim
- **Contents:**
  - Gantt charts (Mermaid)
  - Flow diagrams
  - Technology mindmaps
  - Priority matrices
  - Timeline milestones

#### [TODO.md](../planning/TODO.md)
- **Purpose:** Current task checklist
- **Audience:** Active developers
- **Length:** Quick scan
- **Contents:**
  - Completed tasks ✅
  - In-progress items 🔄
  - Planned improvements
  - Known issues

### Technical Documentation

#### [src/core/api/README.md](./src/core/api/README.md)
- **Purpose:** File System API reference
- **Audience:** Developers working with files
- **Length:** 650+ lines, comprehensive reference
- **Contents:**
  - Complete API documentation
  - 25+ function references
  - Type definitions
  - Usage examples
  - Best practices
  - Browser compatibility

#### [src/core/api/HOOKS.md](./src/core/api/HOOKS.md)
- **Purpose:** TanStack Query hooks documentation
- **Audience:** Developers using file system hooks
- **Length:** 800+ lines, comprehensive reference
- **Contents:**
  - 18+ hook references
  - Query hooks (data fetching)
  - Mutation hooks (data modification)
  - Cache invalidation patterns
  - Working examples
  - Multi-window sync explanation

#### [src/core/api/MIGRATION.md](./src/core/api/MIGRATION.md)
- **Purpose:** Migration guide from legacy code
- **Audience:** Developers updating old code
- **Length:** 500+ lines
- **Contents:**
  - Before/after examples
  - Migration strategies
  - Breaking changes
  - Upgrade path

#### [src/apps/file-explorer/README.md](./src/apps/file-explorer/README.md)
- **Purpose:** File Explorer app documentation
- **Audience:** Users of the app, developers extending it
- **Length:** ~10 min read
- **Contents:**
  - Feature overview
  - Usage guide
  - Technical implementation
  - OPFS benefits
  - Future enhancements

### Development Guides

#### [AI_ASSISTANT_GUIDE.md](../guides/AI_ASSISTANT_GUIDE.md) ⭐ FOR AI/LLMs
- **Purpose:** Guide for AI assistants/LLMs working on this project
- **Audience:** AI/LLM tools, Claude, ChatGPT, Copilot, etc.
- **Length:** ~30 min read, reference guide
- **Contents:**
  - How to use documentation effectively
  - Typical workflows
  - Quick reference by task
  - Important rules and best practices
  - Checklists
  - Troubleshooting
  - Prompt templates

#### [REFACTOR.md](../guides/REFACTOR.md)
- **Purpose:** Core/Apps architecture refactor guide
- **Audience:** Developers doing structural changes
- **Length:** ~15 min read
- **Contents:**
  - Refactor goals
  - Migration steps
  - File moves
  - Import updates
  - Testing checklist

### Session Notes & Summaries

#### [docs/SESSION_SUMMARY_FILE_EXPLORER.md](./docs/SESSION_SUMMARY_FILE_EXPLORER.md)
- **Purpose:** Development session notes for File Explorer
- **Audience:** Historical context, learning resource
- **Length:** Session-specific
- **Contents:**
  - Implementation decisions
  - Challenges encountered
  - Solutions applied
  - Lessons learned

#### [docs/GITHUB_BUILD_STATUS.md](./docs/GITHUB_BUILD_STATUS.md)
- **Purpose:** GitHub Actions integration notes
- **Audience:** DevOps, CI/CD setup
- **Length:** Quick reference
- **Contents:**
  - Build status monitoring
  - GitHub Actions setup
  - Deployment notes

---

## 🗺️ Documentation by Audience

### First-Time Visitors
1. [README.md](./README.md) - Get overview
2. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - Understand project
3. Try the app locally

### New Developers
1. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - Quick context
2. [DOCUMENTATION.md](./DOCUMENTATION.md) - Architecture & patterns
3. [src/core/api/README.md](./src/core/api/README.md) - File API
4. Explore `src/apps/` - Real examples

### Experienced Contributors
1. [TODO.md](./TODO.md) - Current priorities
2. [DOCUMENTATION.md](./DOCUMENTATION.md) - Reference as needed
3. Relevant specialized docs

### Project Managers / Planning
1. [ROADMAP.md](./ROADMAP.md) - Visual timeline
2. [PLAN.md](./PLAN.md) - Detailed specifications
3. [TODO.md](./TODO.md) - Current status

### AI Assistants / LLMs
1. [AI_ASSISTANT_GUIDE.md](./AI_ASSISTANT_GUIDE.md) - How to work with docs
2. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - Quick context
3. [DOCUMENTATION.md](./DOCUMENTATION.md) - Deep reference
4. Specialized docs as needed

### End Users
1. [README.md](./README.md) - What is this?
2. [src/apps/*/README.md] - App-specific guides
3. In-app help (future)

---

## 📊 Documentation by Size

### Quick Reads (<15 min)
- [README.md](../../README.md) - 5-10 min
- [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) - 10 min
- [ROADMAP.md](../planning/ROADMAP.md) - 5 min (visual)
- [TODO.md](../planning/TODO.md) - 2 min
- [src/apps/file-explorer/README.md](./src/apps/file-explorer/README.md) - 10 min

### Medium Reads (15-60 min)
- [AI_ASSISTANT_GUIDE.md](../guides/AI_ASSISTANT_GUIDE.md) - 30 min
- [DOCUMENTATION.md](../DOCUMENTATION.md) - 60 min (can skim sections)

### Reference Documents (Use as needed)
- [PLAN.md](../planning/PLAN.md) - 1600+ lines
- [src/core/api/README.md](./src/core/api/README.md) - 650+ lines
- [src/core/api/HOOKS.md](./src/core/api/HOOKS.md) - 800+ lines
- [src/core/api/MIGRATION.md](./src/core/api/MIGRATION.md) - 500+ lines

---

## 🔍 Finding Information

### By Topic

#### Architecture & Design
- [DOCUMENTATION.md](../DOCUMENTATION.md) → "Technical Architecture"
- [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) → "Architecture" section

#### Window Management
- [DOCUMENTATION.md](../DOCUMENTATION.md) → "Window Management System"
- [src/core/contexts/window-manager/](./src/core/contexts/window-manager/)

#### File System
- [src/core/api/README.md](./src/core/api/README.md) → Complete API
- [src/core/api/HOOKS.md](./src/core/api/HOOKS.md) → React hooks
- [DOCUMENTATION.md](../DOCUMENTATION.md) → "File System API"

#### App Development
- [DOCUMENTATION.md](../DOCUMENTATION.md) → "Adding a New App"
- [src/apps/file-explorer/](./src/apps/file-explorer/) → Example app

#### Code Patterns
- [DOCUMENTATION.md](../DOCUMENTATION.md) → "Development Patterns"
- [AI_ASSISTANT_GUIDE.md](../guides/AI_ASSISTANT_GUIDE.md) → "Code Quality Standards"

#### Roadmap & Planning
- [ROADMAP.md](../planning/ROADMAP.md) → Visual timeline
- [PLAN.md](../planning/PLAN.md) → Detailed phases
- [TODO.md](../planning/TODO.md) → Current work

#### Tech Stack
- [DOCUMENTATION.md](../DOCUMENTATION.md) → "Technology Stack"
- [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) → "Tech Stack"
- [package.json](./package.json) → Exact versions

---

## ✅ Documentation Checklist

When working on the project, consult:

### Before Starting Work
- [ ] Read [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) (if first time)
- [ ] Check [TODO.md](./TODO.md) for priorities
- [ ] Review [PLAN.md](./PLAN.md) relevant section (if new feature)
- [ ] Read [DOCUMENTATION.md](./DOCUMENTATION.md) relevant patterns

### During Development
- [ ] Reference [DOCUMENTATION.md](./DOCUMENTATION.md) for patterns
- [ ] Check API docs if using file system
- [ ] Look at similar code in existing apps

### After Completing Work
- [ ] Update [DOCUMENTATION.md](./DOCUMENTATION.md) if significant feature
- [ ] Update [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) status
- [ ] Mark tasks in [TODO.md](./TODO.md)
- [ ] Update specialized docs if API changed

---

## 🔄 Keeping Documentation Current

### What to Update When

| Change Type | Documents to Update |
|------------|---------------------|
| New feature completed | DOCUMENTATION.md, PROJECT_CONTEXT.md, TODO.md |
| New app created | DOCUMENTATION.md, app README |
| API changed | API docs (README.md, HOOKS.md), MIGRATION.md |
| New pattern established | DOCUMENTATION.md "Development Patterns" |
| Task completed | TODO.md |
| Architecture change | DOCUMENTATION.md, PROJECT_CONTEXT.md |
| Roadmap change | PLAN.md, ROADMAP.md |

### Documentation Review Schedule
- **Weekly:** TODO.md (reflect current work)
- **After Major Features:** DOCUMENTATION.md, PROJECT_CONTEXT.md
- **Monthly:** PLAN.md, ROADMAP.md (adjust priorities)
- **On Release:** All docs (comprehensive review)

---

## 📝 Contributing to Documentation

### Documentation Standards
- **Clear and concise** - Avoid jargon where possible
- **Well-structured** - Use headings, lists, tables
- **Examples included** - Code samples help understanding
- **Up-to-date** - Keep in sync with codebase
- **Cross-referenced** - Link to related docs

### How to Improve Docs
1. Found something unclear? → Open an issue
2. See a mistake? → Submit a PR
3. Want to add examples? → Contribute to relevant doc
4. Missing information? → Add to appropriate file

---

## 🎓 Recommended Reading Paths

### Path 1: Quick Start (30 min)
1. [README.md](./README.md) - Overview
2. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - Context
3. Try the app
4. Explore one app's code

### Path 2: Deep Understanding (2-3 hours)
1. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - Context
2. [DOCUMENTATION.md](./DOCUMENTATION.md) - Full read
3. [src/core/api/README.md](./src/core/api/README.md) - File API
4. [PLAN.md](./PLAN.md) - Relevant phases
5. Explore codebase

### Path 3: Contributing (1 hour)
1. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - Context
2. [DOCUMENTATION.md](./DOCUMENTATION.md) - Patterns section
3. [TODO.md](./TODO.md) - Current tasks
4. Relevant specialized docs
5. Similar existing code

### Path 4: AI Assistant Setup (30 min)
1. [AI_ASSISTANT_GUIDE.md](./AI_ASSISTANT_GUIDE.md) - Full guide
2. [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) - Context
3. [DOCUMENTATION.md](./DOCUMENTATION.md) - Reference
4. Start working with prompts from guide

---

## 🆘 Common Documentation Questions

### "Where do I start?"
→ [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)

### "How do I add a new feature?"
→ [DOCUMENTATION.md](./DOCUMENTATION.md) "How to Add New Features"

### "What's the file system API?"
→ [src/core/api/README.md](./src/core/api/README.md)

### "What's planned for the future?"
→ [ROADMAP.md](./ROADMAP.md) + [PLAN.md](./PLAN.md)

### "How do I work with windows?"
→ [DOCUMENTATION.md](./DOCUMENTATION.md) "Window Management System"

### "What tasks are current priorities?"
→ [TODO.md](./TODO.md)

### "How should AI assistants use these docs?"
→ [AI_ASSISTANT_GUIDE.md](./AI_ASSISTANT_GUIDE.md)

### "I want the complete picture"
→ Read in order: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) → [DOCUMENTATION.md](./DOCUMENTATION.md) → [PLAN.md](./PLAN.md)

---

## 📞 Documentation Feedback

Found an issue with documentation?
- **Unclear explanation?** → Open an issue
- **Missing information?** → Open an issue or PR
- **Outdated content?** → Open a PR with updates
- **Broken links?** → Open a PR to fix

All feedback helps improve the project!

---

**Last Updated:** October 20, 2025  
**Total Documentation:** 15+ files, 10,000+ lines  
**Maintenance:** Active, updated with each major feature

---

**Quick Start:** New to the project? Start with [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)  
**AI Assistant?** Go to [AI_ASSISTANT_GUIDE.md](./AI_ASSISTANT_GUIDE.md)  
**Complete Guide:** See [DOCUMENTATION.md](./DOCUMENTATION.md)

