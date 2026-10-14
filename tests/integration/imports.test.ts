import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { IMPORT_COLUMNS } from "@/features/imports/columns";
import {
  canImport,
  confirmImport,
  discardImport,
  getImportJob,
  getTemplate,
  validateImport,
} from "@/features/imports/service";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let consulta: ActorContext;
let administracion: ActorContext;
const tag = Date.now().toString(36);
const names = {
  dept: `Imp sector ${tag}`,
  position: `Imp puesto ${tag}`,
  contract: `Imp contrato ${tag}`,
  workplace: `Imp lugar ${tag}`,
};

let dniSeq = 36_000_000 + Math.floor(Math.random() * 3_000_000);
function nextPerson() {
  for (;;) {
    const dni = String(dniSeq++);
    const base = `20${dni}`;
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(base[i]), 0);
    const check = 11 - (sum % 11);
    if (check === 10) continue;
    return { dni, cuil: `${base}${check === 11 ? 0 : check}` };
  }
}

const HEADERS = [
  "Apellido",
  "Nombre",
  "DNI",
  "CUIL",
  "Fecha de nacimiento",
  "Sexo",
  "Domicilio",
  "Localidad",
  "Provincia",
  "Código postal",
  "Fecha de ingreso",
  "Sector",
  "Puesto",
  "Tipo de contratación",
  "Establecimiento",
];

function line(firstName: string, person = nextPerson(), overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    Apellido: "Importado",
    Nombre: `${firstName} ${tag}`,
    DNI: person.dni,
    CUIL: person.cuil,
    "Fecha de nacimiento": "12/04/1990",
    Sexo: "F",
    Domicilio: "Calle 1",
    Localidad: "Ciudad",
    Provincia: "Tucumán",
    "Código postal": "4000",
    "Fecha de ingreso": "01/03/2021",
    Sector: names.dept,
    Puesto: names.position,
    "Tipo de contratación": names.contract,
    Establecimiento: names.workplace,
    ...overrides,
  };
  return HEADERS.map((h) => values[h]).join(";");
}

const csv = (lines: string[], headers = HEADERS) => new File([[headers.join(";"), ...lines].join("\n")], "alta.csv");
const imported = () => db.employee.findMany({ where: { lastName: "Importado", firstName: { endsWith: tag } } });

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba un error");
}

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  await db.province.upsert({ where: { code: "AR-T" }, update: {}, create: { code: "AR-T", name: "Tucumán" } });
  await db.department.create({ data: { name: names.dept } });
  await db.position.create({ data: { name: names.position } });
  await db.contractType.create({ data: { name: names.contract } });
  await db.workplace.create({ data: { name: names.workplace } });
});

