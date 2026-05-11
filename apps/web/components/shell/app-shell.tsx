"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { getSessionRole, getStoredToken, redirectToLogin } from "@/lib/api";

const EMPLOYEE_ALLOWED = ["/planning", "/time-clock"];

export function AppShell({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return;
    }
    const role = getSessionRole();
    if (role === "EMPLOYEE" && !EMPLOYEE_ALLOWED.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`))) {
      window.location.assign("/planning");
      return;
    }
    setIsReady(true);
  }, [pathname]);

  if (!isReady) {
    return <div suppressHydrationWarning className="min-h-screen bg-background" />;
  }

  return (
    <div suppressHydrationWarning className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden pb-20 lg:pb-0">{children}</main>
      </div>
    </div>
  );
}
