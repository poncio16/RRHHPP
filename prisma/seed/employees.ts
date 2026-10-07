import { randomUUID } from "node:crypto";
import { cuilCheckDigit } from "../../src/lib/validators/cuil";
import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Empleados de demostración. Nombres, documentos, domicilios, teléfonos y
 * cuentas son inventados; DNI, CUIL y CBU se generan con dígitos
 * verificadores válidos para que pasen las validaciones del sistema.
 *
 * Idempotente: si ya existe un legajo con ese número no se toca.
 */

type Seed = {
  file: number;
  last: string;
  first: string;
  sex: "F" | "M";
  birth: string;
  hire: string;
  position: string;
  category?: string;
  schedule: "Administración L a V" | "Depósito L a S";
  workplace: "Casa central" | "Depósito Avellaneda";
  contract?: "Plazo fijo" | "Tiempo parcial";
  /** Legajo del superior directo. */
  boss?: number;
  bank: string;
};

const EMPLOYEES: Seed[] = [
  {
    file: 1,
    last: "Ferreyra",
    first: "Mariana",
    sex: "F",
    birth: "1978-03-14",
    hire: "2009-02-02",
    position: "Analista de RRHH",
    category: "Fuera de convenio",
    schedule: "Administración L a V",
    workplace: "Casa central",
    bank: "011",
  },
  {
    file: 2,
    last: "Quiroga",
    first: "Martín",
    sex: "M",
    birth: "1975-11-02",
    hire: "2010-05-03",
    position: "Jefe de ventas",
    category: "Fuera de convenio",
    schedule: "Administración L a V",
    workplace: "Casa central",
    bank: "007",
  },
  {
    file: 3,
    last: "Benítez",
    first: "Ramón",
    sex: "M",
    birth: "1980-07-21",
    hire: "2011-08-01",
    position: "Encargado de depósito",
    category: "Fuera de convenio",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    bank: "014",
  },
  {
    file: 4,
    last: "Álvarez",
    first: "Lucía",
    sex: "F",
    birth: "1988-01-30",
    hire: "2014-03-10",
    position: "Analista administrativo",
    category: "Administrativo A",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 1,
    bank: "072",
  },
  {
    file: 5,
    last: "Sosa",
    first: "Diego",
    sex: "M",
    birth: "1990-09-12",
    hire: "2015-06-01",
    position: "Vendedor",
    category: "Vendedor A",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 2,
    bank: "017",
  },
  {
    file: 6,
    last: "Gómez",
    first: "Valeria",
    sex: "F",
    birth: "1992-04-05",
    hire: "2016-02-15",
    position: "Vendedor",
    category: "Vendedor B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 2,
    bank: "285",
  },
  {
    file: 7,
    last: "Peralta",
    first: "Hernán",
    sex: "M",
    birth: "1985-12-19",
    hire: "2016-09-05",
    position: "Operario de depósito",
    category: "Maestranza A",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    boss: 3,
    bank: "011",
  },
  {
    file: 8,
    last: "Núñez",
    first: "Carolina",
    sex: "F",
    birth: "1994-06-23",
    hire: "2017-04-03",
    position: "Asistente contable",
    category: "Administrativo B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 1,
    bank: "029",
  },
  {
    file: 9,
    last: "Medina",
    first: "Jorge",
    sex: "M",
    birth: "1979-02-08",
    hire: "2017-11-13",
    position: "Chofer",
    category: "Maestranza A",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    boss: 3,
    bank: "191",
  },
  {
    file: 10,
    last: "Castro",
    first: "Florencia",
    sex: "F",
    birth: "1996-10-17",
    hire: "2018-03-01",
    position: "Soporte técnico",
    category: "Administrativo A",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 1,
    bank: "034",
  },
  {
    file: 11,
    last: "Romero",
    first: "Pablo",
    sex: "M",
    birth: "1991-05-29",
    hire: "2018-07-16",
    position: "Operario de depósito",
    category: "Maestranza A",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    boss: 3,
    bank: "014",
  },
  {
    file: 12,
    last: "Domínguez",
    first: "Agustina",
    sex: "F",
    birth: "1997-08-03",
    hire: "2019-02-04",
    position: "Vendedor",
    category: "Vendedor B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 2,
    bank: "007",
  },
  {
    file: 13,
    last: "Ibáñez",
    first: "Sebastián",
    sex: "M",
    birth: "1987-03-11",
    hire: "2019-05-20",
    position: "Chofer",
    category: "Maestranza A",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    boss: 3,
    bank: "011",
  },
  {
    file: 14,
    last: "Muñoz",
    first: "Paula",
    sex: "F",
    birth: "1993-12-01",
    hire: "2020-01-13",
    position: "Analista administrativo",
    category: "Administrativo B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 1,
    bank: "044",
  },
  {
    file: 15,
    last: "Ledesma",
    first: "Nicolás",
    sex: "M",
    birth: "1998-02-25",
    hire: "2021-03-08",
    position: "Operario de depósito",
    category: "Maestranza A",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    boss: 3,
    bank: "285",
  },
  {
    file: 16,
    last: "Aguirre",
    first: "Camila",
    sex: "F",
    birth: "1999-07-14",
    hire: "2021-08-02",
    position: "Vendedor",
    category: "Vendedor B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 2,
    contract: "Tiempo parcial",
    bank: "072",
  },
  {
    file: 17,
    last: "Molina",
    first: "Gustavo",
    sex: "M",
    birth: "1983-09-30",
    hire: "2022-02-14",
    position: "Operario de depósito",
    category: "Maestranza A",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    boss: 3,
    bank: "017",
  },
  {
    file: 18,
    last: "Acosta",
    first: "Rocío",
    sex: "F",
    birth: "1995-11-08",
    hire: "2022-06-06",
    position: "Asistente contable",
    category: "Administrativo B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 1,
    bank: "011",
  },
  {
    file: 19,
    last: "Ojeda",
    first: "Matías",
    sex: "M",
    birth: "2000-04-19",
    hire: "2023-01-09",
    position: "Soporte técnico",
    category: "Administrativo B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 1,
    bank: "029",
  },
  {
    file: 20,
    last: "Herrera",
    first: "Julieta",
    sex: "F",
    birth: "1990-01-22",
    hire: "2023-05-02",
    position: "Vendedor",
    category: "Vendedor A",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 2,
    bank: "007",
  },
  {
    file: 21,
    last: "Ponce",
    first: "Federico",
    sex: "M",
    birth: "1997-06-10",
    hire: "2024-02-05",
    position: "Chofer",
    category: "Maestranza A",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    boss: 3,
    bank: "014",
  },
  {
    file: 22,
    last: "Vega",
    first: "Antonella",
    sex: "F",
    birth: "2001-09-27",
    hire: "2025-03-03",
    position: "Analista administrativo",
    category: "Administrativo B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 1,
    bank: "191",
  },
  {
    file: 23,
    last: "Cabrera",
    first: "Ezequiel",
    sex: "M",
    birth: "2002-12-15",
    hire: "2026-04-06",
    position: "Operario de depósito",
    category: "Maestranza A",
    schedule: "Depósito L a S",
    workplace: "Depósito Avellaneda",
    boss: 3,
    contract: "Plazo fijo",
    bank: "011",
  },
  {
    file: 24,
    last: "Ríos",
    first: "Milagros",
    sex: "F",
    birth: "2003-05-06",
    hire: "2026-08-03",
    position: "Vendedor",
    category: "Vendedor B",
    schedule: "Administración L a V",
    workplace: "Casa central",
    boss: 2,
    contract: "Plazo fijo",
    bank: "072",
  },
];

