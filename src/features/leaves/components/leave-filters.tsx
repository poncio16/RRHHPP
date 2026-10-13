import { DateFilter } from "@/components/list/date-filter";
import { FilterSelect } from "@/components/list/filter-select";
import { LEAVE_CLASS_FILTER_LABELS, LEAVE_STATUS_FILTER_LABELS, LEAVE_TIMING_FILTER_LABELS } from "../constants";

const optionsOf = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/**
 * Filtros del listado de licencias (se guardan en la URL). `withClass` muestra
 * el filtro por clase y `withCertificate`, el de certificado faltante.
 */
export function LeaveFilters({
  types,
  withClass,
  withPeriod = true,
  withCertificate = true,
}: {
  types: { id: string; name: string }[];
  withClass: boolean;
  withPeriod?: boolean;
  withCertificate?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {withClass && (
          <FilterSelect
            name="class"
            label="Clase"
            options={[{ value: "", label: "Todas las clases" }, ...optionsOf(LEAVE_CLASS_FILTER_LABELS)]}
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
          options={optionsOf(LEAVE_STATUS_FILTER_LABELS)}
        />
        {withCertificate && (
          <FilterSelect
            name="certificado"
            label="Certificado"
            options={[
              { value: "", label: "Con o sin certificado" },
              { value: "falta", label: "Falta el certificado" },
            ]}
          />
        )}
        <FilterSelect
          name="timing"
          label="Momento"
          options={[{ value: "", label: "Cualquier fecha" }, ...optionsOf(LEAVE_TIMING_FILTER_LABELS)]}
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
