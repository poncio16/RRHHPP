import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ConflictError, toAppError } from "@/server/errors";

afterAll(async () => {
  await db.$disconnect();
});

describe("base de datos", () => {
  it("aplica las migraciones y responde consultas", async () => {
    const rows = await db.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    expect(rows[0]?.ok).toBe(1);
  });

  it("tiene las extensiones de búsqueda instaladas", async () => {
    const rows = await db.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent') ORDER BY extname`;
    expect(rows.map((r) => r.extname)).toEqual(["pg_trgm", "unaccent"]);
  });

  it("impide modificar o borrar registros de auditoría", async () => {
    const entry = await db.auditLog.create({ data: { action: "CREATE", module: "test", message: "prueba" } });
    await expect(db.auditLog.update({ where: { id: entry.id }, data: { message: "alterado" } })).rejects.toThrow(
      /solo inserción/,
    );
    await expect(db.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/solo inserción/);
  });

  it("traduce una violación de unicidad a un error en español", async () => {
    await db.department.create({ data: { name: "Administración" } });
    const error = await db.department.create({ data: { name: "Administración" } }).catch((e: unknown) => e);
    const appError = toAppError(error);
    expect(appError).toBeInstanceOf(ConflictError);
    expect(appError?.message).toBe("Ya existe un registro con ese nombre.");
  });

  it("rechaza en la base un período de novedades que no empieza el día 1", async () => {
    await expect(
      db.$executeRaw`INSERT INTO payroll_record (id, employee_id, period, gross_reported, deductions_reported, net_reported, updated_at)
        VALUES (gen_random_uuid(), gen_random_uuid(), '2026-10-15', 0, 0, 0, now())`,
    ).rejects.toThrow();
  });
});
