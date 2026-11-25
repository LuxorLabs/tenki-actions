// Expected values below were taken from @actions/core 3.0.1, @actions/exec
// 3.0.0 and @actions/io 3.0.2 run on the same inputs.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const actions = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/actions.ts")).href;

// Runs `body` in a child process with the shim imported, returning its stdout
// and the JSON it prints last.
function run(body, env = {}, cwd = tmpdir()) {
  const script = `import { core, io, exec } from ${JSON.stringify(actions)};
let result, error;
try { result = await (async () => { ${body} })(); } catch (e) { error = e.message; }
const exitCode = process.exitCode ?? 0;
process.exitCode = 0;
process.stdout.write("\\n@@" + JSON.stringify({ result, error, exitCode, PATH: process.env.PATH }));`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
  assert.equal(child.status, 0, child.stderr);
  const at = child.stdout.lastIndexOf("\n@@");
  return { stdout: child.stdout.slice(0, at), ...JSON.parse(child.stdout.slice(at + 3)) };
}

test("getInput and getMultilineInput match the toolkit", () => {
  const cases = [
    ["a\n  \nb", undefined, "a\n  \nb", ["a", "", "b"]],
    ["a\n  \nb", { trimWhitespace: false }, "a\n  \nb", ["a", "  ", "b"]],
    ["\n\n x \n\n", undefined, "x", ["x"]],
    ["\n\n x \n\n", { trimWhitespace: false }, "\n\n x \n\n", [" x "]],
    ["a\r\nb", undefined, "a\r\nb", ["a", "b"]],
    ["   ", { required: true }, "", []],
  ];
  for (const [value, options, input, multiline] of cases) {
    const args = options ? `"my input", ${JSON.stringify(options)}` : `"my input"`;
    const env = { INPUT_MY_INPUT: value };
    assert.deepEqual(run(`return core.getInput(${args})`, env).result, input, JSON.stringify(value));
    assert.deepEqual(run(`return core.getMultilineInput(${args})`, env).result, multiline, JSON.stringify(value));
  }
  assert.equal(run(`return core.getInput("missing", { required: true })`).error, "Input required and not supplied: missing");
});

test("setOutput without GITHUB_OUTPUT writes the legacy set-output command", () => {
  assert.equal(run(`core.setOutput("tenki-version", "2.18.0")`).stdout, "\n::set-output name=tenki-version::2.18.0\n");
  assert.equal(run(`core.setOutput("a:b,c", "x%y\\r\\nz")`).stdout, "\n::set-output name=a%3Ab%2Cc::x%25y%0D%0Az\n");
});

test("setOutput with GITHUB_OUTPUT appends a heredoc and needs the file to exist", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-shim-"));
  const file = path.join(dir, "output");
  writeFileSync(file, "");
  assert.equal(run(`core.setOutput("n", "v")`, { GITHUB_OUTPUT: file }).stdout, "");
  assert.match(readFileSync(file, "utf8"), /^n<<(ghadelimiter_[0-9a-f-]+)\nv\n\1\n$/);
  assert.equal(run(`core.setOutput("n", "v")`, { GITHUB_OUTPUT: path.join(dir, "nope") }).error, `Missing file at path: ${path.join(dir, "nope")}`);
});

test("setSecret masks through one escaped add-mask line", () => {
  assert.equal(run(`core.setSecret("a%b\\r\\nc")`).stdout, "::add-mask::a%25b%0D%0Ac\n");
});

test("addPath updates PATH for later steps and this process", () => {
  const legacy = run(`core.addPath("/opt/x")`, { PATH: "/usr/bin" });
  assert.equal(legacy.stdout, "::add-path::/opt/x\n");
  assert.equal(legacy.PATH, "/opt/x:/usr/bin");
});

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-shim-"));
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "tool"), "#!/bin/sh\necho out-$1\nsleep 0.2\necho err-$1 >&2\nexit ${2:-0}\n");
  chmodSync(path.join(bin, "tool"), 0o755);
  writeFileSync(path.join(bin, "tool-noexec"), "#!/bin/sh\n");
  chmodSync(path.join(bin, "tool-noexec"), 0o644);
  mkdirSync(path.join(bin, "tool-dir"));
  chmodSync(path.join(bin, "tool-dir"), 0o755);
  return { dir, bin, env: { PATH: `${bin}:/usr/bin:/bin` } };
}

test("which matches only executable files and honors required", () => {
  const { bin, env } = fixture();
  const notFound = (tool) =>
    `Unable to locate executable file: ${tool}. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also check the file mode to verify the file is executable.`;
  assert.equal(run(`return io.which("tool")`, env).result, path.join(bin, "tool"));
  assert.equal(run(`return io.which("tool-dir")`, env).result, "");
  assert.equal(run(`return io.which("tool-noexec")`, env).result, "");
  assert.equal(run(`return io.which("missing", false)`, env).result, "");
  assert.equal(run(`return io.which("tool-dir", true)`, env).error, notFound("tool-dir"));
  assert.equal(run(`return io.which("missing", true)`, env).error, notFound("missing"));
  assert.equal(run(`return io.which(${JSON.stringify(path.join(bin, "tool-dir"))})`, env).result, "");
  assert.equal(run(`return io.which("bin/tool")`, env).result, "");
});

test("exec echoes the command and output unless silent, and rejects like the toolkit", () => {
  const { dir, bin, env } = fixture();
  const tool = path.join(bin, "tool");
  const ok = run(`return exec.exec("tool", ["a"])`, env, dir);
  assert.equal(ok.stdout, `[command]${tool} a\nout-a\nerr-a\n`);
  assert.equal(ok.result, 0);
  const failed = run(`return exec.exec("tool", ["b", "3"])`, env, dir);
  assert.equal(failed.error, `The process '${tool}' failed with exit code 3`);
  const quiet = run(`let out = ""; const code = await exec.exec("tool", ["c", "4"], { silent: true, ignoreReturnCode: true, listeners: { stdout: (d) => { out += d; } } }); return [code, out]`, env, dir);
  assert.equal(quiet.stdout, "");
  assert.deepEqual(quiet.result, [4, "out-c\n"]);
  assert.equal(run(`return exec.exec("bin/tool", ["r"])`, env, dir).stdout, `[command]${tool} r\nout-r\nerr-r\n`);
  assert.match(run(`return exec.exec("nosuch", [])`, env, dir).error, /^Unable to locate executable file: nosuch\./);
});
