"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { getStoredToken, redirectToLogin } from "@/lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (!getStoredToken()) {
      redirectToLogin();
      return;
    }
    setHasSession(true);
  }, []);

  if (!hasSession) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-sm text-foreground/60">
        Redirection vers la connexion...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
      </div>
    </div>
  );
}
