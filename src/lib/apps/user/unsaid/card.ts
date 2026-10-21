export const Category = {
  ANIMALS: "animals",
  FOOD: "food",
  HOME: "home",
  NATURE: "nature",
  PEOPLE: "people",
  PLAY: "play",
} as const;
export type Category = (typeof Category)[keyof typeof Category];

export const CATEGORY_LABELS: Record<Category, string> = {
  animals: "Animals",
  food: "Food and drink",
  home: "Around the house",
  nature: "Nature",
  people: "People",
  play: "Sport and fun",
};

export interface Card {
  word: string;
  banned: string[];
  category: Category;
}
