import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { AdminRecoveryError, recoverAdmin } from "./admin-recovery";

/**
 * Recuperación del acceso de administrador desde la consola del servidor:
 *
 *   ADMIN_EMAIL=persona@empresa.com.ar ADMIN_PASSWORD='...' npm run admin:recuperar
 *
 * Restablece la contraseña (o crea el usuario si no existe), le da el rol
 * Administrador, lo activa, lo desbloquea y cierra sus sesiones. Al ingresar
 * tiene que cambiar la contraseña. La contraseña nunca se muestra.
 */
async function main(): Promise<number> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Faltan variables: definí ADMIN_EMAIL y ADMIN_PASSWORD al ejecutar el comando, por ejemplo\n" +
        "  ADMIN_EMAIL=persona@empresa.com.ar ADMIN_PASSWORD='...' npm run admin:recuperar",
    );
    return 1;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta DATABASE_URL (ver .env.example).");
    return 1;
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const result = await recoverAdmin(db, { email, password });
    if (result.action === "CREATE") {
      console.log(`Se creó el administrador ${result.email}.`);
    } else {
      const sessions =
        result.revokedSessions === 1 ? "1 sesión cerrada" : `${result.revokedSessions} sesiones cerradas`;
      console.log(
        `Se recuperó el acceso de ${result.email}: contraseña nueva, rol Administrador, cuenta activa y desbloqueada (${sessions}).`,
      );
    }
    console.log("Tiene que cambiar la contraseña al ingresar. Quitá ADMIN_PASSWORD del entorno o del archivo .env.");
    return 0;
  } catch (error) {
    if (error instanceof AdminRecoveryError) {
      console.error(`No se recuperó el acceso. ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("No se recuperó el acceso por un error inesperado:", error);
    process.exitCode = 1;
  },
);
