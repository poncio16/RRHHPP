import { describe, expect, it } from "vitest";
import { missingItems, missingText, nextBirthday, relativeDays } from "@/features/alerts/build";
import { absenteeism, distribution } from "@/features/dashboard/calc";
import { defaultWorkDays } from "@/features/leaves/days";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("cumpleaños", () => {
  it("toma el de este año o el del siguiente", () => {
    expect(iso(nextBirthday(d("1990-10-20"), d("2026-10-07")))).toBe("2026-10-20");
    expect(iso(nextBirthday(d("1990-10-07"), d("2026-10-07")))).toBe("2026-10-07");
    expect(iso(nextBirthday(d("1990-01-05"), d("2026-10-07")))).toBe("2027-01-05");
  });

  it("29 de febrero cae el 28 en años no bisiestos", () => {
    expect(iso(nextBirthday(d("2000-02-29"), d("2026-10-07")))).toBe("2027-02-28");
    expect(iso(nextBirthday(d("2000-02-29"), d("2027-10-07")))).toBe("2028-02-29");
  });
});

describe("legajo incompleto", () => {
  const complete = {
    workScheduleId: "h",
    healthInsurerId: "o",
    artProviderId: "a",
    phone: "1",
    email: null,
    emergencyContactName: "X",
    emergencyContactPhone: "2",
    hasBankAccount: true,
    hasSalary: true,
  };
  const all = { personal: true, bank: true, salary: true };

  it("lista lo que falta en orden fijo", () => {
    expect(missingItems(complete, all)).toEqual([]);
    const items = missingItems({ ...complete, workScheduleId: null, artProviderId: null, hasBankAccount: false }, all);
    expect(items).toEqual(["HORARIO", "ART", "CUENTA_SUELDO"]);
    expect(missingText(items)).toBe("Faltan horario, ART y cuenta sueldo.");
    expect(missingText(["ART"])).toBe("Falta ART.");
  });

  it("solo revisa los datos que quien mira puede ver", () => {
    const empty = { ...complete, phone: null, hasBankAccount: false, hasSalary: false };
    expect(missingItems(empty, { personal: false, bank: false, salary: false })).toEqual([]);
    expect(missingItems(empty, all)).toEqual(["CONTACTO", "CUENTA_SUELDO", "BASICO"]);
  });
});

describe("días relativos", () => {
  it("usa palabras para hoy, mañana y ayer", () => {
    expect([0, 1, -1, 5, -3].map(relativeDays)).toEqual(["Hoy", "Mañana", "Ayer", "En 5 días", "Hace 3 días"]);
  });
});

describe("ausentismo", () => {
  // Octubre de 2026: el 1 es jueves.
  const base = {
    start: d("2026-10-01"),
    end: d("2026-10-09"),
    holidays: new Set<string>(),
    absentDays: [],
    leaves: [],
    employees: [{ id: "a", hireDate: d("2020-01-01"), exitDate: null, workDays: defaultWorkDays(5) }],
  };

  it("cuenta días hábiles de la persona y sin feriados", () => {
    expect(absenteeism(base).expected).toBe(7);
    expect(absenteeism({ ...base, holidays: new Set(["2026-10-05"]) }).expected).toBe(6);
  });

  it("no cuenta dos veces un día con ausencia y licencia, ni fines de semana", () => {
    const result = absenteeism({
      ...base,
      absentDays: [
        { employeeId: "a", date: d("2026-10-02") },
        { employeeId: "a", date: d("2026-10-03") }, // sábado
      ],
      leaves: [{ employeeId: "a", startDate: d("2026-10-02"), endDate: d("2026-10-06") }],
    });
    // Viernes 2, lunes 5 y martes 6.
    expect(result.lost).toBe(3);
    expect(result.people).toBe(1);
    expect(result.rate).toBeCloseTo(3 / 7);
  });

  it("respeta ingreso y egreso dentro del período", () => {
    const result = absenteeism({
      ...base,
      employees: [
        { id: "a", hireDate: d("2026-10-05"), exitDate: null, workDays: defaultWorkDays(5) },
        { id: "b", hireDate: d("2020-01-01"), exitDate: d("2026-10-02"), workDays: defaultWorkDays(5) },
      ],
      absentDays: [{ employeeId: "b", date: d("2026-10-06") }],
    });
    expect(result.expected).toBe(5 + 2);
    expect(result.lost).toBe(0);
  });

  it("sin días previstos no hay tasa", () => {
    expect(absenteeism({ ...base, employees: [] }).rate).toBeNull();
  });
});

describe("distribución", () => {
  it("agrupa y ordena de mayor a menor", () => {
    expect(distribution(["B", "A", "B", "C", "A", "B"])).toEqual([
      { label: "B", count: 3 },
      { label: "A", count: 2 },
      { label: "C", count: 1 },
    ]);
  });
});
