import { beforeAll, describe, expect, it } from "vitest";
import * as alerts from "@/features/alerts/service";
import * as dashboard from "@/features/dashboard/service";
import { periodKey, periodOf, todayInTimeZone, toIsoDate } from "@/lib/format";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let consulta: ActorContext;
const tag = Date.now().toString(36);
const refs = {} as Record<"employee" | "expiring" | "renewed", string>;

const today = todayInTimeZone();
const day = (n: number) => new Date(today.getTime() + n * 86_400_000);

async function createEmployee(name: string, extra: Record<string, unknown> = {}) {
  const province = await db.province.upsert({
    where: { code: "AR-X" },
    update: {},
    create: { code: "AR-X", name: "Santa Cruz" },
  });
  return db.employee.create({
    data: {
      fileNumber: 800_000 + Math.floor(Math.random() * 90_000),
      lastName: "Alertas",
      firstName: `${name} ${tag}`,
      dni: String(10_000_000 + Math.floor(Math.random() * 9_000_000)),
      cuil: `27${Math.floor(Math.random() * 1e9)}`.padEnd(11, "0").slice(0, 11),
      birthDate: new Date(Date.UTC(1990, day(3).getUTCMonth(), day(3).getUTCDate())),
      sex: "F",
      addressLine: "Calle 1",
      city: "Ciudad",
      provinceId: province.id,
      postalCode: "9400",
      hireDate: today,
      seniorityDate: today,
      contractEndDate: day(10),
      departmentId: (await db.department.create({ data: { name: `Alr sector ${name} ${tag}` } })).id,
      positionId: (await db.position.create({ data: { name: `Alr puesto ${name} ${tag}` } })).id,
      contractTypeId: (await db.contractType.create({ data: { name: `Alr contrato ${name} ${tag}` } })).id,
      workplaceId: (await db.workplace.create({ data: { name: `Alr lugar ${name} ${tag}` } })).id,
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

const mine = <T extends { employee: { id: string } }>(items: T[]) =>
  items.filter((a) => a.employee.id === refs.employee);

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
  refs.employee = (await createEmployee("Ana")).id;
  const type = await db.documentType.create({ data: { name: `Apto ${tag}`, alertDaysBefore: 30 } });
  const other = await db.documentType.create({ data: { name: `Carnet ${tag}`, alertDaysBefore: 30 } });
  const doc = (documentTypeId: string, expiryDate: Date) =>
    db.document.create({ data: { employeeId: refs.employee, documentTypeId, status: "PRESENTADO", expiryDate } });
  refs.expiring = (await doc(type.id, day(5))).id;
  // Renovado: hay otro del mismo tipo que vence después.
  refs.renewed = (await doc(other.id, day(3))).id;
  await doc(other.id, day(400));
});

describe("alertas", () => {
  it("calcula documentos, contratos, cumpleaños y legajo incompleto", async () => {
    const { items } = await alerts.listAlerts(rrhh, {});
    const kinds = mine(items).map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["DOCUMENTO", "CONTRATO", "CUMPLEANOS", "LEGAJO"]));
    const docs = mine(items).filter((a) => a.kind === "DOCUMENTO");
    expect(docs).toHaveLength(1);
    expect(docs[0]?.key).toContain(refs.expiring);
    const legajo = mine(items).find((a) => a.kind === "LEGAJO");
    expect(legajo?.detail).toMatch(/horario/);
  });

  it("cada clase depende del permiso de su módulo", async () => {
    const result = await alerts.listAlerts(consulta, {});
    expect(result.kinds).not.toContain("DOCUMENTO");
    expect(result.kinds).not.toContain("CUMPLEANOS");
    const kinds = mine(result.items).map((a) => a.kind);
    expect(kinds).toContain("LEGAJO");
    expect(kinds).not.toContain("DOCUMENTO");
    // Sin datos personales a la vista no se reclaman teléfono ni contacto de emergencia.
    expect(mine(result.items).find((a) => a.kind === "LEGAJO")?.detail).not.toMatch(/emergencia/);
    const legajo = mine(result.items).find((a) => a.kind === "LEGAJO")!;
    expect(legajo.canManage).toBe(false);
    expect(await errorOf(alerts.changeAlertState(consulta, { key: legajo.key, action: "descartar" }))).toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("pospone, descarta y vuelve a pendientes con auditoría", async () => {
    const contract = mine((await alerts.listAlerts(rrhh, {})).items).find((a) => a.kind === "CONTRATO")!;
    await alerts.changeAlertState(rrhh, { key: contract.key, action: "posponer" });
    expect(mine((await alerts.listAlerts(rrhh, {})).items).some((a) => a.key === contract.key)).toBe(false);
    const postponed = mine((await alerts.listAlerts(rrhh, { estado: "pospuestas" })).items);
    expect(postponed.find((a) => a.key === contract.key)?.dismissal?.until).not.toBeNull();
    expect((await lastAudit({ userId: rrhh.userId }))?.message).toMatch(/^Alerta pospuesta: Contratos/);

    await alerts.changeAlertState(rrhh, { key: contract.key, action: "descartar" });
    const dismissed = mine((await alerts.listAlerts(rrhh, { estado: "descartadas" })).items);
    expect(dismissed.find((a) => a.key === contract.key)?.dismissal?.until).toBeNull();

    await alerts.changeAlertState(rrhh, { key: contract.key, action: "restaurar" });
    expect(mine((await alerts.listAlerts(rrhh, {})).items).some((a) => a.key === contract.key)).toBe(true);
  });

  it("si cambia el dato, la alerta es otra y vuelve a aparecer", async () => {
    const contract = mine((await alerts.listAlerts(rrhh, {})).items).find((a) => a.kind === "CONTRATO")!;
    await alerts.changeAlertState(rrhh, { key: contract.key, action: "descartar" });
    await db.employee.update({ where: { id: refs.employee }, data: { contractEndDate: day(12) } });
    const again = mine((await alerts.listAlerts(rrhh, {})).items).find((a) => a.kind === "CONTRATO");
    expect(again).toBeDefined();
    expect(again?.key).not.toBe(contract.key);
  });

  it("no acepta claves de alertas que no existen hoy", async () => {
    const error = await errorOf(
      alerts.changeAlertState(rrhh, { key: `CONTRATO:${refs.employee}:2000-01-01`, action: "descartar" }),
    );
    expect(error).toBeInstanceOf(NotFoundError);
  });
});

describe("inicio", () => {
  it("muestra dotación, ingresos del mes y bloques según permisos", async () => {
    const full = await dashboard.getDashboard(rrhh, {});
    expect(full.isCurrent).toBe(true);
    expect(full.next).toBeNull();
    expect(full.staff!.active).toBeGreaterThan(0);
    expect(full.movements!.hires.some((h) => h.id === refs.employee)).toBe(true);
    expect(full.movements!.exits).not.toBeNull();
    expect(full.alerts!.counts.DOCUMENTO).toBeGreaterThan(0);

    const limited = await dashboard.getDashboard(consulta, {});
    expect(limited.movements!.exits).toBeNull();
    expect(limited.alerts!.kinds).not.toContain("DOCUMENTO");
  });

  it("no muestra meses futuros y navega a los anteriores", async () => {
    const future = await dashboard.getDashboard(rrhh, { periodo: "2999-01" });
    expect(periodKey(future.period)).toBe(periodKey(periodOf(today)));
    const previous = await dashboard.getDashboard(rrhh, { periodo: periodKey(future.previous) });
    expect(previous.isCurrent).toBe(false);
    expect(previous.next && periodKey(previous.next)).toBe(periodKey(periodOf(today)));
    expect(previous.movements!.hires.some((h) => h.id === refs.employee)).toBe(false);
  });

  it("el ausentismo suma la ausencia de un día hábil", async () => {
    // Un miércoles del mes anterior, para no depender del día en que corre el test.
    const prev = periodOf(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
    let target = prev;
    while (target.getUTCDay() !== 3) target = new Date(target.getTime() + 86_400_000);
    const holiday = await db.holiday.findFirst({ where: { date: target } });
    if (holiday) target = new Date(target.getTime() + 7 * 86_400_000);
    const worker = await createEmployee("Beto", { hireDate: prev, seniorityDate: prev, contractEndDate: null });
    const query = { periodo: periodKey(prev) };
    const before = (await dashboard.getDashboard(rrhh, query)).absence!;
    await db.attendanceDay.create({
      data: { employeeId: worker.id, date: target, status: "AUSENTE", source: "MANUAL" },
    });
    const after = (await dashboard.getDashboard(rrhh, query)).absence!;
    expect(after.lost - before.lost).toBe(1);
    expect(after.expected).toBe(before.expected);
    expect(toIsoDate(after.from)).toBe(toIsoDate(prev));
  });
});
