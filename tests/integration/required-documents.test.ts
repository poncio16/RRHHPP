import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as documents from "@/features/documents/service";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { actorFor, createTestUser } from "./helpers";

let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const types = {} as Record<"dni" | "alta" | "epp" | "salud" | "inactivo" | "opcional", string>;
const people = {} as Record<"sinNada" | "parcial" | "completo" | "egresado", string>;

/** Solo los tipos de esta prueba: la base compartida puede tener otros obligatorios. */
const own = (names: string[]) => names.filter((name) => name.endsWith(tag));
const label = (name: string) => `${name} ${tag}`;

async function createEmployee(lastName: string, status: "ACTIVO" | "EGRESADO" = "ACTIVO") {
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
      hireDate: new Date("2020-01-01"),
      seniorityDate: new Date("2020-01-01"),
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

  const type = (
    name: string,
    data: { isRequired?: boolean; isSensitive?: boolean; isActive?: boolean },
    sortOrder: number,
  ) => db.documentType.create({ data: { name: label(name), sortOrder: 5_000 + sortOrder, ...data } }).then((t) => t.id);
  types.dni = await type("DNI", { isRequired: true }, 1);
  types.alta = await type("Alta temprana", { isRequired: true }, 2);
  types.epp = await type("Formulario EPP", { isRequired: true }, 3);
  types.salud = await type("Preocupacional", { isRequired: true, isSensitive: true }, 4);
  types.inactivo = await type("Viejo", { isRequired: true, isActive: false }, 5);
  types.opcional = await type("Apercibimiento", {}, 6);

  people.sinNada = (await createEmployee("Sin nada")).id;
  people.parcial = (await createEmployee("Parcial")).id;
  people.completo = (await createEmployee("Completo")).id;
  people.egresado = (await createEmployee("Egresado", "EGRESADO")).id;

  const doc = (
    employeeId: string,
    documentTypeId: string,
    status: "PRESENTADO" | "PENDIENTE" | "OBSERVADO" | "ANULADO",
  ) => db.document.create({ data: { employeeId, documentTypeId, status } });
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
      { lastName: "Parcial", missing: [label("Alta temprana"), label("Preocupacional")] },
      {
        lastName: "Sin nada",
        missing: [label("DNI"), label("Alta temprana"), label("Formulario EPP"), label("Preocupacional")],
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
    const fileNumber = (await db.employee.findUniqueOrThrow({ where: { id: people.parcial } })).fileNumber;
    const byFile = await documents.listMissingRequiredDocuments(rrhh, { q: String(fileNumber) });
    expect(byFile.items.map((r) => r.employee.id)).toEqual([people.parcial]);
  });

  it("sin permiso de datos de salud no controla los tipos sensibles", async () => {
    const result = await documents.listMissingRequiredDocuments(administracion, { q: `Obligatorios ${tag}` });
    const rows = result.items.map((r) => [r.employee.lastName, own(r.missing)] as const);
    expect(rows.filter(([, missing]) => missing.length > 0)).toEqual([
      ["Parcial", [label("Alta temprana")]],
      ["Sin nada", [label("DNI"), label("Alta temprana"), label("Formulario EPP")]],
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
    const stillMissing = (await documents.getMissingRequiredDocuments(rrhh, people.parcial)).length > 0;
    expect(await documents.countMissingRequiredDocuments(rrhh)).toBe(before - (stillMissing ? 0 : 1));
    expect(await documents.countMissingRequiredDocuments(rrhh)).toBe(
      (await documents.listMissingRequiredDocuments(rrhh, {})).total,
    );
  });

  it("sin permiso para ver documentación no lista ni cuenta", async () => {
    await expect(documents.listMissingRequiredDocuments(consulta, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(documents.countMissingRequiredDocuments(consulta)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(documents.getMissingRequiredDocuments(consulta, people.sinNada)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
