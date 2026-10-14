import type { PpeForm } from "./service";

/*
 * Medidas del formulario de entrega de EPP (funciones puras). La hoja tiene
 * alto fijo para que salga en una sola carilla A4 apaisada: si un dato largo
 * necesita más renglones, se achica su letra y, en último caso, el casillero
 * (18). Los renglones se estiman con los anchos de la letra Times antes de
 * mostrar la hoja, con un margen para las diferencias con el navegador.
 */

/** Ancho y alto útiles de la hoja (A4 apaisado menos los márgenes de `@page epp`), en mm. */
export const SHEET_WIDTH_MM = 285;
export const SHEET_HEIGHT_MM = 196;
/** Lo que no cambia de alto: título, franja, tabla de entregas y bordes, en mm. */
const FIXED_MM = 132;
const FIELD_ROW_MM = 6;
const BOX_ROW_MIN_MM = 22;
/** Alto mínimo del casillero (18), "Información adicional". */
const NOTES_MIN_MM = 8;
/** Margen para diferencias entre la estimación y el navegador. */
const SAFETY_MM = 3;
/** Sangría de cada casillero (lugar para la referencia) más el margen derecho, en mm. */
const CELL_PADDING_MM = 7;
/** Relleno vertical de (9) y (10) más el espacio entre el título y el texto, en mm. */
const BOX_PADDING_MM = 2.3;

export const FONT_SIZES = [9, 8, 7] as const;
export type FontSize = (typeof FONT_SIZES)[number];

const MM_PER_PT = 25.4 / 72;
/** Interlineado de `leading-tight`. */
const LINE_HEIGHT = 1.25;
/** La negrita (el nombre del puesto) es un 7 % más ancha. */
const BOLD_SCALE = 1.075;

/**
 * Anchos de la letra Times New Roman (y de Liberation Serif, que mide igual),
 * en em; las letras con tilde miden como sin ella.
 */
const CHAR_EM: Record<string, number> = {
  ...Object.fromEntries([..."bdghknopquvxy0123456789"].map((c) => [c, 0.5])),
  ...Object.fromEntries([..."acez"].map((c) => [c, 0.444])),
  ...Object.fromEntries([..."fr-()"].map((c) => [c, 0.333])),
  ...Object.fromEntries([..."ijlt:;/"].map((c) => [c, 0.278])),
  s: 0.389,
  m: 0.778,
  w: 0.722,
  ...Object.fromEntries([..."ADGHKNOQUVXY"].map((c) => [c, 0.722])),
  ...Object.fromEntries([..."BCR"].map((c) => [c, 0.667])),
  ...Object.fromEntries([..."ELTZ"].map((c) => [c, 0.611])),
  ...Object.fromEntries([..."FPS"].map((c) => [c, 0.556])),
  I: 0.333,
  J: 0.389,
  M: 0.889,
  W: 0.944,
  " ": 0.25,
  ".": 0.25,
  ",": 0.25,
};
/** Lo que no está en la tabla se cuenta ancho, por las dudas. */
const DEFAULT_EM = 0.722;

function charEm(char: string): number {
  return CHAR_EM[char] ?? CHAR_EM[char.normalize("NFD")[0]!] ?? DEFAULT_EM;
}

function textEm(text: string): number {
  let em = 0;
  for (const char of text) em += charEm(char);
  return em;
}

/**
 * Renglones que ocupa un texto en un ancho dado, cortando por palabras como
 * el navegador. `scale` agranda los anchos (por ejemplo, para la negrita).
 */
export function estimateLines(text: string, widthMm: number, pt: number, scale = 1): number {
  const widthEm = widthMm / (pt * MM_PER_PT);
  const space = charEm(" ") * scale;
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let used = 0;
    lines += 1;
    for (const word of paragraph.split(" ").filter(Boolean)) {
      const em = textEm(word) * scale;
      if (used > 0 && used + space + em <= widthEm) {
        used += space + em;
      } else if (used === 0 && em <= widthEm) {
        used = em;
      } else {
        // Palabra que no entra: empieza otro renglón y, si es más larga que el ancho, se corta.
        if (used > 0) lines += 1;
        lines += Math.ceil(em / widthEm) - 1;
        used = em % widthEm || widthEm;
      }
    }
  }
  return lines;
}

