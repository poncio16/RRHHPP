"use client";

import { RefreshCw } from "lucide-react";
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
import { NOVELTY_ORIGIN_LABELS } from "../constants";
import { generateNoveltiesAction, previewGenerationAction } from "../actions";
import type { GenerationPreview } from "../service";

type Row = GenerationPreview["create"][number];

function Section({ title, rows, tone }: { title: string; rows: Row[]; tone?: "warning" }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className={tone === "warning" ? "text-warning-foreground text-sm font-medium" : "text-sm font-medium"}>
        {title} ({rows.length})
      </h3>
      <ul className="divide-y rounded-md border text-sm">
        {rows.map((row) => (
          <li key={row.key} className="px-3 py-2">
            <span className="font-medium">{row.employee}</span> · {row.type}
            <span className="text-muted-foreground block text-xs">{row.notes}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Genera las novedades de un período desde licencias, asistencia, básicos y
 * categorías. Primero muestra qué va a cambiar; recién al confirmar guarda.
 */
export function GenerateNoveltiesDialog({ period, label }: { period: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [error, setError] = useState<string>();
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = () =>
    startLoading(async () => {
      setError(undefined);
      setPreview(null);
      const result = await previewGenerationAction({ period });
      if (result.ok) setPreview(result.data);
      else setError(result.error.message);
    });

  const changes = preview ? preview.create.length + preview.update.length + preview.annul.length : 0;

  const confirm = () =>
    startSaving(async () => {
      const result = await generateNoveltiesAction({ period });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const { created, updated, annulled } = result.data;
      const parts = [
        created > 0 && `${created} ${created === 1 ? "nueva" : "nuevas"}`,
        updated > 0 && `${updated} ${updated === 1 ? "actualizada" : "actualizadas"}`,
        annulled > 0 && `${annulled} ${annulled === 1 ? "anulada" : "anuladas"}`,
      ].filter(Boolean);
      toast.success(`Novedades de ${label}: ${parts.join(", ")}`);
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCw /> Generar novedades
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generar novedades de {label}</DialogTitle>
          <DialogDescription>
            Arma las novedades del mes a partir de las licencias aprobadas, la asistencia, los cambios de básico y de
            categoría, según lo configurado en los tipos de novedad y de licencia. Se puede repetir: las pendientes o
            aprobadas que cambiaron se recalculan y vuelven a pendiente; las informadas y las anuladas no se tocan.
          </DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive">{error}</Alert>}
        {loading && <p className="text-muted-foreground text-sm">Calculando…</p>}
        {preview && (
          <div className="flex flex-col gap-3">
            {preview.unconfigured.length > 0 && (
              <Alert variant="info" className="text-sm">
                No se generan (ningún tipo de novedad activo los tiene configurados en Configuración → Catálogos → Tipos
                de novedad): {preview.unconfigured.map((o) => NOVELTY_ORIGIN_LABELS[o].toLowerCase()).join(", ")}.
              </Alert>
            )}
            {changes === 0 && preview.informedChanged.length === 0 && (
              <Alert>
                No hay cambios para aplicar.
                {preview.unchanged > 0 &&
                  ` ${preview.unchanged === 1 ? "1 novedad generada ya está al día" : `${preview.unchanged} novedades generadas ya están al día`}.`}
              </Alert>
            )}
            <Section title="Nuevas" rows={preview.create} />
            <Section title="Se recalculan y vuelven a pendiente" rows={preview.update} />
            <Section title="Se anulan porque el origen ya no corresponde" rows={preview.annul} />
            <Section
              title="Ya informadas que hoy darían otro resultado (no se modifican: revisalas)"
              rows={preview.informedChanged}
              tone="warning"
            />
            {changes > 0 && (preview.unchanged > 0 || preview.skippedAnnulled > 0) && (
              <p className="text-muted-foreground text-xs">
                {preview.unchanged > 0 && `${preview.unchanged} sin cambios. `}
                {preview.skippedAnnulled > 0 && `${preview.skippedAnnulled} anuladas a mano no se vuelven a crear.`}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={saving || loading || changes === 0}>
            {saving
              ? "Generando…"
              : changes > 0
                ? `Aplicar ${changes} ${changes === 1 ? "cambio" : "cambios"}`
                : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
