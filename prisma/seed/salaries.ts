import type { ConceptNature, NoveltyOrigin, PrismaClient, SalaryConceptKind } from "../../src/generated/prisma/client";

/**
 * Catálogos de remuneraciones y novedades, básicos y resúmenes ficticios.
 * Los importes son inventados para la demostración: no responden a ningún
 * convenio ni a aportes reales. Los tipos y conceptos se pueden editar en
 * Configuración → Catálogos.
 */

const CONCEPTS: { name: string; nature: ConceptNature; kind: SalaryConceptKind }[] = [
  { name: "Sueldo básico", nature: "HABER", kind: "BASICO" },
  { name: "Adicionales", nature: "HABER", kind: "ADICIONAL" },
  { name: "Bonificaciones", nature: "HABER", kind: "BONIFICACION" },
  { name: "Premios", nature: "HABER", kind: "PREMIO" },
  { name: "Horas extras", nature: "HABER", kind: "HORAS_EXTRAS" },
  { name: "Otros haberes", nature: "HABER", kind: "OTRO" },
  { name: "Descuentos", nature: "DESCUENTO", kind: "OTRO" },
  { name: "Conceptos informativos", nature: "INFORMATIVO", kind: "OTRO" },
];

type NoveltyTypeSeed = {
  name: string;
  nature: ConceptNature;
  requiresAmount?: boolean;
  requiresQuantity?: boolean;
  quantityUnit?: string;
  generatedFrom?: NoveltyOrigin;
};

const NOVELTY_TYPES: NoveltyTypeSeed[] = [
  { name: "Adelanto", nature: "DESCUENTO", requiresAmount: true },
  { name: "Bonificación", nature: "HABER", requiresAmount: true },
  { name: "Descuento", nature: "DESCUENTO", requiresAmount: true },
  {
    name: "Horas extras",
    nature: "HABER",
    requiresQuantity: true,
    quantityUnit: "horas",
    generatedFrom: "HORAS_EXTRAS",
  },
  { name: "Ausencia", nature: "INFORMATIVO", requiresQuantity: true, quantityUnit: "días", generatedFrom: "AUSENCIAS" },
  {
    name: "Llegada tarde",
    nature: "INFORMATIVO",
    requiresQuantity: true,
    quantityUnit: "veces",
    generatedFrom: "LLEGADAS_TARDE",
  },
  { name: "Cambio de categoría", nature: "INFORMATIVO", generatedFrom: "CAMBIO_CATEGORIA" },
  { name: "Cambio salarial", nature: "INFORMATIVO", generatedFrom: "CAMBIO_SALARIAL" },
  { name: "Premio", nature: "HABER", requiresAmount: true },
  { name: "Sanción", nature: "INFORMATIVO" },
  { name: "Otro", nature: "INFORMATIVO" },
];

/** Tipos de licencia que generan una novedad al aprobarse (solo al crear los tipos de novedad). */
const LEAVE_LINKS: Record<string, string> = {
  "Ausencia con aviso": "Ausencia",
  "Ausencia sin aviso": "Ausencia",
  "Suspensión disciplinaria": "Sanción",
};

const DAY = 86_400_000;
const money = (n: number) => (Math.round(n / 100) * 100).toFixed(2);

