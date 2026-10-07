import "server-only";
import * as catalogs from "@/features/catalogs/repository";
import { formatSeniority, seniority } from "@/features/employees/calc";
import { workDaysOf } from "@/features/leaves/service";
import { balanceUsage, holidaysBetween } from "@/features/leaves/repository";
import {
  addMonths,
  formatDate,
  formatPeriod,
  parseIsoDate,
  parsePeriod,
  periodEnd,
  periodOf,
  todayInTimeZone,
} from "@/lib/format";
import { sumAmounts } from "@/lib/validators/decimal";
import { assertPermission, hasPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { getSetting } from "@/server/settings";
import {
  absenceBreakdown,
  countBy,
  employedOn,
  employmentPeriods,
  parseDisplayDate,
  rangeOf,
  rate,
  seniorityRanges,
} from "./calc";
import { REPORTS, SALARY_NOTICE, type ReportSlug } from "./definitions";
import * as repo from "./repository";
import {
  absenteeismQuerySchema,
  expirationsQuerySchema,
  headcountQuerySchema,
  movementsQuerySchema,
  salaryQuerySchema,
  seniorityQuerySchema,
  type StructureFilters,
  vacationsQuerySchema,
} from "./schemas";
import type { Column, ReportResult, ReportRow, ReportTable } from "./table";

const MODULE = "reportes";
const DAY = 86_400_000;
/** Rango máximo de los reportes por fechas, para que una consulta no recorra años de datos. */
const MAX_RANGE_DAYS = 731;
const MAX_RANGE_MONTHS = 60;

const RESERVED_LEAVE = "Licencia (dato reservado)";
const RESERVED_DOCUMENT = "Documento (dato reservado)";
const ATTENDANCE_ABSENCE = "Ausente sin licencia (asistencia)";

/* ----------------------------------------------------------------------------
 * Permisos y opciones
 * ------------------------------------------------------------------------- */

export function canSeeReport(ctx: ActorContext, slug: ReportSlug) {
  return REPORTS[slug].permissions.every((p) => hasPermission(ctx, p));
}

async function assertReport(ctx: ActorContext, slug: ReportSlug) {
  for (const permission of REPORTS[slug].permissions) await assertPermission(ctx, permission, MODULE);
}

export async function getFilterOptions(ctx: ActorContext, slug: ReportSlug) {
  await assertReport(ctx, slug);
  const [sectores, puestos, categorias, establecimientos, years] = await Promise.all([
    catalogs.listOptions("sectores"),
    catalogs.listOptions("puestos"),
    catalogs.listOptions("categorias"),
    catalogs.listOptions("establecimientos"),
    slug === "vacaciones" ? repo.vacationYears() : Promise.resolve([]),
  ]);
  return { sectores, puestos, categorias, establecimientos, years, currentYear: todayInTimeZone().getUTCFullYear() };
}

/* ----------------------------------------------------------------------------
 * Armado de tablas
 * ------------------------------------------------------------------------- */

type Employee = repo.ReportEmployee;

const fullName = (e: Pick<Employee, "lastName" | "firstName">) => `${e.lastName}, ${e.firstName}`;

const EMPLOYEE_COLUMNS: Column[] = [
  { key: "legajo", label: "Legajo", type: "int" },
  { key: "empleado", label: "Empleado" },
];

const employeeCells = (e: Employee): ReportRow => ({
  legajo: e.fileNumber,
  empleado: fullName(e),
  _href: `/empleados/${e.id}`,
});

const NO_CATEGORY = "Sin categoría";

/** Tabla de cantidades por una dimensión, con porcentaje y total. */
function countTable(id: string, title: string, header: string, labels: string[], empty: string): ReportTable {
  const total = labels.length;
  return {
    id,
    title,
    columns: [
      { key: "grupo", label: header },
      { key: "personas", label: "Personas", type: "int" },
      { key: "porcentaje", label: "%", type: "percent" },
    ],
    rows: countBy(labels, (l) => l).map((r) => ({ grupo: r.label, personas: r.count, porcentaje: r.count / total })),
    totals: { grupo: "Total", personas: total, porcentaje: total > 0 ? 1 : null },
    empty,
  };
}

async function describeStructure(filters: StructureFilters): Promise<string[]> {
  const pick = async (key: Parameters<typeof catalogs.listOptions>[0], id: string | undefined, label: string) => {
    if (!id) return null;
    const option = (await catalogs.listOptions(key, [id])).find((o) => o.id === id);
    return option ? `${label}: ${option.label}` : null;
  };
  const parts = await Promise.all([
    pick("sectores", filters.sector, "Sector"),
    pick("puestos", filters.puesto, "Puesto"),
    pick("categorias", filters.categoria, "Categoría"),
    pick("establecimientos", filters.establecimiento, "Establecimiento"),
  ]);
  return parts.filter((p): p is string => p !== null);
}

/** Rango de fechas de los filtros: ordenado y acotado. */
function dateRange(desde: string | undefined, hasta: string | undefined, defaults: { from: Date; to: Date }) {
  let from = (desde && parseIsoDate(desde)) || defaults.from;
  let to = (hasta && parseIsoDate(hasta)) || defaults.to;
  if (from > to) [from, to] = [to, from];
  if ((to.getTime() - from.getTime()) / DAY > MAX_RANGE_DAYS) from = new Date(to.getTime() - MAX_RANGE_DAYS * DAY);
  return { from, to };
}

const yesNo = (value: boolean) => (value ? "Sí" : "No");

/* ----------------------------------------------------------------------------
 * Reportes
 * ------------------------------------------------------------------------- */

export async function runReport(ctx: ActorContext, slug: ReportSlug, rawQuery: unknown): Promise<ReportResult> {
  await assertReport(ctx, slug);
  switch (slug) {
    case "dotacion":
      return headcountReport(rawQuery);
    case "altas-y-bajas":
      return movementsReport(rawQuery);
    case "ausentismo":
      return absenteeismReport(ctx, rawQuery);
    case "vacaciones":
      return vacationsReport(rawQuery);
    case "vencimientos":
      return expirationsReport(ctx, rawQuery);
    case "antiguedad":
      return seniorityReport(rawQuery);
    case "remuneraciones":
      return salaryReport(rawQuery);
  }
}

async function headcountReport(rawQuery: unknown): Promise<ReportResult> {
  const filters = headcountQuerySchema.parse(rawQuery);
  const [employees, described] = await Promise.all([repo.activeEmployees(filters), describeStructure(filters)]);
  const empty = "No hay personal activo con estos filtros.";
  return {
    title: REPORTS.dotacion.title,
    filters: [`Personal activo al ${formatDate(todayInTimeZone())}`, ...described],
    tables: [
      countTable(
        "sector",
        "Por sector",
        "Sector",
        employees.map((e) => e.department.name),
        empty,
      ),
      countTable(
        "puesto",
        "Por puesto",
        "Puesto",
        employees.map((e) => e.position.name),
        empty,
      ),
      countTable(
        "categoria",
        "Por categoría",
        "Categoría",
        employees.map((e) => e.category?.name ?? NO_CATEGORY),
        empty,
      ),
      countTable(
        "establecimiento",
        "Por establecimiento",
        "Establecimiento",
        employees.map((e) => e.workplace.name),
        empty,
      ),
      {
        id: "detalle",
        title: "Detalle",
        columns: [
          ...EMPLOYEE_COLUMNS,
          { key: "sector", label: "Sector" },
          { key: "puesto", label: "Puesto" },
          { key: "categoria", label: "Categoría" },
          { key: "establecimiento", label: "Establecimiento" },
          { key: "contratacion", label: "Contratación" },
          { key: "ingreso", label: "Ingreso", type: "date" },
        ],
        rows: employees.map((e) => ({
          ...employeeCells(e),
          sector: e.department.name,
          puesto: e.position.name,
          categoria: e.category?.name ?? null,
          establecimiento: e.workplace.name,
          contratacion: e.contractType.name,
          ingreso: e.hireDate,
        })),
        empty,
      },
    ],
  };
}

async function movementsReport(rawQuery: unknown): Promise<ReportResult> {
  const query = movementsQuerySchema.parse(rawQuery);
  const current = periodOf(todayInTimeZone());
  let last = (query.hasta && parsePeriod(query.hasta)) || current;
  if (last > current) last = current;
  let first = (query.desde && parsePeriod(query.desde)) || addMonths(last, -11);
  if (first > last) first = last;
  if (addMonths(first, MAX_RANGE_MONTHS - 1) < last) first = addMonths(last, -(MAX_RANGE_MONTHS - 1));
  const start = first;
  const end = periodEnd(last);
  const today = todayInTimeZone();

  const [employees, described] = await Promise.all([repo.employmentHistory(query, end), describeStructure(query)]);
  const people = employees.map((e) => ({
    employee: e,
    periods: employmentPeriods({
      hireDate: e.hireDate,
      previousHires: e.changeHistory.map((h) => parseDisplayDate(h.oldValue)).filter((d): d is Date => d !== null),
      exits: e.exits.map((x) => x.exitDate),
    }),
  }));
  const inRange = (d: Date, from: Date, to: Date) => d >= from && d <= to;

  const hires = people.flatMap(({ employee, periods }) =>
    periods.filter((p) => inRange(p.start, start, end)).map((p) => ({ employee, date: p.start, rehire: p.rehire })),
  );
  const exits = people.flatMap(({ employee }) =>
    employee.exits.filter((x) => inRange(x.exitDate, start, end)).map((x) => ({ employee, exit: x })),
  );

  const months: Date[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m);
  const evolution = months.map((m) => {
    const close = periodEnd(m) > today ? today : periodEnd(m);
    return {
      mes: formatPeriod(m),
      altas: hires.filter((h) => inRange(h.date, m, periodEnd(m))).length,
      bajas: exits.filter((x) => inRange(x.exit.exitDate, m, periodEnd(m))).length,
      dotacion: people.filter((p) => employedOn(p.periods, close)).length,
    };
  });

  return {
    title: REPORTS["altas-y-bajas"].title,
    filters: [
      first.getTime() === last.getTime() ? formatPeriod(first) : `De ${formatPeriod(first)} a ${formatPeriod(last)}`,
      ...described,
      ...(described.length > 0
        ? ["Los filtros usan el sector, puesto y establecimiento actuales de cada persona."]
        : []),
    ],
    tables: [
      {
        id: "evolucion",
        title: "Evolución mensual",
        columns: [
          { key: "mes", label: "Mes" },
          { key: "altas", label: "Altas", type: "int" },
          { key: "bajas", label: "Bajas", type: "int" },
          { key: "dotacion", label: "Dotación al cierre", type: "int" },
        ],
        rows: evolution,
        totals: { mes: "Total", altas: hires.length, bajas: exits.length, dotacion: null },
        empty: "Sin meses en el rango.",
      },
      {
        id: "altas",
        title: "Altas",
        columns: [
          { key: "fecha", label: "Fecha", type: "date" },
          ...EMPLOYEE_COLUMNS,
          { key: "tipo", label: "Tipo" },
          { key: "sector", label: "Sector" },
          { key: "puesto", label: "Puesto" },
        ],
        rows: hires
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((h) => ({
            fecha: h.date,
            ...employeeCells(h.employee),
            tipo: h.rehire ? "Reingreso" : "Ingreso",
            sector: h.employee.department.name,
            puesto: h.employee.position.name,
          })),
        empty: "No hubo altas en el período.",
      },
      {
        id: "bajas",
        title: "Bajas",
        columns: [
          { key: "fecha", label: "Fecha", type: "date" },
          ...EMPLOYEE_COLUMNS,
          { key: "tipo", label: "Tipo de egreso" },
          { key: "motivo", label: "Motivo" },
          { key: "sector", label: "Sector" },
        ],
        rows: exits
          .sort((a, b) => a.exit.exitDate.getTime() - b.exit.exitDate.getTime())
          .map(({ employee, exit }) => ({
            fecha: exit.exitDate,
            ...employeeCells(employee),
            tipo: exit.exitType.label,
            motivo: exit.exitReason.label,
            sector: employee.department.name,
          })),
        empty: "No hubo egresos confirmados en el período.",
      },
    ],
  };
}

async function absenteeismReport(ctx: ActorContext, rawQuery: unknown): Promise<ReportResult> {
  const query = absenteeismQuerySchema.parse(rawQuery);
  const today = todayInTimeZone();
  const range = dateRange(query.desde, query.hasta, { from: periodOf(today), to: today });
  const { from, to } = range;
  const canSeeHealth = hasPermission(ctx, "document.sensitive:read");

  const employees = await repo.employeesInRange(query, from, to);
  const ids = employees.map((e) => e.id);
  const [absent, leaves, holidays, { defaultWorkDays }, described] = await Promise.all([
    repo.absentDays(ids, from, to),
    repo.absenteeismLeaves(ids, from, to),
    holidaysBetween(from, to),
    getSetting("leaves"),
    describeStructure(query),
  ]);
  const breakdown = absenceBreakdown({
    start: from,
    end: to,
    holidays,
    absentDays: absent,
    attendanceType: ATTENDANCE_ABSENCE,
    leaves: leaves.map((l) => ({
      ...l,
      type: l.leaveType.isSensitive && !canSeeHealth ? RESERVED_LEAVE : l.leaveType.name,
    })),
    employees: employees.map((e) => ({
      id: e.id,
      hireDate: e.hireDate,
      exitDate: e.exitDate,
      workDays: workDaysOf(e, defaultWorkDays),
    })),
  });

  const rows = employees.map((e) => ({ employee: e, ...breakdown.get(e.id)! }));
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  const lost = rows.reduce((s, r) => s + r.lost, 0);

  const sectors = new Map<string, typeof rows>();
  for (const r of rows)
    sectors.set(r.employee.department.name, [...(sectors.get(r.employee.department.name) ?? []), r]);
  const types = new Map<string, { days: number; people: Set<string> }>();
  for (const r of rows) {
    for (const [type, days] of r.byType) {
      const entry = types.get(type) ?? { days: 0, people: new Set<string>() };
      entry.days += days;
      entry.people.add(r.employee.id);
      types.set(type, entry);
    }
  }

  const rateColumns: Column[] = [
    { key: "previstos", label: "Días previstos", type: "int" },
    { key: "ausencia", label: "Días de ausencia", type: "int" },
    { key: "ausentismo", label: "Ausentismo", type: "percent" },
  ];
  const totals = { previstos: expected, ausencia: lost, ausentismo: rate(lost, expected) };

  return {
    title: REPORTS.ausentismo.title,
    filters: [
      `Del ${formatDate(from)} al ${formatDate(to)}`,
      ...described,
      "Ausencias de asistencia y licencias aprobadas de tipos que cuentan para el ausentismo, sobre los días hábiles de cada persona según su horario, sin feriados. Un día con ausencia y licencia se cuenta una vez, como licencia.",
    ],
    tables: [
      {
        id: "empleados",
        title: "Por empleado (con ausencias)",
        columns: [...EMPLOYEE_COLUMNS, { key: "sector", label: "Sector" }, ...rateColumns],
        rows: rows
          .filter((r) => r.lost > 0)
          .sort((a, b) => b.lost - a.lost || fullName(a.employee).localeCompare(fullName(b.employee), "es"))
          .map((r) => ({
            ...employeeCells(r.employee),
            sector: r.employee.department.name,
            previstos: r.expected,
            ausencia: r.lost,
            ausentismo: rate(r.lost, r.expected),
          })),
        totals: { legajo: null, empleado: `Total (${rows.length} personas)`, sector: null, ...totals },
        empty: "No hubo ausencias en el período.",
      },
      {
        id: "sectores",
        title: "Por sector",
        columns: [
          { key: "sector", label: "Sector" },
          { key: "personas", label: "Personas", type: "int" },
          { key: "conAusencias", label: "Con ausencias", type: "int" },
          ...rateColumns,
        ],
        rows: [...sectors]
          .sort(([a], [b]) => a.localeCompare(b, "es"))
          .map(([sector, list]) => {
            const e = list.reduce((s, r) => s + r.expected, 0);
            const l = list.reduce((s, r) => s + r.lost, 0);
            return {
              sector,
              personas: list.length,
              conAusencias: list.filter((r) => r.lost > 0).length,
              previstos: e,
              ausencia: l,
              ausentismo: rate(l, e),
            };
          }),
        totals: {
          sector: "Total",
          personas: rows.length,
          conAusencias: rows.filter((r) => r.lost > 0).length,
          ...totals,
        },
        empty: "No hay personal en el período con estos filtros.",
      },
      {
        id: "tipos",
        title: "Por tipo de ausencia",
        columns: [
          { key: "tipo", label: "Tipo" },
          { key: "dias", label: "Días", type: "int" },
          { key: "personas", label: "Personas", type: "int" },
        ],
        rows: [...types]
          .sort(([a, x], [b, y]) => y.days - x.days || a.localeCompare(b, "es"))
          .map(([tipo, t]) => ({ tipo, dias: t.days, personas: t.people.size })),
        totals: { tipo: "Total", dias: lost, personas: rows.filter((r) => r.lost > 0).length },
        empty: "No hubo ausencias en el período.",
      },
    ],
  };
}

async function vacationsReport(rawQuery: unknown): Promise<ReportResult> {
  const query = vacationsQuerySchema.parse(rawQuery);
  const year = query.anio ?? todayInTimeZone().getUTCFullYear();
  const [balances, described] = await Promise.all([
    repo.vacationBalances(query, year, query.estado === "activos"),
    describeStructure(query),
  ]);
  const usage = await balanceUsage(balances.map((b) => b.id));
  const rows = balances.map((b) => {
    const u = usage.get(b.id) ?? { used: 0, requested: 0 };
    const available = b.entitledDays + b.adjustmentDays + b.carriedOverDays;
    return { b, available, used: u.used, requested: u.requested, pending: available - u.used };
  });
  const sum = (list: typeof rows, pick: (r: (typeof rows)[number]) => number) => list.reduce((s, r) => s + pick(r), 0);
  const bySector = new Map<string, typeof rows>();
  for (const r of rows)
    bySector.set(r.b.employee.department.name, [...(bySector.get(r.b.employee.department.name) ?? []), r]);
  const dayColumns: Column[] = [
    { key: "disponibles", label: "Disponibles", type: "int" },
    { key: "utilizados", label: "Utilizados", type: "int" },
    { key: "solicitados", label: "Solicitados", type: "int" },
    { key: "pendientes", label: "Pendientes", type: "int" },
  ];
  const dayTotals = (list: typeof rows) => ({
    disponibles: sum(list, (r) => r.available),
    utilizados: sum(list, (r) => r.used),
    solicitados: sum(list, (r) => r.requested),
    pendientes: sum(list, (r) => r.pending),
  });

  return {
    title: REPORTS.vacaciones.title,
    filters: [
      `Período ${year}`,
      query.estado === "activos" ? "Personal activo" : "Personal activo y egresado",
      ...described,
      "Disponibles = corresponden + ajuste + arrastre. Pendientes = disponibles − utilizados (aprobados). Los solicitados todavía no descuentan.",
    ],
    tables: [
      {
        id: "empleados",
        title: "Por empleado",
        columns: [
          ...EMPLOYEE_COLUMNS,
          { key: "sector", label: "Sector" },
          { key: "corresponden", label: "Corresponden", type: "int" },
          { key: "ajuste", label: "Ajuste", type: "int" },
          { key: "arrastre", label: "Arrastre", type: "int" },
          ...dayColumns,
        ],
        rows: rows.map((r) => ({
          ...employeeCells(r.b.employee),
          sector: r.b.employee.department.name,
          corresponden: r.b.entitledDays,
          ajuste: r.b.adjustmentDays,
          arrastre: r.b.carriedOverDays,
          disponibles: r.available,
          utilizados: r.used,
          solicitados: r.requested,
          pendientes: r.pending,
        })),
        totals: {
          legajo: null,
          empleado: `Total (${rows.length})`,
          sector: null,
          corresponden: sum(rows, (r) => r.b.entitledDays),
          ajuste: sum(rows, (r) => r.b.adjustmentDays),
          arrastre: sum(rows, (r) => r.b.carriedOverDays),
          ...dayTotals(rows),
        },
        empty: `No hay períodos de vacaciones ${year} cargados con estos filtros.`,
      },
      {
        id: "sectores",
        title: "Por sector",
        columns: [
          { key: "sector", label: "Sector" },
          { key: "personas", label: "Personas", type: "int" },
          ...dayColumns,
        ],
        rows: [...bySector]
          .sort(([a], [b]) => a.localeCompare(b, "es"))
          .map(([sector, list]) => ({ sector, personas: list.length, ...dayTotals(list) })),
        totals: { sector: "Total", personas: rows.length, ...dayTotals(rows) },
        empty: `No hay períodos de vacaciones ${year} cargados con estos filtros.`,
      },
    ],
  };
}

async function expirationsReport(ctx: ActorContext, rawQuery: unknown): Promise<ReportResult> {
  const query = expirationsQuerySchema.parse(rawQuery);
  const today = todayInTimeZone();
  const { from, to } = dateRange(query.desde, query.hasta, { from: today, to: new Date(today.getTime() + 60 * DAY) });
  const canSeeHealth = hasPermission(ctx, "document.sensitive:read");
  const [documents, leaves, contracts, described] = await Promise.all([
    repo.expiringDocuments(query, from, to),
    repo.endingLeaves(query, from, to),
    repo.endingContracts(query, from, to),
    describeStructure(query),
  ]);
  const state = (date: Date) => (date < today ? "Vencido" : "Por vencer");
  return {
    title: REPORTS.vencimientos.title,
    filters: [`Del ${formatDate(from)} al ${formatDate(to)}`, "Personal activo", ...described],
    tables: [
      {
        id: "documentos",
        title: "Documentación",
        columns: [
          { key: "fecha", label: "Vence", type: "date" },
          ...EMPLOYEE_COLUMNS,
          { key: "documento", label: "Documento" },
          { key: "estado", label: "Estado" },
          { key: "renovado", label: "Renovado" },
        ],
        rows: documents.map((d) => ({
          fecha: d.expiryDate,
          ...employeeCells(d.employee),
          documento: d.documentType.isSensitive && !canSeeHealth ? RESERVED_DOCUMENT : d.documentType.name,
          estado: state(d.expiryDate!),
          renovado: yesNo(d.renewed),
        })),
        empty: "No hay documentos que venzan en el rango.",
      },
      {
        id: "licencias",
        title: "Licencias que terminan",
        columns: [
          { key: "fecha", label: "Termina", type: "date" },
          ...EMPLOYEE_COLUMNS,
          { key: "licencia", label: "Licencia" },
          { key: "desde", label: "Desde", type: "date" },
        ],
        rows: leaves.map((l) => ({
          fecha: l.endDate,
          ...employeeCells(l.employee),
          licencia: l.leaveType.isSensitive && !canSeeHealth ? RESERVED_LEAVE : l.leaveType.name,
          desde: l.startDate,
        })),
        empty: "No hay licencias aprobadas que terminen en el rango.",
      },
      {
        id: "contratos",
        title: "Contratos a plazo que terminan",
        columns: [
          { key: "fecha", label: "Termina", type: "date" },
          ...EMPLOYEE_COLUMNS,
          { key: "contratacion", label: "Contratación" },
          { key: "puesto", label: "Puesto" },
        ],
        rows: contracts.map((e) => ({
          fecha: e.contractEndDate,
          ...employeeCells(e),
          contratacion: e.contractType.name,
          puesto: e.position.name,
        })),
        empty: "No hay contratos a plazo que terminen en el rango.",
      },
    ],
  };
}

async function seniorityReport(rawQuery: unknown): Promise<ReportResult> {
  const query = seniorityQuerySchema.parse(rawQuery);
  const date = (query.fecha && parseIsoDate(query.fecha)) || todayInTimeZone();
  const [employees, setting, described] = await Promise.all([
    repo.activeEmployees(query),
    getSetting("seniority"),
    describeStructure(query),
  ]);
  const ranges = seniorityRanges([setting.limit1, setting.limit2, setting.limit3, setting.limit4, setting.limit5]);
  const rows = employees
    .filter((e) => e.hireDate <= date)
    .map((e) => {
      const s = seniority(e.seniorityDate, date);
      return { e, s, range: rangeOf(ranges, s.years) };
    })
    .sort((a, b) => a.e.seniorityDate.getTime() - b.e.seniorityDate.getTime());
  const total = rows.length;
  return {
    title: REPORTS.antiguedad.title,
    filters: [
      `Personal activo, antigüedad al ${formatDate(date)}`,
      ...described,
      "Desde la fecha de antigüedad reconocida. Los rangos se ajustan en Configuración → Parámetros → Rangos de antigüedad.",
    ],
    tables: [
      {
        id: "rangos",
        title: "Por rango",
        columns: [
          { key: "rango", label: "Rango" },
          { key: "personas", label: "Personas", type: "int" },
          { key: "porcentaje", label: "%", type: "percent" },
        ],
        rows: ranges.map((r) => {
          const count = rows.filter((x) => x.range === r).length;
          return { rango: r.label, personas: count, porcentaje: total > 0 ? count / total : null };
        }),
        totals: { rango: "Total", personas: total, porcentaje: total > 0 ? 1 : null },
        empty: "No hay personal activo con estos filtros.",
      },
      {
        id: "detalle",
        title: "Detalle",
        columns: [
          ...EMPLOYEE_COLUMNS,
          { key: "sector", label: "Sector" },
          { key: "puesto", label: "Puesto" },
          { key: "desde", label: "Antigüedad desde", type: "date" },
          { key: "antiguedad", label: "Antigüedad" },
          { key: "anios", label: "Años cumplidos", type: "int" },
          { key: "rango", label: "Rango" },
        ],
        rows: rows.map(({ e, s, range }) => ({
          ...employeeCells(e),
          sector: e.department.name,
          puesto: e.position.name,
          desde: e.seniorityDate,
          antiguedad: formatSeniority(s),
          anios: s.years,
          rango: range.label,
        })),
        empty: "No hay personal activo con estos filtros.",
      },
    ],
  };
}

async function salaryReport(rawQuery: unknown): Promise<ReportResult> {
  const query = salaryQuerySchema.parse(rawQuery);
  const period =
    (query.periodo && parsePeriod(query.periodo)) || (await repo.latestPayrollPeriod()) || periodOf(todayInTimeZone());
  const [records, described] = await Promise.all([repo.payrollRecords(query, period), describeStructure(query)]);
  const money = (list: typeof records) => ({
    bruto: Number(sumAmounts(list.map((r) => r.grossReported))),
    descuentos: Number(sumAmounts(list.map((r) => r.deductionsReported))),
    neto: Number(sumAmounts(list.map((r) => r.netReported))),
  });
  const moneyColumns: Column[] = [
    { key: "bruto", label: "Bruto informado", type: "money" },
    { key: "descuentos", label: "Descuentos informados", type: "money" },
    { key: "neto", label: "Neto informado", type: "money" },
  ];
  const bySector = new Map<string, typeof records>();
  for (const r of records)
    bySector.set(r.employee.department.name, [...(bySector.get(r.employee.department.name) ?? []), r]);
  const empty = `No hay resúmenes informados de ${formatPeriod(period)} con estos filtros.`;
  return {
    title: REPORTS.remuneraciones.title,
    notice: SALARY_NOTICE,
    filters: [`Período ${formatPeriod(period)}`, ...described],
    tables: [
      {
        id: "sectores",
        title: "Por sector",
        columns: [
          { key: "sector", label: "Sector" },
          { key: "personas", label: "Personas", type: "int" },
          ...moneyColumns,
        ],
        rows: [...bySector]
          .sort(([a], [b]) => a.localeCompare(b, "es"))
          .map(([sector, list]) => ({ sector, personas: list.length, ...money(list) })),
        totals: { sector: "Total", personas: records.length, ...money(records) },
        empty,
      },
      {
        id: "detalle",
        title: "Detalle",
        columns: [
          ...EMPLOYEE_COLUMNS,
          { key: "sector", label: "Sector" },
          ...moneyColumns,
          { key: "origen", label: "Origen" },
        ],
        rows: records.map((r) => ({
          ...employeeCells(r.employee),
          sector: r.employee.department.name,
          bruto: Number(r.grossReported.toString()),
          descuentos: Number(r.deductionsReported.toString()),
          neto: Number(r.netReported.toString()),
          origen: r.source === "MANUAL" ? "Carga manual" : "Importación",
        })),
        totals: { legajo: null, empleado: `Total (${records.length})`, sector: null, ...money(records), origen: null },
        empty,
      },
    ],
  };
}
