import { FilterSelect } from "@/components/list/filter-select";

/** Filtros comunes del listado de documentos (se guardan en la URL). */
export function DocumentFilters({ types }: { types: { id: string; name: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex">
      <FilterSelect
        name="documentTypeId"
        label="Tipo"
        options={[{ value: "", label: "Todos los tipos" }, ...types.map((t) => ({ value: t.id, label: t.name }))]}
      />
      <FilterSelect
        name="expiry"
        label="Vencimiento"
        options={[
          { value: "", label: "Cualquier vencimiento" },
          { value: "vencidos", label: "Vencidos" },
          { value: "por-vencer", label: "Por vencer" },
          { value: "vigentes", label: "Vigentes" },
          { value: "sin-vencimiento", label: "Sin vencimiento" },
        ]}
      />
      <FilterSelect
        name="status"
        label="Estado"
        defaultValue="vigentes"
        options={[
          { value: "vigentes", label: "No anulados" },
          { value: "pendientes", label: "Pendientes" },
          { value: "observados", label: "Observados" },
          { value: "anulados", label: "Anulados" },
          { value: "todos", label: "Todos" },
        ]}
      />
      <FilterSelect
        name="sort"
        label="Orden"
        defaultValue="vencimiento"
        options={[
          { value: "vencimiento", label: "Por vencimiento" },
          { value: "empleado", label: "Por empleado" },
          { value: "carga", label: "Últimos cargados" },
        ]}
      />
    </div>
  );
}
