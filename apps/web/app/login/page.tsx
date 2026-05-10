"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<{ access_token: string }>("/auth/login", {
        method: "POST",
        authRequired: false,
        body: JSON.stringify({ email, password }),
      });
      window.localStorage.setItem("ctd_token", response.access_token);
      const payload = JSON.parse(window.atob(response.access_token.split(".")[1] ?? ""));
      if (payload.restaurant_id) window.localStorage.setItem("ctd_restaurant_id", payload.restaurant_id);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <Card className="w-full max-w-sm p-5">
        <div className="mb-6">
          <img src="/logo.png" alt="Chez Thérèse & Denise" className="mb-4 h-16 w-16 rounded-full object-contain"/>
          <h1 className="text-2xl font-semibold">Connexion</h1>
          <p className="mt-2 text-sm text-foreground/55">Chez Thérèse et Denise</p>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          {error ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">{error}</p> : null}
          <input
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground"
            placeholder="Mot de passe"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <Button className="w-full" type="submit" disabled={loading}>
            <LogIn className="h-4 w-4" />
            {loading ? "Connexion..." : "Se connecter"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
