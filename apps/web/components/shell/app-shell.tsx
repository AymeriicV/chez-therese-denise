import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
      </div>
    </div>
  );
}
