import "server-only";
import { db } from "@/server/db";

const placeSelect = {
  addressLine: true,
  city: true,
  postalCode: true,
  province: { select: { name: true } },
} as const;

/** Datos de la empresa que van en el encabezado (una sola fila, ver D9). */
export async function findCompanyHeading() {
  return db.company.findFirst({
    select: { legalName: true, cuit: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Trabajador, puesto y establecimiento del formulario de entrega de EPP. */
export async function findEmployeeForPpeForm(id: string) {
  return db.employee.findUnique({
    where: { id },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      dni: true,
      status: true,
      position: { select: { name: true, jobDescription: true, requiredPpe: true } },
      workplace: { select: { name: true, ...placeSelect } },
    },
  });
}
