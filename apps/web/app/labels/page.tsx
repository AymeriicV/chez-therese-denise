import { Suspense } from "react";
import { LabelsClient } from "./labels-client";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LabelsClient />
    </Suspense>
  );
}
