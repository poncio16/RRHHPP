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
          <BackupRow
            title="Último backup"
            check={status.backup}
            now={now}
            none="Todavía no se registró ninguno."
            lastOk="Último correcto"
          />
          <BackupRow
            title="Última prueba de restauración"
            check={status.restoreTest}
            now={now}
            none="Todavía no se registró ninguna."
            lastOk="Última correcta"
          />
        </dl>
        <p className="text-muted-foreground text-xs">
          Cuándo avisar se cambia en{" "}
          <Link href="/configuracion/parametros" className="text-foreground underline underline-offset-4">
            Parámetros
          </Link>{" "}
          → Backups.
        </p>
      </CardContent>
    </Card>
  );
}

function stateBadge(check: BackupCheck): { label: string; variant: "success" | "destructive" | "muted" } {
  switch (check.state) {
    case "ok":
      return { label: "Correcto", variant: "success" };
    case "failed":
      return { label: "Falló", variant: "destructive" };
    case "stale":
      return { label: "Atrasado", variant: "destructive" };
    case "none":
      return { label: "Sin registros", variant: check.alert ? "destructive" : "muted" };
  }
}

function BackupRow({
  title,
  check,
  now,
  none,
  lastOk,
}: {
  title: string;
  check: BackupCheck;
  now: Date;
  none: string;
  lastOk: string;
}) {
  const { last } = check;
  const badge = stateBadge(check);
  return (
    <div className="space-y-1">
      <dt className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{title}</span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </dt>
      {last ? (
        <dd className="space-y-0.5">
          <p>
            {formatDateTime(last.finishedAt)}{" "}
            <span className="text-muted-foreground">({elapsed(last.finishedAt, now)})</span>
          </p>
          {(last.name || last.detail) && (
            <p className="text-muted-foreground text-xs break-words">
              {[last.name, last.detail].filter(Boolean).join(" · ")}
            </p>
          )}
          {!last.ok && check.lastOk && (
            <p className="text-muted-foreground text-xs">
              {lastOk}: {formatDateTime(check.lastOk.finishedAt)} ({elapsed(check.lastOk.finishedAt, now)}).
            </p>
          )}
        </dd>
      ) : (
        <dd className="text-muted-foreground">{none}</dd>
      )}
    </div>
  );
}
