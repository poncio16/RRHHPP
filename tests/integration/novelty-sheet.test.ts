import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as novelties from "@/features/novelties/service";
import { exportResource } from "@/features/reports/export";
import type { ReportTable } from "@/features/reports/table";
import type { NoveltyStatus } from "@/generated/prisma/client";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

/*
 * Planilla de novedades para el contador. Todo queda en un sector propio y se
 * filtra por él; los tipos con columna de otras pruebas o del seed pueden
 * aparecer como columnas en 0 y se ignoran.
 */

const tag = Date.now().toString(36);
const PERIOD = "2025-06";
const JUNE = new Date("2025-06-01");
let rrhh: ActorContext;
let onlyNovelties: ActorContext;
let noExport: ActorContext;
let onlyExport: ActorContext;

const refs = {} as Record<"department" | "category" | "admin", string>;
const type = {} as Record<
  "qty" | "amount" | "both" | "count" | "linked" | "inactiveUsed" | "inactiveUnused" | "noColumn" | "salary" | "first",
  string
>;
const emp = {} as Record<
  "ana" | "beto" | "before" | "after" | "left" | "late" | "moved",
  { id: string; fileNumber: number }
>;

let nextFile = 700_000 + Math.floor(Math.random() * 90_000);

async function createEmployee(
  name: string,
  dates: { hire: string; exit?: string },
  extra: { workdayTypeId?: string; workScheduleId?: string; categoryId?: string } = {},
) {
  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  const employee = await db.employee.create({
    data: {
      fileNumber: (nextFile += 1),
      lastName: "Planilla",
      firstName: `${name} ${tag}`,
      dni: String(10_000_000 + Math.floor(Math.random() * 9_000_000)),
      cuil: `27${Math.floor(Math.random() * 1e9)}`.padEnd(11, "0").slice(0, 11),
      birthDate: new Date("1990-01-01"),
      sex: "F",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: province.id,
      postalCode: "9400",
      hireDate: new Date(dates.hire),
      seniorityDate: new Date(dates.hire),
      exitDate: dates.exit ? new Date(dates.exit) : null,
      status: dates.exit ? "EGRESADO" : "ACTIVO",
      departmentId: refs.department,
      positionId: (await db.position.create({ data: { name: `Planilla puesto ${name} ${tag}` } })).id,
      contractTypeId: (await db.contractType.create({ data: { name: `Planilla contrato ${name} ${tag}` } })).id,
      workplaceId: (await db.workplace.create({ data: { name: `Planilla lugar ${name} ${tag}` } })).id,
      ...extra,
    },
  });
  return { id: employee.id, fileNumber: employee.fileNumber };
}

async function noveltyType(
  key: keyof typeof type,
  data: { sheetColumn?: number; requiresQuantity?: boolean; requiresAmount?: boolean; isActive?: boolean },
) {
  type[key] = (
    await db.noveltyType.create({
      data: { name: `Planilla ${key} ${tag}`, nature: "INFORMATIVO", quantityUnit: "días", ...data },
    })
  ).id;
}

