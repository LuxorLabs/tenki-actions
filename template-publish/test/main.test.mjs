import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const actionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("LUXOR_API_KEY wins over TENKI_AUTH_TOKEN", () => {
  const run = runAction({ LUXOR_API_KEY: "lx_secret", TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN= TENKI_API_KEY=lx_secret");
  assert.match(run.result.stdout, /::add-mask::lx_secret/);
  assert.match(run.outputs, /artifact-id<<ghadelimiter_[^\n]+\nart-1\n/);
});

test("LUXOR_AUTH_TOKEN wins over TENKI_AUTH_TOKEN", () => {
  const run = runAction({ LUXOR_AUTH_TOKEN: "lx-token", TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN=lx-token TENKI_API_KEY=");
  assert.match(run.result.stdout, /::add-mask::lx-token/);
});

test("TENKI_AUTH_TOKEN passes through without LUXOR_*", () => {
  const run = runAction({ TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN=legacy-token TENKI_API_KEY=");
});

test("LUXOR_AUTH_TOKEN wins over LUXOR_API_KEY and TENKI_API_KEY", () => {
  const run = runAction({ LUXOR_AUTH_TOKEN: "lx-token", LUXOR_API_KEY: "lx_secret", TENKI_API_KEY: "legacy-key" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN=lx-token TENKI_API_KEY=");
});

test("fails before any CLI call without a credential", () => {
  const run = runAction({});
  assert.equal(run.result.status, 1);
  assert.match(run.result.stdout, /missing LUXOR_AUTH_TOKEN or TENKI_AUTH_TOKEN/);
  assert.deepEqual(run.auth, []);
});

test("LUXOR_API_KEY with a tk_ prefix is used", () => {
  const run = runAction({ LUXOR_API_KEY: " tk_secret ", TENKI_API_KEY: "legacy-key", TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN= TENKI_API_KEY=tk_secret");
});

test("LUXOR_API_KEY without an lx_ or tk_ prefix is ignored in favor of TENKI_API_KEY", () => {
  const run = runAction({ LUXOR_API_KEY: "pool-key-123", TENKI_API_KEY: "legacy-key", TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN=legacy-token TENKI_API_KEY=legacy-key");
});

test("non-prefixed LUXOR_API_KEY alone fails as a missing credential", () => {
  const run = runAction({ LUXOR_API_KEY: "pool-key-123" });
  assert.equal(run.result.status, 1);
  assert.match(run.result.stdout, /missing LUXOR_AUTH_TOKEN or TENKI_AUTH_TOKEN/);
  assert.deepEqual(run.auth, []);
});

test("LUXOR_AUTH_TOKEN is not subject to the API key prefix guard", () => {
  const run = runAction({ LUXOR_AUTH_TOKEN: "plain-token", LUXOR_API_KEY: "pool-key-123" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN=plain-token TENKI_API_KEY=");
});

function runAction(extraEnv) {
  const dir = mkdtempSync(path.join(tmpdir(), "tenki-template-publish-test-"));
  const binDir = path.join(dir, "bin");
  const authFile = path.join(dir, "auth");
  const outputFile = path.join(dir, "output");
  mkdirSync(binDir);
  writeFileSync(outputFile, "");
  writeFileSync(authFile, "");

  const fakeTenki = path.join(binDir, "tenki");
  writeFileSync(
    fakeTenki,
    `#!/bin/sh
printf 'TENKI_AUTH_TOKEN=%s TENKI_API_KEY=%s\\n' "$TENKI_AUTH_TOKEN" "$TENKI_API_KEY" >> "$TENKI_TEST_AUTH"
case "$2 $3" in
  "template publish") printf '%s\\n' '{"artifact_id":"art-1","snapshot_id":"snap-1","image":"","template_build_id":"build-1","template_build_state":"succeeded","template_id":"tpl-1"}' ;;
  *) printf '%s\\n' '{"id":"snap-1","raw_image_available":false}' ;;
esac
`,
  );
  chmodSync(fakeTenki, 0o755);

  const env = { ...process.env };
  for (const name of ["TENKI_AUTH_TOKEN", "TENKI_API_KEY", "LUXOR_AUTH_TOKEN", "LUXOR_API_KEY"]) delete env[name];
  const result = spawnSync(process.execPath, [path.join(actionDir, "dist/index.js")], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...env,
      PATH: `${binDir}:${process.env.PATH}`,
      GITHUB_OUTPUT: outputFile,
      TENKI_TEST_AUTH: authFile,
      INPUT_MODE: "publish-only",
      "INPUT_TEMPLATE-ID": "tpl-1",
      ...extraEnv,
    },
  });

  return {
    result,
    outputs: readFileSync(outputFile, "utf8"),
    auth: readFileSync(authFile, "utf8").split("\n").filter(Boolean),
  };
}