const STREETS = ["Calle Ficticia", "Pasaje Inventado", "Av. Imaginaria", "Calle Ejemplo", "Diagonal Demo"];
const CITIES = [
  { city: "Ciudad Autónoma de Buenos Aires", province: "AR-C", postalCode: "1406" },
  { city: "Avellaneda", province: "AR-B", postalCode: "1870" },
  { city: "Lanús", province: "AR-B", postalCode: "1824" },
  { city: "Quilmes", province: "AR-B", postalCode: "1878" },
];

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** DNI ficticio derivado del año de nacimiento (orden aproximado real) y del legajo. */
function dniFor(s: Seed): string {
  const year = Number(s.birth.slice(0, 4));
  const base = 20_000_000 + (year - 1975) * 900_000 + s.file * 7_919;
  return String(base).padStart(8, "0");
}

/** CUIL con prefijo 20/27 según sexo, o 23 cuando el verificador da 10. */
function cuilFor(dni: string, sex: "F" | "M"): string {
  const prefix = sex === "F" ? "27" : "20";
  const digit = cuilCheckDigit(prefix + dni);
  if (digit !== null) return `${prefix}${dni}${digit}`;
  const fallback = cuilCheckDigit(`23${dni}`)!;
  return `23${dni}${fallback}`;
}

function cbuDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  return (10 - (sum % 10)) % 10;
}

/** CBU ficticio con verificadores válidos: banco + sucursal + cuenta. */
function cbuFor(bankCode: string, file: number): string {
  const block1 = `${bankCode}${String(100 + file).padStart(4, "0")}`;
  const account = `${String(4000000 + file * 1237).padStart(13, "0")}`;
  return (
    block1 +
    cbuDigit(block1, [7, 1, 3, 9, 7, 1, 3]) +
    account +
    cbuDigit(account, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])
  );
}

