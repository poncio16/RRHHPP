import { beforeAll, describe, expect, it } from "vitest";
import * as documents from "@/features/documents/service";
import * as employees from "@/features/employees/service";
import * as exits from "@/features/exits/service";
import { todayInTimeZone, toIsoDate } from "@/lib/format";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<"employee" | "other" | "type" | "inactiveType" | "reason" | "docType", string>;

const today = todayInTimeZone();
const iso = (days: number) => toIsoDate(new Date(today.getTime() + days * 86_400_000));

async function createEmployee(name: string, supervisorId?: string) {
  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  return db.employee.create({
    data: {
      fileNumber: 700_000 + Math.floor(Math.random() * 90_000),
      lastName: "Egresos",
      firstName: `${name} ${tag}`,
      dni: String(10_000_000 + Math.floor(Math.random() * 9_000_000)),
      cuil: `20${Math.floor(Math.random() * 1e9)}`.padEnd(11, "0").slice(0, 11),
      birthDate: new Date("1990-01-01"),
      sex: "M",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: province.id,
      postalCode: "9400",
      hireDate: new Date("2024-01-01"),
      seniorityDate: new Date("2024-01-01"),
      supervisorId,
      departmentId: (await db.department.create({ data: { name: `Egr sector ${name} ${tag}` } })).id,
      positionId: (await db.position.create({ data: { name: `Egr puesto ${name} ${tag}` } })).id,
      contractTypeId: (await db.contractType.create({ data: { name: `Egr contrato ${name} ${tag}` } })).id,
      workplaceId: (await db.workplace.create({ data: { name: `Egr lugar ${name} ${tag}` } })).id,
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

const exitInput = (exitDate: string, extra: Record<string, unknown> = {}) => ({
  exitDate,
  exitTypeId: refs.type,
  exitReasonId: refs.reason,
  notes: "Prueba",
  ...extra,
});

const employeeRow = (id: string) => db.employee.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  const lookup = (group: string, code: string, isActive = true) =>
    db.lookupValue.create({ data: { group, code: `${code}_${tag}`, label: `${code} ${tag}`, isActive } });
  refs.type = (await lookup("TIPO_EGRESO", "RENUNCIA")).id;
  refs.inactiveType = (await lookup("TIPO_EGRESO", "VIEJO", false)).id;
  refs.reason = (await lookup("MOTIVO_EGRESO", "PERSONALES")).id;
  refs.docType = (await db.documentType.create({ data: { name: `Telegrama ${tag}` } })).id;
  const boss = await createEmployee("Jefa");
  refs.employee = boss.id;
  refs.other = (await createEmployee("Otro", boss.id)).id;
});

describe("egresos", () => {
  it("registra un egreso en trámite sin cambiar el estado del empleado", async () => {
    const { id, confirmed } = await exits.createExit(rrhh, refs.employee, exitInput(iso(10)));
    expect(confirmed).toBe(false);
    expect((await employeeRow(refs.employee)).status).toBe("ACTIVO");
    expect((await lastAudit({ entityId: id }))?.action).toBe("CREATE");
    const pending = await exits.getPendingExit(rrhh, refs.employee);
    expect(pending?.id).toBe(id);

    const duplicate = await errorOf(exits.createExit(rrhh, refs.employee, exitInput(iso(12))));
    expect(duplicate).toBeInstanceOf(ConflictError);
  });

  it("no confirma un egreso con fecha futura", async () => {
    const pending = (await exits.getPendingExit(rrhh, refs.employee))!;
    const error = await errorOf(exits.confirmExit(rrhh, pending.id, {}));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toMatch(/se puede confirmar a partir/);
  });

  it("valida fecha, tipo y motivo al modificar", async () => {
    const pending = (await exits.listEmployeeExits(rrhh, refs.employee))[0]!;
    const before = await errorOf(exits.updateExit(rrhh, pending.id, exitInput("2023-12-31")));
    expect((before as ValidationError).fieldErrors?.exitDate?.[0]).toMatch(/anterior al ingreso/);
    const inactive = await errorOf(
      exits.updateExit(rrhh, pending.id, exitInput(iso(-1), { exitTypeId: refs.inactiveType })),
    );
    expect((inactive as ValidationError).fieldErrors?.exitTypeId).toBeDefined();
    await exits.updateExit(rrhh, pending.id, exitInput(iso(-1), { version: pending.version }));
    const stale = await errorOf(exits.updateExit(rrhh, pending.id, exitInput(iso(-2), { version: pending.version })));
    expect(stale).toBeInstanceOf(ConflictError);
  });

  it("no confirma si hay datos cargados después del egreso", async () => {
    const day = await db.attendanceDay.create({
      data: { employeeId: refs.employee, date: today, status: "AUSENTE", source: "MANUAL" },
    });
    const pending = (await exits.getPendingExit(rrhh, refs.employee))!;
    const error = await errorOf(exits.confirmExit(rrhh, pending.id, {}));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toMatch(/1 día de asistencia/);
    expect((await employeeRow(refs.employee)).status).toBe("ACTIVO");
    await db.attendanceDay.delete({ where: { id: day.id } });
  });

  it("solo quien registra egresos puede hacerlo", async () => {
    expect(await errorOf(exits.createExit(administracion, refs.other, exitInput(iso(-1))))).toBeInstanceOf(
      ForbiddenError,
    );
    expect(await errorOf(exits.listExits(consulta, {}))).toBeInstanceOf(ForbiddenError);
    const list = await exits.listExits(administracion, { q: tag });
    expect(list.items.some((i) => i.employee.id === refs.employee)).toBe(true);
  });

  it("confirma: el empleado queda egresado y avisa si tiene personal a cargo", async () => {
    const pending = (await exits.getPendingExit(rrhh, refs.employee))!;
    const { warnings } = await exits.confirmExit(rrhh, pending.id, {});
    expect(warnings.join(" ")).toMatch(/a cargo/);
    const employee = await employeeRow(refs.employee);
    expect(employee.status).toBe("EGRESADO");
    expect(toIsoDate(employee.exitDate!)).toBe(iso(-1));
    const [item] = await exits.listEmployeeExits(rrhh, refs.employee);
    expect(item?.status).toBe("CONFIRMADO");
    expect(item?.annullable).toBe(true);
  });

  it("vincula documentos solo a egresos vigentes del mismo empleado", async () => {
    const [exit] = await exits.listEmployeeExits(rrhh, refs.employee);
    const input = { documentTypeId: refs.docType, status: "PRESENTADO", exitId: exit!.id };
    const wrong = await errorOf(documents.createDocument(rrhh, refs.other, input, null));
    expect(wrong).toBeInstanceOf(ValidationError);
    const { id } = await documents.createDocument(rrhh, refs.employee, input, null);
    expect((await db.document.findUniqueOrThrow({ where: { id } })).exitId).toBe(exit!.id);
    expect((await exits.listEmployeeExits(rrhh, refs.employee))[0]?.documents).toBe(1);
  });

  it("reingreso: posterior al egreso, no futuro y con historial", async () => {
    const { version } = await employeeRow(refs.employee);
    const early = await errorOf(exits.rehireEmployee(rrhh, refs.employee, { hireDate: iso(-1), version }));
    expect((early as ValidationError).fieldErrors?.hireDate?.[0]).toMatch(/posterior al último egreso/);
    const future = await errorOf(exits.rehireEmployee(rrhh, refs.employee, { hireDate: iso(1), version }));
    expect((future as ValidationError).fieldErrors?.hireDate?.[0]).toMatch(/futura/);
    const stale = await errorOf(exits.rehireEmployee(rrhh, refs.employee, { hireDate: iso(0), version: version - 1 }));
    expect(stale).toBeInstanceOf(ConflictError);

    await exits.rehireEmployee(rrhh, refs.employee, {
      hireDate: iso(0),
      seniorityDate: "2024-01-01",
      notes: "Vuelve",
      version,
    });
    const employee = await employeeRow(refs.employee);
    expect(employee.status).toBe("ACTIVO");
    expect(employee.exitDate).toBeNull();
    expect(toIsoDate(employee.hireDate)).toBe(iso(0));
    expect(toIsoDate(employee.seniorityDate)).toBe("2024-01-01");
    const history = await db.employeeChangeHistory.findMany({
      where: { employeeId: refs.employee, changeType: "REINGRESO" },
    });
    expect(history.map((h) => h.field)).toEqual(["hireDate"]);
    expect(history[0]?.oldValue).toBe("01/01/2024");

    // El egreso anterior queda como historial: ya no se puede anular ni modificar.
    const [old] = await exits.listEmployeeExits(rrhh, refs.employee);
    expect(old?.annullable).toBe(false);
    expect(await errorOf(exits.annulExit(rrhh, old!.id, { reason: "Error de carga" }))).toBeInstanceOf(ConflictError);
  });

  it("registra y confirma en un paso; anular el egreso vigente lo devuelve a activo", async () => {
    const { confirmed } = await exits.createExit(rrhh, refs.employee, exitInput(iso(0), { confirm: true }));
    expect(confirmed).toBe(true);
    expect((await employeeRow(refs.employee)).status).toBe("EGRESADO");
    const [current] = await exits.listEmployeeExits(rrhh, refs.employee);
    const short = await errorOf(exits.annulExit(rrhh, current!.id, { reason: "x" }));
    expect((short as Error).name).toBe("ZodError");
    await exits.annulExit(rrhh, current!.id, { reason: "Se cargó por error", version: current!.version });
    const employee = await employeeRow(refs.employee);
    expect(employee.status).toBe("ACTIVO");
    expect(employee.exitDate).toBeNull();
    const [annulled] = await exits.listEmployeeExits(rrhh, refs.employee);
    expect(annulled?.status).toBe("ANULADO");
    expect(annulled?.notes).toMatch(/Anulado: Se cargó por error/);
  });
});

describe("línea de tiempo del legajo", () => {
  it("une ingreso original, egresos y reingresos según permisos", async () => {
    const { events } = await employees.getTimeline(rrhh, refs.employee, {});
    const titles = events.map((e) => e.title);
    expect(titles).toContain("Reingreso");
    expect(events.filter((e) => e.kind === "egreso")).toHaveLength(1);
    const hire = events.find((e) => e.id === "hire");
    expect(toIsoDate(hire!.date)).toBe("2024-01-01");
    // Más reciente primero.
    const dates = events.map((e) => e.date.getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);

    const filtered = await employees.getTimeline(rrhh, refs.employee, { tipo: "egresos" });
    expect(filtered.events.every((e) => e.kind === "egreso" || e.kind === "ingreso")).toBe(true);

    const limited = await employees.getTimeline(consulta, refs.employee, {});
    expect(limited.sources.exits).toBe(false);
    expect(limited.events.some((e) => e.kind === "egreso")).toBe(false);
  });
});
