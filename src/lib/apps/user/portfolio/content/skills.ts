import { Publication, type SkillGroup } from "./types";

const { OK } = Publication;

export const SKILLS: SkillGroup[] = [
  {
    status: OK,
    title: "Frontend & Browser",
    items: ["TypeScript", "JavaScript", "React", "Next.js", "Svelte 5", "SvelteKit", "Tailwind CSS", "TanStack Query", "design systems", "PWAs", "cross-browser and WebKit debugging"],
  },
  {
    status: OK,
    title: "Backend & Systems",
    items: ["Node.js", "Bun", "PostgreSQL", "Drizzle ORM", "tRPC", "Zod", "Effect", "GraphQL", "Stripe", "Supabase", "AWS Lambda", "DynamoDB", "Java Spring Boot"],
  },
  {
    status: OK,
    title: "Engineering & Quality",
    items: ["Vercel", "Turborepo", "Vite", "GitHub Actions", "Docker", "Playwright", "Vitest", "Testcontainers", "CI/CD", "Sentry", "PostHog", "npm package publishing"],
  },
  {
    status: OK,
    title: "AI Applications & Automation",
    items: ["Vercel AI SDK", "Claude Code", "OpenAI Codex", "Cursor", "agent skills", "subagents", "autonomous code maintenance", "automated device QA"],
  },
  {
    status: OK,
    title: "From my own projects",
    items: ["Go", "OPFS", "service workers", "Web Locks", "CodeMirror 6", "OKLCH colour science", "WCAG and APCA contrast"],
  },
];
