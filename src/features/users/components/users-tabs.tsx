import { SectionTabs } from "@/components/layout/section-tabs";

export function UsersTabs({ current }: { current: "/usuarios" | "/usuarios/roles" }) {
  return (
    <SectionTabs
      current={current}
      tabs={[
        { href: "/usuarios", label: "Usuarios" },
        { href: "/usuarios/roles", label: "Roles y permisos" },
      ]}
    />
  );
}
