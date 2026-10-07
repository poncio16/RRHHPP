import { describe, expect, it } from "vitest";
import { catalogItemSchema } from "@/features/catalogs/schemas";
import { CATALOGS } from "@/features/catalogs/definitions";
import { daysUntil, expiryState, suggestedExpiry } from "@/features/documents/expiry";
import { detectFileType, safeFileName } from "@/features/documents/files";
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
