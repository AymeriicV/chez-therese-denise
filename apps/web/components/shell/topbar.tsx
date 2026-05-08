import { Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Topbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:px-8">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground/55">Vendredi 8 mai 2026</p>
          <h1 className="truncate text-xl font-semibold lg:text-2xl">Pilotage restaurant</h1>
        </div>
        <Button variant="secondary" size="icon" aria-label="Rechercher">
          <Search className="h-4 w-4" />
        </Button>
        <Button className="hidden sm:inline-flex">
          <Upload className="h-4 w-4" />
          Importer
        </Button>
      </div>
    </header>
  );
}
