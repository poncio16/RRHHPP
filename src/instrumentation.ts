/**
 * Next.js lo ejecuta una vez al iniciar el servidor, antes de atender pedidos.
 * El chequeo de arranque usa APIs de Node.js: se importa solo en ese runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkStartup } = await import("./server/startup");
    await checkStartup();
  }
}
