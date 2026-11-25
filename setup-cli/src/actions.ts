// In-house stand-in for the few @actions/* calls this action makes. Each
// function follows @actions/core 3.0.1, @actions/exec 3.0.0, @actions/io
// 3.0.2 and @actions/tool-cache 4.0.0 (their Linux/macOS code paths; tenki
// ships only for those), so the call sites are unchanged.
import { spawn } from "node:child_process";
import { ok } from "node:assert";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, type Stats } from "node:fs";
import { randomUUID } from "node:crypto";
import { arch as osArch, EOL } from "node:os";
import { delimiter, join, resolve, sep } from "node:path";

type Listener = (data: Buffer) => void;
interface ExecOptions {
  env?: Record<string, string | undefined>;
  silent?: boolean;
  ignoreReturnCode?: boolean;
  listeners?: { stdout?: Listener; stderr?: Listener };
}
interface InputOptions {
  required?: boolean;
  trimWhitespace?: boolean;
}

// Workflow commands, as @actions/core writes them.
const toCommandValue = (input: unknown): string =>
  input === null || input === undefined ? "" : typeof input === "string" || input instanceof String ? String(input) : JSON.stringify(input);
const escapeData = (input: unknown): string =>
  toCommandValue(input).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (input: unknown): string => escapeData(input).replace(/:/g, "%3A").replace(/,/g, "%2C");

