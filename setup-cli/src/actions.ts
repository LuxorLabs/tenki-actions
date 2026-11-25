// In-house stand-in for the few @actions/* calls below; the namespaces mirror
// the toolkit APIs so the call site is unchanged.
import { spawn } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Listener = (data: Buffer) => void;
interface ExecOptions {
  env?: Record<string, string | undefined>;
  silent?: boolean;
  ignoreReturnCode?: boolean;
  listeners?: { stdout?: Listener; stderr?: Listener };
}
const escape = (value: string): string => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const command = (level: string, message: string): void => void process.stdout.write(`::${level}::${escape(message)}\n`);
const inputEnv = (name: string): string => `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
// Same layout and completion marker as @actions/tool-cache; self-hosted
// runners reuse entries, so an interrupted copy must not be found.
const directory = (tool: string, version: string): string =>
  join(process.env.RUNNER_TOOL_CACHE ?? join(tmpdir(), "toolcache"), tool, version, process.arch);
const marker = (tool: string, version: string): string => `${directory(tool, version)}.complete`;

export const core = {
  getInput(name: string, options: { required?: boolean } = {}): string {
    const value = (process.env[inputEnv(name)] ?? "").trim();
    if (options.required && !value) throw new Error(`Input required and not supplied: ${name}`);
    return value;
  },
  setOutput(name: string, value: string): void {
    const file = process.env.GITHUB_OUTPUT;
    if (!file) return command("set-output", `name=${name}::${value}`);
    const delimiter = `ghadelimiter_${randomUUID()}`;
    appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  },
  addPath(dir: string): void {
    const file = process.env.GITHUB_PATH;
    if (file) appendFileSync(file, `${dir}\n`);
    else command("add-path", dir);
  },
  info: (message: string): void => void process.stdout.write(`${message}\n`),
  setFailed: (message: string): void => void ((process.exitCode = 1), command("error", message)),
};

export const tc = {
  find(tool: string, version: string): string {
    const dir = directory(tool, version);
    return existsSync(marker(tool, version)) && existsSync(join(dir, tool)) ? dir : "";
  },
  async cacheDir(sourceDir: string, tool: string, version: string): Promise<string> {
    const dir = directory(tool, version);
    rmSync(dir, { recursive: true, force: true });
    rmSync(marker(tool, version), { force: true });
    mkdirSync(dir, { recursive: true });
    cpSync(sourceDir, dir, { recursive: true });
    writeFileSync(marker(tool, version), "");
    return dir;
  },
};

export const exec = {
  exec(cmd: string, args: string[], options: ExecOptions = {}): Promise<number> {
    if (!options.silent) process.stdout.write(`[command]${cmd} ${args.join(" ")}\n`);
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
      // Like @actions/exec, a non-silent call also echoes the child output to
      // the job log; listeners still get every chunk either way.
      child.stdout.on("data", (chunk: Buffer) => {
        options.listeners?.stdout?.(chunk);
        if (!options.silent) process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        options.listeners?.stderr?.(chunk);
        if (!options.silent) process.stderr.write(chunk);
      });
      // A failed spawn rejects like @actions/exec does, so the caller's catch
      // runs instead of a 127 being mistaken for the tool's own exit code.
      child.on("error", (error) => {
        command("error", `${cmd} failed: ${error.message}`);
        reject(error);
      });
      child.on("close", (code) => {
        const exitCode = code ?? 1;
        if (exitCode !== 0 && !options.ignoreReturnCode) {
          reject(new Error(`${cmd} exited with code ${exitCode}`));
          return;
        }
        resolve(exitCode);
      });
    });
  },
};
