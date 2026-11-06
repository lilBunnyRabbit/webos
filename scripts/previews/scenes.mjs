import { pdf, photo, video } from "./samples.mjs";

const pad = (n) => String(n).padStart(2, "0");
const day_key = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const days_from_now = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};
const monday = () => {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
};
const week_day = (offset) => {
  const date = monday();
  date.setDate(date.getDate() + offset);
  return day_key(date);
};
const json = (path, value) => ({ path, text: JSON.stringify(value, null, 2) });

const NOTES = [
  [
    "a3f91c2",
    "ready",
    0,
    "Book the train to Ljubljana\n\nFriday morning, window seat if there is one. Check whether the 7:40 still runs on holidays. #travel",
  ],
  [
    "b81e0d4",
    "ready",
    1,
    "Gift ideas for Maja\n\n- the ceramic mug from the market\n- a plant that survives an office\n- concert tickets? #people",
  ],
  ["c5d27e9", "raw", 0, "Podcast idea: one episode per old family recipe, cooked live"],
  [
    "d09a6b1",
    "ready",
    2,
    "Bike service\n\nBrakes squeak at the back, chain needs oil. The shop on Celovška is open till 18:00. #errands",
  ],
  ["e44c8f0", "done", 4, "Renew the library card #errands"],
  ["f7b3a25", "ready", 3, "Reading list\n\n1. The Overstory\n2. Piranesi\n3. A Psalm for the Wild-Built #books"],
];

const TODO = [
  "- [ ] Call the plumber about the kitchen tap",
  "- [x] Send the slides to Ana",
  "- [ ] Pick up the parcel",
  "- [ ] Water the balcony herbs",
  "",
].join("\n");

const note_file = ([id, status, ago, body]) => {
  const created = days_from_now(-ago);
  created.setHours(9 + ago, 15 * ago, 0, 0);
  const slug = body
    .split("\n")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 5)
    .join("-");
  return {
    path: `/home/Notes/${day_key(created)}-${slug}.md`,
    text: `---\nid: ${id}\nstatus: ${status}\ncreated: ${created.toISOString()}\n---\n\n${body}\n`,
  };
};

let event_id = 0;
const event = (day, title, start, end, color, extra = {}) => ({
  id: `ev${++event_id}`,
  title,
  day,
  all_day: false,
  start,
  end,
  repeat: null,
  skip: [],
  notes: "",
  color,
  reminder: null,
  ...extra,
});

let item_id = 0;
const item = (text, checked = false, qty, unit) => ({
  id: `it${++item_id}`,
  text,
  checked,
  ...(qty ? { qty } : {}),
  ...(unit ? { unit } : {}),
  added_at: Date.now() - item_id * 3600_000,
  updated_at: Date.now() - item_id * 3600_000,
});