function issueCommand(command: string, properties: Record<string, string>, message: unknown): void {
  let line = `::${command}`;
  if (Object.keys(properties).length > 0) {
    line += ` ${Object.entries(properties)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${escapeProperty(value)}`)
      .join(",")}`;
  }
  process.stdout.write(`${line}::${escapeData(message)}${EOL}`);
}

function issueFileCommand(command: string, message: string): void {
  const filePath = process.env[`GITHUB_${command}`];
  if (!filePath) throw new Error(`Unable to find environment variable for file command ${command}`);
  if (!existsSync(filePath)) throw new Error(`Missing file at path: ${filePath}`);
  appendFileSync(filePath, `${message}${EOL}`, { encoding: "utf8" });
}

function prepareKeyValueMessage(key: string, value: unknown): string {
  const delimiter = `ghadelimiter_${randomUUID()}`;
  const convertedValue = toCommandValue(value);
  if (key.includes(delimiter)) throw new Error(`Unexpected input: name should not contain the delimiter "${delimiter}"`);
  if (convertedValue.includes(delimiter)) {
    throw new Error(`Unexpected input: value should not contain the delimiter "${delimiter}"`);
  }
  return `${key}<<${delimiter}${EOL}${convertedValue}${EOL}${delimiter}`;
}

export const core = {
  getInput(name: string, options?: InputOptions): string {
    const value = process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] || "";
    if (options && options.required && !value) throw new Error(`Input required and not supplied: ${name}`);
    if (options && options.trimWhitespace === false) return value;
    return value.trim();
  },
  setOutput(name: string, value: unknown): void {
    if (process.env.GITHUB_OUTPUT || "") return issueFileCommand("OUTPUT", prepareKeyValueMessage(name, value));
    process.stdout.write(EOL);
    issueCommand("set-output", { name }, toCommandValue(value));
  },
  addPath(inputPath: string): void {
    if (process.env.GITHUB_PATH || "") issueFileCommand("PATH", inputPath);
    else issueCommand("add-path", {}, inputPath);
    process.env.PATH = `${inputPath}${delimiter}${process.env.PATH}`;
  },
  info: (message: string): void => void process.stdout.write(message + EOL),
  error: (message: string): void => issueCommand("error", {}, message),
  setFailed(message: string): void {
    process.exitCode = 1;
    core.error(message);
  },
};

// PATH lookup, as @actions/io which() does it on Linux and macOS: only regular
// files with an execute bit the current user can use match.
function isUnixExecutable(stats: Stats): boolean {
  return (
    (stats.mode & 1) > 0 ||
    ((stats.mode & 8) > 0 && process.getgid !== undefined && stats.gid === process.getgid()) ||
    ((stats.mode & 64) > 0 && process.getuid !== undefined && stats.uid === process.getuid())
  );
}

function tryGetExecutablePath(filePath: string): string {
  let stats: Stats | undefined;
  try {
    stats = statSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.log(`Unexpected error attempting to determine if executable file exists '${filePath}': ${err}`);
    }
  }
  return stats && stats.isFile() && isUnixExecutable(stats) ? filePath : "";
}

function isRooted(p: string): boolean {
  const normalized = (p || "").replace(/\/\/+/g, "/");
  if (!normalized) throw new Error('isRooted() parameter "p" cannot be empty');
  return normalized.startsWith("/");
}

async function which(tool: string, check?: boolean): Promise<string> {
  if (!tool) throw new Error("parameter 'tool' is required");
  if (check) {
    const result = await which(tool, false);
    if (!result) {
      throw new Error(
        `Unable to locate executable file: ${tool}. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also check the file mode to verify the file is executable.`,
      );
    }
    return result;
  }
  if (isRooted(tool)) return tryGetExecutablePath(tool);
  if (tool.includes(sep)) return "";
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    const filePath = tryGetExecutablePath(join(dir, tool));
    if (filePath) return filePath;
  }
  return "";
}

// Tool cache, as @actions/tool-cache lays it out:
// $RUNNER_TOOL_CACHE/<tool>/<version>/<arch>, plus a <arch>.complete marker
// written after the copy so an interrupted copy is never found.
function cacheRoot(): string {
  const cacheDirectory = process.env.RUNNER_TOOL_CACHE || "";
  ok(cacheDirectory, "Expected RUNNER_TOOL_CACHE to be defined");
  return cacheDirectory;
}

// semver.clean() for the plain versions this action passes: strict semver,
// leading "=" or "v" and build metadata dropped, "" when not valid.
const SEMVER =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function cleanVersion(version: string): string {
  const value = version.trim().replace(/^[=v]+/, "");
  const match = value.length <= 256 ? SEMVER.exec(value) : null;
  if (!match || [match[1], match[2], match[3]].some((part) => Number(part) > Number.MAX_SAFE_INTEGER)) return "";
  return `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}`;
}

export const tc = {
  // Exact versions only; the toolkit also resolves ranges against cached
  // versions, which this action never asks for.
  find(toolName: string, versionSpec: string, arch?: string): string {
    if (!toolName) throw new Error("toolName parameter is required");
    if (!versionSpec) throw new Error("versionSpec parameter is required");
    const version = cleanVersion(versionSpec);
    const root = cacheRoot();
    if (!version) return "";
    const cachePath = join(root, toolName, version, arch || osArch());
    return existsSync(cachePath) && existsSync(`${cachePath}.complete`) ? cachePath : "";
  },
  async cacheDir(sourceDir: string, tool: string, version: string, arch?: string): Promise<string> {
    if (!statSync(sourceDir).isDirectory()) throw new Error("sourceDir is not a directory");
    const folderPath = join(cacheRoot(), tool, cleanVersion(version) || version, arch || osArch());
    rmSync(folderPath, { recursive: true, force: true });
    rmSync(`${folderPath}.complete`, { force: true });
    mkdirSync(folderPath, { recursive: true });
    for (const itemName of readdirSync(sourceDir)) {
      cpSync(join(sourceDir, itemName), join(folderPath, itemName), { recursive: true });
    }
    writeFileSync(`${folderPath}.complete`, "");
    return folderPath;
  },
};

export const exec = {
  // Like @actions/exec: resolve the tool with which(), echo the command line
  // and the child's stdout and stderr (both to stdout) unless silent, reject on
  // a nonzero exit unless ignoreReturnCode, and reject if the process fails to
  // start.
  async exec(commandLine: string, args: string[] = [], options: ExecOptions = {}): Promise<number> {
    let toolPath = commandLine;
    if (!isRooted(toolPath) && toolPath.includes("/")) toolPath = resolve(process.cwd(), toolPath);
    toolPath = await which(toolPath, true);
    if (!options.silent) process.stdout.write(`[command]${toolPath}${args.map((arg) => ` ${arg}`).join("")}${EOL}`);
    return new Promise((resolvePromise, reject) => {
      const child = spawn(toolPath, args, { env: options.env });
      let done = false;
      child.stdout.on("data", (data: Buffer) => {
        options.listeners?.stdout?.(data);
        if (!options.silent) process.stdout.write(data);
      });
      child.stderr.on("data", (data: Buffer) => {
        options.listeners?.stderr?.(data);
        if (!options.silent) process.stdout.write(data);
      });
      child.on("error", (error) => {
        if (done) return;
        done = true;
        reject(
          new Error(
            `There was an error when attempting to execute the process '${toolPath}'. This may indicate the process failed to start. Error: ${error.message}`,
          ),
        );
      });
      child.on("close", (code) => {
        if (done) return;
        done = true;
        if (code !== 0 && !options.ignoreReturnCode) {
          reject(new Error(`The process '${toolPath}' failed with exit code ${code}`));
          return;
        }
        resolvePromise(code as number);
      });
    });
  },
};
