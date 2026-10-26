import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import * as withdrawals from "@/features/withdrawals/service";
import type { ActorContext } from "@/server/context";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError } from "@/server/errors";
import { actorFor, createTestUser, lastAudit } from "./helpers";

let rrhh: ActorContext;
let administracion: ActorContext;
let consulta: ActorContext;
// Nombres de hoja únicos por corrida: la base de test no se vacía entre corridas.
const tag = Date.now().toString(36).replace(/\d/g, "");
const NAME = { a: `Retirante ${tag}`, b: `Otro ${tag}`, renamed: `Retirantes ${tag}`, c: `Zeta ${tag}` };

type Line = [Date | null, number | null, number | null, string?];
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Planilla como las de la empresa: títulos, encabezado en la fila 5 y una hoja por persona. */
async function workbook(name: string, sheets: Record<string, Line[]>) {
  const book = new ExcelJS.Workbook();
  for (const [sheetName, lines] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(sheetName);
    sheet.addRow(["Retiros Empleados"]);
    sheet.addRow([]);
    sheet.addRow([sheetName]);
    sheet.addRow([]);
    sheet.addRow(["Fecha", "Ingreso", "Retiro", "Saldo", "Descripción"]);
    for (const [date, credit, debit, concept] of lines) sheet.addRow([date, credit, debit, 0, concept ?? null]);
  }
  return new File([await book.xlsx.writeBuffer()], name);
}

const accountId = async (name: string) =>
  (await db.account.findUniqueOrThrow({ where: { key: name.toLowerCase() } })).id;

beforeAll(async () => {
  rrhh = await actorFor((await createTestUser("RRHH")).id);
  administracion = await actorFor((await createTestUser("ADMINISTRACION")).id);
  consulta = await actorFor((await createTestUser("CONSULTA")).id);
});

describe("importación de planillas de retiros", () => {
  it("crea una cuenta por hoja y carga los retiros iguales del mismo día", async () => {
    const file = await workbook("Retiros 2022.xlsx", {
      [NAME.a]: [
        [d("2022-03-01"), 36000, null, "Sueldo"],
        [d("2022-03-04"), null, -5000],
        [null, null, -5000, "Mismo día, mismo importe"],
        [d("2022-03-10"), null, null, "Nota sin importes"],
        [d("2069-01-01"), null, -10],
      ],
      [NAME.b]: [[d("2022-04-01"), 1000, null]],
    });
    const result = await withdrawals.importSpreadsheet(rrhh, file);
    expect(result).toMatchObject({ created: 4, duplicates: 0, errorCount: 1, pendingSheets: [] });
    expect(result.newAccounts).toEqual([NAME.a, NAME.b]);
    expect(result.errors[0]).toMatchObject({ sheet: NAME.a, rowNumber: 10 });

    const statement = await withdrawals.getStatement(rrhh, await accountId(NAME.a), {});
    expect(statement.rows.map((r) => [r.credit, r.debit, r.balance])).toEqual([
      ["36000.00", "0.00", "36000.00"],
      ["0.00", "5000.00", "31000.00"],
      ["0.00", "5000.00", "26000.00"],
    ]);
    expect(statement.rows[2]?.origin).toBe(`Retiros 2022.xlsx, hoja ${NAME.a}, fila 8`);
    expect(statement.balance).toBe("26000.00");
    expect(await lastAudit({ userId: rrhh.userId })).toMatchObject({ action: "IMPORT", module: "retiros" });
  });

  it("descarta lo que la planilla siguiente arrastra y carga solo lo nuevo", async () => {
    const file = await workbook("Retiros 2023.xlsx", {
      [NAME.a]: [
        [d("2022-03-01"), 36000, null, "Sueldo de marzo"],
        [d("2022-03-04"), null, -5000],
        [null, null, -5000],
        [d("2023-01-02"), null, -5000],
      ],
    });
    const result = await withdrawals.importSpreadsheet(rrhh, file);
    expect(result).toMatchObject({ created: 1, duplicates: 3, newAccounts: [] });
    // Subir el mismo archivo otra vez no carga nada.
    expect(await withdrawals.importSpreadsheet(rrhh, file)).toMatchObject({ created: 0, duplicates: 4 });
  });

  it("el saldo al inicio de una planilla fija el saldo de la cuenta", async () => {
    await withdrawals.importSpreadsheet(
      rrhh,
      await workbook("Zeta 2023.xlsx", { [NAME.c]: [[d("2023-05-02"), null, -5000]] }),
    );
    const result = await withdrawals.importSpreadsheet(
      rrhh,
      await workbook("Zeta 2024.xlsx", {
        [NAME.c]: [
          [d("2023-12-31"), null, -8000, "Saldo al 31/12/2023"],
          [d("2024-01-05"), null, -1000],
          [d("2004-01-06"), null, -700, "Año mal escrito"],
        ],
      }),
    );
    expect(result).toMatchObject({ created: 2, duplicates: 0, superseded: 0, errorCount: 1 });
    expect(result.errors[0]?.message).toContain("anterior al saldo de la planilla");
    const statement = await withdrawals.getStatement(rrhh, await accountId(NAME.c), {});
    expect(statement.rows.map((r) => [r.isBalance, r.balance, r.adjustment])).toEqual([
      [false, "-5000.00", null],
      [true, "-8000.00", "-3000.00"],
      [false, "-9000.00", null],
    ]);
    expect(statement.balance).toBe("-9000.00");
    expect(statement.period).toEqual({ credit: "0.00", debit: "6000.00" });
    const [summary] = (await withdrawals.listAccounts(rrhh, { q: NAME.c })).items;
    expect(summary).toMatchObject({ balance: "-9000.00", debit: "6000.00", count: 2 });
  });

  it("pregunta por una hoja nueva con un nombre parecido y la carga en la cuenta elegida", async () => {
    const file = await workbook("Retiros 2024.xlsx", {
      [NAME.renamed]: [
        [d("2023-01-02"), null, -5000],
        [d("2024-02-01"), 2000, null],
      ],
    });
    const first = await withdrawals.importSpreadsheet(rrhh, file);
    expect(first.created).toBe(0);
    expect(first.pendingSheets).toEqual([
      expect.objectContaining({
        name: NAME.renamed,
        movements: 2,
        similar: [expect.objectContaining({ name: NAME.a })],
      }),
    ]);

    const target = await accountId(NAME.a);
    await withdrawals.saveSheetAssignments(rrhh, { sheets: [{ name: NAME.renamed, target }] });
    const second = await withdrawals.importSpreadsheet(rrhh, file);
    expect(second).toMatchObject({ created: 1, duplicates: 1, pendingSheets: [] });
    expect((await withdrawals.getStatement(rrhh, target, {})).balance).toBe("23000.00");
  });

  it("una hoja marcada para no importar se saltea", async () => {
    const name = `Descartada ${tag}`;
    const file = await workbook("Otra.xlsx", { [name]: [[d("2024-01-01"), 10, null]] });
    await withdrawals.saveSheetAssignments(rrhh, { sheets: [{ name, target: "no-importar" }] });
    expect(await withdrawals.importSpreadsheet(rrhh, file)).toMatchObject({ created: 0, skippedSheets: [name] });
  });

  it("avisa si el archivo tiene contraseña", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    const result = await withdrawals.importSpreadsheet(rrhh, new File([ole], "Retiros 2021.xlsx"));
    expect(result.error).toMatch(/contraseña/);
  });
});

