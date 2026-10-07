import { SectionTabs } from "@/components/layout/section-tabs";

export function SalaryTabs({ current }: { current: "/remuneraciones" | "/remuneraciones/basicos" }) {
  return (
    <SectionTabs
      current={current}
      tabs={[
        { href: "/remuneraciones", label: "Resúmenes informados" },
        { href: "/remuneraciones/basicos", label: "Básicos vigentes" },
      ]}
    />
  );
}
