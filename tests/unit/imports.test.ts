import { describe, expect, it } from "vitest";
import { IMPORT_COLUMNS, normalizeKey } from "@/features/imports/columns";
import { indexByName, mapRow, markDuplicates, matchHeaders, toIsoDate, type Lookups } from "@/features/imports/map";
import { parseCsv, readSpreadsheet } from "@/features/imports/parse";

const ID = {
  province: "0190a000-0000-7000-8000-000000000001",
  dept: "0190a000-0000-7000-8000-000000000002",
  position: "0190a000-0000-7000-8000-000000000003",
  contract: "0190a000-0000-7000-8000-000000000004",
  fixedTerm: "0190a000-0000-7000-8000-000000000005",
  workplace: "0190a000-0000-7000-8000-000000000006",
  category: "0190a000-0000-7000-8000-000000000007",
  agreement: "0190a000-0000-7000-8000-000000000008",
  otherAgreement: "0190a000-0000-7000-8000-000000000009",
  boss: "0190a000-0000-7000-8000-00000000000a",
};

const empty = () => new Map<string, string | null>();
const lookups: Lookups = {
  options: {
    provincias: indexByName([
      { id: ID.province, label: "Tucumán" },
      { id: ID.province, label: "AR-T" },
    ]),
    nacionalidades: empty(),
    "estado-civil": empty(),
    sectores: indexByName([
      { id: ID.dept, label: "Administración" },
      // Dos valores activos con el mismo nombre: ambiguo.
      { id: ID.position, label: "Depósito" },
      { id: ID.contract, label: "deposito" },
    ]),
    puestos: indexByName([{ id: ID.position, label: "Analista" }]),
    categorias: indexByName([{ id: ID.category, label: "Administrativo A" }]),
    convenios: indexByName([
      { id: ID.agreement, label: "Comercio" },
      { id: ID.otherAgreement, label: "Otro" },
    ]),
    "tipos-contrato": indexByName([
      { id: ID.contract, label: "Tiempo indeterminado" },
      { id: ID.fixedTerm, label: "Plazo fijo" },
    ]),
    jornadas: empty(),
    horarios: empty(),
    modalidades: empty(),
    establecimientos: indexByName([{ id: ID.workplace, label: "Casa central" }]),
    "obras-sociales": empty(),
    art: empty(),
  },
  supervisors: new Map([[15, ID.boss]]),
  contractTypesWithEndDate: new Set([ID.fixedTerm]),
  categoryAgreement: new Map([[ID.category, ID.agreement]]),
};

const HEADERS = [
  "Apellido",
  "Nombre",
  "DNI",
  "CUIL",
  "Fecha de nacimiento",
  "Sexo",
  "Domicilio",
  "Localidad",
  "Provincia",
  "Código postal",
  "Fecha de ingreso",
  "Sector",
  "Puesto",
  "Tipo de contratación",
  "Establecimiento",
  "Fin de contrato",
  "Categoría",
  "Convenio",
  "Legajo del superior",
];
const { positions } = matchHeaders(HEADERS);

function row(values: Partial<Record<string, string>> = {}) {
  const base: Record<string, string> = {
    Apellido: "Ficticio",
    Nombre: "Ana",
    DNI: "30.123.456",
    CUIL: "27-30123456-8",
    "Fecha de nacimiento": "12/04/1990",
    Sexo: "f",
    Domicilio: "Calle 1",
    Localidad: "San Miguel",
    Provincia: "tucuman",
    "Código postal": "4000",
    "Fecha de ingreso": "01/03/2020",
    Sector: "ADMINISTRACION",
    Puesto: "Analista",
    "Tipo de contratación": "Tiempo indeterminado",
    Establecimiento: "Casa central",
  };
  return HEADERS.map((h) => values[h] ?? base[h] ?? "");
}

describe("importación: encabezados", () => {
  it("reconoce encabezados sin distinguir mayúsculas ni acentos", () => {
    const result = matchHeaders(["apellido", "NOMBRE", "Codigo  postal", "Otra cosa", "Apellido"]);
    expect(result.positions.get("lastName")).toBe(0);
    expect(result.positions.get("postalCode")).toBe(2);
    expect(result.unknown).toEqual(["Otra cosa"]);
    expect(result.repeated).toEqual(["Apellido"]);
    expect(result.missing).toContain("DNI");
    expect(result.missing).not.toContain("Apellido");
  });

  it("la plantilla completa no tiene faltantes", () => {
    expect(matchHeaders(IMPORT_COLUMNS.map((c) => c.header)).missing).toEqual([]);
    expect(normalizeKey("  Antigüedad   Reconocida ")).toBe("antiguedad reconocida");
  });
});

describe("importación: fechas", () => {
  it("acepta dd/mm/aaaa e ISO y rechaza fechas inexistentes", () => {
    expect(toIsoDate("5/3/2020")).toBe("2020-03-05");
    expect(toIsoDate("05-03-2020")).toBe("2020-03-05");
    expect(toIsoDate("2020-03-05")).toBe("2020-03-05");
    expect(toIsoDate("31/02/2020")).toBeNull();
    expect(toIsoDate("03/2020")).toBeNull();
    // Número de serie de Excel (15/06/2022).
    expect(toIsoDate("44727")).toBe("2022-06-15");
  });
});

