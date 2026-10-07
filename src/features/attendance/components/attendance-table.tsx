import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { DAY_SHORT } from "@/features/schedules/calc";
import { isoWeekday } from "@/features/leaves/days";
import { formatMinutes } from "../calc";
import type { AttendanceItem } from "../service";
import { AttendanceStatusBadge } from "./attendance-badges";
import { AttendanceDialog } from "./attendance-dialog";

const minutesCell = (n: number) => (n > 0 ? formatMinutes(n) : "—");

/** Días de asistencia cargados, del legajo o de todo el personal (`showEmployee`). */
export function AttendanceTable({
  items,
  showEmployee,
  canEdit,
  today,
}: {
  items: AttendanceItem[];
  showEmployee: boolean;
  canEdit: boolean;
  today: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          {showEmployee && <TableHead className="hidden md:table-cell">Empleado</TableHead>}
          <TableHead>Entrada y salida</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Trabajadas</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Normales</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Adicionales</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Tarde</TableHead>
          <TableHead className="hidden sm:table-cell">Estado</TableHead>
          {canEdit && (
            <TableHead className="text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const name = `${item.employee.lastName}, ${item.employee.firstName}`;
          const title = `Asistencia de ${name} del ${formatDate(item.date)}`;
          return (
            <TableRow key={item.id}>
              <TableCell className="align-top whitespace-nowrap">
                <span className="text-muted-foreground mr-1 text-xs">{DAY_SHORT[isoWeekday(item.date) - 1]}</span>
                {formatDate(item.date)}
                {showEmployee && (
                  <Link
                    href={`/empleados/${item.employee.id}/asistencia`}
                    className="text-primary block text-sm hover:underline md:hidden"
                  >
                    {name}
                  </Link>
                )}
                <span className="mt-1 block sm:hidden">
                  <AttendanceStatusBadge status={item.status} />
                </span>
              </TableCell>
              {showEmployee && (
                <TableCell className="hidden align-top md:table-cell">
                  <Link href={`/empleados/${item.employee.id}/asistencia`} className="text-primary hover:underline">
                    {name}
                  </Link>
                  <span className="text-muted-foreground block text-xs">Legajo {item.employee.fileNumber}</span>
                </TableCell>
              )}
              <TableCell className="align-top">
                {item.checkIn ? (
                  <span className="whitespace-nowrap">
                    {item.checkIn} – {item.checkOut}
                    {item.nextDay && <span className="text-muted-foreground text-xs"> (+1)</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sin fichada</span>
                )}
                {item.checkIn && item.breakMinutes > 0 && (
                  <span className="text-muted-foreground block text-xs">Descanso {item.breakMinutes} min</span>
                )}
                {item.checkIn && (
                  <span className="text-muted-foreground block text-xs sm:hidden">
                    {formatMinutes(item.workedMinutes)} h{item.lateMinutes > 0 && ` · ${item.lateMinutes} min tarde`}
                  </span>
                )}
                {item.notes && (
                  <span className="text-muted-foreground line-clamp-2 block max-w-xs text-xs whitespace-pre-line">
                    {item.notes}
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                {minutesCell(item.workedMinutes)}
              </TableCell>
              <TableCell className="hidden text-right align-top tabular-nums lg:table-cell">
                {minutesCell(item.regularMinutes)}
              </TableCell>
              <TableCell className="hidden text-right align-top tabular-nums lg:table-cell">
                {minutesCell(item.extraMinutes)}
              </TableCell>
              <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                {item.lateMinutes > 0 ? `${item.lateMinutes} min` : "—"}
              </TableCell>
              <TableCell className="hidden align-top sm:table-cell">
                <AttendanceStatusBadge status={item.status} />
                {item.leave && <span className="text-muted-foreground mt-1 block text-xs">{item.leave}</span>}
              </TableCell>
              {canEdit && (
                <TableCell className="text-right align-top">
                  <AttendanceDialog
                    employeeId={item.employee.id}
                    today={today}
                    record={{ version: item.version, title, values: item.formValues }}
                  />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
