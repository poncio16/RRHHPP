"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FilePlus2, Paperclip, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionErrors } from "@/components/forms/action-errors";
import { FormField, fieldA11y } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseIsoDate, toIsoDate } from "@/lib/format";
import { createDocumentAction, updateDocumentAction } from "../actions";
import { DOCUMENT_STATUS_LABELS, EDITABLE_STATUSES } from "../constants";
import { suggestedExpiry } from "../expiry";
import { FILE_ACCEPT, formatFileSize } from "../files";
import { documentSchema, documentWithEmployeeSchema } from "../schemas";

type Values = {
  employeeId: string;
  documentTypeId: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  notes: string;
};

export type DocumentTypeChoice = {
  id: string;
  name: string;
  isActive: boolean;
  isSensitive: boolean;
  requiresExpiry: boolean;
  defaultValidityDays: number | null;
};

const EMPTY: Values = {
  employeeId: "",
  documentTypeId: "",
  issueDate: "",
  expiryDate: "",
  status: "PRESENTADO",
  notes: "",
};
const withEmployeeSchema = documentSchema.and(documentWithEmployeeSchema);

/**
 * Alta o edición de un documento. Sin `employeeId` (listado general) se elige
 * el empleado en el formulario. El archivo es opcional. Con `leave`, el
 * documento queda vinculado a esa licencia (su certificado); con `exit`, a
 * ese egreso.
 */
