import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditAction, AuditResult } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { ACTION_LABELS, moduleLabel, RESULT_LABELS } from "../constants";

export type AuditListItem = {
  id: string;
  occurredAt: Date;
  userEmail: string | null;
  action: AuditAction;
  module: string;
  result: AuditResult;
  message: string | null;
  user: { name: string } | null;
};

export function AuditTable({ items }: { items: AuditListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha y hora</TableHead>
          <TableHead>Evento</TableHead>
          <TableHead className="hidden md:table-cell">Usuario</TableHead>
          <TableHead className="hidden lg:table-cell">Módulo</TableHead>
          <TableHead className="hidden sm:table-cell">Resultado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="align-top whitespace-nowrap tabular-nums">
              <Link href={`/auditoria/${e.id}`} className="text-primary hover:underline">
                {formatDateTime(e.occurredAt)}
              </Link>
            </TableCell>
            <TableCell className="align-top">
              <span className="font-medium">{ACTION_LABELS[e.action]}</span>
              {e.message && <span className="text-muted-foreground block text-xs break-words">{e.message}</span>}
              <span className="text-muted-foreground block text-xs md:hidden">
                {e.user?.name ?? e.userEmail ?? "Sin usuario"} · {moduleLabel(e.module)}
              </span>
              {e.result !== "SUCCESS" && (
                <Badge variant={RESULT_LABELS[e.result].variant} className="mt-1 sm:hidden">
                  {RESULT_LABELS[e.result].label}
                </Badge>
              )}
            </TableCell>
            <TableCell className="hidden align-top md:table-cell">
              {e.user?.name ?? <span className="text-muted-foreground">{e.userEmail ?? "Sin usuario"}</span>}
            </TableCell>
            <TableCell className="hidden align-top lg:table-cell">{moduleLabel(e.module)}</TableCell>
            <TableCell className="hidden align-top sm:table-cell">
              <Badge variant={RESULT_LABELS[e.result].variant}>{RESULT_LABELS[e.result].label}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