describe("importación de empleados", () => {
  it("solo RRHH y Administrador pueden importar", async () => {
    expect(canImport(rrhh)).toBe(true);
    expect(canImport(consulta)).toBe(false);
    expect(canImport(administracion)).toBe(false);
    expect(await errorOf(validateImport(consulta, csv([line("X")])))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(getTemplate(administracion))).toBeInstanceOf(ForbiddenError);
  });

  it("rechaza archivos con columnas obligatorias faltantes", async () => {
    const error = await errorOf(validateImport(rrhh, csv([], ["Apellido", "Nombre"])));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toMatch(/Faltan columnas obligatorias: DNI, CUIL/);
  });

  it("valida sin crear nada y separa válidas, errores y duplicados", async () => {
    const existing = nextPerson();
    const repeated = nextPerson();
    // Un legajo existente con ese DNI.
    const province = await db.province.findUniqueOrThrow({ where: { code: "AR-T" } });
    const refs = await Promise.all([
      db.department.findFirstOrThrow({ where: { name: names.dept } }),
      db.position.findFirstOrThrow({ where: { name: names.position } }),
      db.contractType.findFirstOrThrow({ where: { name: names.contract } }),
      db.workplace.findFirstOrThrow({ where: { name: names.workplace } }),
    ]);
    await db.employee.create({
      data: {
        fileNumber: 800_000 + Math.floor(Math.random() * 90_000),
        lastName: "Existente",
        firstName: tag,
        ...existing,
        birthDate: new Date("1980-01-01"),
        sex: "M",
        addressLine: "Calle 2",
        city: "Ciudad",
        provinceId: province.id,
        postalCode: "4000",
        hireDate: new Date("2010-01-01"),
        seniorityDate: new Date("2010-01-01"),
        departmentId: refs[0].id,
        positionId: refs[1].id,
        contractTypeId: refs[2].id,
        workplaceId: refs[3].id,
      },
    });

    const { id } = await validateImport(
      rrhh,
      csv([
        line("Uno", repeated),
        line("Dos"),
        line("Malo", nextPerson(), { CUIL: "20111111110", Sector: "No existe" }),
        line("Existente", existing),
        line("Repetido", repeated),
      ]),
    );
    expect(await imported()).toHaveLength(0);
    const job = await getImportJob(rrhh, id);
    expect(job).toMatchObject({ status: "VALIDADO", totalRows: 5, validRows: 2, errorRows: 3 });
    expect(job.summary).toEqual({ valid: 2, errors: 1, duplicates: 2, created: 0 });
    expect(job.rows.map((r) => r.status)).toEqual(["VALIDA", "VALIDA", "ERROR", "DUPLICADA", "DUPLICADA"]);
    // El sector que no existe se daría de alta, pero solo lo usa una fila con errores: no se crea.
    expect(job.rows[2]!.errors).toEqual([expect.stringMatching(/^CUIL:/)]);
    expect(job.newItems).toEqual([]);
    expect(job.rows[4]!.errors[0]).toBe("Repite el DNI, CUIL o legajo de la fila 2.");
    // La vista previa no expone los datos del alta.
    expect(job.rows.some((r) => "input" in r)).toBe(false);

    const result = await confirmImport(rrhh, id);
    expect(result).toEqual({ created: 2, catalogItems: 0 });
    const created = await imported();
    expect(created.map((e) => e.firstName).sort()).toEqual([`Dos ${tag}`, `Uno ${tag}`]);
    // El legajo existente no se tocó.
    const untouched = await db.employee.findFirstOrThrow({ where: { dni: existing.dni } });
    expect(untouched.lastName).toBe("Existente");

    const closed = await getImportJob(rrhh, id);
    expect(closed.status).toBe("CONFIRMADO");
    expect(closed.confirmedAt).not.toBeNull();
    expect(closed.rows.filter((r) => r.status === "CREADA").map((r) => r.fileNumber)).toEqual(
      created.sort((a, b) => a.fileNumber - b.fileNumber).map((e) => e.fileNumber),
    );
    const raw = await db.importJob.findUniqueOrThrow({ where: { id } });
    expect(JSON.stringify(raw.rows)).not.toContain('"input"');

    expect(await lastAudit({ entityId: id })).toMatchObject({
      action: "IMPORT",
      module: "importacion",
      message: `Importó 2 empleados desde "alta.csv" (3 filas sin importar).`,
    });
    expect(await lastAudit({ entityId: created[0]!.id })).toMatchObject({ action: "CREATE" });
    expect((await lastAudit({ entityId: created[0]!.id }))?.message).toMatch(/\(importación\)$/);

    expect(await errorOf(confirmImport(rrhh, id))).toBeInstanceOf(ConflictError);
  });

  it("si algo cambió desde la validación no crea ningún legajo", async () => {
    const late = nextPerson();
    const { id } = await validateImport(rrhh, csv([line("Tarde", late), line("Otro")]));
    // Alguien da de alta a la misma persona antes de confirmar.
    const first = await db.employee.findFirstOrThrow({ where: { lastName: "Importado", firstName: `Uno ${tag}` } });
    await db.employee.create({
      data: {
        ...Object.fromEntries(
          Object.entries(first).filter(([k]) => !["id", "createdAt", "updatedAt", "version"].includes(k)),
        ),
        fileNumber: first.fileNumber + 500_000,
        lastName: "Cargado",
        ...late,
      } as never,
    });
    const error = await errorOf(confirmImport(rrhh, id));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toMatch(/La fila 2 coincide con el legajo/);
    expect((await imported()).map((e) => e.firstName)).not.toContain(`Otro ${tag}`);
    expect((await getImportJob(rrhh, id)).status).toBe("VALIDADO");
  });

  it("respeta el legajo indicado aunque una fila anterior se numere sola", async () => {
    const max = (await db.employee.aggregate({ _max: { fileNumber: true } }))._max.fileNumber ?? 0;
    const { id } = await validateImport(
      rrhh,
      csv([`;${line("Auto")}`, `${max + 1};${line("Fijo")}`], ["Legajo", ...HEADERS]),
    );
    expect((await getImportJob(rrhh, id)).summary.valid).toBe(2);
    await confirmImport(rrhh, id);
    const fixed = await db.employee.findFirstOrThrow({ where: { firstName: `Fijo ${tag}` } });
    const auto = await db.employee.findFirstOrThrow({ where: { firstName: `Auto ${tag}` } });
    expect(fixed.fileNumber).toBe(max + 1);
    expect(auto.fileNumber).toBe(max + 2);
    const rows = (await getImportJob(rrhh, id)).rows;
    expect(rows.map((r) => r.fileNumber)).toEqual([max + 2, max + 1]);
  });

  it("descartar no crea legajos y queda auditado", async () => {
    const { id } = await validateImport(rrhh, csv([line("Descartado")]));
    await discardImport(rrhh, id);
    expect((await getImportJob(rrhh, id)).status).toBe("DESCARTADO");
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "UPDATE", module: "importacion" });
    expect(await errorOf(confirmImport(rrhh, id))).toBeInstanceOf(ConflictError);
    expect((await imported()).map((e) => e.firstName)).not.toContain(`Descartado ${tag}`);
  });

  it("da de alta los sectores, puestos y establecimientos que faltan, listados antes de confirmar", async () => {
    const fresh = { dept: `Nuevo sector ${tag}`, position: `Nuevo puesto ${tag}`, workplace: `Nuevo lugar ${tag}` };
    const { id } = await validateImport(
      rrhh,
      csv([
        line("Crea", nextPerson(), { Sector: fresh.dept, Puesto: fresh.position, Establecimiento: fresh.workplace }),
        line("Reusa", nextPerson(), { Sector: fresh.dept.toUpperCase() }),
        line("Falla", nextPerson(), { CUIL: "20111111110", Sector: `Solo con error ${tag}` }),
      ]),
    );
    const job = await getImportJob(rrhh, id);
    expect(job.newItems.map(({ key, name }) => ({ key, name }))).toEqual([
      { key: "sectores", name: fresh.dept },
      { key: "puestos", name: fresh.position },
      { key: "establecimientos", name: fresh.workplace },
    ]);
    expect(job.rows.map((r) => r.notes)).toEqual([
      [`Sector nuevo: ${fresh.dept}`, `Puesto nuevo: ${fresh.position}`, `Establecimiento nuevo: ${fresh.workplace}`],
      [`Sector nuevo: ${fresh.dept}`],
      undefined,
    ]);
    // Validar no crea nada.
    expect(await db.department.findFirst({ where: { name: fresh.dept } })).toBeNull();

    expect(await confirmImport(rrhh, id)).toEqual({ created: 2, catalogItems: 3 });
    const [dept, position, workplace] = await Promise.all([
      db.department.findFirstOrThrow({ where: { name: fresh.dept } }),
      db.position.findFirstOrThrow({ where: { name: fresh.position } }),
      db.workplace.findFirstOrThrow({ where: { name: fresh.workplace } }),
    ]);
    expect([dept.id, position.id, workplace.id]).toEqual(job.newItems.map((i) => i.id));
    expect(dept).toMatchObject({ isActive: true, createdById: rrhh.userId });
    expect(await db.department.findFirst({ where: { name: `Solo con error ${tag}` } })).toBeNull();
    const employees = await db.employee.findMany({
      where: { firstName: { in: [`Crea ${tag}`, `Reusa ${tag}`] } },
      orderBy: { firstName: "asc" },
    });
    expect(
      employees.map((e) => [e.departmentId, e.positionId === position.id, e.workplaceId === workplace.id]),
    ).toEqual([
      [dept.id, true, true],
      [dept.id, false, false],
    ]);
    expect(await lastAudit({ entityId: dept.id })).toMatchObject({
      action: "CREATE",
      module: "configuracion",
      entityType: "Department",
      message: `Alta de sector: ${fresh.dept} (importación de "alta.csv")`,
    });
    expect(await lastAudit({ entityId: id })).toMatchObject({
      action: "IMPORT",
      message: `Importó 2 empleados desde "alta.csv" (1 fila sin importar) y dio de alta 3 valores nuevos en Catálogos.`,
    });
  });

  it("sin permiso para administrar catálogos no da de alta valores ni confirma una importación que los crea", async () => {
    const withoutCatalogs: ActorContext = {
      ...rrhh,
      permissions: new Set([...rrhh.permissions].filter((p) => p !== "config:catalogs")),
    };
    const name = `Sin permiso ${tag}`;
    const own = await validateImport(withoutCatalogs, csv([line("Propia", nextPerson(), { Sector: name })]));
    const ownJob = await getImportJob(withoutCatalogs, own.id);
    expect(ownJob.newItems).toEqual([]);
    expect(ownJob.rows[0]!.errors).toEqual([`Sector: "${name}" no existe en Catálogos.`]);

    const other = await validateImport(rrhh, csv([line("Ajena", nextPerson(), { Sector: name })]));
    expect(await errorOf(confirmImport(withoutCatalogs, other.id))).toBeInstanceOf(ForbiddenError);
    expect(await db.department.findFirst({ where: { name } })).toBeNull();
    expect((await getImportJob(rrhh, other.id)).status).toBe("VALIDADO");
  });

  it("un valor desactivado no se vuelve a crear, y uno cargado después de validar frena la importación", async () => {
    const inactive = await db.department.create({ data: { name: `Desactivado ${tag}`, isActive: false } });
    const job = await validateImport(
      rrhh,
      csv([line("Inactivo", nextPerson(), { Sector: inactive.name.toUpperCase() })]),
    );
    expect((await getImportJob(rrhh, job.id)).rows[0]!.errors).toEqual([
      `Sector: "${inactive.name.toUpperCase()}" está desactivado en Catálogos.`,
    ]);

    const late = `Cargado después ${tag}`;
    const { id } = await validateImport(
      rrhh,
      csv([line("Antes", nextPerson(), { Sector: late, Puesto: `Puesto de ${late}` })]),
    );
    await db.department.create({ data: { name: late.toLowerCase() } });
    const error = await errorOf(confirmImport(rrhh, id));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      `Mientras tanto se cargó "${late}" en Sectores. Descartá esta importación y volvé a subir el archivo.`,
    );
    expect(await db.position.findFirst({ where: { name: `Puesto de ${late}` } })).toBeNull();
    expect((await imported()).map((e) => e.firstName)).not.toContain(`Antes ${tag}`);
    expect((await getImportJob(rrhh, id)).status).toBe("VALIDADO");
  });

  it("si una fila falla al confirmar, tampoco quedan los valores nuevos de Catálogos", async () => {
    const fresh = `Revertido ${tag}`;
    const late = nextPerson();
    const { id } = await validateImport(
      rrhh,
      csv([line("Primero", nextPerson(), { Sector: fresh }), line("Segundo", late, { Sector: fresh })]),
    );
    const planned = (await getImportJob(rrhh, id)).newItems[0]!;
    // Alguien da de alta a la persona de la segunda fila antes de confirmar.
    const model = (await imported())[0]!;
    await db.employee.create({
      data: {
        ...Object.fromEntries(
          Object.entries(model).filter(([k]) => !["id", "createdAt", "updatedAt", "version"].includes(k)),
        ),
        fileNumber: model.fileNumber + 600_000,
        lastName: "Cargado",
        ...late,
      } as never,
    });
    const error = await errorOf(confirmImport(rrhh, id));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toMatch(/La fila 3 coincide con el legajo/);
    // La primera fila y el sector ya se habían escrito en la transacción: no queda nada.
    expect(await db.department.findUnique({ where: { id: planned.id } })).toBeNull();
    expect(await db.auditLog.count({ where: { entityId: planned.id } })).toBe(0);
    expect(await db.employee.count({ where: { firstName: `Primero ${tag}` } })).toBe(0);
    expect((await getImportJob(rrhh, id)).status).toBe("VALIDADO");
  });

  it("dos confirmaciones simultáneas crean una sola vez", async () => {
    const name = `Simultáneo ${tag}`;
    const { id } = await validateImport(rrhh, csv([line("Doble", nextPerson(), { Sector: name })]));
    const results = await Promise.allSettled([confirmImport(rrhh, id), confirmImport(rrhh, id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(ConflictError);
    expect((rejected?.reason as Error).message).toBe("Esta importación ya fue confirmada o descartada.");
    expect(await db.department.count({ where: { name } })).toBe(1);
    expect(await db.employee.count({ where: { firstName: `Doble ${tag}` } })).toBe(1);
  });

  it("la plantilla trae encabezados, instrucciones y valores, y se puede importar completada", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await getTemplate(rrhh)) as never);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Empleados", "Instrucciones", "Valores"]);
    const sheet = workbook.getWorksheet("Empleados")!;
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(IMPORT_COLUMNS.map((c) => c.header));
    const values = workbook.getWorksheet("Valores")!;
    const sectorColumn = (values.getRow(1).values as unknown[]).indexOf("Sector");
    expect(values.getColumn(sectorColumn).values).toContain(names.dept);
    const help = workbook.getWorksheet("Instrucciones")!.getColumn(1).values.map(String);
    expect(help.some((text) => text.startsWith("Si un sector, puesto o establecimiento no existe"))).toBe(true);

    // Completar una fila (con una fecha como fecha de Excel) y subirla.
    const person = nextPerson();
    const cell = (header: string) => sheet.getRow(2).getCell(IMPORT_COLUMNS.findIndex((c) => c.header === header) + 1);
    const row = line("Plantilla", person).split(";");
    HEADERS.forEach((header, i) => (cell(header).value = row[i]!));
    cell("Fecha de ingreso").value = new Date(Date.UTC(2022, 5, 15));
    const file = new File([await workbook.xlsx.writeBuffer()], "plantilla.xlsx");
    const { id } = await validateImport(rrhh, file);
    const job = await getImportJob(rrhh, id);
    expect(job.rows).toHaveLength(1);
    expect(job.rows[0]!.errors).toEqual([]);
    expect(job.rows[0]).toMatchObject({ status: "VALIDA", dni: person.dni });
    await confirmImport(rrhh, id);
    const employee = await db.employee.findFirstOrThrow({ where: { dni: person.dni } });
    expect(employee.hireDate.toISOString().slice(0, 10)).toBe("2022-06-15");
  });
});
