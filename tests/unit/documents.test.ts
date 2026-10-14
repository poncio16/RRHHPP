import { describe, expect, it } from "vitest";
import { catalogItemSchema } from "@/features/catalogs/schemas";
import { CATALOGS } from "@/features/catalogs/definitions";
import { daysUntil, expiryState, suggestedExpiry } from "@/features/documents/expiry";
import { detectFileType, safeFileName } from "@/features/documents/files";
import { describeMissing, dueMonths, lastDueMonth, missingDocuments } from "@/features/documents/required";
import { documentSchema } from "@/features/documents/schemas";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const bytes = (...values: number[]) => new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("vencimiento de documentos", () => {
  const today = d("2026-10-07");

  it("es válido hasta el día de vencimiento inclusive", () => {
    expect(expiryState(d("2026-10-07"), today, 30)).toBe("POR_VENCER");
    expect(expiryState(d("2026-10-06"), today, 30)).toBe("VENCIDO");
  });

  it("avisa con la anticipación indicada", () => {
    expect(expiryState(d("2026-11-06"), today, 30)).toBe("POR_VENCER");
    expect(expiryState(d("2026-11-07"), today, 30)).toBe("VIGENTE");
    expect(expiryState(null, today, 30)).toBe("SIN_VENCIMIENTO");
  });

  it("calcula días restantes y el vencimiento sugerido", () => {
    expect(daysUntil(d("2026-10-17"), today)).toBe(10);
    expect(daysUntil(d("2026-10-01"), today)).toBe(-6);
    expect(suggestedExpiry(d("2026-01-01"), 365)).toEqual(d("2027-01-01"));
  });
});

describe("archivos adjuntos", () => {
  it("reconoce el tipo por el contenido", () => {
    expect(detectFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))?.mime).toBe("application/pdf");
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(detectFileType(bytes(0x4d, 0x5a))).toBeNull();
    expect(detectFileType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("sanea el nombre y usa la extensión del tipo real", () => {
    const pdf = detectFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))!;
    expect(safeFileName("C:\\Users\\ana\\DNI frente.jpg", pdf)).toBe("DNI frente.pdf");
    expect(safeFileName('../"raro"<>.pdf', pdf)).toBe("raro.pdf");
    expect(safeFileName("...", pdf)).toBe("archivo.pdf");
  });
});

describe("esquemas", () => {
  it("el documento acepta su propia salida", () => {
    const once = documentSchema.parse({
      documentTypeId: "0190a000-0000-7000-8000-000000000001",
      issueDate: "2026-01-10",
      expiryDate: "",
      status: "PRESENTADO",
      notes: " ",
    });
    expect(once).toMatchObject({ expiryDate: null, notes: null });
    expect(documentSchema.parse(once)).toEqual(once);
  });

  it("los días del catálogo de tipos son opcionales, enteros y con tope", () => {
    const schema = catalogItemSchema(CATALOGS["tipos-documento"], "create");
    const once = schema.parse({ name: "Carnet", defaultValidityDays: "365", alertDaysBefore: "" });
    expect(once).toMatchObject({ defaultValidityDays: 365, alertDaysBefore: null, isSensitive: false });
    expect(schema.parse(once)).toEqual(once);
    expect(schema.safeParse({ name: "X", alertDaysBefore: "1,5" }).success).toBe(false);
    expect(schema.safeParse({ name: "X", alertDaysBefore: "400" }).success).toBe(false);
  });
});

