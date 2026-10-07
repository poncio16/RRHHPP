import { FilterSelect } from "@/components/list/filter-select";

/** Filtros del listado de novedades (se guardan en la URL). */
export function NoveltyFilters({
  types,
  departments,
}: {
  types: { id: string; name: string }[];
  departments?: { id: string; name: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
      <FilterSelect
        name="estado"
        label="Estado"
        defaultValue="vigentes"
        options={[
          { value: "vigentes", label: "Sin anuladas" },
          { value: "pendientes", label: "Pendientes" },
          { value: "aprobadas", label: "Aprobadas" },
          { value: "informadas", label: "Informadas" },
          { value: "anuladas", label: "Anuladas" },
          { value: "todas", label: "Todas" },
        ]}
      />
      <FilterSelect
        name="tipo"
        label="Tipo"
        options={[{ value: "", label: "Todos los tipos" }, ...types.map((t) => ({ value: t.id, label: t.name }))]}
      />
      <FilterSelect
        name="origen"
        label="Origen"
        options={[
          { value: "", label: "Manuales y generadas" },
          { value: "manuales", label: "Manuales" },
          { value: "generadas", label: "Generadas" },
        ]}
      />
      {departments && departments.length > 1 && (
        <FilterSelect
          name="sector"
          label="Sector"
          options={[
            { value: "", label: "Todos los sectores" },
            ...departments.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
      )}
    </div>
  );
}