async function novelty(
  employee: keyof typeof emp,
  noveltyType: keyof typeof type,
  data: { status?: NoveltyStatus; quantity?: string; amount?: string; period?: Date; sourceType?: string },
) {
  const period = data.period ?? JUNE;
  await db.novelty.create({
    data: {
      employeeId: emp[employee].id,
      noveltyTypeId: type[noveltyType],
      date: period,
      period,
      quantity: data.quantity ?? null,
      amount: data.amount ?? null,
      status: data.status ?? "APROBADA",
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceType ? crypto.randomUUID() : null,
      createdById: refs.admin,
      updatedById: refs.admin,
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

async function roleActor(code: string, permissions: string[]) {
  const role = await db.role.upsert({
    where: { code },
    update: {},
    create: {
      code,
      name: `${code} (test)`,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });
  return actorFor((await createTestUser(role.code)).id);
}

const sheetOf = async (ctx: ActorContext, query: Record<string, string> = {}) =>
  (await novelties.exportNoveltySheet(ctx, { periodo: PERIOD, sector: refs.department, ...query })).tables[0]!;

const rowOf = (table: ReportTable, who: keyof typeof emp) => table.rows.find((r) => r.legajo === emp[who].fileNumber);

beforeAll(async () => {
  const admin = await createTestUser("ADMIN");
  refs.admin = admin.id;
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  onlyNovelties = await roleActor("PLANILLA_SOLO_NOVEDADES", ["novelty:read", "export:run"]);
  noExport = await roleActor("PLANILLA_SIN_EXPORTAR", ["novelty:read"]);
  onlyExport = await roleActor("PLANILLA_SOLO_EXPORTAR", ["export:run"]);

  refs.department = (await db.department.create({ data: { name: `Planilla sector ${tag}` } })).id;
  refs.category = (await db.category.create({ data: { name: `Planilla categoría ${tag}` } })).id;
  const workday = await db.workdayType.create({ data: { name: `Planilla jornada ${tag}`, weeklyHours: "48" } });
  const schedule = await db.workSchedule.create({ data: { name: `Planilla horario ${tag}`, weeklyHours: "22.5" } });

  emp.ana = await createEmployee(
    "Ana",
    { hire: "2020-03-01" },
    { workdayTypeId: workday.id, workScheduleId: schedule.id, categoryId: refs.category },
  );
  emp.beto = await createEmployee("Beto", { hire: "2025-06-20" }, { workScheduleId: schedule.id });
  emp.before = await createEmployee("Antes", { hire: "2020-01-01", exit: "2025-05-31" });
  emp.after = await createEmployee("Después", { hire: "2025-07-01" });
  emp.left = await createEmployee("Egresada", { hire: "2021-01-01", exit: "2025-06-10" });
  emp.late = await createEmployee("Tardía", { hire: "2025-07-10" });

  // Cambios cargados después del cierre: la planilla de junio muestra lo que regía el 30/06.
  const catOld = await db.category.create({ data: { name: `Planilla cat. junio ${tag}` } });
  const catMid = await db.category.create({ data: { name: `Planilla cat. julio ${tag}` } });
  const catNew = await db.category.create({ data: { name: `Planilla cat. agosto ${tag}` } });
  const wdOther = await db.workdayType.create({ data: { name: `Planilla jornada mayo ${tag}`, weeklyHours: "30" } });
  const wdNew = await db.workdayType.create({ data: { name: `Planilla jornada julio ${tag}`, weeklyHours: "40" } });
  emp.moved = await createEmployee(
    "Cambiada",
    { hire: "2020-01-01" },
    { categoryId: catNew.id, workdayTypeId: wdNew.id },
  );
  for (const [field, changeType, oldRefId, newRefId, effectiveDate] of [
    ["categoryId", "CATEGORIA", catOld.id, catMid.id, "2025-07-01"],
    ["categoryId", "CATEGORIA", catMid.id, catNew.id, "2025-08-01"],
    ["workdayTypeId", "JORNADA", wdOther.id, null, "2025-06-15"],
    ["workdayTypeId", "JORNADA", null, wdNew.id, "2025-07-20"],
  ] as const) {
    await db.employeeChangeHistory.create({
      data: {
        employeeId: emp.moved.id,
        changeSetId: crypto.randomUUID(),
        changeType,
        field,
        oldRefId,
        newRefId,
        effectiveDate: new Date(effectiveDate),
        createdById: admin.id,
      },
    });
  }

  for (const [effectiveDate, basicSalary] of [
    ["2025-01-01", "1000.00"],
    ["2025-06-15", "1200.00"],
    ["2025-07-01", "1300.00"],
  ] as const) {
    await db.salaryHistory.create({
      data: { employeeId: emp.ana.id, effectiveDate: new Date(effectiveDate), basicSalary, createdById: admin.id },
    });
  }

  await noveltyType("first", { sheetColumn: 80, requiresQuantity: true });
  await noveltyType("qty", { sheetColumn: 81, requiresQuantity: true });
  await noveltyType("amount", { sheetColumn: 82, requiresAmount: true });
  await noveltyType("both", { sheetColumn: 83, requiresQuantity: true, requiresAmount: true });
  await noveltyType("count", { sheetColumn: 84 });
  await noveltyType("linked", { sheetColumn: 85 });
  await noveltyType("inactiveUsed", { sheetColumn: 86, isActive: false });
  await noveltyType("inactiveUnused", { sheetColumn: 87, isActive: false });
  await noveltyType("salary", { sheetColumn: 88, requiresAmount: true });
  await noveltyType("noColumn", { requiresQuantity: true });
  await db.leaveType.create({
    data: {
      name: `Planilla licencia ${tag}`,
      class: "LICENCIA",
      countingMode: "CORRIDOS",
      generatesNoveltyTypeId: type.linked,
    },
  });

  await novelty("ana", "qty", { quantity: "1.50" });
  await novelty("ana", "qty", { quantity: "2.25", status: "INFORMADA" });
  await novelty("ana", "qty", { quantity: "10.00", status: "PENDIENTE" });
  await novelty("ana", "qty", { quantity: "5.00", status: "ANULADA" });
  await novelty("ana", "amount", { amount: "100.10" });
  await novelty("ana", "amount", { amount: "200.20" });
  await novelty("ana", "amount", { amount: "999.00", period: new Date("2025-07-01") });
  await novelty("ana", "both", { quantity: "2.00", amount: "50.00" });
  await novelty("ana", "count", {});
  await novelty("ana", "count", {});
  await novelty("ana", "linked", { quantity: "3.00", sourceType: "LEAVE" });
  await novelty("ana", "inactiveUsed", {});
  await novelty("ana", "noColumn", { quantity: "7.00" });
  await novelty("ana", "salary", { amount: "5000.00", sourceType: "SALARY_HISTORY" });
  await novelty("late", "qty", { quantity: "4.00" });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("planilla de novedades para el contador", () => {
  it("una fila por empleado con relación laboral en el período, por legajo", async () => {
    const table = await sheetOf(rrhh);
    expect(table.rows.map((r) => r.legajo)).toEqual(
      [emp.ana, emp.beto, emp.left, emp.late, emp.moved].map((e) => e.fileNumber).sort((a, b) => a - b),
    );
    expect(rowOf(table, "before")).toBeUndefined();
    expect(rowOf(table, "after")).toBeUndefined();
    expect(table.sheet?.heading).toBeTruthy();
  });

  it("datos del legajo: CUIL, categoría, ingreso, jornada y básico vigente al fin de mes", async () => {
    const table = await sheetOf(rrhh);
    expect(table.columns.slice(0, 7).map((c) => c.key)).toEqual([
      "legajo",
      "nombre",
      "cuil",
      "categoria",
      "ingreso",
      "jornada",
      "sueldo",
    ]);
    const ana = rowOf(table, "ana")!;
    const cuil = (await db.employee.findUniqueOrThrow({ where: { id: emp.ana.id } })).cuil;
    expect(ana).toMatchObject({
      nombre: `Planilla, Ana ${tag}`,
      cuil,
      categoria: `Planilla categoría ${tag}`,
      ingreso: new Date("2020-03-01"),
      // La jornada del legajo manda sobre las horas del horario.
      jornada: 48,
      sueldo: 1200,
    });
    // Sin jornada usa las horas del horario; sin básico queda vacío.
    expect(rowOf(table, "beto")).toMatchObject({ jornada: 22.5, sueldo: null, categoria: null });
    expect(rowOf(table, "left")).toMatchObject({ jornada: null });
  });

  it("categoría y jornada como estaban el último día del mes, aunque después cambiaron", async () => {
    // Categoría: el primer cambio posterior dice cuál regía. Jornada: el 15/06 se quitó y recién en julio se
    // asignó la actual, así que a fin de junio no tenía (ni horario).
    expect(rowOf(await sheetOf(rrhh), "moved")).toMatchObject({
      categoria: `Planilla cat. junio ${tag}`,
      jornada: null,
    });
    // En agosto ya rige todo lo actual.
    expect(rowOf(await sheetOf(rrhh, { periodo: "2025-08" }), "moved")).toMatchObject({
      categoria: `Planilla cat. agosto ${tag}`,
      jornada: 40,
    });
    // En julio, la categoría intermedia y la jornada asignada el 20/07.
    expect(rowOf(await sheetOf(rrhh, { periodo: "2025-07" }), "moved")).toMatchObject({
      categoria: `Planilla cat. julio ${tag}`,
      jornada: 40,
    });
  });

  it("columnas por tipo en su orden; suma aprobadas e informadas del período", async () => {
    const table = await sheetOf(rrhh);
    const keys = table.columns.map((c) => c.key);
    const mine = keys.filter((k) => Object.values(type).some((id) => k.endsWith(id)));
    expect(mine).toEqual([
      `quantity:${type.first}`,
      `quantity:${type.qty}`,
      `amount:${type.amount}`,
      `quantity:${type.both}`,
      `amount:${type.both}`,
      `count:${type.count}`,
      `quantity:${type.linked}`,
      `count:${type.inactiveUsed}`,
      `amount:${type.salary}`,
    ]);
    const column = (key: string) => table.columns.find((c) => c.key === key)!;
    expect(column(`quantity:${type.qty}`)).toEqual({
      key: `quantity:${type.qty}`,
      label: `Planilla qty ${tag}`,
      type: "decimal",
    });
    expect(column(`quantity:${type.both}`).label).toBe(`Planilla both ${tag} (días)`);
    expect(column(`amount:${type.both}`)).toMatchObject({ label: `Planilla both ${tag} ($)`, type: "money" });
    expect(column(`count:${type.count}`).type).toBe("int");

    const ana = rowOf(table, "ana")!;
    expect(ana[`quantity:${type.first}`]).toBe(0);
    expect(ana[`quantity:${type.qty}`]).toBe(3.75);
    expect(ana[`amount:${type.amount}`]).toBe(300.3);
    expect(ana[`quantity:${type.both}`]).toBe(2);
    expect(ana[`amount:${type.both}`]).toBe(50);
    expect(ana[`count:${type.count}`]).toBe(2);
    expect(ana[`quantity:${type.linked}`]).toBe(3);
    expect(ana[`count:${type.inactiveUsed}`]).toBe(1);
    expect(ana[`amount:${type.salary}`]).toBe(5000);
    expect(rowOf(table, "late")![`quantity:${type.qty}`]).toBe(4);
    // Los demás quedan en 0, como en una planilla completa.
    expect(mine.map((k) => rowOf(table, "beto")![k])).toEqual(mine.map(() => 0));
  });

  it("avisa las pendientes que no entran y aplica búsqueda y sector", async () => {
    const result = await novelties.exportNoveltySheet(rrhh, { periodo: PERIOD, sector: refs.department });
    expect(result.filters).toContain("Novedades de junio de 2025, aprobadas e informadas.");
    expect(result.filters).toContain(`Sector: Planilla sector ${tag} (el actual de cada empleado)`);
    expect(result.filters).toContain("Hay 1 novedad pendiente de aprobar en el período: no está en la planilla.");

    const byFile = await sheetOf(rrhh, { q: String(emp.beto.fileNumber) });
    expect(byFile.rows.map((r) => r.legajo)).toEqual([emp.beto.fileNumber]);
    const byName = await sheetOf(rrhh, { q: `Egresada ${tag}` });
    expect(byName.rows.map((r) => r.legajo)).toEqual([emp.left.fileNumber]);
  });

  it("sin datos personales ni salariales: sin CUIL, sin básico y sin importes de cambios de básico", async () => {
    const result = await novelties.exportNoveltySheet(onlyNovelties, { periodo: PERIOD, sector: refs.department });
    const table = result.tables[0]!;
    const keys = table.columns.map((c) => c.key);
    expect(keys).not.toContain("cuil");
    expect(keys).not.toContain("sueldo");
    const ana = rowOf(table, "ana")!;
    expect(ana).not.toHaveProperty("cuil");
    expect(ana).not.toHaveProperty("sueldo");
    expect(ana[`amount:${type.salary}`]).toBe(0);
    expect(ana[`amount:${type.amount}`]).toBe(300.3);
    expect(result.filters).toContain("Sin el permiso de datos personales no se incluye el CUIL.");
    expect(result.filters).toContain(
      "Sin el permiso de información salarial no se incluyen el sueldo básico ni los importes de los cambios de básico.",
    );
  });

  it("se exporta en Excel con formato de planilla y queda en la auditoría", async () => {
    const file = await exportResource(rrhh, "planilla-novedades", {
      periodo: PERIOD,
      sector: refs.department,
      formato: "xlsx",
    });
    expect(file.fileName).toMatch(/^planilla-novedades-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as never);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.name).toBe("Novedades");
    const company = await db.company.findFirst();
    expect(sheet.getCell("A1").value).toBe(
      company ? (company.tradeName ?? company.legalName) : "Planilla de novedades",
    );
    let header = 0;
    sheet.eachRow((row, n) => {
      if (row.getCell(1).value === "Legajo") header = n;
    });
    expect(header).toBeGreaterThan(1);
    const label = sheet.getRow(header).getCell(2);
    expect(label.value).toBe("Apellido y nombre");
    expect(label.fill).toMatchObject({ type: "pattern", pattern: "solid" });
    expect(label.border?.bottom?.style).toBe("thin");
    expect(label.alignment?.wrapText).toBe(true);
    const first = sheet.getRow(header + 1);
    expect(first.getCell(1).value).toBe(
      Math.min(...[emp.ana, emp.beto, emp.left, emp.late, emp.moved].map((e) => e.fileNumber)),
    );
    expect(first.getCell(2).font?.name).toBe("Arial");
    expect(first.getCell(2).border?.left?.style).toBe("thin");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: header, xSplit: 2 });
    expect(sheet.pageSetup).toMatchObject({ orientation: "landscape", fitToPage: true, fitToWidth: 1 });
    expect(sheet.getCell("A2").font?.name).toBe("Arial");

    const audit = await lastAudit({ userId: rrhh.userId });
    expect(audit).toMatchObject({ action: "EXPORT", module: "novedades", entityType: "Listado" });
    expect(audit?.after).toMatchObject({ recurso: "planilla-novedades", formato: "xlsx", filas: 5 });
  });

  it("pide exportar y ver novedades", async () => {
    expect(
      await errorOf(exportResource(noExport, "planilla-novedades", { periodo: PERIOD, formato: "xlsx" })),
    ).toBeInstanceOf(ForbiddenError);
    expect(
      await errorOf(exportResource(onlyExport, "planilla-novedades", { periodo: PERIOD, formato: "xlsx" })),
    ).toBeInstanceOf(ForbiddenError);
  });
});
