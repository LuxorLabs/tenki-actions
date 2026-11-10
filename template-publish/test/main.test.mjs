import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const actionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("LUXORAI_API_KEY does not drop TENKI_AUTH_TOKEN", () => {
  const run = runAction({ LUXORAI_API_KEY: "lx-secret", TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN=legacy-token TENKI_API_KEY=lx-secret");
  assert.match(run.result.stdout, /::add-mask::legacy-token/);
  assert.match(run.outputs, /artifact-id<<ghadelimiter_[^\n]+\nart-1\n/);
});

test("LUXORAI_AUTH_TOKEN wins over TENKI_AUTH_TOKEN", () => {
  const run = runAction({ LUXORAI_AUTH_TOKEN: "lx-token", TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN=lx-token TENKI_API_KEY=");
  assert.match(run.result.stdout, /::add-mask::lx-token/);
});

test("TENKI_AUTH_TOKEN passes through without LUXORAI_*", () => {
  const run = runAction({ TENKI_AUTH_TOKEN: "legacy-token" });
  assert.equal(run.result.status, 0, run.result.stderr || run.result.stdout);
  assert.equal(run.auth[0], "TENKI_AUTH_TOKEN=legacy-token TENKI_API_KEY=");
});

test("fails before any CLI call without an auth token", () => {
  const run = runAction({ LUXORAI_API_KEY: "lx-secret" });
  assert.equal(run.result.status, 1);
  assert.match(run.result.stdout, /missing LUXORAI_AUTH_TOKEN or TENKI_AUTH_TOKEN/);
  assert.deepEqual(run.auth, []);
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
  for (const name of ["TENKI_AUTH_TOKEN", "TENKI_API_KEY", "LUXORAI_AUTH_TOKEN", "LUXORAI_API_KEY"]) delete env[name];
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
