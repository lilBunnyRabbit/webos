import { Publication, SocialKind, type Profile } from "./types";

const { OK } = Publication;

export const PROFILE: Profile = {
  name: "Andraž Mesarič-Sirec",
  role: "Senior Software Engineer, Frontend & Full-Stack",
  location: "Ig, Slovenia",
  email: "amesaricsirec@gmail.com",
  linkedin: "https://www.linkedin.com/in/andraz-mesaric-sirec/",
  github: "https://github.com/lilBunnyRabbit",
  npm: "https://www.npmjs.com/~lilbunnyrabbit",
  positioning: {
    status: OK,
    text: "I build product features end to end, untangle browser edge cases, and design frontends a whole team can keep changing.",
  },
  availability: {
    status: OK,
    text: "Open to full-time senior frontend and frontend-focused full-stack roles from November 2026.",
  },
  about_short: {
    status: OK,
    text: "Frontend-focused senior software engineer with nearly seven years of experience building production applications. I led frontend engineering at Astra AI, co-developed its flagship Exam Prep product, and set up shared architecture and an indexed knowledge base that coding agents across the engineering team use.",
  },
  about_long: {
    status: OK,
    paragraphs: [
      "Junior to senior at While True on client products for Blurb and RPI Print, then lead frontend at Astra AI.",
      "Outside work I build TypeScript libraries, developer tools and small apps. Some of them run inside WebOS, the environment you're looking at.",
    ],
  },
  education: {
    status: OK,
    items: [
      { field: "Computer Science", school: "Faculty of Computer and Information Science, University of Ljubljana", years: "2018 – present" },
      { field: "Mathematics", school: "Faculty of Mathematics and Physics, University of Ljubljana", years: "2016 – 2017" },
    ],
  },
  socials: [
    { kind: SocialKind.LINKEDIN, status: OK, label: "LinkedIn", handle: "andraz-mesaric-sirec", url: "https://www.linkedin.com/in/andraz-mesaric-sirec/" },
    { kind: SocialKind.GITHUB, status: OK, label: "GitHub", handle: "lilBunnyRabbit", url: "https://github.com/lilBunnyRabbit" },
    { kind: SocialKind.STACK_OVERFLOW, status: OK, label: "Stack Overflow", handle: "lilBunnyRabbit", url: "https://stackoverflow.com/users/11786580" },
    { kind: SocialKind.TYPEHERO, status: OK, label: "TypeHero", handle: "lilBunnyRabbit", url: "https://typehero.dev/@lilBunnyRabbit" },
    { kind: SocialKind.NPM, status: OK, label: "npm", handle: "~lilbunnyrabbit", url: "https://www.npmjs.com/~lilbunnyrabbit" },
    { kind: SocialKind.BRAND, status: OK, label: "Brand", handle: "lilBunnyRabbit", url: "https://lilbunnyrabbit.github.io/brand/" },
  ],
};
