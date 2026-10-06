import type { Permission } from "./authz/permissions";

/** Metadatos de la petición, para auditoría y logs. */
export type RequestMeta = { ip: string | null; userAgent: string | null };

/**
 * Quién hace la operación. Los servicios lo reciben como primer parámetro;
 * los adaptadores (server actions, route handlers, páginas) lo construyen
 * desde la sesión. Los tests lo construyen a mano.
 */
export type ActorContext = RequestMeta & {
  userId: string;
  email: string;
  name: string;
  roleCode: string;
  roleName: string;
  permissions: ReadonlySet<Permission>;
  mustChangePassword: boolean;
  sessionId: string;
};