export const SCENES = [
  {
    id: "quick-notes",
    props: { tab: "notes" },
    act: (page, win) => win.getByText("Book the train to Ljubljana").first().click(),
    seed: (page, { write_files }) =>
      write_files([...NOTES.map(note_file), { path: "/home/Notes/todo.md", text: TODO }]),
  },
  {
    id: "calendar",
    seed: (page, { write_files }) =>
      write_files([
        json("/var/lib/apps/calendar/events.json", {
          version: 1,
          events: [
            event(week_day(-7), "Team stand-up", "09:30", "09:45", "primary", {
              repeat: { every: "weekly", until: null },
            }),
            event(week_day(-4), "Team stand-up", "09:30", "09:45", "primary", {
              repeat: { every: "weekly", until: null },
            }),
            event(week_day(-6), "Haircut", "17:00", "17:45", "warning"),
            event(week_day(-2), "Hike: Šmarna gora", "08:00", "12:00", "success"),
            event(week_day(-5), "Book club", "19:00", "21:00", "accent"),
            event(week_day(0), "Dentist", "14:00", "15:00", "warning"),
            event(week_day(1), "Lunch with Ana", "12:30", "13:30", "success"),
            event(week_day(2), "Design review", "10:00", "11:30", "info"),
            event(week_day(2), "Climbing", "18:00", "20:00", "accent"),
            event(week_day(16), "Climbing", "18:00", "20:00", "accent"),
            event(week_day(11), "Parents' evening", "18:30", "19:30", "warning"),
            event(week_day(19), "Concert: Laibach", "20:00", "23:00", "accent"),
            event(week_day(24), "Dinner at Maja's", "19:00", "22:00", "success"),
            event(week_day(22), "Sprint demo", "15:00", "16:00", "info"),
            event(week_day(3), "Quarterly planning", "13:00", "16:00", "primary"),
            event(week_day(4), "Mum's birthday", "00:00", "24:00", "error", {
              all_day: true,
              repeat: { every: "yearly", until: null },
            }),
            event(week_day(4), "Cinema: late show", "20:30", "23:00", "accent"),
            event(week_day(5), "Farmers market", "09:00", "10:30", "success"),
            event(week_day(9), "Flight to Lisbon", "07:15", "10:05", "info"),
            event(week_day(15), "Car service", "08:00", "09:00", "warning"),
          ],
        }),
      ]),
  },
  {
    id: "clock",
    seed: (page, { write_files }) =>
      write_files([
        json("/var/lib/apps/clock/clock.json", {
          version: 1,
          zones: ["America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney"],
          alarms: {},
          timers: {},
        }),
      ]),
  },
  {
    id: "shopping-list",
    act: (page, win) => win.getByText("Groceries").first().click(),
    seed: (page, { write_files }) =>
      write_files([
        json("/var/lib/apps/shopping-list/lists.json", {
          version: 1,
          lists: [
            {
              id: "groceries",
              name: "Groceries",
              color: "primary",
              icon: "cart",
              items: [
                item("Oat milk", false, 2, "l"),
                item("Sourdough bread"),
                item("Cherry tomatoes", false, 500, "g"),
                item("Basil"),
                item("Parmesan", false, 200, "g"),
                item("Eggs", false, 10),
                item("Lemons", true, 3),
                item("Coffee beans", true),
              ],
            },
            {
              id: "home",
              name: "Home",
              color: "info",
              icon: "house",
              items: [item("Light bulbs (E27)", false, 4), item("Dish soap"), item("Bin bags")],
            },
            {
              id: "party",
              name: "Saturday party",
              color: "accent",
              icon: "gift",
              items: [item("Sparkling water", false, 6), item("Crisps"), item("Candles", true)],
            },
          ],
          history: {},
        }),
      ]),
  },
  {
    id: "recipe-box",
    props: { path: "/home/Recipes/Shakshuka.cook" },
    seed: (page, { write_files }) =>
      write_files(Object.entries(RECIPES).map(([name, text]) => ({ path: `/home/Recipes/${name}.cook`, text }))),
  },
  {
    id: "file-explorer",
    kind: "system",
    props: { path: "/home" },
    seed: async (page, { write_files }) => write_files(await home_files(page)),
    act: (page, win) => win.getByText("Lisbon trip.pdf").first().click(),
  },
  {
    id: "image-tools",
    props: { section: "fit", path: "/home/Pictures/Lake at dusk.jpg" },
    seed: async (page, { write_files }) =>
      write_files([{ path: "/home/Pictures/Lake at dusk.jpg", base64: await photo(page, "dusk", 11) }]),
  },
  {
    id: "pdf-tools",
    props: { section: "organize", path: "/home/Documents/Lisbon trip.pdf" },
    seed: async (page, { write_files }) =>
      write_files([{ path: "/home/Documents/Lisbon trip.pdf", base64: await pdf() }]),
  },
  {
    id: "video-tools",
    props: { path: "/home/Videos/Coast road.webm" },
    settle: 3000,
    seed: async (page, { write_files, base }) =>
      write_files([{ path: "/home/Videos/Coast road.webm", base64: await video(page, base) }]),
  },
  {
    id: "color-tools",
    act: (page, win) => win.getByRole("button", { name: "Harmony" }).first().click(),
  },
  {
    id: "terminal",
    kind: "system",
    seed: async (page, { write_files }) => write_files(await home_files(page)),
    act: async (page, win) => {
      await win.locator("textarea, input, [contenteditable]").last().click();
      for (const line of ["ls", "cat Notes/todo.md", "ls Pictures | sort size -r | select name size"]) {
        await page.keyboard.type(line);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1000);
      }
    },
  },
  {
    id: "tight-spot",
  },
  {
    id: "solitaire",
    act: async (page, win) => {
      const stock = win.locator("[aria-label*='stock' i], [aria-label*='deck' i]").first();
      for (let i = 0; i < 3; i++) await stock.click().catch(() => {});
    },
  },
  {
    id: "sudoku",
    act: async (page, win) => {
      for (let i = 0; i < 3; i++) {
        await win.getByRole("button", { name: /hint/i }).first().click();
        await page.waitForTimeout(250);
      }
    },
  },
  {
    id: "minesweeper",
    act: async (page, win) => {
      const cells = win.locator("[role=gridcell], [data-cell], button[aria-label*='cell' i]");
      const count = await cells.count();
      await cells.nth(Math.floor(count / 2)).click();
    },
  },
];

