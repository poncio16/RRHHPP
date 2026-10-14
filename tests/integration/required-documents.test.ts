import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeMissing, lastDueMonth } from "@/features/documents/required";
import * as documents from "@/features/documents/service";
import { addMonths, periodKey, todayInTimeZone } from "@/lib/format";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { getSetting } from "@/server/settings";
import { actorFor, createTestUser } from "./helpers";

let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const types = {} as Record<"dni" | "alta" | "epp" | "salud" | "inactivo" | "opcional" | "recibo", string>;
const people = {} as Record<"sinNada" | "parcial" | "completo" | "egresado" | "nuevo", string>;
/** Los tres últimos meses que ya tendrían que tener recibo, del más viejo al más nuevo. */
let months: Date[] = [];

/** Solo los tipos de esta prueba: la base compartida puede tener otros obligatorios. */
const own = (names: string[]) => names.filter((name) => name.includes(tag));
const label = (name: string) => `${name} ${tag}`;
const recibos = (...due: Date[]) => describeMissing({ typeId: types.recibo, name: label("Recibo"), months: due });

async function createEmployee(lastName: string, status: "ACTIVO" | "EGRESADO" = "ACTIVO", hireDate = "2020-01-01") {
  const n = Math.floor(Math.random() * 9_000_000);
  return db.employee.create({
    data: {
      fileNumber: 800_000 + Math.floor(Math.random() * 90_000),
      lastName,
      firstName: `Obligatorios ${tag}`,
      dni: String(10_000_000 + n),
      cuil: `27${10_000_000 + n}4`,
      birthDate: new Date("1990-01-01"),
      sex: "F",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: (await db.province.findFirstOrThrow()).id,
      postalCode: "9400",
      hireDate: new Date(hireDate),
      seniorityDate: new Date(hireDate),
      status,
      exitDate: status === "EGRESADO" ? new Date("2024-01-01") : null,
      departmentId: (await db.department.create({ data: { name: `Obl sector ${lastName} ${tag}` } })).id,
      positionId: (await db.position.create({ data: { name: `Obl puesto ${lastName} ${tag}` } })).id,
      contractTypeId: (await db.contractType.create({ data: { name: `Obl contrato ${lastName} ${tag}` } })).id,
      workplaceId: (await db.workplace.create({ data: { name: `Obl lugar ${lastName} ${tag}` } })).id,
    },
  });
}

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  await db.province.upsert({ where: { code: "AR-X" }, update: {}, create: { code: "AR-X", name: "Santa Cruz" } });

  const { monthlyGraceDays } = await getSetting("documents");
  const lastDue = lastDueMonth(todayInTimeZone(), monthlyGraceDays);
  months = [addMonths(lastDue, -2), addMonths(lastDue, -1), lastDue];

  const type = (
    name: string,
    data: {
      requirement?: "UNA_VEZ" | "MENSUAL";
      requiredFrom?: Date;
      isSensitive?: boolean;
      isActive?: boolean;
    },
    sortOrder: number,
  ) => db.documentType.create({ data: { name: label(name), sortOrder: 5_000 + sortOrder, ...data } }).then((t) => t.id);
  types.dni = await type("DNI", { requirement: "UNA_VEZ" }, 1);
  types.alta = await type("Alta temprana", { requirement: "UNA_VEZ" }, 2);
  types.epp = await type("Formulario EPP", { requirement: "UNA_VEZ" }, 3);
  types.salud = await type("Preocupacional", { requirement: "UNA_VEZ", isSensitive: true }, 4);
  types.inactivo = await type("Viejo", { requirement: "UNA_VEZ", isActive: false }, 5);
  types.opcional = await type("Apercibimiento", {}, 6);
  types.recibo = await type("Recibo", { requirement: "MENSUAL", requiredFrom: months[0] }, 7);

  people.sinNada = (await createEmployee("Sin nada")).id;
  people.parcial = (await createEmployee("Parcial")).id;
  people.completo = (await createEmployee("Completo")).id;
  people.egresado = (await createEmployee("Egresado", "EGRESADO")).id;
  // Ingresó a mitad del penúltimo mes: no se le reclama el recibo de los meses anteriores.
  people.nuevo = (await createEmployee("Nuevo", "ACTIVO", `${periodKey(months[1]!)}-15`)).id;

  const doc = (
    employeeId: string,
    documentTypeId: string,
    status: "PRESENTADO" | "PENDIENTE" | "OBSERVADO" | "ANULADO",
    period: Date | null = null,
  ) => db.document.create({ data: { employeeId, documentTypeId, status, period } });
  // Uno presentado, uno anulado (no cuenta) y uno vencido, que igual está cargado.
  await doc(people.parcial, types.dni, "PRESENTADO");
  await doc(people.parcial, types.alta, "ANULADO");
  await db.document.create({
    data: {
      employeeId: people.parcial,
      documentTypeId: types.epp,
      issueDate: new Date("2020-01-01"),
      expiryDate: new Date("2021-01-01"),
    },
  });
  // Pendiente y observado cuentan como cargados: ya tienen su propio aviso.
  await doc(people.completo, types.dni, "PENDIENTE");
  await doc(people.completo, types.alta, "OBSERVADO");
  await doc(people.completo, types.epp, "PRESENTADO");
  await doc(people.completo, types.salud, "PRESENTADO");
  // Recibos: el anulado no cuenta; el pendiente sí; el del mes en curso no cubre uno vencido.
  await doc(people.parcial, types.recibo, "PRESENTADO", months[0]!);
  await doc(people.parcial, types.recibo, "ANULADO", months[1]!);
  await doc(people.parcial, types.recibo, "PRESENTADO", addMonths(months[2]!, 1));
  for (const [i, month] of months.entries()) {
    await doc(people.completo, types.recibo, i === 1 ? "PENDIENTE" : "PRESENTADO", month);
  }
  for (const id of [types.dni, types.alta, types.epp, types.salud]) await doc(people.nuevo, id, "PRESENTADO");
});

