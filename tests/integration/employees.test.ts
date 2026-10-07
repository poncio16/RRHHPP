import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as employees from "@/features/employees/service";
import { toIsoDate, todayInTimeZone } from "@/lib/format";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, NotFoundError, toAppError, ValidationError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let consulta: ActorContext;
let administracion: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<
  | "province"
  | "dept"
  | "dept2"
  | "position"
  | "contract"
  | "fixedTerm"
  | "workplace"
  | "agreement"
  | "category"
  | "accountType",
  string
>;

/** DNI únicos por corrida y su CUIL válido (prefijo 20). */
let dniSeq = 30_000_000 + Math.floor(Math.random() * 5_000_000);
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

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    lastName: "Prueba",
    firstName: `Empleado ${tag}`,
    ...nextPerson(),
    birthDate: "1990-04-12",
    sex: "F",
    addressLine: "Calle Falsa 123",
    city: "Ciudad",
    provinceId: refs.province,
    postalCode: "1000",
    hireDate: "2020-03-01",
    departmentId: refs.dept,
    positionId: refs.position,
    contractTypeId: refs.contract,
    workplaceId: refs.workplace,
    ...overrides,
  };
}

async function appErrorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return toAppError(error);
  }
  throw new Error("Se esperaba un error");
}

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);

  const province = await db.province.upsert({
    where: { code: "AR-T" },
    update: {},
    create: { code: "AR-T", name: "Tucumán" },
  });
  refs.province = province.id;
  refs.dept = (await db.department.create({ data: { name: `Sector A ${tag}` } })).id;
  refs.dept2 = (await db.department.create({ data: { name: `Sector B ${tag}` } })).id;
  refs.position = (await db.position.create({ data: { name: `Puesto ${tag}` } })).id;
  refs.contract = (await db.contractType.create({ data: { name: `Indeterminado ${tag}` } })).id;
  refs.fixedTerm = (await db.contractType.create({ data: { name: `Plazo fijo ${tag}`, hasEndDate: true } })).id;
  refs.workplace = (await db.workplace.create({ data: { name: `Casa central ${tag}` } })).id;
  refs.agreement = (await db.collectiveAgreement.create({ data: { name: `Convenio ${tag}` } })).id;
  refs.category = (await db.category.create({ data: { name: `Cat ${tag}`, agreementId: refs.agreement } })).id;
  refs.accountType = (
    await db.lookupValue.upsert({
      where: { group_code: { group: "TIPO_CUENTA_BANCARIA", code: "CAJA_AHORRO" } },
      update: {},
      create: { group: "TIPO_CUENTA_BANCARIA", code: "CAJA_AHORRO", label: "Caja de ahorro" },
    })
  ).id;
  await db.bank.upsert({ where: { code: "285" }, update: {}, create: { code: "285", name: "Banco Macro" } });
  await db.bank.upsert({ where: { code: "011" }, update: {}, create: { code: "011", name: "Banco Nación" } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("alta de legajo", () => {
  it("asigna el número de legajo siguiente, toma la antigüedad del ingreso y audita", async () => {
    const { id, fileNumber } = await employees.createEmployee(rrhh, validInput());
    const saved = await db.employee.findUniqueOrThrow({ where: { id } });
    expect(fileNumber).toBeGreaterThan(0);
    expect(toIsoDate(saved.seniorityDate)).toBe("2020-03-01");
    expect(saved.status).toBe("ACTIVO");
    expect(await lastAudit({ entityId: id })).toMatchObject({ action: "CREATE", entityType: "Employee" });
  });

  it("rechaza DNI repetido con un mensaje claro", async () => {
    const input = validInput();
    await employees.createEmployee(rrhh, input);
    const error = await appErrorOf(employees.createEmployee(rrhh, { ...validInput(), dni: input.dni }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error?.message).toBe("Ya existe un empleado con ese DNI.");
  });

  it("valida CUIL, fechas y fin de contrato obligatorio según el tipo", async () => {
    const badCuil = await appErrorOf(employees.createEmployee(rrhh, validInput({ cuil: "20123456780" })));
    expect(badCuil).toMatchObject({ fieldErrors: { cuil: expect.any(Array) } });

    const badHire = await appErrorOf(employees.createEmployee(rrhh, validInput({ hireDate: "1980-01-01" })));
    expect(badHire).toMatchObject({ fieldErrors: { hireDate: ["El ingreso tiene que ser posterior al nacimiento."] } });

    const noEnd = await appErrorOf(employees.createEmployee(rrhh, validInput({ contractTypeId: refs.fixedTerm })));
    expect(noEnd).toBeInstanceOf(ValidationError);
    expect(noEnd).toMatchObject({ fieldErrors: { contractEndDate: expect.any(Array) } });
  });

  it("no acepta una categoría de otro convenio ni catálogos desactivados", async () => {
    const wrongCategory = await appErrorOf(employees.createEmployee(rrhh, validInput({ categoryId: refs.category })));
    expect(wrongCategory).toMatchObject({
      fieldErrors: { categoryId: ["La categoría no corresponde al convenio elegido."] },
    });

    const inactive = await db.department.create({ data: { name: `Inactivo ${tag}`, isActive: false } });
    const error = await appErrorOf(employees.createEmployee(rrhh, validInput({ departmentId: inactive.id })));
    expect(error).toMatchObject({ fieldErrors: { departmentId: expect.any(Array) } });
  });

  it("Consulta y Administración no pueden dar de alta legajos", async () => {
    await expect(employees.createEmployee(consulta, validInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(employees.createEmployee(administracion, validInput())).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("edición de legajo", () => {
  it("registra historial con fecha efectiva al cambiar de sector y sube la versión", async () => {
    const { id } = await employees.createEmployee(rrhh, validInput());
    const view = await employees.getEmployee(rrhh, id);

    const missingDate = await appErrorOf(
      employees.updateEmployee(rrhh, id, { ...view.formValues, departmentId: refs.dept2, version: view.version }),
    );
    expect(missingDate).toMatchObject({ fieldErrors: { effectiveDate: expect.any(Array) } });

    await employees.updateEmployee(rrhh, id, {
      ...view.formValues,
      departmentId: refs.dept2,
      version: view.version,
      effectiveDate: "2024-01-15",
      changeNotes: "Reorganización",
    });
    const history = await employees.getHistory(rrhh, id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      changeType: "SECTOR",
      oldValue: `Sector A ${tag}`,
      newValue: `Sector B ${tag}`,
      notes: "Reorganización",
    });
    expect(toIsoDate(history[0]!.effectiveDate)).toBe("2024-01-15");
    expect((await db.employee.findUniqueOrThrow({ where: { id } })).version).toBe(view.version + 1);
  });

  it("los cambios que no tienen historial no piden fecha efectiva", async () => {
    const { id } = await employees.createEmployee(rrhh, validInput());
    const view = await employees.getEmployee(rrhh, id);
    await employees.updateEmployee(rrhh, id, { ...view.formValues, phone: "11 5555-0000", version: view.version });
    expect(await employees.getHistory(rrhh, id)).toHaveLength(0);
    const audit = await lastAudit({ entityId: id });
    expect(audit).toMatchObject({ action: "UPDATE", after: { phone: "11 5555-0000" } });
  });

  it("rechaza fechas efectivas futuras", async () => {
    const { id } = await employees.createEmployee(rrhh, validInput());
    const view = await employees.getEmployee(rrhh, id);
    const tomorrow = new Date(todayInTimeZone().getTime() + 86_400_000);
    const error = await appErrorOf(
      employees.updateEmployee(rrhh, id, {
        ...view.formValues,
        departmentId: refs.dept2,
        version: view.version,
        effectiveDate: toIsoDate(tomorrow),
      }),
    );
    expect(error).toMatchObject({ fieldErrors: { effectiveDate: expect.any(Array) } });
  });

  it("bloqueo optimista: si otra persona guardó antes, no pisa sus cambios", async () => {
    const { id } = await employees.createEmployee(rrhh, validInput());
    const view = await employees.getEmployee(rrhh, id);
    await employees.updateEmployee(rrhh, id, { ...view.formValues, city: "Primera", version: view.version });
    const error = await appErrorOf(
      employees.updateEmployee(rrhh, id, { ...view.formValues, city: "Segunda", version: view.version }),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((await db.employee.findUniqueOrThrow({ where: { id } })).city).toBe("Primera");
  });

  it("no permite ciclos de superiores", async () => {
    const boss = await employees.createEmployee(rrhh, validInput({ firstName: "Jefa" }));
    const report = await employees.createEmployee(
      rrhh,
      validInput({ firstName: "Subordinado", supervisorId: boss.id }),
    );
    const bossView = await employees.getEmployee(rrhh, boss.id);
    const error = await appErrorOf(
      employees.updateEmployee(rrhh, boss.id, {
        ...bossView.formValues,
        supervisorId: report.id,
        version: bossView.version,
        effectiveDate: toIsoDate(todayInTimeZone()),
      }),
    );
    expect(error).toMatchObject({ fieldErrors: { supervisorId: expect.any(Array) } });
  });
});

describe("alcance de campos", () => {
  it("sin permiso de datos personales, el servicio no los devuelve", async () => {
    const { id } = await employees.createEmployee(rrhh, validInput());
    const view = await employees.getEmployee(consulta, id);
    expect(view.personal).toBeNull();
    expect(view.formValues).toBeNull();
    expect(view.labor.department?.name).toBe(`Sector A ${tag}`);

    const list = await employees.listEmployees(consulta, { q: tag });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((e) => e.dni === null)).toBe(true);
  });

  it("solo quien ve datos personales puede buscar por DNI", async () => {
    const input = validInput();
    await employees.createEmployee(rrhh, input);
    expect((await employees.listEmployees(rrhh, { q: input.dni })).total).toBe(1);
    expect((await employees.listEmployees(consulta, { q: input.dni })).total).toBe(0);
  });

  it("busca por nombre sin distinguir acentos ni mayúsculas", async () => {
    await employees.createEmployee(rrhh, validInput({ lastName: "Núñez", firstName: `Inés ${tag}` }));
    const result = await employees.listEmployees(rrhh, { q: `nunez ines ${tag}` });
    expect(result.items.map((e) => e.lastName)).toContain("Núñez");
  });

  it("Consulta no ve datos bancarios", async () => {
    const { id } = await employees.createEmployee(rrhh, validInput());
    await expect(employees.getBankAccount(consulta, id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("datos bancarios", () => {
  const CBU_MACRO = "2850590940090418135201";

  it("deduce el banco del CBU, enmascara la auditoría y registra el cambio en el historial", async () => {
    const { id } = await employees.createEmployee(rrhh, validInput());
    await employees.saveBankAccount(rrhh, id, { cbu: CBU_MACRO, alias: "", accountTypeId: refs.accountType });
    const account = await employees.getBankAccount(rrhh, id);
    expect(account).toMatchObject({ cbu: CBU_MACRO, bank: { code: "285" } });
    const created = await lastAudit({ entityId: account!.id });
    expect(JSON.stringify(created?.after)).not.toContain(CBU_MACRO);

    await employees.saveBankAccount(rrhh, id, {
      cbu: CBU_MACRO,
      alias: "cuenta.sueldo",
      accountTypeId: refs.accountType,
    });
    const history = await employees.getHistory(rrhh, id);
    expect(history[0]).toMatchObject({ changeType: "DATOS_BANCARIOS", newValue: "Banco Macro ****5201" });
    expect(await employees.getHistory(consulta, id)).toHaveLength(0);
  });

  it("rechaza un CBU de un banco que no está en el catálogo", async () => {
    const { id } = await employees.createEmployee(rrhh, validInput());
    const cbu = "9990001800000000000017";
    const error = await appErrorOf(employees.saveBankAccount(rrhh, id, { cbu, accountTypeId: refs.accountType }));
    expect(error).toBeInstanceOf(ValidationError);
  });

  it("legajo inexistente", async () => {
    await expect(employees.getEmployee(rrhh, "00000000-0000-7000-8000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
