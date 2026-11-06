const CREDENTIALS = ["AUTH_TOKEN", "API_KEY"] as const;

/**
 * Environment for the tenki CLI with LUXORAI_* credentials taking precedence:
 * when any LUXORAI_* credential is set it replaces every TENKI_* one, under the
 * TENKI_* names released CLIs read.
 */
export function cliEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out = { ...env } as Record<string, string>;
  const luxor = CREDENTIALS.filter((name) => env[`LUXORAI_${name}`]?.trim());
  if (luxor.length === 0) return out;
  for (const name of CREDENTIALS) delete out[`TENKI_${name}`];
  for (const name of luxor) out[`TENKI_${name}`] = env[`LUXORAI_${name}`]!.trim();
  return out;
}
