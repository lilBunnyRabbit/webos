import { LinkKind, Publication, type Principle, type Text } from "./types";

const { OK } = Publication;

export const PRINCIPLES_INTRO: Text = {
  status: OK,
  text: "The engineering choices I keep coming back to, each with the job or project where it shows.",
};

export const PRINCIPLES: Principle[] = [
  {
    id: "decisions",
    status: OK,
    title: "Decisions get written down",
    line: "I compare the options, pick one, and write down why, so the next person doesn't have to guess. A trick that works but feels like a hack gets called out, not hidden.",
    proof: "WebOS records every architecture choice in the repo, with the options it passed over and the reasons.",
    adrs: [],
    links: [{ kind: LinkKind.DOCS, url: "https://github.com/lilBunnyRabbit/webos/tree/master/docs/adrs", label: "The decision records" }],
  },
  {
    id: "team",
    status: OK,
    title: "Make the next change easy",
    line: "Good frontend architecture is one that a teammate, or their coding agent, can change without asking me.",
    proof: "At Astra AI I set up shared frontend conventions and an indexed knowledge base, so backend developers and their coding agents make consistent frontend changes.",
    adrs: [],
    links: [],
  },
  {
    id: "lightest",
    status: OK,
    title: "The lightest thing that fits",
    line: "I reach for the platform before a library. Before adding a layer, I ask what breaks today without it.",
    proof: "WebOS spots new releases by polling one small JSON file instead of a push channel. Its kernel stayed only once it had a concrete job: swapping desktop and mobile implementations of the same services.",
    adrs: ["004-version-update-system", "002-service-lifecycle", "016-mobile-support"],
    links: [],
  },
  {
    id: "performance",
    status: OK,
    title: "Performance by design",
    line: "Speed comes from the structure, not from tuning at the end.",
    proof: "At Astra AI I virtualized long tutor conversations. WebOS loads each app only when it opens, and CI fails any change that pushes boot past its size budget.",
    adrs: ["036-boot-loading-screen", "049-lazy-app-metadata"],
    links: [],
  },
  {
    id: "tested",
    status: OK,
    title: "Test it where it runs",
    line: "A change is done when I've seen it work where people use it: the real browser and the real phone, not a mock of either.",
    proof: "At Astra AI I checked changes inside the real iOS and Android apps on simulators, with tools I built to drive them. WebOS's tests run in real Chromium against the real file system, with no fakes.",
    adrs: ["027-testing"],
    links: [],
  },
  {
    id: "feel",
    status: OK,
    title: "How it feels counts",
    line: "Working isn't the finish line. An interface that is slow to answer, drops your input or fights your fingers isn't done.",
    proof: "At Astra AI that meant chat that recovers when the connection drops, including on Safari and iOS.",
    adrs: [],
    links: [],
  },
];
