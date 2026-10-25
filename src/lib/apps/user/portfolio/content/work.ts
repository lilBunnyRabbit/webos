import { LinkKind, Publication, type CaseStudy } from "./types";

const { OK } = Publication;

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: "exam-prep",
    title: "Exam Prep",
    org: "Astra AI",
    blocks: [
      {
        heading: "Context",
        status: OK,
        paragraphs: [
          "Exam Prep turns a student's study materials into an AI-generated study plan with interactive lessons and assessments. It became Astra's core product.",
        ],
      },
      {
        heading: "My role",
        status: OK,
        paragraphs: [
          "Co-developed it through four major iterations with a small team, delivering features across frontend and backend, and led the migration to a study-path-centred architecture, where each preparation is one learning path instead of separate topic sections.",
        ],
      },
      {
        heading: "What I worked on",
        status: OK,
        items: [
          "Creating a study plan from uploaded materials.",
          "The study path and its lesson screens.",
          "New lesson types, each built end to end, and mock exams.",
          "Discovery and sharing.",
        ],
      },
    ],
    links: [{ kind: LinkKind.SITE, url: "https://astra-ai.co/exam-prep/", label: "Exam Prep" }],
  },
  {
    id: "astra-engineering",
    title: "Engineering practices",
    org: "Astra AI",
    blocks: [
      {
        heading: "Engineering knowledge for agents",
        status: OK,
        paragraphs: [
          "I set up an indexed frontend knowledge base covering architecture, shared component patterns and lessons from production issues, including iOS-specific pitfalls, and defined the process for keeping it current. Coding agents across the team use it to follow frontend practices, so backend developers can make consistent frontend changes.",
        ],
      },
      {
        heading: "AI tutor chat",
        status: OK,
        paragraphs: [
          "Reworked the shared streaming chat client to recover from network interruptions and navigation, virtualized long conversations, and fixed cross-browser reliability and rendering issues.",
        ],
      },
      {
        heading: "Production build",
        status: OK,
        paragraphs: ["Reduced the production server build size by 20% (330 → 264 MiB)."],
      },
    ],
    links: [],
  },
  {
    id: "blurb",
    title: "Wall Art and later Blurb work",
    org: "Blurb, a While True client",
    blocks: [
      {
        heading: "Context",
        status: OK,
        paragraphs: [
          "Blurb makes printed books and wall art. I worked on its products for five years through While True.",
        ],
      },
      {
        heading: "Wall Art (2020)",
        status: OK,
        paragraphs: [
          "My first frontend built from scratch, co-developed with another engineer. The interesting part was a canvas preview that places the artwork in a room and shows the print bleed.",
        ],
      },
      {
        heading: "Later work",
        status: OK,
        paragraphs: [
          "Later I independently built the frontend for a rewrite of the core application and related tools, migrating existing Ember.js functionality. The rewrite was built but not released.",
        ],
      },
    ],
    links: [{ kind: LinkKind.SITE, url: "https://www.blurb.com/custom-wall-art", label: "Wall Art" }],
  },
  {
    id: "rpi",
    title: "Self-service dashboard",
    org: "RPI Print, a While True client",
    blocks: [
      {
        heading: "Context",
        status: OK,
        paragraphs: [
          "RPI Print's self-service API lets companies add printing to their own products. The dashboard is where they track orders and users.",
        ],
      },
      {
        heading: "My role",
        status: OK,
        paragraphs: [
          "Independently built the dashboard frontend in React and TypeScript, working with a designer who was rebranding RPI at the same time, and with the backend engineer on the API.",
        ],
      },
    ],
    links: [
      { kind: LinkKind.SITE, url: "https://www.rpiprint.com/products-services/print-apis/self-service/", label: "Self-service API" },
    ],
  },
];
