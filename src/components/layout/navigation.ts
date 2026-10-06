import {
  BarChart3,
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

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Fase en la que se habilita. Los ítems no disponibles se muestran deshabilitados. */
  phase: number;
};

export type NavGroup = { label: string; items: NavItem[] };

/** Fase actual del desarrollo: habilita los ítems de fases ya entregadas. */
export const CURRENT_PHASE = 2;

export const navigation: NavGroup[] = [
  {
    label: "Personal",
    items: [
      { label: "Inicio", href: "/dashboard", icon: LayoutDashboard, phase: 2 },
      { label: "Empleados", href: "/empleados", icon: Users, phase: 5 },
      { label: "Documentación", href: "/documentacion", icon: FileText, phase: 6 },
      { label: "Egresos", href: "/egresos", icon: UserMinus, phase: 10 },
    ],
  },
  {
    label: "Tiempo",
    items: [
      { label: "Licencias y ausencias", href: "/licencias", icon: CalendarDays, phase: 7 },
      { label: "Vacaciones", href: "/vacaciones", icon: CalendarCheck, phase: 7 },
      { label: "Asistencia", href: "/asistencia", icon: Clock, phase: 8 },
    ],
  },
  {
    label: "Remuneraciones",
    items: [
      { label: "Información salarial", href: "/remuneraciones", icon: Wallet, phase: 9 },
      { label: "Novedades", href: "/novedades", icon: ClipboardList, phase: 9 },
    ],
  },
  {
    label: "Análisis",
    items: [
      { label: "Reportes", href: "/reportes", icon: BarChart3, phase: 12 },
      { label: "Importar", href: "/importar", icon: FileUp, phase: 13 },
    ],
  },
  {
    label: "Administración",
    items: [
      { label: "Configuración", href: "/configuracion", icon: Settings, phase: 4 },
      { label: "Usuarios y permisos", href: "/usuarios", icon: ShieldCheck, phase: 3 },
      { label: "Auditoría", href: "/auditoria", icon: History, phase: 14 },
    ],
  },
];

export function isAvailable(item: NavItem): boolean {
  return item.phase <= CURRENT_PHASE;
}
