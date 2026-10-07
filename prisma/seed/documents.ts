import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Tipos de documento (los que pide el relevamiento; se editan desde
 * Configuración) y documentos de demostración para algunos empleados.
 * Las vigencias y anticipaciones quedan vacías: dependen de cada empresa.
 */
const DOCUMENT_TYPES: { name: string; isSensitive?: boolean; requiresExpiry?: boolean }[] = [
  { name: "DNI" },
  { name: "CUIL" },
  { name: "Constancia de CUIL" },
  { name: "Alta laboral" },
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

type DemoDocument = {
  file: number;
  type: string;
  status?: "PRESENTADO" | "PENDIENTE" | "OBSERVADO";
  issue?: number;
  expiry?: number;
  notes?: string;
  attach?: boolean;
};

const DEMO: DemoDocument[] = [
  { file: 1, type: "DNI", issue: -2000, attach: true },
  { file: 1, type: "Alta laboral", issue: -6000 },
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
  { file: 24, type: "Alta laboral", issue: -65, attach: true },
];

export async function seedDocuments(db: PrismaClient): Promise<number> {
  const existingTypes = new Set((await db.documentType.findMany()).map((t) => t.name));
  await db.documentType.createMany({
    data: DOCUMENT_TYPES.map((t, sortOrder) => ({ ...t, sortOrder })).filter((t) => !existingTypes.has(t.name)),
  });

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
        notes: demo.notes ?? null,
        fileId,
        createdById: admin.id,
      },
    });
    created++;
  }
  return created;
}
