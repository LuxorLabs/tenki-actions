import './sourcemap-register.cjs';import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:child_process");
;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");
;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:crypto");
;// CONCATENATED MODULE: external "node:os"
const external_node_os_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:os");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");
;// CONCATENATED MODULE: ./src/actions.ts
// In-house stand-in for the few @actions/* calls below; the namespaces mirror
// the toolkit APIs so the call site is unchanged.





const actions_escape = (value) => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const command = (level, message) => void process.stdout.write(`::${level}::${actions_escape(message)}\n`);
const inputEnv = (name) => `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
// Same layout and completion marker as @actions/tool-cache; self-hosted
// runners reuse entries, so an interrupted copy must not be found.
const directory = (tool, version) => (0,external_node_path_namespaceObject.join)(process.env.RUNNER_TOOL_CACHE ?? (0,external_node_path_namespaceObject.join)((0,external_node_os_namespaceObject.tmpdir)(), "toolcache"), tool, version, process.arch);
const marker = (tool, version) => `${directory(tool, version)}.complete`;
const core = {
    getInput(name, options = {}) {
        const value = (process.env[inputEnv(name)] ?? "").trim();
        if (options.required && !value)
            throw new Error(`Input required and not supplied: ${name}`);
        return value;
    },
    setOutput(name, value) {
        const file = process.env.GITHUB_OUTPUT;
        if (!file)
            return command("set-output", `name=${name}::${value}`);
        const delimiter = `ghadelimiter_${(0,external_node_crypto_namespaceObject.randomUUID)()}`;
        (0,external_node_fs_namespaceObject.appendFileSync)(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
    },
    addPath(dir) {
        const file = process.env.GITHUB_PATH;
        if (file)
            (0,external_node_fs_namespaceObject.appendFileSync)(file, `${dir}\n`);
        else
            command("add-path", dir);
    },
    info: (message) => void process.stdout.write(`${message}\n`),
    setFailed: (message) => void ((process.exitCode = 1), command("error", message)),
};
const tc = {
    find(tool, version) {
        const dir = directory(tool, version);
        return (0,external_node_fs_namespaceObject.existsSync)(marker(tool, version)) && (0,external_node_fs_namespaceObject.existsSync)((0,external_node_path_namespaceObject.join)(dir, tool)) ? dir : "";
    },
    async cacheDir(sourceDir, tool, version) {
        const dir = directory(tool, version);
        (0,external_node_fs_namespaceObject.rmSync)(dir, { recursive: true, force: true });
        (0,external_node_fs_namespaceObject.rmSync)(marker(tool, version), { force: true });
        (0,external_node_fs_namespaceObject.mkdirSync)(dir, { recursive: true });
        (0,external_node_fs_namespaceObject.cpSync)(sourceDir, dir, { recursive: true });
        (0,external_node_fs_namespaceObject.writeFileSync)(marker(tool, version), "");
        return dir;
    },
};
const exec = {
    exec(cmd, args, options = {}) {
        if (!options.silent)
            process.stdout.write(`[command]${cmd} ${args.join(" ")}\n`);
        return new Promise((resolve, reject) => {
            const child = (0,external_node_child_process_namespaceObject.spawn)(cmd, args, { env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
            // Like @actions/exec, a non-silent call also echoes the child output to
            // the job log; listeners still get every chunk either way.
            child.stdout.on("data", (chunk) => {
                options.listeners?.stdout?.(chunk);
                if (!options.silent)
                    process.stdout.write(chunk);
            });
            child.stderr.on("data", (chunk) => {
                options.listeners?.stderr?.(chunk);
                if (!options.silent)
                    process.stderr.write(chunk);
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

;// CONCATENATED MODULE: ./src/main.ts




const TOOL_NAME = "tenki";
const INSTALL_URL = "https://tenki.cloud/install.sh";
const SUPPORTED_PLATFORMS = new Set(["linux/x64", "darwin/arm64"]);
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?(\+[A-Za-z0-9.]+)?$/;
// Matches both `tenki version X` and the rebranded `luxor version X`.
const VERSION_LINE = /(?:tenki|luxor)\s+version\s+(\S+)/i;
async function run() {
    const platform = `${external_node_os_namespaceObject.platform()}/${external_node_os_namespaceObject.arch()}`;
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
    const installDir = (0,external_node_fs_namespaceObject.mkdtempSync)(external_node_path_namespaceObject.join(external_node_os_namespaceObject.tmpdir(), "tenki-cli-install-"));
    const pipeline = requestedVersion === "latest"
        ? `curl -fsSL ${INSTALL_URL} | bash`
        : `curl -fsSL ${INSTALL_URL} | bash -s -- --version ${normalizedVersion}`;
    // Without pipefail a failed fetch (curl -f) is masked by bash's exit 0 and
    // only surfaces later as a confusing "tenki: not found".
    const command = `set -o pipefail; ${pipeline}`;
    await exec.exec("bash", ["-c", command], {
        env: { ...process.env, TENKI_INSTALL_DIR: installDir },
    });
    const resolvedVersion = await installedVersion(external_node_path_namespaceObject.join(installDir, "tenki"), requestedVersion);
    if (requestedVersion !== "latest" && resolvedVersion !== "dev") {
        const cached = await tc.cacheDir(installDir, TOOL_NAME, resolvedVersion);
        core.addPath(cached);
    }
    else {
        core.addPath(installDir);
    }
    setVersionOutputs(resolvedVersion);
    core.info(`tenki ${resolvedVersion} installed`);
}
// luxor-version mirrors tenki-version so workflows can move to the new name early.
function setVersionOutputs(version) {
    core.setOutput("tenki-version", version);
    core.setOutput("luxor-version", version);
}
async function installedVersion(binaryPath, requestedVersion) {
    let stdout = "";
    await exec.exec(binaryPath, ["--version"], {
        listeners: {
            stdout: (data) => {
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
run().catch((error) => {
    core.setFailed(error instanceof Error ? error.message : String(error));
});


//# sourceMappingURL=index.js.map