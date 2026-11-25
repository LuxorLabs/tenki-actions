// In-house stand-in for the few @actions/* calls below; the namespaces mirror
// the toolkit APIs so call sites are unchanged.
import { spawn } from "node:child_process";
import { accessSync, appendFileSync, constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { delimiter, join } from "node:path";

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

export const core = {
  getInput(name: string, options: { required?: boolean } = {}): string {
    const value = (process.env[inputEnv(name)] ?? "").trim();
    if (options.required && !value) throw new Error(`Input required and not supplied: ${name}`);
    return value;
  },
  getMultilineInput(name: string): string[] {
    return core.getInput(name).split("\n").map((line) => line.trim()).filter(Boolean);
  },
  setOutput(name: string, value: string): void {
    const file = process.env.GITHUB_OUTPUT;
    if (!file) return command("set-output", `name=${name}::${value}`);
    const delimiter = `ghadelimiter_${randomUUID()}`;
    appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  },
  setSecret: (value: string): void => void (value && command("add-mask", value)),
  addPath(dir: string): void {
    const file = process.env.GITHUB_PATH;
    if (file) appendFileSync(file, `${dir}\n`);
    else command("add-path", dir);
  },
  info: (message: string): void => void process.stdout.write(`${message}\n`),
  warning: (message: string): void => command("warning", message),
  error: (message: string): void => command("error", message),
  setFailed: (message: string): void => void ((process.exitCode = 1), command("error", message)),
};

export const io = {
  async which(tool: string, _required = false): Promise<string | null> {
    for (const dir of (process.env.PATH ?? "").split(delimiter)) {
      if (!dir) continue;
      try {
        accessSync(join(dir, tool), constants.X_OK);
        return join(dir, tool);
      } catch {}
    }
    return null;
  },
};

export const exec = {
  exec(cmd: string, args: string[], options: ExecOptions = {}): Promise<number> {
    if (!options.silent) process.stdout.write(`[command]${cmd} ${args.join(" ")}\n`);
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
      const pipe = (source: typeof child.stdout, listener?: Listener): void =>
        void source.on("data", (chunk: Buffer) => listener?.(chunk));
      pipe(child.stdout, options.listeners?.stdout);
      pipe(child.stderr, options.listeners?.stderr);
      // A failed spawn rejects like @actions/exec does, so a caller that passes
      // ignoreReturnCode still sees a missing binary as an error, not as a 127.
      child.on("error", (error) => {
        command("error", `${cmd} failed: ${error.message}`);
        reject(error);
      });
      child.on("close", (code) => {
        if (code !== 0 && code !== null && !options.ignoreReturnCode) {
          reject(new Error(`${cmd} exited with code ${code}`));
          return;
        }
        resolve(code ?? 1);
      });
    });
  },
};