describe("documentos obligatorios", () => {
  const types = [
    { id: "dni", name: "DNI", requirement: "UNA_VEZ" as const, requiredFrom: null },
    { id: "recibo", name: "Recibo de sueldo", requirement: "MENSUAL" as const, requiredFrom: d("2026-06-01") },
    { id: "epp", name: "Formulario de EPP", requirement: "UNA_VEZ" as const, requiredFrom: null },
  ];
  const doc = (documentTypeId: string, period: string | null = null) => ({
    documentTypeId,
    period: period ? d(`${period}-01`) : null,
  });

  it("un mes se reclama cuando pasó el plazo desde su último día", () => {
    // Plazo de 10 días: septiembre vence el 10 de octubre inclusive.
    expect(lastDueMonth(d("2026-10-10"), 10)).toEqual(d("2026-08-01"));
    expect(lastDueMonth(d("2026-10-11"), 10)).toEqual(d("2026-09-01"));
    expect(lastDueMonth(d("2026-10-01"), 0)).toEqual(d("2026-09-01"));
    expect(lastDueMonth(d("2026-09-30"), 0)).toEqual(d("2026-08-01"));
    expect(lastDueMonth(d("2027-01-15"), 10)).toEqual(d("2026-12-01"));
  });

  it("los meses a controlar empiezan en el de inicio o en el de ingreso, el que sea posterior", () => {
    expect(dueMonths(d("2026-06-01"), d("2020-03-15"), d("2026-08-01"))).toEqual([
      d("2026-06-01"),
      d("2026-07-01"),
      d("2026-08-01"),
    ]);
    expect(dueMonths(d("2026-06-01"), d("2026-07-20"), d("2026-08-01"))).toEqual([d("2026-07-01"), d("2026-08-01")]);
    expect(dueMonths(d("2026-06-01"), d("2026-09-01"), d("2026-08-01"))).toEqual([]);
  });

  it("los de una vez faltan sin ningún documento; los mensuales, por cada mes sin el suyo", () => {
    const lastDue = d("2026-09-01");
    const hire = d("2019-01-01");
    expect(missingDocuments(types, [doc("dni"), doc("otro")], hire, lastDue)).toEqual([
      { typeId: "recibo", name: "Recibo de sueldo", months: [6, 7, 8, 9].map((m) => d(`2026-0${m}-01`)) },
      { typeId: "epp", name: "Formulario de EPP", months: [] },
    ]);
    const loaded = [
      doc("epp"),
      doc("dni"),
      ...["2026-06", "2026-07", "2026-09", "2026-10"].map((p) => doc("recibo", p)),
    ];
    expect(missingDocuments(types, loaded, hire, lastDue)).toEqual([
      { typeId: "recibo", name: "Recibo de sueldo", months: [d("2026-08-01")] },
    ]);
    // Un recibo sin mes no cubre ninguno.
    expect(missingDocuments(types.slice(1, 2), [doc("recibo")], hire, d("2026-06-01"))[0]?.months).toEqual([
      d("2026-06-01"),
    ]);
    expect(missingDocuments([], [], hire, lastDue)).toEqual([]);
  });

  it("un mensual sin mes de inicio no se controla", () => {
    const type = { id: "x", name: "X", requirement: "MENSUAL" as const, requiredFrom: null };
    expect(missingDocuments([type], [], d("2019-01-01"), d("2026-09-01"))).toEqual([]);
  });

  it("describe lo que falta con los meses", () => {
    const months = (...keys: string[]) => keys.map((k) => d(`${k}-01`));
    expect(describeMissing({ typeId: "dni", name: "DNI", months: [] })).toBe("DNI");
    const recibo = (keys: string[]) =>
      describeMissing({ typeId: "r", name: "Recibo de sueldo", months: months(...keys) });
    expect(recibo(["2026-09"])).toBe("Recibo de sueldo: septiembre de 2026");
    expect(recibo(["2026-07", "2026-09"])).toBe("Recibo de sueldo: julio y septiembre de 2026");
    expect(recibo(["2026-07", "2026-08", "2026-09"])).toBe("Recibo de sueldo: julio, agosto y septiembre de 2026");
    expect(recibo(["2025-12", "2026-01"])).toBe("Recibo de sueldo: diciembre de 2025 y enero de 2026");
    expect(recibo(["2025-11", "2025-12", "2026-01", "2026-03"])).toBe(
      "Recibo de sueldo: 4 meses entre noviembre de 2025 y marzo de 2026",
    );
  });
});

describe("mes de un documento", () => {
  const base = { documentTypeId: "6f1c1b3e-2f4a-4d8e-9b7a-1c2d3e4f5a6b", status: "PRESENTADO" };

  it("es opcional, AAAA-MM y no posterior al mes actual", () => {
    expect(documentSchema.parse({ ...base, period: "" }).period).toBeNull();
    expect(documentSchema.parse({ ...base, period: "2026-01" }).period).toBe("2026-01");
    expect(documentSchema.safeParse({ ...base, period: "2026-13" }).success).toBe(false);
    expect(documentSchema.safeParse({ ...base, period: "2999-01" }).success).toBe(false);
  });
});

describe("catálogo de tipos de documento", () => {
  const schema = catalogItemSchema(CATALOGS["tipos-documento"], "create");

  it("por defecto no es obligatorio", () => {
    expect(schema.parse({ name: "Formulario de EPP" })).toMatchObject({ requirement: null, requiredFrom: null });
    expect(schema.parse({ name: "DNI", requirement: "UNA_VEZ", requiredFrom: "" })).toMatchObject({
      requirement: "UNA_VEZ",
      requiredFrom: null,
    });
  });

  it("el mensual pide desde qué mes se controla, y solo el mensual lo lleva", () => {
    const monthly = schema.parse({ name: "Recibo de sueldo", requirement: "MENSUAL", requiredFrom: "2026-10" });
    expect(monthly).toMatchObject({ requirement: "MENSUAL", requiredFrom: d("2026-10-01") });
    expect(schema.parse(monthly)).toEqual(monthly);
    const issues = (values: object) => schema.safeParse(values).error?.issues.map((i) => [i.path[0], i.message]);
    expect(issues({ name: "Recibo", requirement: "MENSUAL" })).toEqual([
      ["requiredFrom", "Indicá desde qué mes se controla."],
    ]);
    expect(issues({ name: "DNI", requirement: "UNA_VEZ", requiredFrom: "2026-10" })?.[0]?.[0]).toBe("requiredFrom");
    expect(issues({ name: "X", requiredFrom: "2026-10" })?.[0]?.[0]).toBe("requiredFrom");
    expect(issues({ name: "Recibo", requirement: "MENSUAL", requiredFrom: "2026-1" })?.[0]?.[0]).toBe("requiredFrom");
  });
});
