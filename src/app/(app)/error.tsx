"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>No se pudo mostrar esta sección</CardTitle>
        <CardDescription>
          Ocurrió un error inesperado. Los datos guardados no se perdieron.
          {error.digest && <> Código de referencia: {error.digest}.</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => retry()}>Reintentar</Button>
      </CardContent>
    </Card>
  );
}
