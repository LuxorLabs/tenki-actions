const API_KEY_PREFIXES = ["lx_", "tk_"];

/**
 * Environment for the tenki CLI. Credentials resolve in the order LUXOR_AUTH_TOKEN,
 * LUXOR_API_KEY, TENKI_AUTH_TOKEN, TENKI_API_KEY. A chosen LUXOR_* credential is passed
 * under the TENKI_* name released CLIs read, with the other TENKI_* credential removed.
 */
export function cliEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out = { ...env } as Record<string, string>;
  const token = env.LUXOR_AUTH_TOKEN?.trim();
  const apiKey = luxorApiKey(env);
  if (token) {
    out.TENKI_AUTH_TOKEN = token;
    delete out.TENKI_API_KEY;
  } else if (apiKey) {
    out.TENKI_API_KEY = apiKey;
    delete out.TENKI_AUTH_TOKEN;
  }
  return out;
}

// LUXOR_API_KEY is also the Luxor Mining Pool key name, so only lx_/tk_ values count as set.
function luxorApiKey(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.LUXOR_API_KEY?.trim();
  return API_KEY_PREFIXES.some((prefix) => value?.startsWith(prefix)) ? value : undefined;
}
