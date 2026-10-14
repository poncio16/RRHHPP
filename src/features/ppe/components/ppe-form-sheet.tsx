import type { CSSProperties, ReactNode } from "react";
import { DESCRIPTION_BOX, FIELD_ROWS, type FontSize, PPE_BOX, type PpeLayout, SHEET_HEIGHT_MM } from "../layout";
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

const FONT_CLASS: Record<FontSize, string> = { 9: "text-[9pt]", 8: "text-[8pt]", 7: "text-[7pt]" };

/**
 * Formulario de entrega de ropa de trabajo y elementos de protección personal,
 * con el diseño del modelo que usa la empresa: A4 apaisado, encabezado
 * completo y renglones en blanco para completar a mano. No lleva firma de la
 * empresa. Las medidas están en milímetros para que el impreso coincida; la
 * hoja tiene alto fijo y la letra de los datos largos se ajusta (`layout`).
 */
export function PpeFormSheet({ form, layout }: { form: PpeForm; layout: PpeLayout }) {
  return (
    <section
      data-print-sheet
      aria-label="Formulario de entrega de ropa de trabajo y elementos de protección personal"
      className="w-[285mm] bg-white font-['Times_New_Roman',Times,'Liberation_Serif',serif] text-[9pt] leading-tight text-black [-webkit-print-color-adjust:exact] [page:epp] [print-color-adjust:exact]"
    >
      <div style={{ height: `${SHEET_HEIGHT_MM}mm` }} className="flex flex-col border border-black [&>*]:shrink-0">
        <p className="flex h-[4.5mm] items-center justify-end px-1 text-[12pt] font-bold italic">
          Resolución 299/11, Anexo I
        </p>
        <h2 className="flex h-[5mm] items-center justify-center bg-black text-[11pt] font-bold text-white">
          ENTREGA DE ROPA DE TRABAJO Y ELEMENTOS DE PROTECCIÓN PERSONAL
        </h2>
        {FIELD_ROWS.map((row) => (
          <Row key={row[0]!.reference}>
            {row.map((field) => (
              <Field
                key={field.reference}
                reference={field.reference}
                percent={field.percent}
                label={field.label}
                value={field.value(form)}
                size={layout.fields[field.reference] ?? 9}
              />
            ))}
          </Row>
        ))}
        <Row
          className={`min-h-[22mm] overflow-hidden ${FONT_CLASS[layout.box]}`}
          style={{ maxHeight: `${layout.boxMaxMm}mm` }}
        >
          <Box {...DESCRIPTION_BOX}>
            <span className="font-bold">{form.position.name}</span>
            {form.position.description && <>. {form.position.description}</>}
          </Box>
          <Box {...PPE_BOX}>{form.position.requiredPpe}</Box>
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
        <div className="relative min-h-[8mm] flex-1 shrink! border-t border-black py-[0.5mm] pl-[6mm]">
          <Reference value={18} />
          Información adicional:
        </div>
      </div>
    </section>
  );
}

function Row({
  children,
  className = "min-h-[6mm]",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={style} className={`flex border-b border-black ${className}`}>
      {children}
    </div>
  );
}

/** Número de referencia del instructivo, chico, en la esquina del casillero. */
function Reference({ value }: { value: number }) {
  return <span className="absolute top-[0.3mm] left-[0.6mm] text-[6pt] leading-none">({value})</span>;
}

function Field({
  reference,
  percent,
  label,
  value,
  size,
}: {
  reference: number;
  percent: number;
  label: string;
  value: string | undefined;
  size: FontSize;
}) {
  return (
    <div
      style={{ width: `${percent}%` }}
      className="relative flex items-center border-r border-black pr-1 pl-[6mm] last:border-r-0"
    >
      <Reference value={reference} />
      <span className={`min-w-0 break-words ${FONT_CLASS[size]}`}>
        {label} {value}
      </span>
    </div>
  );
}

function Box({
  reference,
  percent,
  label,
  children,
}: {
  reference: number;
  percent: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{ width: `${percent}%` }}
      className="relative border-r border-black py-[0.5mm] pr-1 pl-[6mm] last:border-r-0"
    >
      <Reference value={reference} />
      <p>{label}</p>
      <p className="mt-[1mm] break-words whitespace-pre-line">{children}</p>
    </div>
  );
}
