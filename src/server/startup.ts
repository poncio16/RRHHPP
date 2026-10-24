import "server-only";

/**
 * Valida las variables de entorno al arrancar. Si falta alguna o tiene un
 * formato inválido, el proceso termina con el detalle en el log, en lugar de
 * quedar en pie respondiendo error 500 a cada pedido. En Vercel no hay un
 * proceso que terminar: cada función que arranca falla con el mismo detalle.
 */
export async function checkStartup() {
  let env: typeof import("./env").env;
  try {
    ({ env } = await import("./env"));
  } catch (error) {
    // Sin variables válidas tampoco hay logger configurado: va directo a stderr.
    console.error(error instanceof Error ? error.message : error);
    if (process.env.VERCEL === "1") throw error;
    process.exit(1);
  }
  const { logger } = await import("./logger");
  logger.info({ appUrl: env.APP_URL, nodeEnv: env.NODE_ENV, trustedProxy: env.TRUSTED_PROXY }, "Aplicación iniciada");
}
