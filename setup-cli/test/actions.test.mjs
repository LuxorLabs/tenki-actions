// Expected values below were taken from @actions/core 3.0.1, @actions/exec
// 3.0.0 and @actions/tool-cache 4.0.0 run on the same inputs.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { arch, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const actions = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/actions.ts")).href;

// Runs `body` in a child process with the shim imported, returning its stdout
// and the JSON it prints last.
function run(body, env = {}, cwd = tmpdir()) {
  const script = `import { core, exec, tc } from ${JSON.stringify(actions)};
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

test("getInput trims and checks required like the toolkit", () => {
  assert.equal(run(`return core.getInput("version")`, { INPUT_VERSION: " 1.2.3 " }).result, "1.2.3");
  assert.equal(run(`return core.getInput("version", { required: true })`, { INPUT_VERSION: "  " }).result, "");
  assert.equal(run(`return core.getInput("version", { required: true })`).error, "Input required and not supplied: version");
});

test("setOutput without GITHUB_OUTPUT writes the legacy set-output command", () => {
  assert.equal(run(`core.setOutput("tenki-version", "2.18.0")`).stdout, "\n::set-output name=tenki-version::2.18.0\n");
  assert.equal(run(`core.setOutput("a:b,c", "x%y\\r\\nz")`).stdout, "\n::set-output name=a%3Ab%2Cc::x%25y%0D%0Az\n");
});

test("addPath and setFailed match the toolkit", () => {
  const added = run(`core.addPath("/opt/x")`, { PATH: "/usr/bin" });
  assert.equal(added.stdout, "::add-path::/opt/x\n");
  assert.equal(added.PATH, "/opt/x:/usr/bin");
  const failed = run(`core.setFailed("50%\\nnext")`);
  assert.equal(failed.stdout, "::error::50%25%0Anext\n");
  assert.equal(failed.exitCode, 1);
});

test("exec echoes the command and output unless silent, and rejects like the toolkit", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-shim-"));
  const tool = path.join(dir, "tool");
  writeFileSync(tool, "#!/bin/sh\necho out-$1\nsleep 0.2\necho err-$1 >&2\nexit ${2:-0}\n");
  chmodSync(tool, 0o755);
  const env = { PATH: `${dir}:/usr/bin:/bin` };
  assert.equal(run(`return exec.exec("tool", ["a"])`, env).stdout, `[command]${tool} a\nout-a\nerr-a\n`);
  assert.equal(run(`return exec.exec(${JSON.stringify(tool)}, ["b", "3"])`, env).error, `The process '${tool}' failed with exit code 3`);
  const quiet = run(`return exec.exec("tool", ["c", "4"], { silent: true, ignoreReturnCode: true })`, env);
  assert.equal(quiet.stdout, "");
  assert.equal(quiet.result, 4);
  assert.match(run(`return exec.exec("nosuch", [])`, env).error, /^Unable to locate executable file: nosuch\./);
});

test("tool cache needs RUNNER_TOOL_CACHE and uses the toolkit layout", () => {
  assert.equal(run(`return tc.find("tenki", "1.2.3")`).error, "Expected RUNNER_TOOL_CACHE to be defined");
  assert.equal(run(`return tc.cacheDir("/", "tenki", "1.2.3")`).error, "Expected RUNNER_TOOL_CACHE to be defined");

  const dir = mkdtempSync(path.join(tmpdir(), "actions-shim-"));
  const source = path.join(dir, "src");
  mkdirSync(source);
  writeFileSync(path.join(source, "tenki"), "bin");
  const env = { RUNNER_TOOL_CACHE: path.join(dir, "cache") };
  const entry = path.join(dir, "cache", "tenki", "1.2.3", arch());

  assert.equal(run(`return tc.find("tenki", "1.2.3")`, env).result, "");
  assert.equal(run(`return tc.cacheDir(${JSON.stringify(source)}, "tenki", "1.2.3+build.5")`, env).result, entry);
  assert.deepEqual(readdirSync(entry), ["tenki"]);
  assert.ok(existsSync(`${entry}.complete`));
  for (const version of ["1.2.3", "v1.2.3", "1.2.3+other"]) {
    assert.equal(run(`return tc.find("tenki", ${JSON.stringify(version)})`, env).result, entry, version);
  }
  assert.equal(run(`return tc.find("tenki", "01.2.3")`, env).result, "");

  rmSync(`${entry}.complete`);
  assert.equal(run(`return tc.find("tenki", "1.2.3")`, env).result, "", "an entry without its marker is not used");
});
