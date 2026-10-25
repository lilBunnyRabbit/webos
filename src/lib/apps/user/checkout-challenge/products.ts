import {
  Avocado as AvocadoIcon,
  Book as BookIcon,
  Bread as BreadIcon,
  Cake as CakeIcon,
  Carrot as CarrotIcon,
  Cheese as CheeseIcon,
  Cherries as CherriesIcon,
  Coffee as CoffeeIcon,
  Cookie as CookieIcon,
  Egg as EggIcon,
  Fish as FishIcon,
  Flower as FlowerIcon,
  Gift as GiftIcon,
  IceCream as IceCreamIcon,
  Orange as OrangeIcon,
  Pepper as PepperIcon,
  Pizza as PizzaIcon,
  Plant as PlantIcon,
  Popcorn as PopcornIcon,
  Sock as SockIcon,
} from "phosphor-svelte";
import type { Product } from "./game";

export interface ProductInfo {
  name: string;
  icon: typeof CarrotIcon;
}

export const PRODUCT_INFO: Record<Product, ProductInfo> = {
  carrot: { name: "Carrots", icon: CarrotIcon },
  coffee: { name: "Coffee", icon: CoffeeIcon },
  cookie: { name: "Cookies", icon: CookieIcon },
  bread: { name: "Bread", icon: BreadIcon },
  egg: { name: "Eggs", icon: EggIcon },
  fish: { name: "Fish", icon: FishIcon },
  pizza: { name: "Pizza", icon: PizzaIcon },
  cheese: { name: "Cheese", icon: CheeseIcon },
  "ice-cream": { name: "Ice cream", icon: IceCreamIcon },
  orange: { name: "Oranges", icon: OrangeIcon },
  pepper: { name: "Peppers", icon: PepperIcon },
  avocado: { name: "Avocado", icon: AvocadoIcon },
  popcorn: { name: "Popcorn", icon: PopcornIcon },
  cake: { name: "Cake", icon: CakeIcon },
  cherries: { name: "Cherries", icon: CherriesIcon },
  flower: { name: "Flowers", icon: FlowerIcon },
  book: { name: "Book", icon: BookIcon },
  gift: { name: "Gift", icon: GiftIcon },
  sock: { name: "Socks", icon: SockIcon },
  plant: { name: "Plant", icon: PlantIcon },
};
