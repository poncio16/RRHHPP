import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Tipos de documento (datos base: los que pide el relevamiento; se editan
 * desde Configuración) y documentos de demostración para algunos empleados,
 * con sus archivos en STORAGE_DIR. Las vigencias y anticipaciones de los
 * tipos quedan vacías: dependen de cada empresa. Los obligatorios son los que
 * indicó la empresa; los apercibimientos no, porque solo existen si hubo una
 * sanción. El recibo de sueldo se controla mes a mes desde el mes en que se
 * instala el sistema.
 */
const DOCUMENT_TYPES: {
  name: string;
  isSensitive?: boolean;
  requiresExpiry?: boolean;
  requirement?: "UNA_VEZ" | "MENSUAL";
}[] = [
  { name: "DNI", requirement: "UNA_VEZ" },
  { name: "CUIL" },
  { name: "Constancia de CUIL", requirement: "UNA_VEZ" },
  { name: "Alta temprana firmada", requirement: "UNA_VEZ" },
  { name: "Formulario de EPP", requirement: "UNA_VEZ" },
  { name: "Apercibimiento" },
  { name: "Recibo de sueldo", requirement: "MENSUAL" },
  { name: "Contrato" },
  { name: "Certificado médico", isSensitive: true },
  { name: "Licencia" },
  { name: "Estudio preocupacional", isSensitive: true },
  { name: "Documentación bancaria" },
  { name: "Documentación de obra social" },
  { name: "Documentación de ART" },
  { name: "Certificado" },
  { name: "Evaluación" },
  { name: "Otro" },
];

/** PDF mínimo de una página con un texto, para que la descarga funcione. */
function demoPdf(text: string): Uint8Array {
  const stream = `BT /F1 14 Tf 72 720 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

const DAY = 86_400_000;

/** Fecha de calendario (medianoche UTC) a `days` días de hoy. */
function fromToday(days: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * DAY);
}

/** Primer día del mes actual en Argentina, corrido `months` meses. */
function monthFromNow(months: number): Date {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year!, month! - 1 + months, 1));
}

type DemoDocument = {
  file: number;
  type: string;
  status?: "PRESENTADO" | "PENDIENTE" | "OBSERVADO";
  issue?: number;
  expiry?: number;
  /** Mes del documento (los mensuales), relativo al actual. */
  period?: number;
  notes?: string;
  attach?: boolean;
};

const DEMO: DemoDocument[] = [
  { file: 1, type: "DNI", issue: -2000, attach: true },
  { file: 1, type: "Alta temprana firmada", issue: -6000 },
  { file: 4, type: "DNI", issue: -1500, attach: true },
  { file: 4, type: "Certificado", issue: -340, expiry: 25, notes: "Curso de primeros auxilios.", attach: true },
  { file: 5, type: "Constancia de CUIL", status: "PENDIENTE", notes: "Se pidió al empleado." },
  { file: 7, type: "Estudio preocupacional", issue: -3500, attach: true },
  { file: 9, type: "Certificado", issue: -700, expiry: -12, notes: "Licencia de conducir profesional." },
  { file: 13, type: "Certificado", issue: -300, expiry: 65, notes: "Licencia de conducir profesional." },
  { file: 16, type: "Contrato", issue: -1890, attach: true },
  { file: 20, type: "Documentación de obra social", status: "OBSERVADO", notes: "Falta la firma." },
  { file: 21, type: "Certificado", issue: -360, expiry: 5, notes: "Licencia de conducir profesional." },
  { file: 23, type: "Contrato", issue: -180, expiry: 185, attach: true },
  { file: 24, type: "Alta temprana firmada", issue: -65, attach: true },
  { file: 1, type: "Recibo de sueldo", period: -1, issue: -10, attach: true },
];

/**
 * Datos base: tipos de documento. Devuelve cuántos creó. Los obligatorios se
 * marcan solo en una instalación nueva: en las demás los marcó la migración y
 * un tipo que la empresa renombró volvería como obligatorio sin documentos.
 */
export async function seedDocumentTypes(db: PrismaClient): Promise<number> {
  const existingTypes = new Set((await db.documentType.findMany()).map((t) => t.name.toLocaleLowerCase("es")));
  const fresh = existingTypes.size === 0;
  const { count } = await db.documentType.createMany({
    data: DOCUMENT_TYPES.map(({ requirement, ...t }, sortOrder) => ({
      ...t,
      sortOrder,
      ...(fresh && requirement
        ? { requirement, requiredFrom: requirement === "MENSUAL" ? monthFromNow(0) : null }
        : {}),
    })).filter((t) => !existingTypes.has(t.name.toLocaleLowerCase("es"))),
  });
  return count;
}

/** Datos de demostración: documentos y archivos de algunos empleados ficticios. */
export async function seedDemoDocuments(db: PrismaClient): Promise<number> {
  const admin = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!admin) return 0;
  const types = new Map((await db.documentType.findMany()).map((t) => [t.name, t.id]));
  const employees = new Map(
    (await db.employee.findMany({ select: { id: true, fileNumber: true, lastName: true, firstName: true } })).map(
      (e) => [e.fileNumber, e],
    ),
  );
  const storageDir = path.resolve(process.env.STORAGE_DIR ?? "./storage");
  let created = 0;

  for (const demo of DEMO) {
    const employee = employees.get(demo.file);
    const typeId = types.get(demo.type);
    if (!employee || !typeId) continue;
    if (await db.document.findFirst({ where: { employeeId: employee.id, documentTypeId: typeId } })) continue;

    let fileId: string | null = null;
    if (demo.attach) {
      const bytes = demoPdf(`${demo.type} - ${employee.lastName}, ${employee.firstName} (documento ficticio)`);
      const now = new Date();
      const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}`;
      const target = path.join(storageDir, ...key.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      const slug = demo.type.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
      fileId = (
        await db.storedFile.create({
          data: {
            storageKey: key,
            originalName: `${slug}-${employee.lastName.toLowerCase()}.pdf`.normalize("NFD").replace(/[̀-ͯ]/g, ""),
            mimeType: "application/pdf",
            sizeBytes: bytes.byteLength,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            uploadedById: admin.id,
          },
        })
      ).id;
    }
    await db.document.create({
      data: {
        employeeId: employee.id,
        documentTypeId: typeId,
        status: demo.status ?? "PRESENTADO",
        issueDate: demo.issue === undefined ? null : fromToday(demo.issue),
        expiryDate: demo.expiry === undefined ? null : fromToday(demo.expiry),
        period: demo.period === undefined ? null : monthFromNow(demo.period),
        notes: demo.notes ?? null,
        fileId,
        createdById: admin.id,
      },
    });
    created++;
  }
  return created;
}
