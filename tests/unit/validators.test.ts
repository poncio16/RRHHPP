import { describe, expect, it } from "vitest";
import {
  cbuBankCode,
  cuilCheckDigit,
  cuilMatchesDni,
  formatCuil,
  isValidCbu,
  isValidCuil,
  isValidCuit,
  isValidDni,
  maskCbu,
  normalizeDni,
} from "@/lib/validators";

describe("DNI", () => {
  it("acepta 7 u 8 dígitos, con o sin puntos", () => {
    expect(isValidDni("12345678")).toBe(true);
    expect(isValidDni("12.345.678")).toBe(true);
    expect(isValidDni("1234567")).toBe(true);
  });

  it("rechaza longitudes incorrectas, letras y ceros a la izquierda", () => {
    expect(isValidDni("123456")).toBe(false);
    expect(isValidDni("123456789")).toBe(false);
    expect(isValidDni("1234567a")).toBe(false);
    expect(isValidDni("01234567")).toBe(false);
  });

  it("normaliza quitando puntos y espacios", () => {
    expect(normalizeDni(" 12.345.678 ")).toBe("12345678");
  });
});

describe("CUIL/CUIT", () => {
  it("calcula el dígito verificador módulo 11", () => {
    expect(cuilCheckDigit("2012345678")).toBe(6);
    expect(cuilCheckDigit("2730111222")).toBe(5);
    expect(cuilCheckDigit("2000000001")).toBeNull();
  });

  it("valida CUIL de personas con o sin guiones", () => {
    expect(isValidCuil("20123456786")).toBe(true);
    expect(isValidCuil("20-12345678-6")).toBe(true);
    expect(isValidCuil("27301112225")).toBe(true);
  });

  it("rechaza dígito verificador incorrecto, prefijo inválido o longitud incorrecta", () => {
    expect(isValidCuil("20123456787")).toBe(false);
    expect(isValidCuil("21123456786")).toBe(false);
    expect(isValidCuil("2012345678")).toBe(false);
  });

  it("CUIL no admite prefijos de empresa, CUIT sí", () => {
    expect(isValidCuil("30712345671")).toBe(false);
    expect(isValidCuit("30712345671")).toBe(true);
  });

  it("compara el CUIL con el DNI", () => {
    expect(cuilMatchesDni("20123456786", "12.345.678")).toBe(true);
    expect(cuilMatchesDni("20123456786", "12345679")).toBe(false);
    expect(cuilMatchesDni("20012345671", "1234567")).toBe(true);
  });

  it("formatea con guiones", () => {
    expect(formatCuil("20123456786")).toBe("20-12345678-6");
  });
});

describe("CBU", () => {
  const valid = "0110599500000003123456";

  it("valida los dos dígitos verificadores", () => {
    expect(isValidCbu(valid)).toBe(true);
    expect(isValidCbu("0110 5995 0000 0003 1234 56")).toBe(true);
  });

  it("rechaza errores en cualquiera de los bloques", () => {
    expect(isValidCbu("0110599400000003123456")).toBe(false);
    expect(isValidCbu("0110599500000003123457")).toBe(false);
    expect(isValidCbu("011059950000000312345")).toBe(false);
  });

  it("extrae el código de banco y enmascara", () => {
    expect(cbuBankCode(valid)).toBe("011");
    expect(maskCbu(valid)).toBe("****3456");
  });
});
