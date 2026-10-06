"use client";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-AR">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h1>La aplicación no pudo cargarse</h1>
        <p>Ocurrió un error inesperado.{error.digest && ` Código de referencia: ${error.digest}.`}</p>
        <button type="button" onClick={() => retry()}>
          Reintentar
        </button>
      </body>
    </html>
  );
}
