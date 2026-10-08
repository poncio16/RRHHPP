import { DateFilter } from "@/components/list/date-filter";
import { FilterSelect } from "@/components/list/filter-select";
import { ACTION_LABELS, RESULT_LABELS } from "../constants";

type Option = { value: string; label: string };

/** Filtros del visor de auditoría (se guardan en la URL). */
export function AuditFilters({ modules, users }: { modules: Option[]; users: Option[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <DateFilter name="desde" label="Desde" />
        <DateFilter name="hasta" label="Hasta" />
      </div>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
        <FilterSelect name="modulo" label="Módulo" options={[{ value: "", label: "Todos los módulos" }, ...modules]} />
        <FilterSelect
          name="accion"
          label="Acción"
          options={[
            { value: "", label: "Todas las acciones" },
            ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <FilterSelect
          name="resultado"
          label="Resultado"
          options={[
            { value: "", label: "Todos los resultados" },
            ...Object.entries(RESULT_LABELS).map(([value, r]) => ({ value, label: r.label })),
          ]}
        />
        <FilterSelect name="usuario" label="Usuario" options={[{ value: "", label: "Todos los usuarios" }, ...users]} />
      </div>
    </div>
  );
}