export async function seedEmployees(db: PrismaClient): Promise<number> {
  const existing = new Set((await db.employee.findMany({ select: { fileNumber: true } })).map((e) => e.fileNumber));
  const pending = EMPLOYEES.filter((s) => !existing.has(s.file));
  if (pending.length === 0) return 0;

  const [departments, positions, categories, contractTypes, workdayTypes, schedules, workplaces, insurers, art] =
    await Promise.all([
      db.department.findMany(),
      db.position.findMany(),
      db.category.findMany(),
      db.contractType.findMany(),
      db.workdayType.findMany(),
      db.workSchedule.findMany(),
      db.workplace.findMany(),
      db.healthInsurer.findMany({ orderBy: { name: "asc" } }),
      db.artProvider.findFirst({ orderBy: { name: "asc" } }),
    ]);
  const [provinces, lookups, banks, agreement, admin] = await Promise.all([
    db.province.findMany(),
    db.lookupValue.findMany(),
    db.bank.findMany(),
    db.collectiveAgreement.findFirst({ where: { name: "Convenio de demostración" } }),
    db.user.findFirst({ orderBy: { createdAt: "asc" } }),
  ]);
  const byName = <T extends { name: string; id: string }>(rows: T[], name: string) => {
    const row = rows.find((r) => r.name === name);
    if (!row) throw new Error(`Seed de empleados: falta "${name}" (correr primero el seed de organización).`);
    return row.id;
  };
  const lookup = (group: string, code: string) => lookups.find((l) => l.group === group && l.code === code)?.id ?? null;
  const ids = new Map(
    (await db.employee.findMany({ select: { id: true, fileNumber: true } })).map((e) => [e.fileNumber, e.id]),
  );

  // Se crean en orden de legajo: los superiores (1 a 3) existen antes que sus equipos.
  for (const s of pending) {
    const dni = dniFor(s);
    const place = CITIES[s.file % CITIES.length]!;
    const position = positions.find((p) => p.name === s.position)!;
    const contract = s.contract ?? "Tiempo indeterminado";
    const id = randomUUID();
    const hire = date(s.hire);
    await db.employee.create({
      data: {
        id,
        fileNumber: s.file,
        lastName: s.last,
        firstName: s.first,
        dni,
        cuil: cuilFor(dni, s.sex),
        birthDate: date(s.birth),
        sex: s.sex,
        nationalityId: lookup("NACIONALIDAD", "ARGENTINA"),
        maritalStatusId: lookup("ESTADO_CIVIL", s.file % 3 === 0 ? "CASADO" : "SOLTERO"),
        addressLine: `${STREETS[s.file % STREETS.length]} ${100 + s.file * 37}`,
        city: place.city,
        provinceId: provinces.find((p) => p.code === place.province)!.id,
        postalCode: place.postalCode,
        phone: `11 5555-${String(1000 + s.file).slice(-4)}`,
        email: `${s.first}.${s.last}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().concat("@correo-demo.com.ar"),
        hireDate: hire,
        seniorityDate: hire,
        contractEndDate:
          contract === "Plazo fijo"
            ? new Date(Date.UTC(hire.getUTCFullYear() + 1, hire.getUTCMonth(), hire.getUTCDate() - 1))
            : null,
        departmentId: position.departmentId ?? byName(departments, "Administración"),
        positionId: position.id,
        agreementId: s.category ? (agreement?.id ?? null) : null,
        categoryId: s.category ? byName(categories, s.category) : null,
        contractTypeId: byName(contractTypes, contract),
        workdayTypeId: byName(workdayTypes, contract === "Tiempo parcial" ? "Jornada parcial" : "Jornada completa"),
        workScheduleId: byName(schedules, s.schedule),
        workModalityId: lookup("MODALIDAD_TRABAJO", s.position === "Soporte técnico" ? "HIBRIDO" : "PRESENCIAL"),
        workplaceId: byName(workplaces, s.workplace),
        supervisorId: s.boss ? (ids.get(s.boss) ?? null) : null,
        healthInsurerId: insurers[s.file % insurers.length]?.id ?? null,
        artProviderId: art?.id ?? null,
        createdById: admin?.id ?? null,
      },
    });
    ids.set(s.file, id);

    const bank = banks.find((b) => b.code === s.bank);
    const accountType = lookup("TIPO_CUENTA_BANCARIA", "CUENTA_SUELDO");
    if (bank && accountType) {
      await db.employeeBankAccount.create({
        data: { employeeId: id, bankId: bank.id, cbu: cbuFor(bank.code, s.file), accountTypeId: accountType },
      });
    }
  }

  // Un par de cambios de categoría para que el historial tenga ejemplos.
  if (admin) {
    for (const file of [4, 5].filter((f) => pending.some((p) => p.file === f))) {
      const seed = EMPLOYEES.find((e) => e.file === file)!;
      const from = file === 4 ? "Administrativo B" : "Vendedor B";
      const to = seed.category!;
      const hire = date(seed.hire);
      await db.employeeChangeHistory.create({
        data: {
          employeeId: ids.get(file)!,
          changeSetId: randomUUID(),
          changeType: "CATEGORIA",
          field: "categoryId",
          oldValue: from,
          newValue: to,
          oldRefId: byName(categories, from),
          newRefId: byName(categories, to),
          effectiveDate: new Date(Date.UTC(hire.getUTCFullYear() + 3, 0, 1)),
          notes: "Recategorización (dato de demostración).",
          createdById: admin.id,
        },
      });
    }
  }
  return pending.length;
}
