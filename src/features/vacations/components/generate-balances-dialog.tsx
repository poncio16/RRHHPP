"use client";

import { CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { generateBalancesAction, previewGenerationAction } from "../actions";
import type { GenerationPreview } from "../service";

/**
 * Generación de los períodos de un año: primero muestra lo que se va a crear
 * para cada empleado y recién al confirmar lo guarda.
 */
export function GenerateBalancesDialog({ years, defaultYear }: { years: number[]; defaultYear: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(defaultYear);
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [error, setError] = useState<string>();
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = (target: number) =>
    startLoading(async () => {
      setError(undefined);
      setPreview(null);
      const result = await previewGenerationAction({ year: target });
      if (result.ok) setPreview(result.data);
      else setError(result.error.message);
    });

  const confirm = () =>
    startSaving(async () => {
      const result = await generateBalancesAction({ year });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(result.data.created === 1 ? "Se generó 1 período" : `Se generaron ${result.data.created} períodos`);
      setOpen(false);
      router.push(`/vacaciones/saldos?year=${year}`);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) load(year);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <CalendarPlus /> Generar períodos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generar períodos de vacaciones</DialogTitle>
          <DialogDescription>
            Calcula los días de cada empleado activo que todavía no tiene el período, con las reglas y parámetros de
            Configuración. Los períodos ya generados no se modifican.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Label htmlFor="generate-year">Año</Label>
          <Select
            id="generate-year"
            className="w-auto"
            value={year}
            disabled={loading || saving}
            onChange={(e) => {
              const next = Number(e.target.value);
              setYear(next);
              load(next);
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        {loading && <p className="text-muted-foreground text-sm">Calculando…</p>}
        {preview && (
          <>
            <p className="text-muted-foreground text-sm">
              Antigüedad al {formatDate(preview.cutoff)}.{" "}
              {preview.existing > 0 &&
                `${preview.existing} ${preview.existing === 1 ? "empleado ya tiene" : "empleados ya tienen"} el período. `}
              {preview.notYet > 0 &&
                `${preview.notYet} ${preview.notYet === 1 ? "empleado ingresó" : "empleados ingresaron"} después del corte. `}
            </p>
            {preview.items.length === 0 ? (
              <Alert>No hay períodos para generar en {preview.year}.</Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead className="hidden sm:table-cell">Criterio</TableHead>
                    <TableHead className="text-right">Días</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.items.map((item) => (
                    <TableRow key={item.employee.id}>
                      <TableCell>
                        {item.employee.lastName}, {item.employee.firstName}
                        <span className="text-muted-foreground block text-xs">Antigüedad {item.seniority}</span>
                        <span className="text-muted-foreground block text-xs sm:hidden">{item.basis}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">{item.basis}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{item.days}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={saving || loading || !preview || preview.items.length === 0}>
            {saving
              ? "Generando…"
              : preview && preview.items.length > 0
                ? `Generar ${preview.items.length} ${preview.items.length === 1 ? "período" : "períodos"}`
                : "Generar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
