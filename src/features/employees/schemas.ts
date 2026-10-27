import { parseIsoDate, todayInTimeZone } from "@/lib/format";
import { baseListQuerySchema } from "@/lib/list/query";
import { isValidCbu, isValidCuil, isValidDni, normalizeCbu, normalizeCuil, normalizeDni } from "@/lib/validators";
import { z } from "@/lib/zod";
import { REGISTRATION_OPTIONS, SEX_OPTIONS, type RegistrationValue } from "./constants";

/*
 * Los esquemas aceptan su propia salida: el formulario valida en el cliente y
 * envía al servidor los valores ya normalizados (vacíos como null).
 */

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const requiredText = (max: number, message = "Este campo es obligatorio.") =>
  z.preprocess((v) => v ?? "", z.string().trim().min(1, message).max(max));

const optionalText = (max: number) =>
  z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .max(max)
      .transform((v) => (v === "" ? null : v)),
  );

const requiredId = (message = "Elegí una opción.") => z.preprocess((v) => v ?? "", z.uuid(message));
const optionalId = z.preprocess(blankToNull, z.uuid().nullable());

/** Fecha "AAAA-MM-DD" (input type=date). Se guarda como string y el servicio la convierte. */
const isoDate = (message = "Ingresá una fecha válida.") =>
  z.preprocess(
    (v) => v ?? "",
    z.string().refine((v) => parseIsoDate(v) !== null, message),
  );
const optionalIsoDate = z.preprocess(
  blankToNull,
  z
    .string()
    .refine((v) => parseIsoDate(v) !== null, "Ingresá una fecha válida.")
    .nullable(),
);

const date = (v: string) => parseIsoDate(v)!;

/*
 * Registro del empleado. Las dos fechas son opcionales: vacía, la del estado
 * elegido toma la fecha de ingreso (el servicio la completa). La de "sin
 * registro" se conserva al pasar a con registro.
 */
const registrationFields = {
  registration: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? "CON_REGISTRO" : v),
    z.enum(
      REGISTRATION_OPTIONS.map((o) => o.value) as [RegistrationValue, ...RegistrationValue[]],
      "Elegí una opción.",
    ),
  ),
  registeredSince: optionalIsoDate,
  unregisteredSince: optionalIsoDate,
};

type RegistrationShape = {
  registration: RegistrationValue;
  registeredSince: string | null;
  unregisteredSince: string | null;
};

/** Con registro después de un período sin registro: el alta en ARCA va después. */
function checkRegistration(v: RegistrationShape, ctx: z.RefinementCtx) {
  // Al pasar de un estado al otro, la fecha del nuevo no puede ser la de ingreso.
  if (v.registration === "CON_REGISTRO" && !v.registeredSince && v.unregisteredSince) {
    ctx.addIssue({ code: "custom", path: ["registeredSince"], message: "Ingresá la fecha de alta en ARCA." });
  }
  if (v.registration === "SIN_REGISTRO" && !v.unregisteredSince && v.registeredSince) {
    ctx.addIssue({ code: "custom", path: ["unregisteredSince"], message: "Ingresá desde cuándo está sin registro." });
  }
  if (
    v.registration === "CON_REGISTRO" &&
    v.registeredSince &&
    v.unregisteredSince &&
    date(v.unregisteredSince) > date(v.registeredSince)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["unregisteredSince"],
      message: "El período sin registro tiene que empezar antes del alta en ARCA.",
    });
  }
}

