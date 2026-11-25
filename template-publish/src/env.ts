import { core } from "./actions.js";

export function collectForwardedEnv(input: string, prefix: string): Map<string, string> {
  const result = new Map<string, string>();
  const trimmed = input.trim();
  if (!trimmed) return result;

  const names =
    trimmed === "*"
      ? Object.keys(process.env).filter((name) => name.startsWith(prefix))
      : trimmed
          .split(/\r?\n/)
          .map((name) => name.trim())
          .filter(Boolean);

  for (const name of names) {
    const value = process.env[name];
    if (value === undefined) {
      core.warning(`env var ${name} is not set; skipping`);
      continue;
    }
    core.setSecret(value);
    result.set(name, value);
  }
  core.info(`forwarding env vars: ${Array.from(result.keys()).join(", ") || "none"}`);
  return result;
}