afterAll(async () => {
  // Que los obligatorios de esta prueba no aparezcan en las demás.
  await db.documentType.updateMany({ where: { id: { in: Object.values(types) } }, data: { isActive: false } });
});

describe("documentos obligatorios", () => {
  it("lista los legajos activos con obligatorios sin cargar, en el orden del catálogo", async () => {
    const result = await documents.listMissingRequiredDocuments(rrhh, { q: `Obligatorios ${tag}` });
    const rows = result.items
      .map((r) => ({ lastName: r.employee.lastName, missing: own(r.missing) }))
      .filter((r) => r.missing.length > 0);
    expect(rows).toEqual([
      { lastName: "Nuevo", missing: [recibos(months[1]!, months[2]!)] },
      {
        lastName: "Parcial",
        missing: [label("Alta temprana"), label("Preocupacional"), recibos(months[1]!, months[2]!)],
      },
      {
        lastName: "Sin nada",
        missing: [
          label("DNI"),
          label("Alta temprana"),
          label("Formulario EPP"),
          label("Preocupacional"),
          recibos(...months),
        ],
      },
    ]);
    // El tipo inactivo y el opcional no se controlan; el egresado y el completo no aparecen.
    expect(result.requiredTypes.map((t) => t.id)).not.toContain(types.inactivo);
    expect(result.requiredTypes.map((t) => t.id)).not.toContain(types.opcional);
    expect(result.items.map((r) => r.employee.id)).not.toContain(people.egresado);
  });

  it("filtra por tipo y por legajo", async () => {
    const byType = await documents.listMissingRequiredDocuments(rrhh, {
      q: `Obligatorios ${tag}`,
      documentTypeId: types.dni,
    });
    expect(byType.items.map((r) => [r.employee.lastName, r.missing])).toEqual([["Sin nada", [label("DNI")]]]);
    const byMonthly = await documents.listMissingRequiredDocuments(rrhh, {
      q: `Obligatorios ${tag}`,
      documentTypeId: types.recibo,
    });
    expect(byMonthly.items.map((r) => [r.employee.lastName, r.missing])).toEqual([
      ["Nuevo", [recibos(months[1]!, months[2]!)]],
      ["Parcial", [recibos(months[1]!, months[2]!)]],
      ["Sin nada", [recibos(...months)]],
    ]);
    const fileNumber = (await db.employee.findUniqueOrThrow({ where: { id: people.parcial } })).fileNumber;
    const byFile = await documents.listMissingRequiredDocuments(rrhh, { q: String(fileNumber) });
    expect(byFile.items.map((r) => r.employee.id)).toEqual([people.parcial]);
  });

  it("sin permiso de datos de salud no controla los tipos sensibles", async () => {
    const result = await documents.listMissingRequiredDocuments(administracion, { q: `Obligatorios ${tag}` });
    const rows = result.items.map((r) => [r.employee.lastName, own(r.missing)] as const);
    expect(rows.filter(([, missing]) => missing.length > 0)).toEqual([
      ["Nuevo", [recibos(months[1]!, months[2]!)]],
      ["Parcial", [label("Alta temprana"), recibos(months[1]!, months[2]!)]],
      ["Sin nada", [label("DNI"), label("Alta temprana"), label("Formulario EPP"), recibos(...months)]],
    ]);
    expect(result.requiredTypes.map((t) => t.id)).not.toContain(types.salud);
    expect(own(await documents.getMissingRequiredDocuments(administracion, people.sinNada))).not.toContain(
      label("Preocupacional"),
    );
  });

  it("muestra lo que le falta a cada legajo activo", async () => {
    expect(own(await documents.getMissingRequiredDocuments(rrhh, people.parcial))).toEqual([
      label("Alta temprana"),
      label("Preocupacional"),
      recibos(months[1]!, months[2]!),
    ]);
    expect(own(await documents.getMissingRequiredDocuments(rrhh, people.completo))).toEqual([]);
    expect(await documents.getMissingRequiredDocuments(rrhh, people.egresado)).toEqual([]);
  });

  it("el contador del Inicio coincide con el listado completo", async () => {
    const before = await documents.countMissingRequiredDocuments(rrhh);
    expect(before).toBe((await documents.listMissingRequiredDocuments(rrhh, {})).total);
    // Al cargar lo que falta, el legajo sale de la cuenta (si no le faltan otros de la base compartida).
    for (const documentTypeId of [types.alta, types.salud]) {
      await db.document.create({ data: { employeeId: people.parcial, documentTypeId } });
    }
    for (const period of months.slice(1)) {
      await db.document.create({ data: { employeeId: people.parcial, documentTypeId: types.recibo, period } });
    }
    const stillMissing = (await documents.getMissingRequiredDocuments(rrhh, people.parcial)).length > 0;
    expect(await documents.countMissingRequiredDocuments(rrhh)).toBe(before - (stillMissing ? 0 : 1));
    expect(await documents.countMissingRequiredDocuments(rrhh)).toBe(
      (await documents.listMissingRequiredDocuments(rrhh, {})).total,
    );
  });

  it("un filtro que no es de un obligatorio visible no filtra", async () => {
    const all = await documents.listMissingRequiredDocuments(administracion, { q: `Obligatorios ${tag}` });
    for (const documentTypeId of [types.inactivo, types.opcional, types.salud]) {
      const result = await documents.listMissingRequiredDocuments(administracion, {
        q: `Obligatorios ${tag}`,
        documentTypeId,
      });
      expect(result.query.documentTypeId).toBeUndefined();
      expect(result.items).toEqual(all.items);
    }
  });

  it("una página que ya no existe muestra la última", async () => {
    const result = await documents.listMissingRequiredDocuments(rrhh, { q: `Obligatorios ${tag}`, page: "9" });
    expect(result.page).toBe(1);
    expect(result.query.page).toBe(1);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("sin permiso para ver documentación no lista ni cuenta", async () => {
    await expect(documents.listMissingRequiredDocuments(consulta, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(documents.countMissingRequiredDocuments(consulta)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(documents.getMissingRequiredDocuments(consulta, people.sinNada)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("documentos mensuales", () => {
  const input = (documentTypeId: string, period = "") => ({ documentTypeId, status: "PRESENTADO", period });

  it("piden el mes y lo guardan; los demás tipos lo descartan", async () => {
    await expect(documents.createDocument(rrhh, people.sinNada, input(types.recibo), null)).rejects.toMatchObject({
      fieldErrors: { period: [`Indicá el mes al que corresponde "${label("Recibo")}".`] },
    });
    await expect(documents.createDocument(rrhh, people.sinNada, input(types.recibo), null)).rejects.toBeInstanceOf(
      ValidationError,
    );
    const { id } = await documents.createDocument(
      rrhh,
      people.sinNada,
      input(types.recibo, periodKey(months[2]!)),
      null,
    );
    expect((await db.document.findUniqueOrThrow({ where: { id } })).period).toEqual(months[2]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { entityId: id, action: "CREATE" } });
    expect(audit.after).toMatchObject({ period: periodKey(months[2]!) });
    const other = await documents.createDocument(
      rrhh,
      people.sinNada,
      input(types.opcional, periodKey(months[2]!)),
      null,
    );
    expect((await db.document.findUniqueOrThrow({ where: { id: other.id } })).period).toBeNull();
    expect(own(await documents.getMissingRequiredDocuments(rrhh, people.sinNada))).toContain(
      recibos(months[0]!, months[1]!),
    );
  });

  it("no acepta un mes posterior al actual", async () => {
    const next = addMonths(todayInTimeZone(), 1);
    await expect(
      documents.createDocument(rrhh, people.sinNada, input(types.recibo, periodKey(next)), null),
    ).rejects.toThrow("El mes no puede ser posterior al actual.");
  });
});
