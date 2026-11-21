import { Network } from "lucide-react";
import { mod } from "../../lib/platform";
import { Empty, Header, Kbd } from "../../ui/ui";
import { useNav, type Place } from "../../shell/nav";
import { Overview } from "./Overview";
import { EntityView } from "./EntityView";

export function ServiceBusView({ place, onUp }: { place: Extract<Place, { tool: "sb" }>; onUp: () => void }) {
  const { go } = useNav();
  if (place.entity) return <EntityView entity={place.entity} onBack={onUp} />;
  if (place.ns) return <Overview ns={place.ns} onSelect={(e) => go({ tool: "sb", ns: e.ns, entity: e })} />;
  return (
    <div className="flex h-full flex-col">
      <Header><span className="text-[13px] font-medium text-fg">Service Bus</span></Header>
      <Empty icon={<Network />} title="Pick a namespace">
        See its topology, then open a queue or subscription to peek messages. Or press <Kbd>{mod("K")}</Kbd> to jump anywhere.
      </Empty>
    </div>
  );
}
