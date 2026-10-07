import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodNav } from "@/components/list/period-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeDays, daysBetween } from "@/features/alerts/build";
import { ALERT_KIND_LABELS } from "@/features/alerts/constants";
import { DistributionCard } from "@/features/dashboard/components/distribution-card";
import { EventList } from "@/features/dashboard/components/event-list";
import { StatTile } from "@/features/dashboard/components/stat-tile";
import { getDashboard } from "@/features/dashboard/service";
import { getSystemStatus } from "@/features/system/service";
import {
  formatDate,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatPeriod,
  periodKey,
  todayInTimeZone,
} from "@/lib/format";
import { flattenSearchParams } from "@/lib/list/query";
import { hasPermission } from "@/server/authz";
import { requirePageAccess } from "@/server/auth/request";

export const metadata: Metadata = { title: "Inicio" };

type Props = PageProps<"/dashboard">;

export default function DashboardPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader title="Inicio" description="Indicadores calculados en este momento con los datos cargados." />
      <Suspense fallback={<DashboardSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

const days = (n: number) => (n === 1 ? "1 día" : `${formatInteger(n)} días`);
const people = (n: number) => (n === 1 ? "1 persona" : `${formatInteger(n)} personas`);

async function Content({ searchParams }: Pick<Props, "searchParams">) {
  const { ctx } = await requirePageAccess();
  const data = await getDashboard(ctx, flattenSearchParams(await searchParams));
  const { staff, movements, absence, leaves, alerts } = data;
  const today = todayInTimeZone();
  const link = (period: Date | null) => (period ? `/dashboard?periodo=${periodKey(period)}` : null);
  const pendingAlerts = alerts ? Object.values(alerts.counts).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const alertsOf = (kind: keyof typeof ALERT_KIND_LABELS) => alerts?.items.filter((a) => a.kind === kind) ?? [];
  const showConfig = hasPermission(ctx, "config:manage");

  if (!staff && !leaves && !absence) {
    return (
      <div className="space-y-6">
        <Card>
          <EmptyState
            title="No hay indicadores para mostrar"
            description="Tu rol no tiene acceso a datos de personal. Pedile a quien administra el sistema que revise tus permisos."
          />
        </Card>
        {showConfig && <SystemStatusSection />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="hoy" className="space-y-3">
        <h2 id="hoy" className="text-lg font-semibold">
          Hoy, {formatDate(today)}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {staff && (
            <StatTile
              label="Personal activo"
              value={formatInteger(staff.active)}
              hint={[
                leaves && leaves.suspended > 0
                  ? `${formatInteger(leaves.suspended)} ${leaves.suspended === 1 ? "suspendido" : "suspendidos"} hoy`
                  : null,
                `${formatInteger(staff.inactive)} egresados`,
                `${formatInteger(staff.total)} legajos`,
              ]
                .filter(Boolean)
                .join(" · ")}
              href="/empleados"
            />
          )}
          {staff && (
            <StatTile
              label="Antigüedad promedio"
              value={staff.averageSeniority === null ? "—" : `${formatDecimal(staff.averageSeniority)} años`}
              hint="Del personal activo, desde la fecha de antigüedad reconocida."
            />
          )}
          {leaves && (
            <StatTile
              label="Licencias en curso"
              value={formatInteger(leaves.current.length)}
              hint={`${leaves.current.filter((l) => l.leaveClass === "VACACIONES").length} de vacaciones`}
              href="/licencias"
            />
          )}
          {leaves && (
            <StatTile
              label="Vacaciones pendientes"
              value={days(leaves.pendingVacationDays)}
              hint={`De ${people(leaves.pendingVacationPeople)}, en períodos hasta ${today.getUTCFullYear()}.`}
              href="/vacaciones"
            />
          )}
          {alerts && (
            <StatTile
              label="Alertas pendientes"
              value={formatInteger(pendingAlerts)}
              hint="Sin las pospuestas ni las descartadas."
              href="/alertas"
            />
          )}
        </div>
      </section>

      <section aria-labelledby="periodo" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="periodo" className="text-lg font-semibold">
            Movimientos del mes
          </h2>
          <PeriodNav label={formatPeriod(data.period)} prevHref={link(data.previous)!} nextHref={link(data.next)} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {movements && <StatTile label="Ingresos" value={formatInteger(movements.hires.length)} />}
          {movements?.exits && (
            <StatTile label="Egresos confirmados" value={formatInteger(movements.exits.length)} href="/egresos" />
          )}
          {absence && (
            <StatTile
              label="Ausentismo"
              value={absence.rate === null ? "—" : formatPercent(absence.rate)}
              hint={
                absence.expected === 0
                  ? "No hay días de trabajo previstos en el período."
                  : `${days(absence.lost)} perdidos de ${formatInteger(absence.expected)} previstos (${people(absence.people)})${data.isCurrent ? `, hasta el ${formatDate(data.measuredUntil)}` : ""}.`
              }
            />
          )}
        </div>
        {absence && (
          <p className="text-muted-foreground text-xs">
            El ausentismo suma las ausencias de asistencia y las licencias aprobadas de tipos marcados “Cuenta para el
            ausentismo”, sobre los días hábiles de cada persona según su horario, sin feriados.
          </p>
        )}
        {movements && (
          <div className="grid gap-3 md:grid-cols-2">
            <EventList
              title="Ingresos"
              empty="No hubo ingresos en el mes."
              rows={movements.hires.map((h) => ({
                key: h.id,
                employee: h,
                primary: formatDate(h.hireDate),
                secondary: h.position.name,
              }))}
            />
            {movements.exits && (
              <EventList
                title="Egresos"
                empty="No hubo egresos confirmados en el mes."
                moreHref="/egresos"
                rows={movements.exits.map((e) => ({
                  key: e.id,
                  employee: e.employee,
                  primary: formatDate(e.exitDate),
                  secondary: e.exitType.label,
                }))}
              />
            )}
          </div>
        )}
      </section>

      {staff && (
        <section aria-labelledby="distribucion" className="space-y-3">
          <h2 id="distribucion" className="text-lg font-semibold">
            Personal activo por…
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <DistributionCard title="Sector" items={staff.byDepartment} />
            <DistributionCard title="Puesto" items={staff.byPosition} />
            <DistributionCard title="Tipo de contratación" items={staff.byContract} />
            <DistributionCard title="Modalidad de trabajo" items={staff.byModality} />
          </div>
        </section>
      )}

      {(leaves || alerts) && (
        <section aria-labelledby="proximos" className="space-y-3">
          <h2 id="proximos" className="text-lg font-semibold">
            En curso y próximos
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {leaves && (
              <EventList
                title="Licencias en curso"
                empty="Nadie está de licencia hoy."
                moreHref="/licencias"
                rows={leaves.current.map((l) => ({
                  key: l.id,
                  employee: l.employee,
                  primary: `hasta el ${formatDate(l.endDate)}`,
                  secondary: l.type,
                }))}
              />
            )}
            {alerts?.kinds.includes("VACACIONES") && (
              <EventList
                title="Próximas vacaciones"
                empty="No hay vacaciones aprobadas que empiecen pronto."
                moreHref="/vacaciones"
                rows={alertsOf("VACACIONES").map((a) => ({
                  key: a.key,
                  employee: a.employee,
                  href: a.href,
                  primary: relativeDays(daysBetween(today, a.date)),
                  secondary: a.detail,
                }))}
              />
            )}
            {alerts?.kinds.includes("DOCUMENTO") && (
              <EventList
                title="Documentos por vencer"
                empty="No hay documentos vencidos ni por vencer."
                moreHref="/alertas?tipo=DOCUMENTO"
                moreLabel="Ver en alertas"
                rows={alertsOf("DOCUMENTO").map((a) => ({
                  key: a.key,
                  employee: a.employee,
                  href: a.href,
                  primary: relativeDays(daysBetween(today, a.date)),
                  secondary: a.title,
                }))}
              />
            )}
            {alerts?.kinds.includes("CUMPLEANOS") && (
              <EventList
                title="Próximos cumpleaños"
                empty="No hay cumpleaños en los próximos días."
                moreHref="/alertas?tipo=CUMPLEANOS"
                moreLabel="Ver en alertas"
                rows={alertsOf("CUMPLEANOS").map((a) => ({
                  key: a.key,
                  employee: a.employee,
                  href: a.href,
                  primary: relativeDays(daysBetween(today, a.date)),
                  secondary: a.detail,
                }))}
              />
            )}
          </div>
        </section>
      )}

      {alerts && (
        <section aria-labelledby="alertas" className="space-y-3">
          <h2 id="alertas" className="text-lg font-semibold">
            Alertas pendientes
          </h2>
          <Card>
            <ul className="divide-y">
              {alerts.kinds.map((kind) => {
                const count = alerts.counts[kind] ?? 0;
                return (
                  <li key={kind}>
                    <Link
                      href={`/alertas?tipo=${kind}`}
                      className="hover:bg-muted/50 flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <span>{ALERT_KIND_LABELS[kind]}</span>
                      {count > 0 ? (
                        <Badge variant="warning">{formatInteger(count)}</Badge>
                      ) : (
                        <span className="text-muted-foreground tabular-nums">0</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {showConfig && <SystemStatusSection />}
    </div>
  );
}

async function SystemStatusSection() {
  const status = await getSystemStatus();
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Estado de la instalación</CardTitle>
        <CardDescription>Información leída en este momento de la base de datos.</CardDescription>
      </CardHeader>
      <CardContent>
        {status.database === "error" ? (
          <p className="text-destructive text-sm">
            No se pudo conectar con la base de datos. Revisá DATABASE_URL y que PostgreSQL esté en marcha.
          </p>
        ) : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Base de datos</dt>
            <dd>
              <Badge variant="success">Conectada</Badge>
            </dd>
            <dt className="text-muted-foreground">Migraciones aplicadas</dt>
            <dd className="text-right tabular-nums">{status.migrations}</dd>
            <dt className="text-muted-foreground">Provincias cargadas</dt>
            <dd className="text-right tabular-nums">{status.reference.provinces}</dd>
            <dt className="text-muted-foreground">Valores de listas de referencia</dt>
            <dd className="text-right tabular-nums">{status.reference.lookupValues}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
