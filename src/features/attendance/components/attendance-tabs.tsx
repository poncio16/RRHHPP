import { SectionTabs } from "@/components/layout/section-tabs";

export function AttendanceTabs({ current }: { current: "/asistencia" | "/asistencia/registros" }) {
  return (
    <SectionTabs
      current={current}
      tabs={[
        { href: "/asistencia", label: "Planilla diaria" },
        { href: "/asistencia/registros", label: "Registros" },
      ]}
    />
  );
}
