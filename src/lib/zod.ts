import { z } from "zod";

// Mensajes de validación en español para todos los esquemas (cliente y servidor).
// Importar siempre `z` desde este módulo, no directamente desde "zod".
z.config(z.locales.es());

export { z };
