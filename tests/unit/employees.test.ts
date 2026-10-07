import { describe, expect, it } from "vitest";
import { formatSeniority, seniority } from "@/features/employees/calc";
import { bankAccountSchema, employeeSchema } from "@/features/employees/schemas";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const id = (n: number) => `0190a000-0000-7000-8000-${String(n).padStart(12, "0")}`;

describe("antigüedad", () => {
  it("cuenta años, meses y días cumplidos", () => {
    expect(seniority(d("2020-03-15"), d("2026-10-07"))).toEqual({ years: 6, months: 6, days: 22 });
    expect(seniority(d("2026-01-31"), d("2026-03-01"))).toEqual({ years: 0, months: 1, days: 1 });
    expect(seniority(d("2024-02-29"), d("2025-02-28"))).toEqual({ years: 1, months: 0, days: 0 });
    expect(seniority(d("2025-12-31"), d("2026-02-27"))).toEqual({ years: 0, months: 1, days: 27 });
  });

  it("devuelve cero si la fecha final es anterior", () => {
    expect(seniority(d("2026-10-07"), d("2026-01-01"))).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("se muestra en texto", () => {
    expect(formatSeniority({ years: 1, months: 0, days: 3 })).toBe("1 año");
    expect(formatSeniority({ years: 3, months: 2, days: 0 })).toBe("3 años y 2 meses");
    expect(formatSeniority({ years: 0, months: 0, days: 1 })).toBe("1 día");
  });
});

const VALID = {
  fileNumber: "",
  lastName: " Pérez ",
  firstName: "Ana",
  dni: "30.123.456",
  cuil: "27-30123456-8",
  birthDate: "1985-05-10",
  sex: "F",
  nationalityId: "",
  maritalStatusId: "",
  addressLine: "Calle Ficticia 123",
  city: "Lanús",
  provinceId: id(1),
  postalCode: "1824",
  phone: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  hireDate: "2020-03-01",
  seniorityDate: "",
  contractEndDate: "",
  departmentId: id(2),
  positionId: id(3),
  categoryId: "",
  agreementId: "",
  contractTypeId: id(4),
  workdayTypeId: "",
  workScheduleId: "",
  workModalityId: "",
  workplaceId: id(5),
  supervisorId: "",
  healthInsurerId: "",
  artProviderId: "",
};

describe("esquema del legajo", () => {
  it("normaliza documentos y vacíos, y acepta su propia salida", () => {
    const once = employeeSchema.parse(VALID);
    expect(once).toMatchObject({
      lastName: "Pérez",
      dni: "30123456",
      cuil: "27301234568",
      fileNumber: null,
      phone: null,
      categoryId: null,
      seniorityDate: null,
    });
    expect(employeeSchema.parse(once)).toEqual(once);
  });

  it("rechaza fechas incoherentes", () => {
    const result = employeeSchema.safeParse({ ...VALID, hireDate: "1980-01-01", contractEndDate: "1979-01-01" });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((i) => i.path[0]);
    expect(fields).toContain("hireDate");
    expect(fields).toContain("contractEndDate");
  });

  it("rechaza un CUIL con dígito verificador incorrecto", () => {
    const result = employeeSchema.safeParse({ ...VALID, cuil: "27-30123456-0" });
    expect(result.error?.issues[0]?.path).toEqual(["cuil"]);
  });
});

describe("esquema de cuenta sueldo", () => {
  it("normaliza el CBU y acepta su propia salida", () => {
    const once = bankAccountSchema.parse({
      cbu: "2850590 940090418135201",
      alias: "",
      accountTypeId: id(9),
      effectiveDate: "",
      changeNotes: "",
    });
    expect(once).toMatchObject({ cbu: "2850590940090418135201", alias: null });
    expect(bankAccountSchema.parse(once)).toEqual(once);
  });
});
