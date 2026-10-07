import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  { href: "/vacaciones", label: "Solicitudes" },
  { href: "/vacaciones/saldos", label: "Saldos por período" },
];

export function VacationTabs({ current }: { current: string }) {
  return <SectionTabs tabs={TABS} current={current} />;
}
