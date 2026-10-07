import { DateFilter } from "@/components/list/date-filter";
import { FilterSelect } from "@/components/list/filter-select";
import type { ReportSlug } from "../definitions";

type Option = { id: string; label: string };

export type FilterOptions = {
  sectores: Option[];
  puestos: Option[];
  categorias: Option[];
  establecimientos: Option[];
  years: number[];
  currentYear: number;
};

const toOptions = (all: string, items: Option[]) => [
  { value: "", label: all },
  ...items.map((o) => ({ value: o.id, label: o.label })),
];

/** Filtros de cada reporte; se guardan en la URL y los lee el servicio. */
export function ReportFilters({ slug, options }: { slug: ReportSlug; options: FilterOptions }) {
  const structure = (
    <>
      <FilterSelect name="sector" label="Sector" options={toOptions("Todos los sectores", options.sectores)} />
      <FilterSelect name="puesto" label="Puesto" options={toOptions("Todos los puestos", options.puestos)} />
      {slug === "dotacion" && (
        <FilterSelect
          name="categoria"
          label="Categoría"
          options={toOptions("Todas las categorías", options.categorias)}
        />
      )}
      <FilterSelect
        name="establecimiento"
        label="Establecimiento"
        options={toOptions("Todos los establecimientos", options.establecimientos)}
      />
    </>
  );
  return (
    <div className="grid grid-cols-1 gap-2 p-3 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
      {slug === "altas-y-bajas" && (
        <>
          <DateFilter name="desde" label="Desde" type="month" />
          <DateFilter name="hasta" label="Hasta" type="month" />
        </>
      )}
      {(slug === "ausentismo" || slug === "vencimientos") && (
        <>
          <DateFilter name="desde" label="Desde" />
          <DateFilter name="hasta" label="Hasta" />
        </>
      )}
      {slug === "antiguedad" && <DateFilter name="fecha" label="Al" />}
      {slug === "remuneraciones" && <DateFilter name="periodo" label="Período" type="month" />}
      {slug === "vacaciones" && (
        <>
          <FilterSelect
            name="anio"
            label="Período"
            options={[
              { value: "", label: `Período ${options.currentYear}` },
              ...options.years
                .filter((y) => y !== options.currentYear)
                .map((y) => ({ value: String(y), label: `Período ${y}` })),
            ]}
          />
          <FilterSelect
            name="estado"
            label="Estado"
            defaultValue="activos"
            options={[
              { value: "activos", label: "Personal activo" },
              { value: "todos", label: "Activos y egresados" },
            ]}
          />
        </>
      )}
      {structure}
    </div>
  );
}
