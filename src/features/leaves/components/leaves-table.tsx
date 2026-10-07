import { Lock } from "lucide-react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentDialog, type DocumentTypeChoice } from "@/features/documents/components/document-dialog";
import { formatDate } from "@/lib/format";
import { LEAVE_CLASS_LABELS } from "../constants";
import type { LeaveListItem } from "../service";
import { AnnulLeaveButton } from "./annul-leave-button";
import { CertificateBadge, LeaveStatusBadge, LeaveTimingBadge } from "./leave-badges";
import { LeaveDecisionDialog } from "./leave-decision-dialog";
import { LeaveDialog, type LeaveTypeChoice } from "./leave-dialog";

export type LeaveTableEdit = {
  types: LeaveTypeChoice[];
  canApprove: boolean;
  /** Para adjuntar certificados, si el usuario puede registrar documentación. */
  documents: { types: DocumentTypeChoice[]; limits: { maxFileSizeMb: number; typesLabel: string } } | null;
};

const days = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
const countLabel = (n: number, mode: "CORRIDOS" | "HABILES") =>
  mode === "CORRIDOS"
    ? `${days(n)} ${n === 1 ? "corrido" : "corridos"}`
    : `${days(n)} ${n === 1 ? "hábil" : "hábiles"}`;

/** Tabla de licencias, ausencias, vacaciones y suspensiones, del legajo o general (`showEmployee`). */
export function LeavesTable({
  items,
  showEmployee,
  canApprove,
  edit,
}: {
  items: LeaveListItem[];
  showEmployee: boolean;
  canApprove: boolean;
  /** Presente solo si el usuario puede registrar. */
  edit: LeaveTableEdit | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tipo</TableHead>
          {showEmployee && <TableHead className="hidden md:table-cell">Empleado</TableHead>}
          <TableHead>Período</TableHead>
          <TableHead className="hidden sm:table-cell">Estado</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const name = `${item.employee.lastName}, ${item.employee.firstName}`;
          const title = `${item.leaveType.name} de ${name}`;
          const range = `Del ${formatDate(item.startDate)} al ${formatDate(item.endDate)}`;
          const active = item.status === "SOLICITADA" || item.status === "APROBADA";
          const editable =
            !!edit && !item.hidden && (item.status === "SOLICITADA" || (item.status === "APROBADA" && canApprove));
          const status = (
            <span className="flex flex-wrap items-center gap-1">
              <LeaveStatusBadge status={item.status} />
              <LeaveTimingBadge timing={item.timing} status={item.status} />
              {active && <CertificateBadge state={item.certificate} />}
            </span>
          );
          return (
            <TableRow key={item.id} className={active ? undefined : "opacity-60"}>
              <TableCell className="align-top">
                <span className="flex items-center gap-1.5 font-medium">
                  {item.leaveType.name}
                  {item.leaveType.isSensitive && (
                    <Lock className="text-muted-foreground size-3.5" aria-label="Dato de salud" />
                  )}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {LEAVE_CLASS_LABELS[item.leaveType.class]}
                  {item.vacationYear !== null && ` · período ${item.vacationYear}`}
                </span>
                {showEmployee && (
                  <Link
                    href={`/empleados/${item.employee.id}/licencias`}
                    className="text-primary block text-sm hover:underline md:hidden"
                  >
                    {name}
                  </Link>
                )}
                {item.notes && (
                  <span className="text-muted-foreground line-clamp-2 block max-w-xs text-xs whitespace-pre-line">
                    {item.notes}
                  </span>
                )}
                {item.decisionNotes && (
                  <span className="text-muted-foreground line-clamp-2 block max-w-xs text-xs whitespace-pre-line">
                    {item.status === "RECHAZADA" ? "Motivo del rechazo: " : ""}
                    {item.decisionNotes}
                  </span>
                )}
                <span className="mt-1 block sm:hidden">{status}</span>
              </TableCell>
              {showEmployee && (
                <TableCell className="hidden align-top md:table-cell">
                  <Link href={`/empleados/${item.employee.id}/licencias`} className="text-primary hover:underline">
                    {name}
                  </Link>
                  <span className="text-muted-foreground block text-xs">Legajo {item.employee.fileNumber}</span>
                </TableCell>
              )}
              <TableCell className="align-top">
                <span className="block sm:whitespace-nowrap">
                  <span className="inline-block whitespace-nowrap">{formatDate(item.startDate)} –</span>{" "}
                  <span className="inline-block">{formatDate(item.endDate)}</span>
                </span>
                <span className="text-muted-foreground block text-xs">
                  {countLabel(item.days, item.leaveType.countingMode)}
                </span>
              </TableCell>
              <TableCell className="hidden align-top sm:table-cell">
                {status}
                {item.decidedBy && (
                  <span className="text-muted-foreground mt-1 block text-xs">
                    {item.status === "RECHAZADA" ? "Rechazó" : "Aprobó"} {item.decidedBy}
                  </span>
                )}
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                  {canApprove && item.status === "SOLICITADA" && !item.hidden && (
                    <LeaveDecisionDialog
                      id={item.id}
                      version={item.version}
                      title={title}
                      summary={`${range}: ${days(item.days)}.`}
                    />
                  )}
                  {edit?.documents && active && item.certificate && (
                    <DocumentDialog
                      employeeId={item.employee.id}
                      types={edit.documents.types}
                      limits={edit.documents.limits}
                      leave={{ id: item.id, label: `${title} (${range.toLowerCase()})` }}
                    />
                  )}
                  {editable && item.formValues && (
                    <LeaveDialog
                      employeeId={item.employee.id}
                      types={edit.types}
                      canApprove={edit.canApprove}
                      leave={{
                        id: item.id,
                        version: item.version,
                        title: `${title} (${range.toLowerCase()})`,
                        status: item.status,
                        values: item.formValues,
                      }}
                    />
                  )}
                  {edit && active && !item.hidden && (
                    <AnnulLeaveButton id={item.id} version={item.version} title={title} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
