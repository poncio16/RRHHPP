/*
 * Estado de los backups y de las pruebas de restauración que registran los
 * scripts del servidor o, en Vercel, GitHub Actions (tabla `backup_run`), para
 * el aviso del inicio (funciones puras).
 */
import { formatDateTime } from "@/lib/format";

export type BackupRunSummary = { finishedAt: Date; ok: boolean; name: string | null; detail: string | null };

/** El último registro de un tipo y el último correcto (el mismo, si el último salió bien). */
export type BackupRuns = { last: BackupRunSummary | null; lastOk: BackupRunSummary | null };

/**
 * - `ok`: el último salió bien y no está atrasado.
 * - `failed`: el último falló.
 * - `stale`: el último salió bien, pero hace más del máximo de Parámetros → Backups.
 * - `none`: no hay ninguno registrado.
 */
export type BackupCheckState = "ok" | "failed" | "stale" | "none";

export type BackupCheck = BackupRuns & {
  state: BackupCheckState;
  /** Texto del aviso en rojo del inicio, o `null` si no hay que avisar. */
  alert: string | null;
};

export type BackupCheckKind = "backup" | "restoreTest";

const TEXTS = {
  backup: {
    last: "El último backup",
    lastOk: "El último backup correcto",
    otherOk: "El último correcto",
    noneOk: "No hay ningún backup correcto registrado.",
    none: "No hay ningún backup registrado",
    noneSince: "No se registró ningún backup desde el",
  },
  restoreTest: {
    last: "La última prueba de restauración",
    lastOk: "La última prueba de restauración correcta",
    otherOk: "La última correcta",
    noneOk: "No hay ninguna prueba de restauración correcta registrada.",
    none: "No hay ninguna prueba de restauración registrada",
    noneSince: "No se registró ninguna prueba de restauración desde el",
  },
} as const;

const HOUR_MS = 3_600_000;

/** "hace menos de una hora", "hace 5 horas", "hace 3 días". */
export function elapsed(from: Date, now: Date): string {
  const hours = Math.floor((now.getTime() - from.getTime()) / HOUR_MS);
  if (hours < 1) return "hace menos de una hora";
  if (hours < 48) return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  return `hace ${Math.floor(hours / 24)} días`;
}

/**
 * Estado de los backups (o de las pruebas de restauración) y el aviso que
 * corresponde. Avisa si el último falló, si el último correcto tiene más de
 * `maxHours` horas o si no hay ninguno y pasaron más de `maxHours` desde
 * `since` (desde cuándo se registran; `null`, desconocido). `maxHours` 0
 * desactiva el aviso: el estado se informa igual.
 */
export function backupCheck(
  kind: BackupCheckKind,
  runs: BackupRuns,
  { now, maxHours, since }: { now: Date; maxHours: number; since: Date | null },
): BackupCheck {
  const texts = TEXTS[kind];
  const enabled = maxHours > 0;
  const tooOld = (date: Date) => now.getTime() - date.getTime() > maxHours * HOUR_MS;
  const { last, lastOk } = runs;

  if (!last) {
    const alert =
      enabled && (!since || tooOld(since))
        ? since
          ? `${texts.noneSince} ${formatDateTime(since)}.`
          : `${texts.none}.`
        : null;
    return { ...runs, state: "none", alert };
  }
  if (!last.ok) {
    const previous = lastOk
      ? `${texts.otherOk} es del ${formatDateTime(lastOk.finishedAt)} (${elapsed(lastOk.finishedAt, now)}).`
      : texts.noneOk;
    const alert = [`${texts.last} falló (${formatDateTime(last.finishedAt)}).`, last.detail, previous]
      .filter(Boolean)
      .join(" ");
    return { ...runs, state: "failed", alert: enabled ? alert : null };
  }
  if (enabled && tooOld(last.finishedAt)) {
    const alert = `${texts.lastOk} es del ${formatDateTime(last.finishedAt)} (${elapsed(last.finishedAt, now)}).`;
    return { ...runs, state: "stale", alert };
  }
  return { ...runs, state: "ok", alert: null };
}
