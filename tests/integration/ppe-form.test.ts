import { beforeAll, describe, expect, it } from "vitest";
import { getPpeForm } from "@/features/ppe/service";
import { formatCuil } from "@/lib/validators/cuil";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { actorFor, createTestUser } from "./helpers";

let rrhh: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<"complete" | "blank" | "exited", string>;

async function createEmployee(lastName: string, positionId: string, workplaceId: string) {
  const n = Math.floor(Math.random() * 9_000_000);
  const employee = await db.employee.create({
    data: {
      fileNumber: 700_000 + Math.floor(Math.random() * 90_000),
      lastName,
      firstName: `EPP ${tag}`,
      dni: String(10_000_000 + n),
      cuil: `20${10_000_000 + n}5`,
      birthDate: new Date("1990-01-01"),
      sex: "M",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: (await db.province.findFirstOrThrow()).id,
      postalCode: "9400",
      hireDate: new Date("2020-01-01"),
      seniorityDate: new Date("2020-01-01"),
      departmentId: (await db.department.create({ data: { name: `EPP sector ${lastName} ${tag}` } })).id,
      positionId,
      contractTypeId: (await db.contractType.create({ data: { name: `EPP contrato ${lastName} ${tag}` } })).id,
      workplaceId,
    },
  });
  return employee.id;
}

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  const operario = await db.position.create({
    data: {
      name: `Operario EPP ${tag}`,
      jobDescription: "Carga y descarga.\nOrden del depósito.",
      requiredPpe: "Calzado de seguridad y guantes.",
    },
  });
  const planta = await db.workplace.create({
    data: {
      name: `Planta EPP ${tag}`,
      addressLine: "Calle Ficticia 123",
      city: "Río Gallegos",
      postalCode: "9400",
      provinceId: province.id,
    },
  });
  refs.complete = await createEmployee("Completo", operario.id, planta.id);
  refs.blank = await createEmployee(
    "En blanco",
    (await db.position.create({ data: { name: `Sin datos EPP ${tag}` } })).id,
    (await db.workplace.create({ data: { name: `Lugar sin domicilio ${tag}` } })).id,
  );
  refs.exited = await createEmployee("Egresado", operario.id, planta.id);
  await db.employee.update({
    where: { id: refs.exited },
    data: { status: "EGRESADO", exitDate: new Date("2024-01-01") },
  });
});

describe("formulario de entrega de EPP", () => {
  it("arma el encabezado con la empresa, el establecimiento, el trabajador y su puesto", async () => {
    const form = await getPpeForm(rrhh, refs.complete);
    const employee = await db.employee.findUniqueOrThrow({ where: { id: refs.complete } });
    const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
    expect(form.company).toEqual(company ? { legalName: company.legalName, cuit: formatCuil(company.cuit) } : null);
    expect(form.place).toEqual({
      addressLine: "Calle Ficticia 123",
      city: "Río Gallegos",
      postalCode: "9400",
      province: "Santa Cruz",
    });
    expect(form.worker).toEqual({ name: `Completo, EPP ${tag}`, dni: employee.dni });
    expect(form.position).toEqual({
      name: `Operario EPP ${tag}`,
      description: "Carga y descarga.\nOrden del depósito.",
      requiredPpe: "Calzado de seguridad y guantes.",
    });
    expect(form.missing.filter((line) => !line.includes("empresa"))).toEqual([]);
  });

  it("deja en blanco lo que falta cargar y avisa dónde completarlo", async () => {
    const form = await getPpeForm(rrhh, refs.blank);
    expect(form.place).toEqual({ addressLine: "", city: "", postalCode: "", province: "" });
    expect(form.position).toEqual({ name: `Sin datos EPP ${tag}`, description: "", requiredPpe: "" });
    expect(form.missing.filter((line) => !line.includes("empresa"))).toEqual([
      `Al establecimiento «Lugar sin domicilio ${tag}» le falta domicilio, localidad, código postal y provincia: completalo en Configuración → Catálogos → Establecimientos.`,
      `Al puesto «Sin datos EPP ${tag}» le falta la descripción y los elementos de protección necesarios: completalo en Configuración → Catálogos → Puestos.`,
    ]);
  });

  it("pide ver datos personales, porque lleva el DNI", async () => {
    await expect(getPpeForm(consulta, refs.complete)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getPpeForm(rrhh, "0199e0e0-0000-7000-8000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("no se arma para un egresado", async () => {
    await expect(getPpeForm(rrhh, refs.exited)).rejects.toBeInstanceOf(ConflictError);
  });
});
