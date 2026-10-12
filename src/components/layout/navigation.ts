import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  Clock,
  FileText,
  FileUp,
  History,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  ShieldCheck,
  UserMinus,
  Users,
  Wallet,
  ClipboardList,
} from "lucide-react";
import type { Permission } from "@/server/authz/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permiso necesario para ver el ítem. Sin permiso, el ítem no se muestra. */
  permission?: Permission;
};

export type NavGroup = { label: string; items: NavItem[] };

export const navigation: NavGroup[] = [
  {
    label: "Personal",
    items: [
      { label: "Inicio", href: "/dashboard", icon: LayoutDashboard },
      { label: "Alertas", href: "/alertas", icon: Bell, permission: "employee:read" },
      { label: "Empleados", href: "/empleados", icon: Users, permission: "employee:read" },
      { label: "Documentación", href: "/documentacion", icon: FileText, permission: "document:read" },
      { label: "Egresos", href: "/egresos", icon: UserMinus, permission: "exit:read" },
    ],
  },
  {
    label: "Tiempo",
    items: [
      { label: "Licencias y ausencias", href: "/licencias", icon: CalendarDays, permission: "leave:read" },
      { label: "Vacaciones", href: "/vacaciones", icon: CalendarCheck, permission: "leave:read" },
      { label: "Asistencia", href: "/asistencia", icon: Clock, permission: "attendance:read" },
    ],
  },
  {
    label: "Remuneraciones",
    items: [
      { label: "Información salarial", href: "/remuneraciones", icon: Wallet, permission: "salary:read" },
      { label: "Novedades", href: "/novedades", icon: ClipboardList, permission: "novelty:read" },
    ],
  },
  {
    label: "Análisis",
    items: [
      { label: "Reportes", href: "/reportes", icon: BarChart3 },
      { label: "Importar", href: "/importar", icon: FileUp, permission: "import:run" },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Configuración", href: "/configuracion", icon: Settings, permission: "config:catalogs" },
      { label: "Usuarios y permisos", href: "/usuarios", icon: ShieldCheck, permission: "user:manage" },
      { label: "Auditoría", href: "/auditoria", icon: History, permission: "audit:read" },
    ],
  },
];

/** Ítems visibles para un usuario: los que no piden permiso o cuyo permiso tiene. */
export function visibleNavigation(permissions: readonly string[]): NavGroup[] {
  const granted = new Set(permissions);
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || granted.has(item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}