describe("importación: filas", () => {
  it("convierte una fila completa a los datos del alta", () => {
    const result = mapRow(2, row(), positions, lookups);
    expect(result.errors).toEqual([]);
    expect(result.status).toBe("VALIDA");
    expect(result).toMatchObject({ name: "Ficticio, Ana", dni: "30123456", cuil: "27301234568" });
    expect(result.input).toMatchObject({
      dni: "30123456",
      cuil: "27301234568",
      birthDate: "1990-04-12",
      sex: "F",
      provinceId: ID.province,
      departmentId: ID.dept,
      hireDate: "2020-03-01",
      fileNumber: null,
    });
  });

  it("acepta la provincia por código y el superior por legajo", () => {
    const result = mapRow(2, row({ Provincia: "AR-T", "Legajo del superior": "15" }), positions, lookups);
    expect(result.input).toMatchObject({ provinceId: ID.province, supervisorId: ID.boss });
  });

  it("informa cada problema con el nombre de la columna", () => {
    const result = mapRow(
      3,
      row({
        Apellido: "",
        CUIL: "20123456780",
        "Fecha de nacimiento": "31/02/1990",
        Sexo: "otro",
        Sector: "Inexistente",
        "Legajo del superior": "999",
      }),
      positions,
      lookups,
    );
    expect(result.status).toBe("ERROR");
    expect(result.input).toBeUndefined();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Apellido: Ingresá el apellido.",
        expect.stringMatching(/^CUIL: /),
        'Fecha de nacimiento: "31/02/1990" no es una fecha (usá dd/mm/aaaa).',
        "Sexo: usá F, M o X.",
        'Sector: "Inexistente" no existe o está desactivado.',
        "Legajo del superior: no hay un empleado activo con legajo 999.",
      ]),
    );
    // Un problema por columna: la conversión no se repite con el error del esquema.
    expect(result.errors.filter((e) => e.startsWith("Sector:"))).toHaveLength(1);
  });

  it("marca los nombres ambiguos", () => {
    const result = mapRow(2, row({ Sector: "Depósito" }), positions, lookups);
    expect(result.errors).toEqual(['Sector: hay más de un valor activo llamado "Depósito".']);
  });

  it("aplica las reglas del alta: fin de contrato y categoría del convenio", () => {
    const fixed = mapRow(2, row({ "Tipo de contratación": "Plazo fijo" }), positions, lookups);
    expect(fixed.errors).toEqual(["Fin de contrato: el tipo de contratación exige fecha de finalización."]);
    const category = mapRow(2, row({ Categoría: "Administrativo A", Convenio: "Otro" }), positions, lookups);
    expect(category.errors).toEqual(["Categoría: no corresponde al convenio indicado."]);
    const ok = mapRow(2, row({ Categoría: "Administrativo A", Convenio: "Comercio" }), positions, lookups);
    expect(ok.status).toBe("VALIDA");
  });
});

describe("importación: duplicados", () => {
  it("marca duplicados contra la base y dentro del archivo, sin datos para el alta", () => {
    const a = mapRow(2, row(), positions, lookups);
    const sameDni = mapRow(3, row({ CUIL: "20301234563" }), positions, lookups);
    const other = mapRow(4, row({ DNI: "28111222", CUIL: "20281112229" }), positions, lookups);
    const result = markDuplicates(
      [a, sameDni, other],
      [{ fileNumber: 7, dni: "28111222", cuil: "x", lastName: "Existente", firstName: "Uno" }],
    );
    expect(result.map((r) => r.status)).toEqual(["VALIDA", "DUPLICADA", "DUPLICADA"]);
    expect(result[1]!.errors[0]).toBe("Repite el DNI, CUIL o legajo de la fila 2.");
    expect(result[2]!.errors[0]).toMatch(/Ya existe el legajo 7 \(Existente, Uno\)/);
    expect(result[1]!.input).toBeUndefined();
  });
});

describe("importación: lectura de CSV", () => {
  it("detecta el separador, respeta comillas y saltea filas vacías", async () => {
    expect(parseCsv('a;b;c\n1;"x; y";"con ""comillas"""\r\n')).toEqual([
      ["a", "b", "c"],
      ["1", "x; y", 'con "comillas"'],
    ]);
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    const bytes = new TextEncoder().encode("﻿Apellido;Nombre\n\nPérez;Ana\n;\n");
    const sheet = await readSpreadsheet("lista.csv", bytes);
    expect(sheet.headers).toEqual(["Apellido", "Nombre"]);
    expect(sheet.rows).toEqual([{ rowNumber: 3, cells: ["Pérez", "Ana"] }]);
  });

  it("lee CSV de Excel en Windows-1252", async () => {
    const bytes = Uint8Array.from([0x41, 0x3b, 0x42, 0x0a, 0x50, 0xe9, 0x72, 0x65, 0x7a, 0x3b, 0x31]);
    const sheet = await readSpreadsheet("lista.CSV", bytes);
    expect(sheet.rows[0]!.cells).toEqual(["Pérez", "1"]);
  });

  it("rechaza otros formatos y archivos vacíos", async () => {
    await expect(readSpreadsheet("lista.pdf", new Uint8Array())).rejects.toThrow("Excel (.xlsx) o CSV");
    await expect(readSpreadsheet("lista.csv", new TextEncoder().encode("\n;\n"))).rejects.toThrow("vacío");
  });
});
