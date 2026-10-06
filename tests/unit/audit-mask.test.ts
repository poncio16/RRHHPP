import { describe, expect, it } from "vitest";
import { auditDiff, sanitizeForAudit } from "@/server/audit/mask";

describe("sanitizeForAudit", () => {
  it("omite secretos, enmascara el CBU y serializa fechas y decimales", () => {
    const result = sanitizeForAudit({
      email: "ana@empresa.com.ar",
      passwordHash: "$argon2id$...",
      tokenHash: "abc",
      cbu: "2850590940090418135201",
      createdAt: new Date("2026-10-06T12:00:00Z"),
      amount: { toFixed: () => "1500.50", toString: () => "1500.50" },
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("tokenHash");
    expect(result.cbu).not.toBe("2850590940090418135201");
    expect(String(result.cbu)).toMatch(/5201$/);
    expect(result.createdAt).toBe("2026-10-06T12:00:00.000Z");
    expect(result.amount).toBe("1500.50");
  });
});

describe("auditDiff", () => {
  it("devuelve solo los campos que cambiaron", () => {
    const diff = auditDiff(
      { name: "Ana", email: "a@x.com", isActive: true, updatedAt: new Date(1) },
      { name: "Ana María", email: "a@x.com", isActive: true, updatedAt: new Date(2) },
    );
    expect(diff).toEqual({ before: { name: "Ana" }, after: { name: "Ana María" } });
  });

  it("devuelve null si no hubo cambios relevantes", () => {
    expect(auditDiff({ name: "Ana", updatedAt: new Date(1) }, { name: "Ana", updatedAt: new Date(2) })).toBeNull();
  });

  it("registra que cambió un secreto sin exponer su valor", () => {
    const diff = auditDiff({ passwordHash: "viejo" }, { passwordHash: "nuevo" });
    expect(diff).toEqual({ before: { passwordHash: "[oculto]" }, after: { passwordHash: "[modificado]" } });
  });
});