async function home_files(page) {
  return [
    ...NOTES.slice(0, 3).map(note_file),
    { path: "/home/Notes/todo.md", text: TODO },
    { path: "/home/Pictures/Lake at dusk.jpg", base64: await photo(page, "dusk", 11, 1200, 800) },
    { path: "/home/Pictures/Meadow.jpg", base64: await photo(page, "meadow", 23, 1200, 800) },
    { path: "/home/Pictures/Coast road.jpg", base64: await photo(page, "coast", 37, 1200, 800) },
    { path: "/home/Pictures/Last light.jpg", base64: await photo(page, "dusk", 64, 1600, 1066) },
    { path: "/home/Recipes/Shakshuka.cook", text: RECIPES.Shakshuka },
    { path: "/home/Music/.keep", text: "" },
    { path: "/home/Videos/.keep", text: "" },
    { path: "/home/Lisbon trip.pdf", base64: await pdf() },
    { path: "/home/Budget 2026.csv", text: "month,rent,food,fun\nJan,650,310,120\nFeb,650,290,90\nMar,650,335,140\n" },
    { path: "/home/Moving checklist.md", text: "# Moving\n\n- [ ] Book the van\n- [ ] Boxes from the shop\n" },
    { path: "/home/Cover letter.txt", text: "Dear hiring team,\n\nI would love to join the studio.\n" },
  ];
}

const RECIPES = {
  Shakshuka: `---
title: Shakshuka
servings: 2
time: 30 minutes
tags: [breakfast, vegetarian]
---
Warm @olive oil{2%tbsp} in a #wide pan{} and soften @onion{1} and @red pepper{1}, sliced, for ~{8%minutes}.

Add @garlic{2%cloves}, @cumin{1%tsp} and @smoked paprika{1%tsp}, then stir for a minute.

Pour in @chopped tomatoes{400%g} and simmer ~{10%minutes} until thick. Season with @salt{} and @pepper{}.

Make four wells and crack in @eggs{4}. Cover and cook ~{6%minutes}, until the whites set.

Finish with @feta{50%g} and @parsley{a handful}. Serve with @bread{}.`,
  "Lemon pasta": `---
title: Lemon pasta
servings: 2
tags: [dinner, quick]
---
Cook @spaghetti{200%g} in salted water. Keep a cup of the water.

Melt @butter{30%g}, add the zest and juice of @lemon{1} and @parmesan{40%g}, then toss with the pasta and a splash of the water.`,
  "Banana bread": `---
title: Banana bread
servings: 8
tags: [baking]
---
Mash @bananas{3}, mix in @melted butter{80%g}, @sugar{100%g} and @egg{1}.

Fold in @flour{190%g}, @baking soda{1%tsp} and @salt{1%pinch}. Bake ~{55%minutes} at 175 °C.`,
  "Tomato soup": `---
title: Tomato soup
servings: 4
tags: [dinner, vegetarian]
---
Roast @tomatoes{1%kg} with @garlic{4%cloves} ~{30%minutes}, then blend with @stock{500%ml}.`,
  "Overnight oats": `---
title: Overnight oats
servings: 1
tags: [breakfast, quick]
---
Stir @oats{50%g} into @milk{120%ml} with @yoghurt{2%tbsp}. Chill overnight, top with @berries{a handful}.`,
};
