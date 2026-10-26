"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/forms/form-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatInteger, parseIsoDate } from "@/lib/format";
import { importSpreadsheetAction, saveSheetAssignmentsAction } from "../actions";
import { SHEET_NEW, SHEET_SKIP } from "../schemas";
import type { FileResult, PendingSheet } from "../service";

type Option = { id: string; label: string };

const isoText = (iso: string | null) => (iso ? formatDate(parseIsoDate(iso)) : "—");

/**
 * Sube las planillas de a una y muestra lo cargado. Cada hoja nueva crea su
 * cuenta; si su nombre se parece al de una cuenta que ya existía, se pregunta
 * y se vuelven a importar los mismos archivos: lo que ya entró cuenta como
 * repetido.
 */
export function ImportPanel({ accounts, maxFiles, maxMb }: { accounts: Option[]; maxFiles: number; maxMb: number }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<string>();
  const [results, setResults] = useState<FileResult[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // Las hojas sin asignar de todos los archivos, una vez por nombre.
  const pendingSheets = results
    .flatMap((r) => r.pendingSheets)
    .reduce<PendingSheet[]>((list, sheet) => {
      const same = list.find((s) => s.key === sheet.key);
      if (!same) list.push({ ...sheet, similar: [...sheet.similar] });
      else {
        same.movements += sheet.movements;
        if (sheet.from && (!same.from || sheet.from < same.from)) same.from = sheet.from;
        if (sheet.to && (!same.to || sheet.to > same.to)) same.to = sheet.to;
      }
      return list;
    }, []);

  const run = (list: File[]) =>
    startTransition(async () => {
      setError(undefined);
      const done: FileResult[] = [];
      for (const [i, file] of list.entries()) {
        setProgress(`Importando ${file.name} (${i + 1} de ${list.length})…`);
        const data = new FormData();
        data.set("file", file);
        const result = await importSpreadsheetAction(data);
        if (!result.ok) {
          setError(result.error.message);
          break;
        }
        done.push(result.data);
        setResults([...done]);
      }
      setProgress(undefined);
      setChoices({});
      router.refresh();
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (files.length === 0) return setError("Elegí al menos una planilla.");
    if (files.length > maxFiles) return setError(`Se pueden subir hasta ${maxFiles} planillas por vez.`);
    setResults([]);
    run(files);
  };

  const assign = () => {
    const missing = pendingSheets.filter((s) => !choices[s.key]);
    if (missing.length > 0) {
      setError(`Elegí qué hacer con: ${missing.map((s) => s.name).join(", ")}.`);
      return;
    }
    startTransition(async () => {
      setError(undefined);
      const result = await saveSheetAssignmentsAction({
        sheets: pendingSheets.map((s) => ({ name: s.name, target: choices[s.key]! })),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Listo: se vuelven a importar las planillas");
      run(files);
    });
  };

  const totals = {
    created: results.reduce((n, r) => n + r.created, 0),
    duplicates: results.reduce((n, r) => n + r.duplicates, 0),
    errors: results.reduce((n, r) => n + r.errorCount, 0),
    newAccounts: results.reduce((n, r) => n + r.newAccounts.length, 0),
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end" noValidate>
        <FormField
          id="withdrawals-files"
          label="Planillas"
          hint={`Excel (.xlsx) o CSV, hasta ${maxFiles} archivos de ${maxMb} MB cada uno.`}
          className="min-w-0 flex-1"
          required
        >
          <Input
            id="withdrawals-files"
            type="file"
            multiple
            accept=".xlsx,.csv,.txt"
            aria-describedby="withdrawals-files-hint"
            disabled={pending}
            onChange={(e) => {
              // De la más vieja a la más nueva: así una planilla posterior corrige lo que trajo la anterior.
              setFiles(
                Array.from(e.target.files ?? []).sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
              );
              setError(undefined);
            }}
          />
        </FormField>
        <Button type="submit" disabled={pending} className="sm:mb-5">
          <Upload />
          {pending ? "Importando…" : "Importar"}
        </Button>
      </form>

      {progress && (
        <p className="text-muted-foreground text-sm" role="status">
          {progress}
        </p>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}

      {results.length > 0 && !pending && (
        <Alert>
          {formatInteger(totals.created)} movimientos nuevos, {formatInteger(totals.duplicates)} repetidos descartados
          {totals.newAccounts > 0 && `, ${formatInteger(totals.newAccounts)} cuentas nuevas`}
          {totals.errors > 0 && `, ${formatInteger(totals.errors)} filas con errores que no se cargaron`}.
        </Alert>
      )}

      {pendingSheets.length > 0 && !pending && (
        <section className="flex flex-col gap-3 rounded-md border p-3">
          <div>
            <h2 className="font-medium">Hojas para revisar</h2>
            <p className="text-muted-foreground text-sm">
              Estas hojas tienen un nombre nuevo parecido al de una cuenta que ya existe, así que todavía no se
              cargaron. Elegí si son la misma persona (por ejemplo, &quot;Luci&quot; y &quot;Luciano&quot;) o una cuenta
              nueva. Queda guardado para las próximas planillas y se vuelven a importar los mismos archivos: lo que ya
              entró se descarta como repetido.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hoja</TableHead>
                <TableHead className="hidden sm:table-cell">Movimientos</TableHead>
                <TableHead>Va a</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingSheets.map((sheet) => {
                const similar = new Set(sheet.similar.map((a) => a.id));
                return (
                  <TableRow key={sheet.key}>
                    <TableCell className="align-top">
                      <span className="font-medium">{sheet.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {isoText(sheet.from)} al {isoText(sheet.to)}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        Parecida a {sheet.similar.map((a) => a.name).join(", ")}
                      </span>
                    </TableCell>
                    <TableCell className="hidden align-top tabular-nums sm:table-cell">
                      {formatInteger(sheet.movements)}
                    </TableCell>
                    <TableCell className="min-w-56 align-top">
                      <Select
                        aria-label={`Cuenta de la hoja ${sheet.name}`}
                        value={choices[sheet.key] ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setChoices((current) => ({ ...current, [sheet.key]: value }));
                        }}
                      >
                        <option value="">Elegí una opción</option>
                        <option value={SHEET_NEW}>Cuenta nueva &quot;{sheet.name}&quot;</option>
                        <optgroup label="Misma persona que">
                          {sheet.similar.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Otra cuenta">
                          {accounts
                            .filter((a) => !similar.has(a.id))
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                        </optgroup>
                        <option value={SHEET_SKIP}>No importar</option>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex justify-end">
            <Button onClick={assign}>Guardar y volver a importar</Button>
          </div>
        </section>
      )}

      {results.map((result) => (
        <FileSummary key={result.fileName} result={result} />
      ))}
    </div>
  );
}

function FileSummary({ result }: { result: FileResult }) {
  return (
    <section className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium break-all">{result.fileName}</h3>
        {result.error ? (
          <Badge variant="destructive">No se cargó</Badge>
        ) : (
          <>
            <Badge variant="success">{formatInteger(result.created)} nuevos</Badge>
            <Badge variant="muted">{formatInteger(result.duplicates)} repetidos</Badge>
            {result.errorCount > 0 && (
              <Badge variant="destructive">{formatInteger(result.errorCount)} con errores</Badge>
            )}
            {result.superseded > 0 && (
              <Badge variant="muted">{formatInteger(result.superseded)} corregidos por esta planilla</Badge>
            )}
            {result.newAccounts.length > 0 && <Badge>{result.newAccounts.length} cuentas nuevas</Badge>}
            {result.pendingSheets.length > 0 && (
              <Badge variant="warning">{result.pendingSheets.length} hojas para revisar</Badge>
            )}
          </>
        )}
      </div>
      {result.error && <p className="text-destructive">{result.error}</p>}
      {result.skippedSheets.length > 0 && (
        <p className="text-muted-foreground">No se importan: {result.skippedSheets.join(", ")}.</p>
      )}
      {result.ignoredSheets.length > 0 && (
        <p className="text-muted-foreground">Hojas sin movimientos reconocibles: {result.ignoredSheets.join(", ")}.</p>
      )}
      {result.errors.length > 0 && (
        <details>
          <summary className="cursor-pointer">Filas con errores (no se cargaron)</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {result.errors.map((e) => (
              <li key={`${e.sheet}-${e.rowNumber}`}>
                <span className="font-medium">
                  {e.sheet}, fila {e.rowNumber}:
                </span>{" "}
                {e.message}
              </li>
            ))}
            {result.errorCount > result.errors.length && (
              <li className="text-muted-foreground">Y {result.errorCount - result.errors.length} más.</li>
            )}
          </ul>
        </details>
      )}
    </section>
  );
}