export async function seedSalaries(
  db: PrismaClient,
): Promise<{ salaries: number; payrolls: number; novelties: number }> {
  const existingConcepts = new Set(
    (await db.salaryConceptType.findMany({ select: { name: true } })).map((c) => c.name),
  );
  await db.salaryConceptType.createMany({
    data: CONCEPTS.filter((c) => !existingConcepts.has(c.name)).map((c, i) => ({ ...c, sortOrder: i })),
  });

  const existingTypes = new Set((await db.noveltyType.findMany({ select: { name: true } })).map((t) => t.name));
  const usedOrigins = new Set(
    (await db.noveltyType.findMany({ where: { generatedFrom: { not: null } }, select: { generatedFrom: true } })).map(
      (t) => t.generatedFrom,
    ),
  );
  const newTypes = NOVELTY_TYPES.filter((t) => !existingTypes.has(t.name));
  await db.noveltyType.createMany({
    data: newTypes.map((t, i) => ({
      ...t,
      generatedFrom: t.generatedFrom && !usedOrigins.has(t.generatedFrom) ? t.generatedFrom : null,
      sortOrder: i,
    })),
  });
  const created = new Set(newTypes.map((t) => t.name));
  for (const [leaveType, noveltyType] of Object.entries(LEAVE_LINKS)) {
    if (!created.has(noveltyType)) continue;
    const type = await db.noveltyType.findUnique({ where: { name: noveltyType } });
    await db.leaveType.updateMany({
      where: { name: leaveType, generatesNoveltyTypeId: null },
      data: { generatesNoveltyTypeId: type!.id },
    });
  }

  // Los datos de demostración se cargan una sola vez.
  if ((await db.salaryHistory.count()) > 0) return { salaries: 0, payrolls: 0, novelties: 0 };
  const admin = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!admin) return { salaries: 0, payrolls: 0, novelties: 0 };

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const raiseDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));

  const employees = await db.employee.findMany({
    where: { status: { not: "EGRESADO" } },
    orderBy: { fileNumber: "asc" },
    select: { id: true, fileNumber: true, hireDate: true },
  });
  const concepts = new Map((await db.salaryConceptType.findMany()).map((c) => [c.name, c.id]));
  const types = new Map((await db.noveltyType.findMany()).map((t) => [t.name, t.id]));

  let salaries = 0;
  let payrolls = 0;
  for (const employee of employees) {
    // Uno sin básico, para ver el aviso en "Básicos vigentes".
    if (employee.fileNumber === employees.at(-1)?.fileNumber) continue;
    const initial = 850_000 + (employee.fileNumber % 9) * 65_000;
    const raised = initial * 1.08;
    const firstDate = employee.hireDate > raiseDate ? employee.hireDate : new Date(raiseDate.getTime() - 180 * DAY);
    await db.salaryHistory.create({
      data: {
        employeeId: employee.id,
        effectiveDate: firstDate < employee.hireDate ? employee.hireDate : firstDate,
        basicSalary: money(initial),
        notes: "Dato ficticio de demostración.",
        createdById: admin.id,
      },
    });
    salaries += 1;
    let basic = initial;
    if (employee.hireDate < raiseDate) {
      await db.salaryHistory.create({
        data: {
          employeeId: employee.id,
          effectiveDate: raiseDate,
          basicSalary: money(raised),
          notes: "Aumento ficticio de demostración.",
          createdById: admin.id,
        },
      });
      salaries += 1;
      basic = raised;
    }

    if (employee.hireDate >= lastMonth) continue;
    const additional = employee.fileNumber % 3 === 0 ? 45_000 : 0;
    const gross = Number(money(basic)) + additional;
    const deductions = Number(money(gross * 0.2));
    // Algunos con un neto que no cierra, para ver el aviso de diferencias.
    const net = gross - deductions + (employee.fileNumber % 7 === 0 ? 1_000 : 0);
    await db.payrollRecord.create({
      data: {
        employeeId: employee.id,
        period: lastMonth,
        grossReported: gross.toFixed(2),
        deductionsReported: deductions.toFixed(2),
        netReported: net.toFixed(2),
        notes: "Resumen ficticio de demostración.",
        createdById: admin.id,
        updatedById: admin.id,
        lines: {
          create: [
            { conceptTypeId: concepts.get("Sueldo básico")!, amount: money(basic) },
            ...(additional > 0
              ? [
                  {
                    conceptTypeId: concepts.get("Adicionales")!,
                    description: "Dato ficticio",
                    amount: additional.toFixed(2),
                  },
                ]
              : []),
            { conceptTypeId: concepts.get("Descuentos")!, description: "Dato ficticio", amount: deductions.toFixed(2) },
          ],
        },
      },
    });
    payrolls += 1;
  }

  // Algunas novedades manuales del mes en curso.
  const manual = [
    { file: 0, type: "Adelanto", amount: "150000.00", status: "PENDIENTE" as const },
    { file: 2, type: "Premio", amount: "80000.00", status: "APROBADA" as const },
    {
      file: 4,
      type: "Descuento",
      amount: "12500.00",
      status: "PENDIENTE" as const,
      notes: "Rotura de herramienta (ficticio).",
    },
    { file: 6, type: "Bonificación", amount: "60000.00", status: "PENDIENTE" as const },
  ];
  let novelties = 0;
  for (const item of manual) {
    const employee = employees[item.file];
    const typeId = types.get(item.type);
    if (!employee || !typeId) continue;
    await db.novelty.create({
      data: {
        employeeId: employee.id,
        noveltyTypeId: typeId,
        date: today,
        period: thisMonth,
        amount: item.amount,
        status: item.status,
        notes: item.notes ?? "Dato ficticio de demostración.",
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    novelties += 1;
  }
  return { salaries, payrolls, novelties };
}
