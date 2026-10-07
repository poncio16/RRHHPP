import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ALERT_KIND_LABELS } from "../constants";
import type { AlertItem } from "../service";
import { AlertActions } from "./alert-actions";

const TONE_LABEL = { destructive: "Vencido", warning: "Atención", default: null } as const;

/** Lista de alertas con enlace al legajo y, si corresponde, acciones. */
export function AlertList({ items, showKind, actions }: { items: AlertItem[]; showKind: boolean; actions: boolean }) {
  return (
    <ul className="divide-y">
      {items.map((alert) => {
        const employee = `${alert.employee.lastName}, ${alert.employee.firstName}`;
        return (
          <li key={alert.key} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={alert.href} className="text-primary font-medium hover:underline">
                  {employee}
                </Link>
                <span className="text-muted-foreground text-xs">Legajo {alert.employee.fileNumber}</span>
                {alert.tone !== "default" && <Badge variant={alert.tone}>{TONE_LABEL[alert.tone]}</Badge>}
              </div>
              <p className="text-sm">{alert.title}</p>
              <p className="text-muted-foreground text-sm">{alert.detail}</p>
              {showKind && <p className="text-muted-foreground text-xs">{ALERT_KIND_LABELS[alert.kind]}</p>}
              {alert.dismissal && (
                <p className="text-muted-foreground text-xs">
                  {alert.dismissal.until
                    ? `Pospuesta hasta el ${formatDate(alert.dismissal.until)} por ${alert.dismissal.by}`
                    : `Descartada por ${alert.dismissal.by}`}
                </p>
              )}
            </div>
            {actions && alert.canManage && <AlertActions alertKey={alert.key} state={alert.state} />}
          </li>
        );
      })}
    </ul>
  );
}
