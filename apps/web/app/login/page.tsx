import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
      <Card className="w-full max-w-sm p-5">
        <div className="mb-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-foreground font-semibold text-background">
            CTD
          </div>
          <h1 className="text-2xl font-semibold">Connexion</h1>
          <p className="mt-2 text-sm text-foreground/55">Chez Therese et Denise</p>
        </div>
        <form className="space-y-3">
          <input
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground"
            placeholder="Email"
            type="email"
          />
          <input
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground"
            placeholder="Mot de passe"
            type="password"
          />
          <Button className="w-full" type="submit">Se connecter</Button>
        </form>
      </Card>
    </main>
  );
}
