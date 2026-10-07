import { SectionTabs } from "@/components/layout/section-tabs";
import type { Permission } from "@/server/authz/permissions";

const TABS: { href: string; label: string; permission: Permission }[] = [
  { href: "/configuracion", label: "Catálogos", permission: "config:catalogs" },
  { href: "/configuracion/horarios", label: "Horarios", permission: "config:catalogs" },
  { href: "/configuracion/feriados", label: "Feriados", permission: "config:catalogs" },
  { href: "/configuracion/empresa", label: "Empresa", permission: "config:manage" },
  { href: "/configuracion/vacaciones", label: "Vacaciones", permission: "config:manage" },
  { href: "/configuracion/parametros", label: "Parámetros", permission: "config:manage" },
];

/** Pestañas de Configuración: solo las que el usuario puede usar. */
export function ConfigTabs({ current, permissions }: { current: string; permissions: ReadonlySet<string> }) {
  return <SectionTabs current={current} tabs={TABS.filter((tab) => permissions.has(tab.permission))} />;
}
