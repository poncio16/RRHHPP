import { beforeAll, describe, expect, it } from "vitest";
import { exportEmployeeList } from "@/features/employees/service";
import { exportResource } from "@/features/reports/export";
import { canSeeReport, runReport } from "@/features/reports/service";
import { addMonths, periodKey, periodOf, todayInTimeZone } from "@/lib/format";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<
  "department" | "position" | "contract" | "workplace" | "ana" | "beto" | "exitType" | "reason",
  string
>;

const today = todayInTimeZone();
const thisMonth = periodOf(today);
const lastMonth = addMonths(thisMonth, -1);

async function createEmployee(name: string, extra: Record<string, unknown> = {}) {
  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  return db.employee.create({
    data: {
      fileNumber: 900_000 + Math.floor(Math.random() * 90_000),
      lastName: "Reportes",
      firstName: `${name} ${tag}`,
      dni: String(10_000_000 + Math.floor(Math.random() * 9_000_000)),
      cuil: `20${Math.floor(Math.random() * 1e9)}`.padEnd(11, "0").slice(0, 11),
      birthDate: new Date("1990-01-01"),
      sex: "M",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: province.id,
      postalCode: "9400",
      hireDate: new Date("2018-05-02"),
      seniorityDate: new Date("2018-05-02"),
      departmentId: refs.department,
      positionId: refs.position,
      contractTypeId: refs.contract,
      workplaceId: refs.workplace,
      ...extra,
    },
  });
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba un error");
}

const filter = () => ({ sector: refs.department });

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  refs.department = (await db.department.create({ data: { name: `Rep sector ${tag}` } })).id;
  refs.position = (await db.position.create({ data: { name: `Rep puesto ${tag}` } })).id;
  refs.contract = (await db.contractType.create({ data: { name: `Rep contrato ${tag}` } })).id;
  refs.workplace = (await db.workplace.create({ data: { name: `Rep lugar ${tag}` } })).id;
  refs.exitType = (
    await db.lookupValue.create({ data: { group: "TIPO_EGRESO", code: `REP_${tag}`, label: `Renuncia ${tag}` } })
  ).id;
  refs.reason = (
    await db.lookupValue.create({ data: { group: "MOTIVO_EGRESO", code: `REP_${tag}`, label: `Motivo ${tag}` } })
  ).id;

  // Ana: activa desde 2018. Beto: ingresó el mes pasado y egresó este mes.
  refs.ana = (await createEmployee("Ana")).id;
  const exitDay = today;
  refs.beto = (
    await createEmployee("Beto", {
      hireDate: lastMonth,
      seniorityDate: lastMonth,
      status: "EGRESADO",
      exitDate: exitDay,
    })
  ).id;
  await db.employeeExit.create({
    data: {
      employeeId: refs.beto,
      exitDate: exitDay,
      exitTypeId: refs.exitType,
      exitReasonId: refs.reason,
      status: "CONFIRMADO",
      createdById: rrhh.userId,
      confirmedById: rrhh.userId,
      confirmedAt: new Date(),
    },
  });
  await db.payrollRecord.create({
    data: {
      employeeId: refs.ana,
      period: lastMonth,
      grossReported: "1000.10",
      deductionsReported: "170.05",
      netReported: "830.05",
    },
  });
});

