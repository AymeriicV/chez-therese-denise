import { ModulePage } from "@/components/modules/module-page";
import { getModuleByHref } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ModulePage module={getModuleByHref("/allergens")!} />;
}
