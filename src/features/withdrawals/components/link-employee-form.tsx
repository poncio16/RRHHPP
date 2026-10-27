"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { linkAccountEmployeeAction } from "../actions";

/** Vincula la cuenta a un legajo (o la desvincula). Un legajo puede tener varias cuentas. */
export function LinkEmployeeForm({
  accountId,
  current,
  employees,
}: {
  accountId: string;
  current: string | null;
  employees: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await linkAccountEmployeeAction(accountId, { employeeId: value });
      if (!result.ok) {
        setError(result.error.fieldErrors?.employeeId?.[0] ?? result.error.message);
        return;
      }
      toast.success(value ? "Se vinculó la cuenta al legajo" : "Se desvinculó la cuenta del legajo");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label="Legajo de la cuenta"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="sm:max-w-sm"
        >
          <option value="">Sin legajo</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
        <Button variant="outline" onClick={save} disabled={pending || value === (current ?? "")}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