export function DocumentDialog({
  employeeId,
  employees,
  types,
  limits,
  document,
  leave,
  exit,
}: {
  employeeId: string | null;
  employees?: { id: string; label: string }[];
  types: DocumentTypeChoice[];
  limits: { maxFileSizeMb: number; typesLabel: string };
  document?: {
    id: string;
    version: string;
    title: string;
    fileName: string | null;
    values: Omit<Values, "employeeId">;
  };
  leave?: { id: string; label: string };
  exit?: { id: string; label: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [file, setFile] = useState<File | null>(null);
  // Cambiar la clave vacía el input de archivo (no se puede asignar su valor).
  const [fileKey, setFileKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const pickEmployee = !employeeId && !document;
  const initial: Values = document ? { ...EMPTY, ...document.values } : EMPTY;
  const form = useForm<Values>({
    resolver: zodResolver(pickEmployee ? withEmployeeSchema : documentSchema) as never,
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { errors, isDirty } = form.formState;
  const typeId = useWatch({ control: form.control, name: "documentTypeId" });
  const type = types.find((t) => t.id === typeId);
  const visibleTypes = types.filter((t) => t.isActive || t.id === document?.values.documentTypeId);

  const reset = () => {
    form.reset(initial);
    setFile(null);
    setFormError(undefined);
    setFileError(undefined);
    setFileKey((k) => k + 1);
  };

  /** Si el tipo tiene vigencia habitual, sugiere el vencimiento al cargar la emisión. */
  const suggestExpiry = () => {
    const issue = parseIsoDate(form.getValues("issueDate"));
    if (!issue || !type?.defaultValidityDays || form.getValues("expiryDate")) return;
    form.setValue("expiryDate", toIsoDate(suggestedExpiry(issue, type.defaultValidityDays)), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onFile = (selected: File | null) => {
    setFileError(undefined);
    if (selected && selected.size > limits.maxFileSizeMb * 1024 * 1024) {
      setFileError(`El archivo supera el máximo de ${limits.maxFileSizeMb} MB.`);
      setFile(null);
      setFileKey((k) => k + 1);
      return;
    }
    setFile(selected);
  };

  const submit = form.handleSubmit(() => {
    setFormError(undefined);
    if (fileError) return;
    const raw = form.getValues();
    const data = new FormData();
    for (const [key, value] of Object.entries(raw)) {
      if (key !== "employeeId" || pickEmployee) data.set(key, value);
    }
    if (document) data.set("version", document.version);
    if (leave) data.set("leaveRecordId", leave.id);
    if (exit) data.set("exitId", exit.id);
    if (file) data.set("file", file);
    startTransition(async () => {
      const result = document
        ? await updateDocumentAction(document.id, data)
        : await createDocumentAction(employeeId, data);
      if (!result.ok) {
        setFormError(
          applyActionErrors<Values>(result.error, (name, error) =>
            (name as string) === "file" ? setFileError(error.message) : form.setError(name, error),
          ),
        );
        return;
      }
      toast.success(document ? "Documento actualizado" : "Documento registrado");
      setOpen(false);
      reset();
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) reset();
      }}
    >
      <DialogTrigger asChild>
        {document ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${document.title}`}>
            <Pencil />
          </Button>
        ) : leave ? (
          <Button variant="ghost" size="icon" aria-label={`Adjuntar certificado de ${leave.label}`}>
            <FilePlus2 />
          </Button>
        ) : exit ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Adjuntar documento a ${exit.label}`}
            title="Adjuntar documento"
          >
            <FilePlus2 />
          </Button>
        ) : (
          <Button>
            <Plus /> Nuevo documento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {document
              ? "Editar documento"
              : leave
                ? "Adjuntar certificado"
                : exit
                  ? "Adjuntar documento al egreso"
                  : "Nuevo documento"}
          </DialogTitle>
          <DialogDescription>
            {document
              ? document.title
              : leave || exit
                ? `${(leave ?? exit)!.label}. Queda en la documentación del legajo, vinculado a este registro.`
                : "Registrá el documento y, si lo tenés, adjuntá el archivo."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          {pickEmployee && (
            <FormField id="doc-employee" label="Empleado" error={errors.employeeId?.message} required>
              <Select {...fieldA11y("doc-employee", errors.employeeId?.message)} {...form.register("employeeId")}>
                <option value="">Elegí un empleado…</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField
            id="doc-type"
            label="Tipo"
            error={errors.documentTypeId?.message}
            hint={type?.isSensitive ? "Documentación sensible: solo la ven los roles autorizados." : undefined}
            required
          >
            <Select {...fieldA11y("doc-type", errors.documentTypeId?.message)} {...form.register("documentTypeId")}>
              <option value="">Elegí un tipo…</option>
              {visibleTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isActive ? "" : " (inactivo)"}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="doc-issue" label="Fecha de emisión" error={errors.issueDate?.message}>
              <Input
                {...fieldA11y("doc-issue", errors.issueDate?.message)}
                type="date"
                {...form.register("issueDate", { onBlur: suggestExpiry })}
              />
            </FormField>
            <FormField
              id="doc-expiry"
              label="Vencimiento"
              error={errors.expiryDate?.message}
              hint={
                type?.defaultValidityDays
                  ? `Vigencia habitual: ${type.defaultValidityDays} días desde la emisión.`
                  : undefined
              }
              required={type?.requiresExpiry}
            >
              <Input
                {...fieldA11y("doc-expiry", errors.expiryDate?.message)}
                type="date"
                {...form.register("expiryDate")}
              />
            </FormField>
          </div>
          <FormField id="doc-status" label="Estado" error={errors.status?.message} required>
            <Select {...fieldA11y("doc-status", errors.status?.message)} {...form.register("status")}>
              {EDITABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {DOCUMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="doc-file"
            label={document?.fileName ? "Reemplazar archivo" : "Archivo"}
            error={fileError}
            hint={
              file
                ? `${file.name} (${formatFileSize(file.size)})`
                : `${limits.typesLabel}, hasta ${limits.maxFileSizeMb} MB.${document?.fileName ? ` Actual: ${document.fileName}. El anterior queda guardado.` : ""}`
            }
          >
            <Input
              id="doc-file"
              key={fileKey}
              type="file"
              accept={FILE_ACCEPT}
              aria-invalid={!!fileError}
              aria-describedby={fileError ? "doc-file-error" : "doc-file-hint"}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className="file:text-foreground file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
          </FormField>
          <FormField id="doc-notes" label="Observaciones" error={errors.notes?.message}>
            <Textarea {...fieldA11y("doc-notes", errors.notes?.message)} rows={3} {...form.register("notes")} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || (!!document && !isDirty && !file)}>
              {pending ? (
                "Guardando…"
              ) : (
                <>
                  {file && <Paperclip />} {document ? "Guardar cambios" : "Registrar"}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
