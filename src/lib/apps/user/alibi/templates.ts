export interface Value {
  sheet: string;
  card: string;
}

export interface Beat {
  id: string;
  // Must stay true whatever the value is: the player sees it before asking.
  claim: string;
  sheet: string;
  /** Distinct values, or `"people"`: someone from the case's cast. */
  values: readonly Value[] | "people";
  card: { title: string; text: string };
}

export interface Herring {
  title: string;
  text: string;
}

export interface Template {
  id: string;
  title: string;
  brief: string;
  role: string;
  jobs: readonly string[];
  slots: Record<string, readonly string[]>;
  beats: readonly Beat[];
  herrings: readonly Herring[];
}

const same = (...values: string[]): Value[] => values.map((value) => ({ sheet: value, card: value }));

export const NAMES = [
  "Ada",
  "Bram",
  "Cleo",
  "Dev",
  "Edith",
  "Felix",
  "Greta",
  "Hugo",
  "Iris",
  "Jonas",
  "Kit",
  "Lena",
  "Milo",
  "Nora",
  "Otto",
  "Pia",
  "Quinn",
  "Rosa",
  "Sami",
  "Tess",
] as const;

export const TEMPLATES: readonly Template[] = [
  {
    id: "brooch",
    title: "The missing brooch",
    brief: "A silver brooch vanished from its glass case at the {venue} opening night, some time between 9 and 10 pm.",
    role: "{job} who came to the {venue} opening as a guest",
    jobs: ["a graphic designer", "a bookshop owner", "a music teacher", "a nurse", "a carpenter"],
    slots: { venue: ["Hartley Gallery", "Quayside Gallery", "Linden Gallery"] },
    beats: [
      {
        id: "travel",
        claim: "I got there and back on my own.",
        sheet: "You travelled to the opening and home again by {v}.",
        values: [
          { sheet: "bus", card: "Transit card tapped twice that evening, on routes 4 and 12." },
          { sheet: "bike", card: "Bike share: two rides, both docked outside the gallery." },
          { sheet: "taxi", card: "Ride app: two trips, to the gallery and away from it." },
        ],
        card: { title: "Travel record", text: "{v}" },
      },
      {
        id: "arrive",
        claim: "I got to the opening well before the speeches.",
        sheet: "You arrived at the opening at {v}.",
        values: same("7:15 pm", "7:45 pm", "8:15 pm"),
        card: { title: "Guest list", text: "{suspect} checked in at the door at {v}." },
      },
      {
        id: "drink",
        claim: "I had one drink at the bar.",
        sheet: "At the bar you had one glass of {v}.",
        values: same("red wine", "white wine", "sparkling water", "elderflower cordial"),
        card: { title: "Bar tab", text: "One glass of {v}, paid by card." },
      },
      {
        id: "talk",
        claim: "I spent most of the night chatting with a friend.",
        sheet: "You spent most of the evening talking with your friend {v}.",
        values: "people",
        card: { title: "Witness", text: "{v} says they spent most of the evening talking with {suspect}." },
      },
      {
        id: "call",
        claim: "I stepped outside once to take a phone call.",
        sheet: "Around 9:20 pm you stepped outside to take a call from {v}.",
        values: [
          { sheet: "your sister", card: "Sister" },
          { sheet: "your landlord", card: "Landlord" },
          { sheet: "your boss", card: "Boss" },
          { sheet: "your neighbour", card: "Neighbour" },
        ],
        card: { title: "Phone record", text: "Incoming call around 9:20 pm from the contact \"{v}\", 6 minutes." },
      },
      {
        id: "leave",
        claim: "I left once the party wound down.",
        sheet: "You collected your coat and left at {v}.",
        values: same("10:15 pm", "10:45 pm", "11:30 pm"),
        card: { title: "Cloakroom", text: "Ticket 41, {suspect}'s coat, handed back at {v}." },
      },
      {
        id: "food",
        claim: "On the way home I stopped for something to eat.",
        sheet: "On the way home you bought food at {v}.",
        values: same("Night Owl Noodles", "the kebab place on Mill Street", "the all-night bakery", "a petrol station shop"),
        card: { title: "Card payment", text: "{suspect}'s card, late that night: {v}." },
      },
    ],
    herrings: [
      { title: "Weather report", text: "Light rain over the city from 9 pm." },
      { title: "Security note", text: "The brooch's case was found unlocked at 10:05 pm." },
      { title: "Staff rota", text: "Two guards on the door all night, one on the floor." },
    ],
  },
  {
    id: "till",
    title: "The empty till",
    brief: "The day's cash disappeared from the till at {venue} after closing on Saturday night.",
    role: "{job} who worked Saturday's evening shift at {venue}",
    jobs: ["a waiter", "a line cook", "a dishwasher", "a bartender"],
    slots: { venue: ["Rosa's Bistro", "The Copper Pot", "Bistro Marlo"] },
    beats: [
      {
        id: "start",
        claim: "I came in for my shift on time.",
        sheet: "Your shift started at {v}, and you were on time.",
        values: same("4 pm", "5 pm", "6 pm"),
        card: { title: "Staff rota", text: "{suspect}: Saturday evening shift from {v}." },
      },
      {
        id: "meal",
        claim: "I took my break out the back.",
        sheet: "On your break you had {v}.",
        values: [
          { sheet: "the staff curry", card: "the staff curry" },
          { sheet: "a cheese sandwich", card: "a cheese sandwich" },
          { sheet: "leftover risotto", card: "leftover risotto" },
          { sheet: "nothing but a coffee", card: "no meal taken" },
        ],
        card: { title: "Kitchen log", text: "Staff meal for {suspect}: {v}." },
      },
      {
        id: "music",
        claim: "We had music on while we cleaned.",
        sheet: "While you cleaned up you played {v}.",
        values: [
          { sheet: "the radio", card: "talk radio" },
          { sheet: "a jazz playlist", card: "jazz" },
          { sheet: "an old rock album", card: "loud rock music" },
        ],
        card: { title: "Neighbour's statement", text: "Heard {v} from the kitchen while they cleaned." },
      },
      {
        id: "close",
        claim: "I closed up together with someone else.",
        sheet: "You closed up together with {v}.",
        values: "people",
        card: { title: "Closing checklist", text: "Signed off by {suspect} and {v}." },
      },
      {
        id: "leave",
        claim: "I left right after we closed.",
        sheet: "You left the restaurant at {v}.",
        values: same("11:10 pm", "11:40 pm", "12:20 am"),
        card: { title: "Alarm panel", text: "Back door armed with {suspect}'s code at {v}." },
      },
      {
        id: "home",
        claim: "I went home the usual way.",
        sheet: "You went home by {v}.",
        values: [
          { sheet: "the night bus", card: "Transit card: night bus N3, tapped once." },
          { sheet: "bike", card: "Bike lock app: unlocked outside the restaurant." },
          { sheet: "taxi", card: "Ride app: one trip from the restaurant." },
        ],
        card: { title: "Travel record", text: "{v}" },
      },
      {
        id: "text",
        claim: "When I got home I texted someone goodnight.",
        sheet: "When you got home you texted {v} goodnight.",
        values: [
          { sheet: "your mum", card: "Mum" },
          { sheet: "your partner", card: "Partner" },
          { sheet: "your flatmate", card: "Flatmate" },
        ],
        card: { title: "Phone record", text: "One message sent to the contact \"{v}\" late that night." },
      },
    ],
    herrings: [
      { title: "Bank", text: "Saturday's deposit bag was never collected." },
      { title: "Lost property", text: "One umbrella, left at table 6." },
      { title: "Inspection notice", text: "Health inspection passed last month, no remarks." },
    ],
  },
  {
    id: "drive",
    title: "The wiped drive",
    brief: "Someone wiped the backup drive in the server room at {venue} on Friday night.",
    role: "{job} at {venue} who worked late on Friday",
    jobs: ["an accountant", "a project manager", "a designer", "an office manager"],
    slots: { venue: ["Northgate Studio", "Brindle & Co.", "the Harbour Works office"] },
    beats: [
      {
        id: "report",
        claim: "I stayed late to finish a report.",
        sheet: "You stayed late to finish the {v} report.",
        values: same("quarterly sales", "budget", "client feedback", "staffing"),
        card: { title: "Printer log", text: "One job from {suspect}'s desk: \"{v} report\", 8:05 pm." },
      },
      {
        id: "dinner",
        claim: "I ordered food to my desk.",
        sheet: "You ordered {v} to your desk.",
        values: same("pizza", "sushi", "a burrito", "pad thai"),
        card: { title: "Delivery receipt", text: "One order of {v}, left at reception for {suspect}." },
      },
      {
        id: "coffee",
        claim: "I made myself a coffee in the kitchen.",
        sheet: "Around 8:30 pm you made a {v} at the kitchen machine.",
        values: same("flat white", "black coffee", "hot chocolate", "chai latte"),
        card: { title: "Coffee machine", text: "8:31 pm: one {v}." },
      },
      {
        id: "other",
        claim: "One other person was still in the office.",
        sheet: "The only other person still in the office was {v}.",
        values: "people",
        card: { title: "Sign-out sheet", text: "The only other name signed out after 7 pm: {v}." },
      },
      {
        id: "call",
        claim: "Someone called to ask when I'd be home.",
        sheet: "Around 9 pm your {v} phoned to ask when you'd be home.",
        values: [
          { sheet: "partner", card: "Partner" },
          { sheet: "dad", card: "Dad" },
          { sheet: "flatmate", card: "Flatmate" },
        ],
        card: { title: "Phone record", text: "Incoming call around 9 pm from the contact \"{v}\"." },
      },
      {
        id: "exit",
        claim: "I went home before it got really late.",
        sheet: "You badged out of the building at {v}.",
        values: same("9:15 pm", "10:00 pm", "10:45 pm"),
        card: { title: "Door log", text: "{suspect}'s badge: out through the main door at {v}." },
      },
      {
        id: "home",
        claim: "I got home the way I always do.",
        sheet: "You went home {v}.",
        values: [
          { sheet: "by train", card: "Transit card: one train journey that night." },
          { sheet: "by bike", card: "Bike share: one ride from outside the office." },
          { sheet: "on foot", card: "Fitness tracker: a 35 minute walk late that night." },
        ],
        card: { title: "Travel record", text: "{v}" },
      },
    ],
    herrings: [
      { title: "Cleaner's note", text: "Bins emptied on every floor before 7 pm." },
      { title: "IT ticket", text: "Thursday: the backup drive was flagged as nearly full." },
      { title: "Building notice", text: "Lift maintenance on Saturday morning." },
    ],
  },
];
