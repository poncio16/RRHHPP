/** Argon2id con los parámetros mínimos recomendados por OWASP (19 MiB, 2 iteraciones). */
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
