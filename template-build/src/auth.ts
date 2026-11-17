const CREDENTIALS = ["AUTH_TOKEN", "API_KEY"] as const;
const API_KEY_PREFIXES = ["lx_", "tk_"];

/**
 * Environment for the tenki CLI, resolving each credential on its own: a non-empty
 * LUXOR_<name> wins over TENKI_<name>, passed under the TENKI_* name released CLIs read.
 */
export function cliEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out = { ...env } as Record<string, string>;
  for (const name of CREDENTIALS) {
    const luxor = luxorCredential(env, name);
    if (luxor) out[`TENKI_${name}`] = luxor;
  }
  return out;
}

// LUXOR_API_KEY is also the Luxor Mining Pool key name, so only lx_/tk_ values count as set.
function luxorCredential(env: NodeJS.ProcessEnv, name: (typeof CREDENTIALS)[number]): string | undefined {
  const value = env[`LUXOR_${name}`]?.trim();
  if (name === "API_KEY" && !API_KEY_PREFIXES.some((prefix) => value?.startsWith(prefix))) return undefined;
  return value;
}
