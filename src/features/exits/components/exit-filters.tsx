import { DateFilter } from "@/components/list/date-filter";
import { FilterSelect } from "@/components/list/filter-select";
import type { ExitOption } from "../service";

/** Filtros del listado de egresos (se guardan en la URL). */
export function ExitFilters({ types, reasons }: { types: ExitOption[]; reasons: ExitOption[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
        <FilterSelect
          name="estado"
          label="Estado"
          defaultValue="vigentes"
          options={[
            { value: "vigentes", label: "En trámite y confirmados" },
            { value: "en-tramite", label: "En trámite" },
            { value: "confirmados", label: "Confirmados" },
            { value: "anulados", label: "Anulados" },
            { value: "todos", label: "Todos" },
          ]}
        />
        <FilterSelect
          name="tipo"
          label="Tipo"
          options={[{ value: "", label: "Todos los tipos" }, ...types.map((t) => ({ value: t.id, label: t.label }))]}
        />
        <FilterSelect
          name="motivo"
          label="Motivo"
          options={[
            { value: "", label: "Todos los motivos" },
            ...reasons.map((r) => ({ value: r.id, label: r.label })),
          ]}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
        <DateFilter name="desde" label="Desde" />
        <DateFilter name="hasta" label="Hasta" />
      </div>
    </div>
  );
}
