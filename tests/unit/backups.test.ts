import { describe, expect, it } from "vitest";
import { backupCheck, elapsed, type BackupRunSummary } from "@/features/system/backups";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";

// Horas UTC: en la zona de la empresa (UTC-3), 06:30Z son las 03:30.
const at = (iso: string) => new Date(`${iso}Z`);
const run = (iso: string, ok: boolean, detail: string | null = null): BackupRunSummary => ({
  finishedAt: at(iso),
  ok,
  name: ok ? "rrhh-20261019T063000Z" : null,
  detail,
});

const now = at("2026-10-19T12:00:00");
const installed = at("2026-10-01T10:00:00");
const daily = { now, maxHours: 26, since: installed };

describe("elapsed", () => {
  it("cuenta horas hasta dos días y después días", () => {
    expect(elapsed(at("2026-10-19T11:30:00"), now)).toBe("hace menos de una hora");
    expect(elapsed(at("2026-10-19T11:00:00"), now)).toBe("hace 1 hora");
    expect(elapsed(at("2026-10-18T12:00:01"), now)).toBe("hace 23 horas");
    expect(elapsed(at("2026-10-17T12:00:01"), now)).toBe("hace 47 horas");
    expect(elapsed(at("2026-10-17T12:00:00"), now)).toBe("hace 2 días");
    expect(elapsed(at("2026-09-19T12:00:00"), now)).toBe("hace 30 días");
  });

  it("un registro con la hora adelantada no da un tiempo negativo", () => {
    expect(elapsed(at("2026-10-19T12:05:00"), now)).toBe("hace menos de una hora");
  });
});

describe("backupCheck", () => {
  it("el último backup correcto dentro del máximo no avisa", () => {
    const ok = run("2026-10-19T06:30:00", true, "12M");
    const check = backupCheck("backup", { last: ok, lastOk: ok }, daily);
    expect(check).toMatchObject({ state: "ok", alert: null, last: ok, lastOk: ok });
  });

  it("avisa si el último correcto tiene más del máximo de horas", () => {
    const ok = run("2026-10-18T09:59:00", true);
    expect(backupCheck("backup", { last: ok, lastOk: ok }, daily)).toMatchObject({
      state: "stale",
      alert: "El último backup correcto es del 18/10/2026 06:59 (hace 26 horas).",
    });
    // Justo en el máximo, todavía no.
    const limit = run("2026-10-18T10:00:00", true);
    expect(backupCheck("backup", { last: limit, lastOk: limit }, daily).state).toBe("ok");
  });

  it("avisa si el último falló, con el motivo y el último correcto, aunque sea reciente", () => {
    const failed = run("2026-10-19T06:31:00", false, "Error al copiar la base de datos.");
    const ok = run("2026-10-18T06:30:00", true);
    expect(backupCheck("backup", { last: failed, lastOk: ok }, daily)).toMatchObject({
      state: "failed",
      alert:
        "El último backup falló (19/10/2026 03:31). Error al copiar la base de datos. El último correcto es del 18/10/2026 03:30 (hace 29 horas).",
    });
    expect(backupCheck("backup", { last: failed, lastOk: null }, daily).alert).toBe(
      "El último backup falló (19/10/2026 03:31). Error al copiar la base de datos. No hay ningún backup correcto registrado.",
    );
  });

  it("un fallo sin motivo registrado se avisa igual", () => {
    const failed = run("2026-10-19T06:31:00", false);
    expect(backupCheck("backup", { last: failed, lastOk: null }, daily).alert).toBe(
      "El último backup falló (19/10/2026 03:31). No hay ningún backup correcto registrado.",
    );
  });

  it("sin registros, avisa recién cuando pasó el máximo desde que se registran", () => {
    const none = { last: null, lastOk: null };
    expect(backupCheck("backup", none, { ...daily, since: at("2026-10-18T12:00:00") })).toMatchObject({
      state: "none",
      alert: null,
    });
    expect(backupCheck("backup", none, daily)).toMatchObject({
      state: "none",
      alert: "No se registró ningún backup desde el 01/10/2026 07:00.",
    });
    // Si no se sabe desde cuándo, avisa enseguida.
    expect(backupCheck("backup", none, { ...daily, since: null }).alert).toBe("No hay ningún backup registrado.");
  });

  it("con máximo 0 informa el estado sin avisar", () => {
    const off = { ...daily, maxHours: 0 };
    const old = run("2026-01-01T06:30:00", true);
    const failed = run("2026-10-19T06:31:00", false, "Error al copiar la base de datos.");
    expect(backupCheck("backup", { last: old, lastOk: old }, off)).toMatchObject({ state: "ok", alert: null });
    expect(backupCheck("backup", { last: failed, lastOk: old }, off)).toMatchObject({ state: "failed", alert: null });
    expect(backupCheck("backup", { last: null, lastOk: null }, { ...off, since: null })).toMatchObject({
      state: "none",
      alert: null,
    });
  });

  it("las pruebas de restauración usan sus propios textos", () => {
    const weekly = { now, maxHours: 35 * 24, since: at("2026-08-01T00:00:00") };
    const ok = run("2026-09-01T07:30:00", true, "15230 filas, 412 archivos.");
    expect(backupCheck("restoreTest", { last: ok, lastOk: ok }, weekly).alert).toBe(
      "La última prueba de restauración correcta es del 01/09/2026 04:30 (hace 48 días).",
    );
    const failed = run(
      "2026-10-18T07:30:00",
      false,
      "1 problema: faltan los triggers que impiden modificar audit_log (hay 0).",
    );
    expect(backupCheck("restoreTest", { last: failed, lastOk: ok }, weekly).alert).toBe(
      "La última prueba de restauración falló (18/10/2026 04:30). 1 problema: faltan los triggers que impiden modificar audit_log (hay 0). La última correcta es del 01/09/2026 04:30 (hace 48 días).",
    );
    expect(backupCheck("restoreTest", { last: failed, lastOk: null }, weekly).alert).toContain(
      "No hay ninguna prueba de restauración correcta registrada.",
    );
    expect(backupCheck("restoreTest", { last: null, lastOk: null }, weekly).alert).toBe(
      "No se registró ninguna prueba de restauración desde el 31/07/2026 21:00.",
    );
  });
});

describe("parámetros de backups", () => {
  it("26 horas y 35 días por defecto; 0 desactiva el aviso", () => {
    const { schema } = SETTING_DEFINITIONS.backups;
    expect(schema.parse({})).toEqual({ maxHoursWithoutBackup: 26, maxDaysWithoutRestoreTest: 35 });
    expect(schema.safeParse({ maxHoursWithoutBackup: 0, maxDaysWithoutRestoreTest: 0 }).success).toBe(true);
    expect(schema.safeParse({ maxHoursWithoutBackup: 721 }).success).toBe(false);
    expect(schema.safeParse({ maxDaysWithoutRestoreTest: 366 }).success).toBe(false);
    expect(schema.safeParse({ maxHoursWithoutBackup: 1.5 }).success).toBe(false);
  });
});