const lineMm = (pt: number) => pt * LINE_HEIGHT * MM_PER_PT;
const cellWidth = (percent: number) => (SHEET_WIDTH_MM * percent) / 100 - CELL_PADDING_MM;

type Field = { reference: number; percent: number; label: string; value: (form: PpeForm) => string | undefined };

/** Renglones de datos del encabezado, referencias (1) a (8) del instructivo. */
export const FIELD_ROWS: readonly (readonly Field[])[] = [
  [
    { reference: 1, percent: 63, label: "Razón social:", value: (f) => f.company?.legalName },
    { reference: 2, percent: 37, label: "C.U.I.T.:", value: (f) => f.company?.cuit },
  ],
  [
    { reference: 3, percent: 36, label: "Dirección:", value: (f) => f.place.addressLine },
    { reference: 4, percent: 19.5, label: "Localidad:", value: (f) => f.place.city },
    { reference: 5, percent: 8, label: "C.P.:", value: (f) => f.place.postalCode },
    { reference: 6, percent: 36.5, label: "Provincia:", value: (f) => f.place.province },
  ],
  [
    { reference: 7, percent: 72.8, label: "Nombre y apellido del trabajador:", value: (f) => f.worker.name },
    { reference: 8, percent: 27.2, label: "D.N.I.:", value: (f) => f.worker.dni },
  ],
];

export const DESCRIPTION_BOX = {
  reference: 9,
  percent: 48.6,
  label: "Descripción breve del puesto/s de trabajo en el/los cuales se desempeña el trabajador:",
};
export const PPE_BOX = {
  reference: 10,
  percent: 51.4,
  label: "Elementos de protección personal, necesarios para el trabajador, según el puesto de trabajo:",
};

/** Texto de (9): el puesto y su descripción. */
export const positionText = (form: PpeForm) =>
  form.position.description ? `${form.position.name}. ${form.position.description}` : form.position.name;

export type PpeLayout = {
  /** Letra de cada dato, por número de referencia. */
  fields: Record<number, FontSize>;
  /** Letra de (9) y (10), la misma para los dos. */
  box: FontSize;
  /** Alto máximo de la fila de (9) y (10), en mm: lo que no entre se corta. */
  boxMaxMm: number;
  /** false si ni con la letra más chica entra todo: la pantalla avisa que se corta. */
  fits: boolean;
};

/**
 * Letra de cada parte del encabezado. Cada dato usa la más grande con la que
 * entra en un renglón o, si no hay, en dos; (9) y (10), la más grande con la
 * que entran en el alto que queda.
 */
export function layoutPpeForm(form: PpeForm): PpeLayout {
  const fields: Record<number, FontSize> = {};
  let fieldsMm = 0;
  for (const row of FIELD_ROWS) {
    let rowMm = FIELD_ROW_MM;
    for (const field of row) {
      const text = `${field.label} ${field.value(form) ?? ""}`;
      const width = cellWidth(field.percent);
      const lines = (pt: number) => estimateLines(text, width, pt);
      const pt = FONT_SIZES.find((size) => lines(size) <= 1) ?? FONT_SIZES.find((size) => lines(size) <= 2) ?? 7;
      fields[field.reference] = pt;
      rowMm = Math.max(rowMm, lines(pt) * lineMm(pt) + 0.5);
    }
    fieldsMm += rowMm;
  }

  const boxMaxMm = SHEET_HEIGHT_MM - FIXED_MM - fieldsMm - NOTES_MIN_MM - SAFETY_MM;
  const boxes = [
    // El puesto va en negrita: se cuenta todo como negrita, por exceso.
    { label: DESCRIPTION_BOX.label, text: positionText(form), percent: DESCRIPTION_BOX.percent, scale: BOLD_SCALE },
    { label: PPE_BOX.label, text: form.position.requiredPpe, percent: PPE_BOX.percent, scale: 1 },
  ];
  const boxMm = (pt: number) =>
    Math.max(
      ...boxes.map((box) => {
        const width = cellWidth(box.percent);
        const lines =
          estimateLines(box.label, width, pt) + (box.text ? estimateLines(box.text, width, pt, box.scale) : 0);
        return lines * lineMm(pt) + BOX_PADDING_MM;
      }),
    );
  const box = FONT_SIZES.find((pt) => boxMm(pt) <= boxMaxMm);
  return { fields, box: box ?? 7, boxMaxMm: Math.max(BOX_ROW_MIN_MM, boxMaxMm), fits: box !== undefined };
}
