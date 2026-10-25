import { LinkKind, Publication, type Engagement, type Job } from "./types";

const { OK } = Publication;

export const JOBS: Job[] = [
  {
    id: "astra",
    company: "Astra AI",
    url: "https://astra-ai.co/",
    title: "Lead Frontend Developer",
    period: "Jan 2025 – Oct 2026",
    place: "Ljubljana, Slovenia",
    about: { status: OK, text: "Astra AI builds AI tutoring and exam preparation software for students." },
    summary: {
      status: OK,
      paragraphs: [
        "At Astra AI, I led frontend engineering while remaining hands-on in product development and architecture. My focus was building reliable learning experiences and establishing engineering practices that helped the team work consistently as the product evolved.",
      ],
    },
    highlights: {
      status: OK,
      items: [
        "Co-developed the flagship Exam Prep product through four major iterations, delivering features across frontend and backend and leading its migration to a study-path-centered architecture.",
        "Improved AI tutor chat reliability, including streaming recovery, long-conversation performance and Safari/iOS compatibility.",
        "Established shared frontend architecture and UI conventions, introduced an indexed knowledge base used by coding agents across the engineering team, and supported other engineers through code reviews.",
        "Collaborated directly with Vercel engineers and members of the Next.js core team on framework adoption, technical challenges and platform issues.",
        "Worked closely with product and design teams, built self-service tools for product and marketing, and introduced automated onboarding validation across 43 country configurations.",
      ],
    },
    links: [{ kind: LinkKind.SITE, url: "https://astra-ai.co/exam-prep/", label: "Exam Prep" }],
  },
  {
    id: "while-true",
    company: "While True",
    url: "https://www.whiletrue.com/",
    title: "Senior Software Developer",
    period: "Nov 2019 – Jan 2025",
    place: "Ljubljana, Slovenia",
    progression: ["Junior Developer", "Mid-level Developer", "Senior Software Developer"],
    summary: {
      status: OK,
      paragraphs: [
        "I joined While True as a Junior Developer and progressed to Senior Software Developer, moving from maintaining existing applications to independently engineering major frontend products for international clients.",
        "At Blurb, I co-developed Wall Art and later independently engineered the frontend for the core application rewrite and related tools, including PDF to Book, migrating existing Ember.js functionality.",
        "At RPI Print, I led frontend development of new React and TypeScript applications, including the self-service printing platform dashboard. I also worked on shared TypeScript packages, API design, GraphQL integration and backend troubleshooting.",
        "I also contributed to a project for Cosylab involving the European Space Agency.",
        "Alongside client work, I contributed to internal products including WT.dev, developed serverless Slack workflow automation and worked on additional development tools.",
      ],
    },
    engagements: [
      { client: "Blurb, Inc.", years: "2019–2024", url: "https://www.blurb.com/custom-wall-art", url_label: "Wall Art" },
      { client: "RPI Print, Inc.", years: "2020–2024", url: "https://www.rpiprint.com/products-services/print-apis/self-service/", url_label: "Self-service" },
      { client: "Cosylab", years: "2020" },
      { client: "WT.dev & internal", years: "" },
    ],
    links: [],
  },
];

/** An engagement's own sentence, taken from the job summary rather than copied, so each claim is written once. */
export function engagement_line(job: Job, engagement: Engagement): string | null {
  const name = engagement.client.split(/[,&]/)[0].trim();
  return job.summary.paragraphs.find((paragraph) => paragraph.includes(name)) ?? null;
}
