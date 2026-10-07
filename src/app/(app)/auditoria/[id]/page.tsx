import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ListSkeleton } from "@/components/feedback/list-skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTION_LABELS, entityHref, moduleLabel, RESULT_LABELS } from "@/features/audit/constants";
import { getAuditEntry } from "@/features/audit/service";
import { formatDateTime } from "@/lib/format";
import { z } from "@/lib/zod";
import { requirePageAccess } from "@/server/auth/request";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Evento de auditoría" };

type Props = PageProps<"/auditoria/[id]">;

/** Solo los valores largos sin espacios (IDs, JSON) se cortan en cualquier carácter. */
const wrap = (value: string | null) => (value && value.length > 20 && !/\s/.test(value) ? "break-all" : "break-words");

export default function AuditEntryPage({ params }: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const access = await requirePageAccess("audit:read", "auditoria");
  if (!access.allowed) return <AccessDenied />;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const entry = await getAuditEntry(access.ctx, id.data).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const href = entityHref(entry.entityType, entry.entityId);
  const isUpdate = entry.diff.some((row) => row.changed) || (entry.before !== null && entry.after !== null);

  const facts: [string, React.ReactNode][] = [
    ["Fecha y hora", formatDateTime(entry.occurredAt)],
    [
      "Usuario",
      entry.user ? (
        <Link href={`/usuarios/${entry.userId}`} className="text-primary hover:underline">
          {entry.user.name} ({entry.user.email})
        </Link>
      ) : (
        (entry.userEmail ?? "Sin usuario")
      ),
    ],
    ["Módulo", moduleLabel(entry.module)],
    [
      "Registro afectado",
      entry.entityType ? (
        <span className="break-all">
          {entry.entityType}{" "}
          {href ? (
            <Link href={href} className="text-primary hover:underline">
              {entry.entityId}
            </Link>
          ) : (
            entry.entityId
          )}
          {entry.entityId && (
            <Link
              href={`/auditoria?entidad=${encodeURIComponent(entry.entityType)}&registro=${encodeURIComponent(entry.entityId)}`}
              className="text-primary ml-2 text-xs whitespace-nowrap hover:underline"
            >
              Otros eventos de este registro
            </Link>
          )}
        </span>
      ) : (
        "—"
      ),
    ],
    ["IP", entry.ip ?? "—"],
    [
      "Navegador",
      <span key="ua" className="break-all">
        {entry.userAgent ?? "—"}
      </span>,
    ],
  ];

  return (
    <>
      <Link
        href="/auditoria"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Auditoría
      </Link>
      <PageHeader
        title={ACTION_LABELS[entry.action]}
        description={entry.message ?? undefined}
        actions={<Badge variant={RESULT_LABELS[entry.result].variant}>{RESULT_LABELS[entry.result].label}</Badge>}
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="pt-5">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        {entry.diff.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{isUpdate ? "Cambios" : "Datos registrados"}</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  {isUpdate && <TableHead>Antes</TableHead>}
                  <TableHead>{isUpdate ? "Después" : "Valor"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.diff.map((row) => (
                  <TableRow key={row.field || row.label}>
                    <TableCell className="text-muted-foreground align-top">{row.label}</TableCell>
                    {isUpdate && <TableCell className={`align-top ${wrap(row.before)}`}>{row.before ?? "—"}</TableCell>}
                    <TableCell
                      className={`align-top ${wrap(isUpdate ? row.after : (row.after ?? row.before))} ${row.changed ? "font-medium" : ""}`}
                    >
                      {(isUpdate ? row.after : (row.after ?? row.before)) ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        <p className="text-muted-foreground text-xs">
          Sectores, puestos, catálogos y empleados se muestran por su nombre actual; otros identificadores, como se
          guardaron. Las contraseñas nunca se registran y el CBU queda enmascarado.
        </p>
      </div>
    </>
  );
}