export const employeeSchema = z
  .object({
    fileNumber: z.preprocess(
      blankToNull,
      z.coerce.number().int("Debe ser un número entero.").positive("Debe ser mayor que cero.").nullable(),
    ),
    // Datos personales
    lastName: requiredText(100, "Ingresá el apellido."),
    firstName: requiredText(100, "Ingresá el nombre."),
    dni: z.preprocess(
      (v) => v ?? "",
      z.string().trim().refine(isValidDni, "El DNI tiene 7 u 8 dígitos.").transform(normalizeDni),
    ),
    cuil: z.preprocess(
      (v) => v ?? "",
      z
        .string()
        .trim()
        .refine(isValidCuil, "El CUIL no es válido (revisá los 11 dígitos y el dígito verificador).")
        .transform(normalizeCuil),
    ),
    birthDate: isoDate("Ingresá la fecha de nacimiento."),
    sex: z.enum(SEX_OPTIONS.map((o) => o.value) as ["F", "M", "X"], "Elegí una opción."),
    nationalityId: optionalId,
    maritalStatusId: optionalId,
    // Contacto
    addressLine: requiredText(200, "Ingresá el domicilio."),
    city: requiredText(120, "Ingresá la localidad."),
    provinceId: requiredId("Elegí la provincia."),
    postalCode: requiredText(8, "Ingresá el código postal."),
    phone: optionalText(40),
    email: z.preprocess(
      (v) => v ?? "",
      z
        .string()
        .trim()
        .toLowerCase()
        .refine((v) => v === "" || z.email().safeParse(v).success, "El email no es válido.")
        .transform((v) => (v === "" ? null : v)),
    ),
    emergencyContactName: optionalText(120),
    emergencyContactPhone: optionalText(40),
    // Datos laborales
    hireDate: isoDate("Ingresá la fecha de ingreso."),
    seniorityDate: optionalIsoDate,
    contractEndDate: optionalIsoDate,
    departmentId: requiredId("Elegí el sector."),
    positionId: requiredId("Elegí el puesto."),
    categoryId: optionalId,
    agreementId: optionalId,
    contractTypeId: requiredId("Elegí el tipo de contrato."),
    workdayTypeId: optionalId,
    workScheduleId: optionalId,
    workModalityId: optionalId,
    workplaceId: requiredId("Elegí el establecimiento."),
    supervisorId: optionalId,
    healthInsurerId: optionalId,
    artProviderId: optionalId,
    ...registrationFields,
  })
  .superRefine((v, ctx) => {
    checkRegistration(v, ctx);
    const today = todayInTimeZone();
    const birth = parseIsoDate(v.birthDate);
    const hire = parseIsoDate(v.hireDate);
    if (birth && birth >= today) {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: "La fecha de nacimiento tiene que ser pasada." });
    }
    if (birth && hire && hire <= birth) {
      ctx.addIssue({
        code: "custom",
        path: ["hireDate"],
        message: "El ingreso tiene que ser posterior al nacimiento.",
      });
    }
    if (hire && v.contractEndDate && date(v.contractEndDate) < hire) {
      ctx.addIssue({
        code: "custom",
        path: ["contractEndDate"],
        message: "El fin de contrato no puede ser anterior al ingreso.",
      });
    }
    if (birth && v.seniorityDate && date(v.seniorityDate) <= birth) {
      ctx.addIssue({
        code: "custom",
        path: ["seniorityDate"],
        message: "La antigüedad reconocida tiene que ser posterior al nacimiento.",
      });
    }
    for (const field of ["registeredSince", "unregisteredSince"] as const) {
      const value = v[field];
      if (birth && value && date(value) <= birth) {
        ctx.addIssue({ code: "custom", path: [field], message: "Tiene que ser posterior al nacimiento." });
      }
    }
  });

export type EmployeeInput = z.input<typeof employeeSchema>;
export type EmployeeData = z.output<typeof employeeSchema>;

/** Cambio de registro desde el encabezado del legajo. */
export const registrationFormSchema = z.object(registrationFields).superRefine(checkRegistration);
export const registrationSchema = z
  .object({ version: z.coerce.number().int().positive(), ...registrationFields })
  .superRefine(checkRegistration);
export type RegistrationInput = z.input<typeof registrationSchema>;

/** Datos del cambio que acompañan una edición de campos con historial. */
export const changeMetaSchema = z.object({
  version: z.coerce.number().int().positive(),
  effectiveDate: optionalIsoDate,
  changeNotes: optionalText(500),
});

export const bankAccountSchema = z.object({
  cbu: z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .refine(isValidCbu, "El CBU no es válido (22 dígitos con sus dígitos verificadores).")
      .transform(normalizeCbu),
  ),
  alias: z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .toLowerCase()
      .refine(
        (v) => v === "" || /^[a-z0-9.-]{6,20}$/.test(v),
        "El alias tiene de 6 a 20 letras, números, puntos o guiones.",
      )
      .transform((v) => (v === "" ? null : v)),
  ),
  accountTypeId: requiredId("Elegí el tipo de cuenta."),
  effectiveDate: optionalIsoDate,
  changeNotes: optionalText(500),
});

export const EMPLOYEE_SORTS = {
  apellido: "Apellido",
  legajo: "Legajo",
  ingreso: "Ingreso más reciente",
} as const;

export const employeeListQuerySchema = baseListQuerySchema.extend({
  /** "suspendidos" = activos con una suspensión aprobada que cubre hoy. */
  status: z.enum(["activos", "suspendidos", "egresados", "todos"]).catch("activos").default("activos"),
  departmentId: z.uuid().optional().catch(undefined),
  workplaceId: z.uuid().optional().catch(undefined),
  registro: z.enum(["con", "sin"]).optional().catch(undefined),
  sort: z.enum(["apellido", "legajo", "ingreso"]).catch("apellido").default("apellido"),
});
export type EmployeeListQuery = z.output<typeof employeeListQuerySchema>;

/** Línea de tiempo del legajo: qué clase de hechos mostrar. */
export const TIMELINE_FILTERS = ["todos", "laborales", "salariales", "licencias", "egresos"] as const;
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];
export const timelineQuerySchema = z.object({
  tipo: z.enum(TIMELINE_FILTERS).catch("todos").default("todos"),
});
