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
    expect(job.rows[2]!.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/^CUIL:/), expect.stringMatching(/^Sector: "No existe"/)]),
    );
    expect(job.rows[4]!.errors[0]).toBe("Repite el DNI, CUIL o legajo de la fila 2.");
    // La vista previa no expone los datos del alta.
    expect(job.rows.some((r) => "input" in r)).toBe(false);

    const result = await confirmImport(rrhh, id);
    expect(result).toEqual({ created: 2 });
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

  it("descartar no crea legajos y queda auditado", async () => {
    const { id } = await validateImport(rrhh, csv([line("Descartado")]));
    await discardImport(rrhh, id);
    expect((await getImportJob(rrhh, id)).status).toBe("DESCARTADO");
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "UPDATE", module: "importacion" });
    expect(await errorOf(confirmImport(rrhh, id))).toBeInstanceOf(ConflictError);
    expect((await imported()).map((e) => e.firstName)).not.toContain(`Descartado ${tag}`);
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
