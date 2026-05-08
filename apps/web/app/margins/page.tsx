import { ModulePage } from "@/components/modules/module-page";
import { getModuleByHref } from "@/lib/modules";

export default function Page() {
  return <ModulePage module={getModuleByHref("/margins")!} />;
}
