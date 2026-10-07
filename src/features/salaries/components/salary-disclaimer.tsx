import { Info } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { SALARY_DISCLAIMER } from "../constants";

/** Rótulo fijo de las pantallas de remuneraciones. */
export function SalaryDisclaimer() {
  return (
    <Alert variant="info" className="mb-4 flex items-start gap-2 text-sm">
      <Info className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{SALARY_DISCLAIMER}</span>
    </Alert>
  );
}
