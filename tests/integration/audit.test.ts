import { beforeAll, describe, expect, it } from "vitest";
import { getAuditEntry, getAuditFilterOptions, listAuditLog } from "@/features/audit/service";
import { exportResource } from "@/features/reports/export";
import { ADMIN_ROLE } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let admin: ActorContext;
let rrhh: ActorContext;
const tag = `aud-${Date.now().toString(36)}`;
const ids = {} as Record<"department" | "update" | "denied" | "old", string>;

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba un error");
}

beforeAll(async () => {
  admin = await actorFor((await createTestUser(ADMIN_ROLE)).id);
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  ids.department = (await db.department.create({ data: { name: `Sector ${tag}` } })).id;
  const base = { module: tag, userId: admin.userId, userEmail: admin.email };
  ids.update = (
    await db.auditLog.create({
      data: {
        ...base,
        action: "UPDATE",
        entityType: "Employee",
        entityId: "0190a000-0000-7000-8000-0000000000aa",
        before: { lastName: "Antes", departmentId: null },
        after: { lastName: "Después", departmentId: ids.department },
        message: `Modificación ${tag}`,
        ip: "203.0.113.5",
      },
    })
  ).id;
  ids.denied = (
    await db.auditLog.create({
      data: { ...base, action: "ACCESS_DENIED", result: "DENIED", message: `Denegado ${tag}` },
    })
  ).id;
  ids.old = (
    await db.auditLog.create({
      data: { ...base, action: "CREATE", occurredAt: new Date("2025-01-15T12:00:00Z"), message: `Viejo ${tag}` },
    })
  ).id;
});

describe("visor de auditoría", () => {
  it("solo quien tiene 'Ver auditoría' accede, y el intento queda registrado", async () => {
    expect(await errorOf(listAuditLog(rrhh, {}))).toBeInstanceOf(ForbiddenError);
    expect(await lastAudit({ userId: rrhh.userId })).toMatchObject({
      action: "ACCESS_DENIED",
      module: "auditoria",
      result: "DENIED",
    });
    expect(await errorOf(getAuditEntry(rrhh, ids.update))).toBeInstanceOf(ForbiddenError);
  });

  it("filtra por módulo, acción, resultado, fechas, registro y texto", async () => {
    const ids_ = async (query: Record<string, string>) =>
      (await listAuditLog(admin, { modulo: tag, ...query })).items.map((e) => e.id);
    expect(await ids_({})).toEqual([ids.denied, ids.update, ids.old]);
    expect(await ids_({ accion: "UPDATE" })).toEqual([ids.update]);
    expect(await ids_({ resultado: "DENIED" })).toEqual([ids.denied]);
    expect(await ids_({ desde: "2025-01-15", hasta: "2025-01-15" })).toEqual([ids.old]);
    expect(await ids_({ hasta: "2025-01-14" })).toEqual([]);
    expect(await ids_({ entidad: "Employee", registro: "0190a000-0000-7000-8000-0000000000aa" })).toEqual([ids.update]);
    expect(await ids_({ q: `viejo ${tag}` })).toEqual([ids.old]);
    expect(await ids_({ usuario: rrhh.userId })).toEqual([]);
    const page = await listAuditLog(admin, { modulo: tag, pageSize: "10" });
    expect(page.total).toBe(3);

    const options = await getAuditFilterOptions(admin);
    expect(options.modules.map((m) => m.value)).toContain(tag);
    expect(options.users.map((u) => u.value)).toContain(admin.userId);
  });

  it("el detalle muestra el antes y el después con nombres legibles", async () => {
    const entry = await getAuditEntry(admin, ids.update);
    expect(entry).toMatchObject({ action: "UPDATE", ip: "203.0.113.5", user: { email: admin.email } });
    expect(entry.diff).toEqual([
      { field: "lastName", label: "Apellido", before: "Antes", after: "Después", changed: true },
      { field: "departmentId", label: "Sector", before: null, after: `Sector ${tag}`, changed: true },
    ]);
    expect(await errorOf(getAuditEntry(admin, "0190a000-0000-7000-8000-0000000000ff"))).toBeInstanceOf(NotFoundError);
  });

  it("se exporta con los filtros y la exportación también queda auditada", async () => {
    const file = await exportResource(admin, "auditoria", { modulo: tag, accion: "UPDATE", formato: "csv" });
    expect(file.fileName).toMatch(/^auditoria-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = String(file.body);
    expect(csv).toContain(`Modificación ${tag}`);
    expect(csv).not.toContain(`Denegado ${tag}`);
    expect(await lastAudit({ userId: admin.userId })).toMatchObject({
      action: "EXPORT",
      module: "auditoria",
      message: "Exportó el listado Auditoría (CSV, 1 fila)",
    });
    expect(await errorOf(exportResource(rrhh, "auditoria", { formato: "csv" }))).toBeInstanceOf(ForbiddenError);
  });

  it("la tabla de auditoría no admite cambios ni borrados", async () => {
    await expect(db.auditLog.update({ where: { id: ids.old }, data: { message: "x" } })).rejects.toThrow();
    await expect(db.auditLog.delete({ where: { id: ids.old } })).rejects.toThrow();
  });
});
