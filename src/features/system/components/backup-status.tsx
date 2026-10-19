import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { type BackupCheck, elapsed } from "../backups";
import type { BackupStatus } from "../service";

/** Aviso en rojo del inicio: un backup o una prueba de restauración que falló o está atrasado. */
export function BackupAlert({ status }: { status: BackupStatus }) {
  const alerts = [status.backup.alert, status.restoreTest.alert].filter((alert) => alert !== null);
  if (alerts.length === 0) return null;
  return (
    <Alert variant="destructive">
      <p className="font-medium">Revisá los backups</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {alerts.map((alert) => (
          <li key={alert}>{alert}</li>
        ))}
      </ul>
      <p className="mt-2">
        Quien administra el servidor encuentra el detalle en el log de los backups (docs/operacion.md, sección 10).
      </p>
    </Alert>
  );
}

/** Último backup y última prueba de restauración, con su estado. */
export function BackupCard({ status, now }: { status: BackupStatus; now: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backups</CardTitle>
        <CardDescription>Los registran los scripts de backup del servidor.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="space-y-4">
          <BackupRow check={status.backup} now={now} texts={BACKUP_TEXTS} />
          <BackupRow check={status.restoreTest} now={now} texts={RESTORE_TEST_TEXTS} />
        </dl>
        <p className="text-muted-foreground text-xs">
          Cuándo avisar se cambia en{" "}
          <Link href="/configuracion/parametros#backups" className="text-foreground underline underline-offset-4">
            Parámetros → Backups
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

type RowTexts = { title: string; none: string; lastOk: string; ok: string; stale: string };

const BACKUP_TEXTS: RowTexts = {
  title: "Último backup",
  none: "Todavía no se registró ninguno.",
  lastOk: "Último correcto",
  ok: "Correcto",
  stale: "Atrasado",
};

const RESTORE_TEST_TEXTS: RowTexts = {
  title: "Última prueba de restauración",
  none: "Todavía no se registró ninguna.",
  lastOk: "Última correcta",
  ok: "Correcta",
  stale: "Atrasada",
};

function stateBadge(check: BackupCheck, texts: RowTexts) {
  switch (check.state) {
    case "ok":
      return { label: texts.ok, variant: "success" } as const;
    case "failed":
      return { label: "Falló", variant: "destructive" } as const;
    case "stale":
      return { label: texts.stale, variant: "destructive" } as const;
    case "none":
      return { label: "Sin registros", variant: check.alert ? "destructive" : "muted" } as const;
  }
}

function BackupRow({ check, now, texts }: { check: BackupCheck; now: Date; texts: RowTexts }) {
  const { last, lastOk } = check;
  const badge = stateBadge(check, texts);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <dt className="text-muted-foreground">{texts.title}</dt>
      <dd>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </dd>
      {last ? (
        <dd className="col-span-2 space-y-0.5">
          <p>
            {formatDateTime(last.finishedAt)}{" "}
            <span className="text-muted-foreground">({elapsed(last.finishedAt, now)})</span>
          </p>
          {(last.name || last.detail) && (
            <p className="text-muted-foreground text-xs break-words">
              {[last.name, last.detail].filter(Boolean).join(" · ")}
            </p>
          )}
          {!last.ok && lastOk && (
            <p className="text-muted-foreground text-xs">
              {texts.lastOk}: {formatDateTime(lastOk.finishedAt)} ({elapsed(lastOk.finishedAt, now)}).
            </p>
          )}
        </dd>
      ) : (
        // Sin registros: en rojo, el texto del aviso dice desde cuándo faltan.
        <dd className="text-muted-foreground col-span-2">{check.alert ?? texts.none}</dd>
      )}
    </div>
  );
}
