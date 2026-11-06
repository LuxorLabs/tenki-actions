import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as tc from "@actions/tool-cache";
import { mkdtempSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TOOL_NAME = "tenki";
const INSTALL_URL = "https://tenki.cloud/install.sh";
const SUPPORTED_PLATFORMS = new Set(["linux/x64", "darwin/arm64"]);
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?(\+[A-Za-z0-9.]+)?$/;
// Matches both `tenki version X` and the rebranded `luxor version X`.
const VERSION_LINE = /(?:tenki|luxor)\s+version\s+(\S+)/i;

async function run(): Promise<void> {
  const platform = `${os.platform()}/${os.arch()}`;
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    core.setFailed(`tenki-cli is not yet published for ${platform}. Supported: linux/x64, darwin/arm64.`);
    return;
  }

  const requestedVersion = core.getInput("version") || "latest";
  const normalizedVersion = requestedVersion.replace(/^v/, "");
  // normalizedVersion reaches a bash -c command, so reject anything but a
  // strict semver to keep shell metacharacters out.
  if (requestedVersion !== "latest" && !SEMVER.test(normalizedVersion)) {
    throw new Error(`invalid version ${JSON.stringify(requestedVersion)}; expected "latest" or a semver like 1.2.3`);
  }
  if (requestedVersion !== "latest") {
    const cached = tc.find(TOOL_NAME, normalizedVersion);
    if (cached) {
      core.addPath(cached);
      setVersionOutputs(normalizedVersion);
      core.info(`tenki ${normalizedVersion} restored from cache`);
      return;
    }
  }

  const installDir = mkdtempSync(path.join(os.tmpdir(), "tenki-cli-install-"));
  const pipeline =
    requestedVersion === "latest"
      ? `curl -fsSL ${INSTALL_URL} | bash`
      : `curl -fsSL ${INSTALL_URL} | bash -s -- --version ${normalizedVersion}`;
  // Without pipefail a failed fetch (curl -f) is masked by bash's exit 0 and
  // only surfaces later as a confusing "tenki: not found".
  const command = `set -o pipefail; ${pipeline}`;

  await exec.exec("bash", ["-c", command], {
    env: { ...process.env, TENKI_INSTALL_DIR: installDir },
  });

  const resolvedVersion = await installedVersion(path.join(installDir, "tenki"), requestedVersion);
  if (requestedVersion !== "latest" && resolvedVersion !== "dev") {
    const cached = await tc.cacheDir(installDir, TOOL_NAME, resolvedVersion);
    core.addPath(cached);
  } else {
    core.addPath(installDir);
  }
  setVersionOutputs(resolvedVersion);
  core.info(`tenki ${resolvedVersion} installed`);
}

// luxor-version mirrors tenki-version so workflows can move to the new name early.
function setVersionOutputs(version: string): void {
  core.setOutput("tenki-version", version);
  core.setOutput("luxor-version", version);
}

async function installedVersion(binaryPath: string, requestedVersion: string): Promise<string> {
  let stdout = "";
  await exec.exec(binaryPath, ["--version"], {
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
    },
  });
  const match = stdout.match(VERSION_LINE);
  if (match?.[1]) {
    return match[1].replace(/^v/, "");
  }
  return requestedVersion === "latest" ? "latest" : requestedVersion.replace(/^v/, "");
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