describe("reportes", () => {
  it("cada rol ve solo sus reportes, también en el servidor", async () => {
    expect(canSeeReport(consulta, "dotacion")).toBe(true);
    expect(canSeeReport(consulta, "ausentismo")).toBe(false);
    expect(canSeeReport(administracion, "remuneraciones")).toBe(true);
    expect(canSeeReport(administracion, "vencimientos")).toBe(false);
    expect(await errorOf(runReport(consulta, "ausentismo", {}))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(runReport(administracion, "antiguedad", {}))).toBeInstanceOf(ForbiddenError);
  });

  it("dotación: solo activos, agrupados y filtrados por sector", async () => {
    const result = await runReport(consulta, "dotacion", filter());
    expect(result.filters.join(" ")).toMatch(`Rep sector ${tag}`);
    const detail = result.tables.find((t) => t.id === "detalle")!;
    expect(detail.rows.map((r) => r.empleado)).toEqual([`Reportes, Ana ${tag}`]);
    const bySector = result.tables.find((t) => t.id === "sector")!;
    expect(bySector.rows).toEqual([{ grupo: `Rep sector ${tag}`, personas: 1, porcentaje: 1 }]);
  });

  it("altas y bajas: ingreso del mes pasado, egreso de este mes y dotación al cierre", async () => {
    const result = await runReport(rrhh, "altas-y-bajas", {
      ...filter(),
      desde: periodKey(lastMonth),
      hasta: periodKey(addMonths(thisMonth, 3)),
    });
    const [evolution, hires, exits] = result.tables;
    expect(evolution!.rows).toHaveLength(2); // los meses futuros no se muestran
    expect(evolution!.rows[0]).toMatchObject({ altas: 1, bajas: 0, dotacion: 2 });
    expect(evolution!.rows[1]).toMatchObject({ altas: 0, bajas: 1 });
    expect(hires!.rows.map((r) => r.tipo)).toEqual(["Ingreso"]);
    expect(exits!.rows[0]).toMatchObject({ tipo: `Renuncia ${tag}`, motivo: `Motivo ${tag}` });
  });

  it("antigüedad: usa los rangos de Parámetros", async () => {
    const result = await runReport(rrhh, "antiguedad", filter());
    const ranges = result.tables.find((t) => t.id === "rangos")!;
    const withPeople = ranges.rows.filter((r) => r.personas === 1);
    expect(withPeople).toHaveLength(1);
    expect(String(withPeople[0]!.rango)).toMatch(/De 5 a menos de 10|10 años o más/);
  });

  it("remuneraciones: suma en centavos y lleva el aviso de información informada", async () => {
    const result = await runReport(administracion, "remuneraciones", { ...filter(), periodo: periodKey(lastMonth) });
    expect(result.notice).toMatch(/no constituye liquidación/);
    const detail = result.tables.find((t) => t.id === "detalle")!;
    expect(detail.totals).toMatchObject({ bruto: 1000.1, descuentos: 170.05, neto: 830.05 });
  });
});

describe("exportación", () => {
  it("exige el permiso de exportar y queda en la auditoría", async () => {
    expect(await errorOf(exportResource(consulta, "dotacion", {}))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(exportResource(rrhh, "no-existe", {}))).toBeInstanceOf(NotFoundError);
    expect(await errorOf(exportResource(rrhh, "dotacion", { tabla: "otra" }))).toBeInstanceOf(NotFoundError);

    const file = await exportResource(rrhh, "dotacion", { ...filter(), formato: "csv", tabla: "detalle" });
    expect(file.fileName).toMatch(/^dotacion-detalle-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(String(file.body)).toContain(`Reportes, Ana ${tag}`);
    const audit = await lastAudit({ userId: rrhh.userId });
    expect(audit?.action).toBe("EXPORT");
    expect(audit?.message).toMatch(/Dotación \(CSV, 1 fila\)/);

    const xlsx = await exportResource(administracion, "remuneraciones", { formato: "xlsx" });
    expect(xlsx.contentType).toMatch(/spreadsheetml/);
  });

  it("el listado de empleados no exporta DNI ni CUIL sin permiso de datos personales", async () => {
    const consultaExport = await exportEmployeeList(consulta, { departmentId: refs.department, status: "todos" });
    const columns = consultaExport.tables[0]!.columns.map((c) => c.key);
    expect(columns).not.toContain("dni");
    expect(consultaExport.tables[0]!.rows).toHaveLength(2);
    const full = await exportEmployeeList(rrhh, { departmentId: refs.department });
    expect(full.tables[0]!.columns.map((c) => c.key)).toContain("cuil");
    expect(full.tables[0]!.rows).toHaveLength(1);
  });
});
