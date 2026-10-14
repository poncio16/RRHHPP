import "server-only";
import { formatCuil } from "@/lib/validators/cuil";
import { assertPermission } from "@/server/authz";
import type { ActorContext } from "@/server/context";
import { ConflictError, NotFoundError } from "@/server/errors";
import * as repo from "./repository";

const MODULE = "empleados";

export type PpeForm = {
  employeeId: string;
  company: { legalName: string; cuit: string } | null;
  /** Domicilio del establecimiento donde trabaja (referencias 3 a 6 del instructivo). */
  place: { addressLine: string; city: string; postalCode: string; province: string };
  worker: { name: string; dni: string };
  position: { name: string; description: string; requiredPpe: string };
  /** Datos que faltan cargar en el sistema: quedan en blanco para completar a mano. */
  missing: string[];
};

/**
 * Formulario de entrega de ropa de trabajo y elementos de protección personal
 * de un empleado, con el encabezado completo. Los renglones de entrega se
 * llenan a mano y los firma el trabajador. Lleva el DNI, así que pide el
 * permiso de datos personales. No se arma para egresados. Como la ficha, no
 * se audita cada vista.
 */
export async function getPpeForm(ctx: ActorContext, employeeId: string): Promise<PpeForm> {
  await assertPermission(ctx, "employee:read", MODULE);
  await assertPermission(ctx, "employee.personal:read", MODULE);
  const [employee, company] = await Promise.all([repo.findEmployeeForPpeForm(employeeId), repo.findCompanyHeading()]);
  if (!employee) throw new NotFoundError("No se encontró el empleado.");
  if (employee.status === "EGRESADO") {
    throw new ConflictError("El empleado está egresado: el formulario de EPP se imprime solo para el personal activo.");
  }

  const { workplace, position } = employee;
  const missing: string[] = [];
  if (!company) missing.push("Faltan los datos de la empresa: cargalos en Configuración → Empresa.");
  const placeGaps = [
    !workplace.addressLine && "domicilio",
    !workplace.city && "localidad",
    !workplace.postalCode && "código postal",
    !workplace.province && "provincia",
  ].filter((gap): gap is string => !!gap);
  if (placeGaps.length > 0) {
    missing.push(
      `Al establecimiento «${workplace.name}» le falta ${listOf(placeGaps)}: completalo en Configuración → Catálogos → Establecimientos.`,
    );
  }
  const positionGaps = [
    !position.jobDescription && "la descripción",
    !position.requiredPpe && "los elementos de protección necesarios",
  ].filter((gap): gap is string => !!gap);
  if (positionGaps.length > 0) {
    missing.push(
      `Al puesto «${position.name}» le falta ${listOf(positionGaps)}: completalo en Configuración → Catálogos → Puestos.`,
    );
  }

  return {
    employeeId: employee.id,
    company: company ? { legalName: company.legalName, cuit: formatCuil(company.cuit) } : null,
    place: {
      addressLine: workplace.addressLine ?? "",
      city: workplace.city ?? "",
      postalCode: workplace.postalCode ?? "",
      province: workplace.province?.name ?? "",
    },
    worker: { name: `${employee.lastName}, ${employee.firstName}`, dni: employee.dni },
    position: {
      name: position.name,
      description: position.jobDescription ?? "",
      requiredPpe: position.requiredPpe ?? "",
    },
    missing,
  };
}

function listOf(items: string[]): string {
  return items.length === 1 ? items[0]! : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}
