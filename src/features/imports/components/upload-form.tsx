"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateImportAction } from "../actions";

/** Sube el archivo y lleva a la vista previa. No crea nada todavía. */
export function UploadForm({ maxMb, maxRows }: { maxMb: number; maxRows: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Elegí el archivo a importar.");
      return;
    }
    startTransition(async () => {
      const data = new FormData();
      data.set("file", file);
      const result = await validateImportAction(data);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/importar/${result.data.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end" noValidate>
      <FormField
        id="import-file"
        label="Archivo"
        error={error}
        hint={`Excel (.xlsx) o CSV, hasta ${maxMb} MB y ${maxRows} filas.`}
        className="min-w-0 flex-1"
        required
      >
        <Input
          id="import-file"
          type="file"
          accept=".xlsx,.csv,.txt"
          aria-invalid={!!error}
          aria-describedby={error ? "import-file-error" : "import-file-hint"}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(undefined);
          }}
        />
      </FormField>
      <Button type="submit" disabled={pending} className="sm:mb-5">
        <Upload />
        {pending ? "Validando…" : "Validar archivo"}
      </Button>
    </form>
  );
}
