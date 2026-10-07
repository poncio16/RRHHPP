import { DateFilter } from "@/components/list/date-filter";
import { FilterSelect } from "@/components/list/filter-select";

/** Filtros del listado de licencias (se guardan en la URL). `withClass` muestra el filtro por clase. */
export function LeaveFilters({
  types,
  withClass,
  withPeriod = true,
}: {
  types: { id: string; name: string }[];
  withClass: boolean;
  withPeriod?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {withClass && (
          <FilterSelect
            name="class"
            label="Clase"
            options={[
              { value: "", label: "Todas las clases" },
              { value: "licencias", label: "Licencias" },
              { value: "ausencias", label: "Ausencias" },
              { value: "vacaciones", label: "Vacaciones" },
              { value: "suspensiones", label: "Suspensiones" },
            ]}
          />
        )}
        {types.length > 1 && (
          <FilterSelect
            name="leaveTypeId"
            label="Tipo"
            options={[{ value: "", label: "Todos los tipos" }, ...types.map((t) => ({ value: t.id, label: t.name }))]}
          />
        )}
        <FilterSelect
          name="status"
          label="Estado"
          defaultValue="vigentes"
          options={[
            { value: "vigentes", label: "Solicitadas y aprobadas" },
            { value: "pendientes", label: "Pendientes de aprobación" },
            { value: "aprobadas", label: "Aprobadas" },
            { value: "rechazadas", label: "Rechazadas" },
            { value: "anuladas", label: "Anuladas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <FilterSelect
          name="timing"
          label="Momento"
          options={[
            { value: "", label: "Cualquier fecha" },
            { value: "en-curso", label: "En curso hoy" },
            { value: "proximas", label: "Próximas" },
            { value: "finalizadas", label: "Finalizadas" },
          ]}
        />
        <FilterSelect
          name="sort"
          label="Orden"
          defaultValue="recientes"
          options={[
            { value: "recientes", label: "Más recientes primero" },
            { value: "inicio", label: "Por fecha de inicio" },
            { value: "empleado", label: "Por empleado" },
          ]}
        />
      </div>
      {withPeriod && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateFilter name="desde" label="Período desde" />
          <DateFilter name="hasta" label="hasta" />
        </div>
      )}
    </div>
  );
}
