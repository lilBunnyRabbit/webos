export const WORDS = [
  "airplane", "alarm clock", "anchor", "ant", "apple", "axe", "backpack", "banana", "bandage", "barn",
  "baseball bat", "basket", "bathtub", "bear", "bed", "bee", "bell", "bicycle", "bird",
  "boat", "book", "boomerang", "bowtie", "bread", "bridge", "broom", "bucket", "bus", "bush",
  "butterfly", "cactus", "cake", "camel", "camera", "candle", "cannon", "car", "carrot", "castle",
  "cat", "chair", "cherry", "clock", "cloud", "compass", "cookie", "couch", "cow", "crab",
  "crocodile", "crown", "cup", "diamond", "dog", "dolphin", "donut", "door", "dragon", "drum",
  "duck", "dumbbell", "ear", "elephant", "envelope", "eye", "eyeglasses", "fan", "feather", "fence",
  "fish", "flag", "flamingo", "flashlight", "flower", "fork", "frog", "frying pan", "giraffe", "grapes",
  "guitar", "hamburger", "hammer", "hand", "hat", "headphones", "hedgehog", "helicopter", "horse", "hot air balloon",
  "house", "ice cream", "igloo", "jellyfish", "kangaroo", "key", "kite", "knife", "ladder", "lamp",
  "leaf", "light bulb", "lighthouse", "lightning", "lion", "lipstick", "lollipop", "mailbox", "map", "microphone",
  "moon", "mosquito", "motorbike", "mountain", "mouse", "mushroom", "nose", "octopus", "owl", "paintbrush",
  "palm tree", "panda", "pants", "paper clip", "parachute", "parrot", "pear", "pencil", "penguin", "piano",
  "pig", "pineapple", "pizza", "rabbit", "rainbow", "rake", "rhinoceros", "rocket", "sailboat", "saw",
  "scissors", "scorpion", "shark", "sheep", "shoe", "shovel", "skateboard", "skull", "snail", "snake",
  "snowflake", "snowman", "sock", "spider", "spoon", "squirrel", "star", "strawberry", "sun", "swan",
  "sword", "t-shirt", "table", "teapot", "teddy bear", "telephone", "television", "tent", "toothbrush", "tornado",
  "tractor", "traffic light", "train", "tree", "truck", "trumpet", "turtle", "umbrella", "violin", "watermelon",
  "whale", "wheel", "windmill", "wine glass", "zebra",
] as const;

export type Word = (typeof WORDS)[number];
