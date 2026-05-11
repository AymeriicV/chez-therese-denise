"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatParisDate } from "@/lib/time";

function formatToday() {
  return formatParisDate(new Date(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function Topbar() {
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(formatToday());
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:px-8">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs capitalize text-foreground/55">{today || formatToday()}</p>
          <h1 className="truncate text-xl font-semibold lg:text-2xl">Pilotage restaurant</h1>
        </div>
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/invoices">
            <Upload className="h-4 w-4" />
            Importer
          </Link>
        </Button>
      </div>
    </header>
  );
}
