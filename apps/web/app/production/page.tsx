import { Suspense } from "react";
import { ProductionClient } from "./production-client";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProductionClient />
    </Suspense>
  );
}
