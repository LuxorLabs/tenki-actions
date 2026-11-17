import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const actionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("invokes the template build workflow and exports its result", () => {
  const run = runAction({
    template_id: "tpl-123",
    template_build_id: "build-123",
    template_build: 7,
    template_build_state: "succeeded",
    snapshot_id: "snap-123",
    spec_hash: "spec-123",
    image_digest: "sha256:abc",
    image_digest_ref: "node-api@sha256:abc",
    failure_reason: null,
  });

  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.deepEqual(run.args, [
    "template",
    "build",
    "node-api",
    "--wait-timeout",
    "15m",
    "--json",
    "--build-env",
    "NODE_ENV",
    "--build-secret-env",
    "NPM_TOKEN",
    "--wait-durable",
    "--publish-raw-image=true",
  ]);
  assert.match(run.outputs, /image<<ghadelimiter_[^\n]+\nnode-api@sha256:abc\n/);
  assert.match(run.outputs, /template-id<<ghadelimiter_[^\n]+\ntpl-123\n/);
  assert.match(run.outputs, /template-build<<ghadelimiter_[^\n]+\n7\n/);
  assert.match(run.result.stdout, /::add-mask::api-secret/);
  assert.match(run.result.stdout, /::add-mask::npm-secret/);
});

test("preserves failed build metadata as action outputs", () => {
  const run = runAction(
    {
      template_id: "tpl-123",
      template_build_id: "build-124",
      template_build: 8,
      template_build_state: "failed",
      failure_reason: "install failed",
    },
    1,
  );

  assert.equal(run.result.status, 1);
  assert.match(run.outputs, /template-build-state<<ghadelimiter_[^\n]+\nfailed\n/);
  assert.match(run.outputs, /failure-reason<<ghadelimiter_[^\n]+\ninstall failed\n/);
});

const succeeded = {
  template_id: "tpl-123",
  template_build_id: "build-125",
  template_build: 9,
  template_build_state: "succeeded",
  image_digest_ref: "node-api@sha256:abc",
};

test("LUXOR_API_KEY wins over TENKI_API_KEY and keeps TENKI_AUTH_TOKEN", () => {
  const run = runAction(succeeded, 0, { LUXOR_API_KEY: "lx_secret", TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth, "TENKI_AUTH_TOKEN=legacy-token\nTENKI_API_KEY=lx_secret\n");
  assert.match(run.result.stdout, /::add-mask::lx_secret/);
  assert.match(run.result.stdout, /::add-mask::legacy-token/);
});

test("each LUXOR_* credential replaces its TENKI_* counterpart", () => {
  const run = runAction(succeeded, 0, {
    LUXOR_AUTH_TOKEN: "lx-token",
    LUXOR_API_KEY: "lx_secret",
    TENKI_AUTH_TOKEN: "legacy-token",
  });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth, "TENKI_AUTH_TOKEN=lx-token\nTENKI_API_KEY=lx_secret\n");
});

test("empty LUXOR_* credentials fall back to TENKI_*", () => {
  const run = runAction(succeeded, 0, { LUXOR_API_KEY: " ", LUXOR_AUTH_TOKEN: "", TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth, "TENKI_AUTH_TOKEN=legacy-token\nTENKI_API_KEY=api-secret\n");
});

test("TENKI_* credentials pass through unchanged without LUXOR_*", () => {
  const run = runAction(succeeded);
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth, "TENKI_AUTH_TOKEN=\nTENKI_API_KEY=api-secret\n");
});

test("LUXOR_API_KEY with a tk_ prefix is used", () => {
  const run = runAction(succeeded, 0, { LUXOR_API_KEY: " tk_secret " });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth, "TENKI_AUTH_TOKEN=\nTENKI_API_KEY=tk_secret\n");
  assert.match(run.result.stdout, /::add-mask::tk_secret/);
});

test("LUXOR_API_KEY without an lx_ or tk_ prefix is ignored in favor of TENKI_API_KEY", () => {
  const run = runAction(succeeded, 0, { LUXOR_API_KEY: "pool-key-123" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth, "TENKI_AUTH_TOKEN=\nTENKI_API_KEY=api-secret\n");
  assert.doesNotMatch(run.result.stdout, /::add-mask::pool-key-123/);
});

test("non-prefixed LUXOR_API_KEY alone fails as a missing credential", () => {
  const run = runAction(succeeded, 0, { LUXOR_API_KEY: "pool-key-123", TENKI_API_KEY: "" });
  assert.equal(run.result.status, 1);
  assert.match(run.result.stdout, /missing LUXOR_AUTH_TOKEN, LUXOR_API_KEY, TENKI_AUTH_TOKEN or TENKI_API_KEY env var/);
  assert.equal(run.auth, "");
});

test("LUXOR_AUTH_TOKEN is not subject to the API key prefix guard", () => {
  const run = runAction(succeeded, 0, { LUXOR_AUTH_TOKEN: "plain-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth, "TENKI_AUTH_TOKEN=plain-token\nTENKI_API_KEY=api-secret\n");
});

function runAction(json, exitCode = 0, extraEnv = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "tenki-template-build-test-"));
  const binDir = path.join(dir, "bin");
  const argsFile = path.join(dir, "args");
  const authFile = path.join(dir, "auth");
  const outputFile = path.join(dir, "output");
  mkdirSync(binDir);
  writeFileSync(outputFile, "");

  const fakeTenki = path.join(binDir, "tenki");
  writeFileSync(
    fakeTenki,
    `#!/bin/sh
printf '%s\\n' "$@" > "$TENKI_TEST_ARGS"
printf 'TENKI_AUTH_TOKEN=%s\\nTENKI_API_KEY=%s\\n' "$TENKI_AUTH_TOKEN" "$TENKI_API_KEY" > "$TENKI_TEST_AUTH"
printf '%s\\n' "$TENKI_TEST_JSON"
exit "$TENKI_TEST_EXIT"
`,
  );
  chmodSync(fakeTenki, 0o755);

  const result = spawnSync(process.execPath, [path.join(actionDir, "dist/index.js")], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...cleanEnv(),
      PATH: `${binDir}:${process.env.PATH}`,
      GITHUB_OUTPUT: outputFile,
      TENKI_API_KEY: "api-secret",
      TENKI_TEST_ARGS: argsFile,
      TENKI_TEST_AUTH: authFile,
      TENKI_TEST_JSON: JSON.stringify(json),
      TENKI_TEST_EXIT: String(exitCode),
      NODE_ENV: "production",
      NPM_TOKEN: "npm-secret",
      INPUT_TEMPLATE: "node-api",
      "INPUT_BUILD-ENV": "NODE_ENV",
      "INPUT_BUILD-SECRET-ENV": "NPM_TOKEN",
      "INPUT_PUBLISH-RAW-IMAGE": "true",
      ...extraEnv,
    },
  });

  return {
    result,
    args: existsSync(argsFile) ? readFileSync(argsFile, "utf8").trim().split("\n") : [],
    outputs: readFileSync(outputFile, "utf8"),
    auth: existsSync(authFile) ? readFileSync(authFile, "utf8") : "",
  };
}

function cleanEnv() {
  const env = { ...process.env };
  for (const name of ["TENKI_AUTH_TOKEN", "TENKI_API_KEY", "LUXOR_AUTH_TOKEN", "LUXOR_API_KEY"]) delete env[name];
  return env;
}
