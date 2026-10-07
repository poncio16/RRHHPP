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
  /** Fase en la que se habilita. Los ítems no disponibles se muestran deshabilitados. */
  phase: number;
  /** Permiso necesario para ver el ítem. Sin permiso, el ítem no se muestra. */
  permission?: Permission;
};

export type NavGroup = { label: string; items: NavItem[] };

/** Fase actual del desarrollo: habilita los ítems de fases ya entregadas. */
export const CURRENT_PHASE = 12;

export const navigation: NavGroup[] = [
  {
    label: "Personal",
    items: [
      { label: "Inicio", href: "/dashboard", icon: LayoutDashboard, phase: 2 },
      { label: "Alertas", href: "/alertas", icon: Bell, phase: 11, permission: "employee:read" },
      { label: "Empleados", href: "/empleados", icon: Users, phase: 5, permission: "employee:read" },
      { label: "Documentación", href: "/documentacion", icon: FileText, phase: 6, permission: "document:read" },
      { label: "Egresos", href: "/egresos", icon: UserMinus, phase: 10, permission: "exit:read" },
    ],
  },
  {
    label: "Tiempo",
    items: [
      { label: "Licencias y ausencias", href: "/licencias", icon: CalendarDays, phase: 7, permission: "leave:read" },
      { label: "Vacaciones", href: "/vacaciones", icon: CalendarCheck, phase: 7, permission: "leave:read" },
      { label: "Asistencia", href: "/asistencia", icon: Clock, phase: 8, permission: "attendance:read" },
    ],
  },
  {
    label: "Remuneraciones",
    items: [
      { label: "Información salarial", href: "/remuneraciones", icon: Wallet, phase: 9, permission: "salary:read" },
      { label: "Novedades", href: "/novedades", icon: ClipboardList, phase: 9, permission: "novelty:read" },
    ],
  },
  {
    label: "Análisis",
    items: [
      { label: "Reportes", href: "/reportes", icon: BarChart3, phase: 12 },
      { label: "Importar", href: "/importar", icon: FileUp, phase: 13, permission: "import:run" },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Configuración", href: "/configuracion", icon: Settings, phase: 4, permission: "config:catalogs" },
      { label: "Usuarios y permisos", href: "/usuarios", icon: ShieldCheck, phase: 3, permission: "user:manage" },
      { label: "Auditoría", href: "/auditoria", icon: History, phase: 14, permission: "audit:read" },
    ],
  },
];

export function isAvailable(item: NavItem): boolean {
  return item.phase <= CURRENT_PHASE;
}

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
