/**
 * Datos de referencia estables: jurisdicciones argentinas y listas simples.
 * Son editables desde Configuración (Fase 4); el seed solo los crea si faltan.
 */

/** Las 24 jurisdicciones, con el código ISO 3166-2:AR. */
export const PROVINCES: { code: string; name: string }[] = [
  { code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-K", name: "Catamarca" },
  { code: "AR-H", name: "Chaco" },
  { code: "AR-U", name: "Chubut" },
  { code: "AR-X", name: "Córdoba" },
  { code: "AR-W", name: "Corrientes" },
  { code: "AR-E", name: "Entre Ríos" },
  { code: "AR-P", name: "Formosa" },
  { code: "AR-Y", name: "Jujuy" },
  { code: "AR-L", name: "La Pampa" },
  { code: "AR-F", name: "La Rioja" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-N", name: "Misiones" },
  { code: "AR-Q", name: "Neuquén" },
  { code: "AR-R", name: "Río Negro" },
  { code: "AR-A", name: "Salta" },
  { code: "AR-J", name: "San Juan" },
  { code: "AR-D", name: "San Luis" },
  { code: "AR-Z", name: "Santa Cruz" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-G", name: "Santiago del Estero" },
  { code: "AR-V", name: "Tierra del Fuego, Antártida e Islas del Atlántico Sur" },
  { code: "AR-T", name: "Tucumán" },
];

/** Grupos de LookupValue (ver prisma/schema.prisma). */
export const LOOKUP_VALUES: Record<string, { code: string; label: string }[]> = {
  ESTADO_CIVIL: [
    { code: "SOLTERO", label: "Soltero/a" },
    { code: "CASADO", label: "Casado/a" },
    { code: "UNION_CONVIVENCIAL", label: "Unión convivencial" },
    { code: "DIVORCIADO", label: "Divorciado/a" },
    { code: "VIUDO", label: "Viudo/a" },
  ],
  NACIONALIDAD: [
    { code: "ARGENTINA", label: "Argentina" },
    { code: "BOLIVIANA", label: "Boliviana" },
    { code: "BRASILENA", label: "Brasileña" },
    { code: "CHILENA", label: "Chilena" },
    { code: "PARAGUAYA", label: "Paraguaya" },
    { code: "PERUANA", label: "Peruana" },
    { code: "URUGUAYA", label: "Uruguaya" },
    { code: "VENEZOLANA", label: "Venezolana" },
    { code: "OTRA", label: "Otra" },
  ],
  MODALIDAD_TRABAJO: [
    { code: "PRESENCIAL", label: "Presencial" },
    { code: "REMOTO", label: "Remoto" },
    { code: "HIBRIDO", label: "Híbrido" },
  ],
  TIPO_CUENTA_BANCARIA: [
    { code: "CAJA_AHORRO", label: "Caja de ahorro" },
    { code: "CUENTA_CORRIENTE", label: "Cuenta corriente" },
    { code: "CUENTA_SUELDO", label: "Cuenta sueldo" },
  ],
  TIPO_EGRESO: [
    { code: "RENUNCIA", label: "Renuncia" },
    { code: "DESPIDO_CON_CAUSA", label: "Despido con causa" },
    { code: "DESPIDO_SIN_CAUSA", label: "Despido sin causa" },
    { code: "MUTUO_ACUERDO", label: "Mutuo acuerdo" },
    { code: "FIN_CONTRATO", label: "Fin de contrato" },
    { code: "PERIODO_PRUEBA", label: "Extinción en período de prueba" },
    { code: "JUBILACION", label: "Jubilación" },
    { code: "FALLECIMIENTO", label: "Fallecimiento" },
    { code: "OTRO", label: "Otro" },
  ],
  MOTIVO_EGRESO: [
    { code: "MEJOR_OFERTA", label: "Mejor oferta laboral" },
    { code: "MOTIVOS_PERSONALES", label: "Motivos personales" },
    { code: "REESTRUCTURACION", label: "Reestructuración" },
    { code: "DESEMPENO", label: "Desempeño" },
    { code: "MUDANZA", label: "Mudanza" },
    { code: "OTRO", label: "Otro" },
  ],
};
