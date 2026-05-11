import { ProductionClient } from "./production-client";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ recipe_id?: string }>;
}) {
  const params = searchParams ? await searchParams : null;
  return <ProductionClient initialRecipeId={params?.recipe_id ?? null} />;
}
