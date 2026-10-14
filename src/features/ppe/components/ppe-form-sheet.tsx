import type { ReactNode } from "react";
import type { PpeForm } from "../service";

/** Renglones de entrega del modelo (Resolución SRT 299/11, Anexo I). */
const DELIVERY_ROWS = 18;

/** Columnas de la tabla de entregas: referencia del instructivo, título y ancho. */
const ITEM_COLUMNS = [
  { ref: 11, label: "Producto", width: "15.6%" },
  { ref: 12, label: "Tipo / Modelo", width: "18%" },
  { ref: 13, label: "Marca", width: "12.3%" },
  { ref: 14, label: "Posee certificación SI / NO", width: "7.4%" },
  { ref: 15, label: "Cantidad", width: "7.8%" },
  { ref: 16, label: "Fecha de entrega", width: "9.3%" },
  { ref: 17, label: "Firma del trabajador", width: "26.8%" },
] as const;

/**
 * Formulario de entrega de ropa de trabajo y elementos de protección personal,
 * con el diseño del modelo que usa la empresa: A4 apaisado, encabezado
 * completo y renglones en blanco para completar a mano. No lleva firma de la
 * empresa. Las medidas están en milímetros para que el impreso coincida.
 */
export function PpeFormSheet({ form }: { form: PpeForm }) {
  const { company, place, worker, position } = form;
  return (
    <section
      data-print-sheet
      aria-label="Formulario de entrega de ropa de trabajo y elementos de protección personal"
      className="w-[285mm] bg-white font-['Times_New_Roman',Times,'Liberation_Serif',serif] text-[9pt] leading-tight text-black [-webkit-print-color-adjust:exact] [page:epp] [print-color-adjust:exact]"
    >
      <div className="border border-black">
        <p className="flex h-[4.5mm] items-center justify-end px-1 text-[12pt] font-bold italic">
          Resolución 299/11, Anexo I
        </p>
        <h2 className="flex h-[5mm] items-center justify-center bg-black text-[11pt] font-bold text-white">
          ENTREGA DE ROPA DE TRABAJO Y ELEMENTOS DE PROTECCIÓN PERSONAL
        </h2>
        <Row>
          <Field reference={1} width="63%" label="Razón social:" value={company?.legalName} />
          <Field reference={2} width="37%" label="C.U.I.T.:" value={company?.cuit} />
        </Row>
        <Row>
          <Field reference={3} width="36%" label="Dirección:" value={place.addressLine} />
          <Field reference={4} width="19.5%" label="Localidad:" value={place.city} />
          <Field reference={5} width="8%" label="C.P.:" value={place.postalCode} />
          <Field reference={6} width="36.5%" label="Provincia:" value={place.province} />
        </Row>
        <Row>
          <Field reference={7} width="72.8%" label="Nombre y apellido del trabajador:" value={worker.name} />
          <Field reference={8} width="27.2%" label="D.N.I.:" value={worker.dni} />
        </Row>
        <Row className="min-h-[22mm]">
          <Box
            reference={9}
            width="48.6%"
            label="Descripción breve del puesto/s de trabajo en el/los cuales se desempeña el trabajador:"
          >
            <span className="font-bold">{position.name}</span>
            {position.description && <>. {position.description}</>}
          </Box>
          <Box
            reference={10}
            width="51.4%"
            label="Elementos de protección personal, necesarios para el trabajador, según el puesto de trabajo:"
          >
            {position.requiredPpe}
          </Box>
        </Row>
        <div className="h-[1.5mm] border-b border-black bg-neutral-400" />
        <table className="w-full table-fixed border-collapse border-hidden">
          <colgroup>
            <col className="w-[2.8%]" />
            {ITEM_COLUMNS.map((c) => (
              <col key={c.ref} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="h-[11mm]">
              <th scope="col" className="border border-black bg-neutral-400">
                <span className="sr-only">Renglón</span>
              </th>
              {ITEM_COLUMNS.map((c) => (
                <th key={c.ref} scope="col" className="relative border border-black px-1 text-center font-normal">
                  <Reference value={c.ref} />
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: DELIVERY_ROWS }, (_, i) => (
              <tr key={i} className="h-[6mm]">
                <td className="border border-black text-center">{i + 1}</td>
                {ITEM_COLUMNS.map((c) => (
                  <td key={c.ref} className="border border-black" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="relative h-[22mm] border-t border-black py-[0.5mm] pl-[6mm]">
          <Reference value={18} />
          Información adicional:
        </div>
      </div>
    </section>
  );
}

function Row({ children, className = "min-h-[6mm]" }: { children: ReactNode; className?: string }) {
  return <div className={`flex border-b border-black ${className}`}>{children}</div>;
}

/** Número de referencia del instructivo, chico, en la esquina del casillero. */
function Reference({ value }: { value: number }) {
  return <span className="absolute top-[0.3mm] left-[0.6mm] text-[6pt] leading-none">({value})</span>;
}

function Field({
  reference,
  width,
  label,
  value,
}: {
  reference: number;
  width: string;
  label: string;
  value: string | undefined;
}) {
  return (
    <div style={{ width }} className="relative flex items-center border-r border-black pr-1 pl-[6mm] last:border-r-0">
      <Reference value={reference} />
      <span className="break-words">
        {label} {value}
      </span>
    </div>
  );
}

function Box({
  reference,
  width,
  label,
  children,
}: {
  reference: number;
  width: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ width }} className="relative border-r border-black py-[0.5mm] pr-1 pl-[6mm] last:border-r-0">
      <Reference value={reference} />
      <p>{label}</p>
      <p className="mt-[1mm] break-words whitespace-pre-line">{children}</p>
    </div>
  );
}
