const CREDENTIALS = ["AUTH_TOKEN", "API_KEY"] as const;

/**
 * Environment for the tenki CLI, resolving each credential on its own: a non-empty
 * LUXORAI_<name> wins over TENKI_<name>, passed under the TENKI_* name released CLIs read.
 */
export function cliEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out = { ...env } as Record<string, string>;
  for (const name of CREDENTIALS) {
    const luxor = env[`LUXORAI_${name}`]?.trim();
    if (luxor) out[`TENKI_${name}`] = luxor;
  }
  return out;
}
