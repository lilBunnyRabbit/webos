import { Button } from "@/core/ui/button";
import { cn } from "@/core/lib/utils";
import { Palette } from "lucide-react";
import React from "react";

type Component = "button";

export default function StyleGuideApp() {
  const [activeComponent, setActiveComponent] = React.useState<Component>("button");

  React.useEffect(() => {
    console.log("~~~~~~~~~~~~~~~ StyleGuideApp mounted");
  }, []);

  const components: Component[] = ["button"];

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-48 border-r border-foreground/20 bg-background/50">
        <nav className="p-2 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-foreground/50 uppercase tracking-wide">
            Components
          </div>
          {components.sort().map((component) => (
            <button
              key={component}
              onClick={() => setActiveComponent(component)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors capitalize",
                activeComponent === component
                  ? "bg-primary/20 text-primary"
                  : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              <Palette className="w-4 h-4" />
              {component}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {activeComponent === "button" && <ButtonSection />}
      </main>
    </div>
  );
}

function ButtonSection() {
  const variants = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
  const sizes = ["sm", "default", "lg"] as const;
  const iconSizes = ["icon-sm", "icon", "icon-lg"] as const;

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Button</h1>
        <p className="text-foreground/70 text-sm">
          Displays a button or a component that looks like a button.
        </p>
      </div>

      {/* Variants */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-3">Variants</h2>
          <p className="text-sm text-foreground/70 mb-4">
            Different visual styles for different contexts.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {variants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Button variant={variant}>
                {variant.charAt(0).toUpperCase() + variant.slice(1)}
              </Button>
              <span className="text-xs text-foreground/60">{variant}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sizes */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-3">Sizes</h2>
          <p className="text-sm text-foreground/70 mb-4">
            Different button sizes for different use cases.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {sizes.map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <Button size={size}>
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </Button>
              <span className="text-xs text-foreground/60">{size}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Icon Sizes */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-3">Icon Sizes</h2>
          <p className="text-sm text-foreground/70 mb-4">
            Icon-only button sizes.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {iconSizes.map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <Button size={size}>
                <Palette />
              </Button>
              <span className="text-xs text-foreground/60">{size}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Disabled State */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-3">Disabled</h2>
          <p className="text-sm text-foreground/70 mb-4">
            Disabled state for all variants.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {variants.map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Button variant={variant} disabled>
                {variant.charAt(0).toUpperCase() + variant.slice(1)}
              </Button>
              <span className="text-xs text-foreground/60">{variant}</span>
            </div>
          ))}
        </div>
      </div>

      {/* With Icons */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-3">With Icons</h2>
          <p className="text-sm text-foreground/70 mb-4">
            Buttons with icons for enhanced visual communication.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {variants.slice(0, 3).map((variant) => (
            <div key={variant} className="flex flex-col items-center gap-2">
              <Button variant={variant}>
                <Palette />
                {variant.charAt(0).toUpperCase() + variant.slice(1)}
              </Button>
              <span className="text-xs text-foreground/60">{variant}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Combination Examples */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-3">Combinations</h2>
          <p className="text-sm text-foreground/70 mb-4">
            Various combinations of variants and sizes.
          </p>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          <div className="p-4 border border-foreground/20 rounded-lg space-y-2">
            <div className="text-xs text-foreground/60 mb-2">Primary + Large</div>
            <Button variant="default" size="lg" className="w-full">
              Large Primary
            </Button>
          </div>
          <div className="p-4 border border-foreground/20 rounded-lg space-y-2">
            <div className="text-xs text-foreground/60 mb-2">Destructive + Small</div>
            <Button variant="destructive" size="sm" className="w-full">
              Delete Item
            </Button>
          </div>
          <div className="p-4 border border-foreground/20 rounded-lg space-y-2">
            <div className="text-xs text-foreground/60 mb-2">Outline + Icon</div>
            <Button variant="outline" className="w-full">
              <Palette />
              With Icon
            </Button>
          </div>
          <div className="p-4 border border-foreground/20 rounded-lg space-y-2">
            <div className="text-xs text-foreground/60 mb-2">Ghost + Small</div>
            <Button variant="ghost" size="sm" className="w-full">
              Ghost Button
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