describe("cuenta corriente", () => {
  it("la carga manual de un movimiento igual a uno existente no es un repetido", async () => {
    const id = await accountId(NAME.b);
    await withdrawals.createEntry(rrhh, { accountId: id, date: "2022-04-01", credit: "1.000,00", debit: "" });
    const statement = await withdrawals.getStatement(rrhh, id, {});
    expect(statement.rows).toHaveLength(2);
    expect(statement.balance).toBe("2000.00");
  });

  it("anular saca el movimiento del saldo y lo deja a la vista", async () => {
    const id = await accountId(NAME.b);
    const [entry] = (await withdrawals.getStatement(rrhh, id, {})).rows;
    await withdrawals.voidEntry(rrhh, entry!.id, { reason: "Cargado de más" });
    await expect(withdrawals.voidEntry(rrhh, entry!.id, { reason: "Otra vez" })).rejects.toBeInstanceOf(ConflictError);
    const statement = await withdrawals.getStatement(rrhh, id, { anulados: "si" });
    expect(statement.balance).toBe("1000.00");
    expect(statement.rows.map((r) => r.balance)).toEqual([null, "1000.00"]);
    expect((await withdrawals.getStatement(rrhh, id, {})).rows).toHaveLength(1);
  });

  it("con fecha desde, la primera línea es el saldo anterior", async () => {
    const statement = await withdrawals.getStatement(rrhh, await accountId(NAME.a), { desde: "2023-01-01" });
    expect(statement.opening).toBe("26000.00");
    expect(statement.rows.map((r) => r.balance)).toEqual(["21000.00", "23000.00"]);
  });

  it("un legajo puede tener varias cuentas", async () => {
    const employee = await db.employee.findFirst({ select: { id: true } });
    if (!employee) return;
    await withdrawals.linkAccountEmployee(rrhh, await accountId(NAME.a), { employeeId: employee.id });
    await withdrawals.linkAccountEmployee(rrhh, await accountId(NAME.b), { employeeId: employee.id });
    const accounts = await withdrawals.getEmployeeAccounts(rrhh, employee.id);
    expect(accounts.map((a) => a.name)).toEqual(expect.arrayContaining([NAME.a, NAME.b]));
    await withdrawals.linkAccountEmployee(rrhh, await accountId(NAME.b), { employeeId: "" });
  });

  it("se ve con información salarial y se carga con el permiso de registrarla", async () => {
    const id = await accountId(NAME.a);
    await expect(withdrawals.getStatement(administracion, id, {})).resolves.toBeDefined();
    await expect(
      withdrawals.createEntry(administracion, { accountId: id, date: "2024-01-01", credit: "1", debit: "" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(withdrawals.listAccounts(consulta, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});
