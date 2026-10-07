import { DateFilter } from "@/components/list/date-filter";
import { FilterSelect } from "@/components/list/filter-select";

/** Filtros del listado de asistencia (se guardan en la URL). */
export function AttendanceFilters({ departments }: { departments: { id: string; name: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <FilterSelect
          name="estado"
          label="Estado"
          defaultValue="todos"
          options={[
            { value: "todos", label: "Todos los días" },
            { value: "presentes", label: "Presentes" },
            { value: "ausentes", label: "Ausentes" },
            { value: "tarde", label: "Con llegada tarde" },
            { value: "adicionales", label: "Con horas adicionales" },
            { value: "licencia", label: "Con licencia" },
            { value: "descanso", label: "Francos y feriados" },
          ]}
        />
        {departments.length > 1 && (
          <FilterSelect
            name="sector"
            label="Sector"
            options={[
              { value: "", label: "Todos los sectores" },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        )}
        <FilterSelect
          name="sort"
          label="Orden"
          defaultValue="recientes"
          options={[
            { value: "recientes", label: "Más recientes primero" },
            { value: "empleado", label: "Por empleado" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <DateFilter name="desde" label="Desde" />
        <DateFilter name="hasta" label="hasta" />
      </div>
    </div>
  );
}
