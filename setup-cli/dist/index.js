import './sourcemap-register.cjs';import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:child_process");
;// CONCATENATED MODULE: external "node:assert"
const external_node_assert_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:assert");
;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs");
;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:crypto");
;// CONCATENATED MODULE: external "node:os"
const external_node_os_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:os");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");
;// CONCATENATED MODULE: ./src/actions.ts
// In-house stand-in for the few @actions/* calls this action makes. Each
// function follows @actions/core 3.0.1, @actions/exec 3.0.0, @actions/io
// 3.0.2 and @actions/tool-cache 4.0.0 (their Linux/macOS code paths; tenki
// ships only for those), so the call sites are unchanged.






// Workflow commands, as @actions/core writes them.
const toCommandValue = (input) => input === null || input === undefined ? "" : typeof input === "string" || input instanceof String ? String(input) : JSON.stringify(input);
const escapeData = (input) => toCommandValue(input).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (input) => escapeData(input).replace(/:/g, "%3A").replace(/,/g, "%2C");
function issueCommand(command, properties, message) {
    let line = `::${command}`;
    if (Object.keys(properties).length > 0) {
        line += ` ${Object.entries(properties)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}=${escapeProperty(value)}`)
            .join(",")}`;
    }
    process.stdout.write(`${line}::${escapeData(message)}${external_node_os_namespaceObject.EOL}`);
}
function issueFileCommand(command, message) {
    const filePath = process.env[`GITHUB_${command}`];
    if (!filePath)
        throw new Error(`Unable to find environment variable for file command ${command}`);
    if (!(0,external_node_fs_namespaceObject.existsSync)(filePath))
        throw new Error(`Missing file at path: ${filePath}`);
    (0,external_node_fs_namespaceObject.appendFileSync)(filePath, `${message}${external_node_os_namespaceObject.EOL}`, { encoding: "utf8" });
}
function prepareKeyValueMessage(key, value) {
    const delimiter = `ghadelimiter_${(0,external_node_crypto_namespaceObject.randomUUID)()}`;
    const convertedValue = toCommandValue(value);
    if (key.includes(delimiter))
        throw new Error(`Unexpected input: name should not contain the delimiter "${delimiter}"`);
    if (convertedValue.includes(delimiter)) {
        throw new Error(`Unexpected input: value should not contain the delimiter "${delimiter}"`);
    }
    return `${key}<<${delimiter}${external_node_os_namespaceObject.EOL}${convertedValue}${external_node_os_namespaceObject.EOL}${delimiter}`;
}
const core = {
    getInput(name, options) {
        const value = process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] || "";
        if (options && options.required && !value)
            throw new Error(`Input required and not supplied: ${name}`);
        if (options && options.trimWhitespace === false)
            return value;
        return value.trim();
    },
    setOutput(name, value) {
        if (process.env.GITHUB_OUTPUT || "")
            return issueFileCommand("OUTPUT", prepareKeyValueMessage(name, value));
        process.stdout.write(external_node_os_namespaceObject.EOL);
        issueCommand("set-output", { name }, toCommandValue(value));
    },
    addPath(inputPath) {
        if (process.env.GITHUB_PATH || "")
            issueFileCommand("PATH", inputPath);
        else
            issueCommand("add-path", {}, inputPath);
        process.env.PATH = `${inputPath}${external_node_path_namespaceObject.delimiter}${process.env.PATH}`;
    },
    info: (message) => void process.stdout.write(message + external_node_os_namespaceObject.EOL),
    error: (message) => issueCommand("error", {}, message),
    setFailed(message) {
        process.exitCode = 1;
        core.error(message);
    },
};
// PATH lookup, as @actions/io which() does it on Linux and macOS: only regular
// files with an execute bit the current user can use match.
function isUnixExecutable(stats) {
    return ((stats.mode & 1) > 0 ||
        ((stats.mode & 8) > 0 && process.getgid !== undefined && stats.gid === process.getgid()) ||
        ((stats.mode & 64) > 0 && process.getuid !== undefined && stats.uid === process.getuid()));
}
function tryGetExecutablePath(filePath) {
    let stats;
    try {
        stats = (0,external_node_fs_namespaceObject.statSync)(filePath);
    }
    catch (err) {
        if (err.code !== "ENOENT") {
            console.log(`Unexpected error attempting to determine if executable file exists '${filePath}': ${err}`);
        }
    }
    return stats && stats.isFile() && isUnixExecutable(stats) ? filePath : "";
}
function isRooted(p) {
    const normalized = (p || "").replace(/\/\/+/g, "/");
    if (!normalized)
        throw new Error('isRooted() parameter "p" cannot be empty');
    return normalized.startsWith("/");
}
async function which(tool, check) {
    if (!tool)
        throw new Error("parameter 'tool' is required");
    if (check) {
        const result = await which(tool, false);
        if (!result) {
            throw new Error(`Unable to locate executable file: ${tool}. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also check the file mode to verify the file is executable.`);
        }
        return result;
    }
    if (isRooted(tool))
        return tryGetExecutablePath(tool);
    if (tool.includes(external_node_path_namespaceObject.sep))
        return "";
    for (const dir of (process.env.PATH || "").split(external_node_path_namespaceObject.delimiter)) {
        if (!dir)
            continue;
        const filePath = tryGetExecutablePath((0,external_node_path_namespaceObject.join)(dir, tool));
        if (filePath)
            return filePath;
    }
    return "";
}
// Tool cache, as @actions/tool-cache lays it out:
// $RUNNER_TOOL_CACHE/<tool>/<version>/<arch>, plus a <arch>.complete marker
// written after the copy so an interrupted copy is never found.
function cacheRoot() {
    const cacheDirectory = process.env.RUNNER_TOOL_CACHE || "";
    (0,external_node_assert_namespaceObject.ok)(cacheDirectory, "Expected RUNNER_TOOL_CACHE to be defined");
    return cacheDirectory;
}
// semver.clean() for the plain versions this action passes: strict semver,
// leading "=" or "v" and build metadata dropped, "" when not valid.
const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function cleanVersion(version) {
    const value = version.trim().replace(/^[=v]+/, "");
    const match = value.length <= 256 ? SEMVER.exec(value) : null;
    if (!match || [match[1], match[2], match[3]].some((part) => Number(part) > Number.MAX_SAFE_INTEGER))
        return "";
    return `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}`;
}
const tc = {
    // Exact versions only; the toolkit also resolves ranges against cached
    // versions, which this action never asks for.
    find(toolName, versionSpec, arch) {
        if (!toolName)
            throw new Error("toolName parameter is required");
        if (!versionSpec)
            throw new Error("versionSpec parameter is required");
        const version = cleanVersion(versionSpec);
        const root = cacheRoot();
        if (!version)
            return "";
        const cachePath = (0,external_node_path_namespaceObject.join)(root, toolName, version, arch || (0,external_node_os_namespaceObject.arch)());
        return (0,external_node_fs_namespaceObject.existsSync)(cachePath) && (0,external_node_fs_namespaceObject.existsSync)(`${cachePath}.complete`) ? cachePath : "";
    },
    async cacheDir(sourceDir, tool, version, arch) {
        if (!(0,external_node_fs_namespaceObject.statSync)(sourceDir).isDirectory())
            throw new Error("sourceDir is not a directory");
        const folderPath = (0,external_node_path_namespaceObject.join)(cacheRoot(), tool, cleanVersion(version) || version, arch || (0,external_node_os_namespaceObject.arch)());
        (0,external_node_fs_namespaceObject.rmSync)(folderPath, { recursive: true, force: true });
        (0,external_node_fs_namespaceObject.rmSync)(`${folderPath}.complete`, { force: true });
        (0,external_node_fs_namespaceObject.mkdirSync)(folderPath, { recursive: true });
        for (const itemName of (0,external_node_fs_namespaceObject.readdirSync)(sourceDir)) {
            (0,external_node_fs_namespaceObject.cpSync)((0,external_node_path_namespaceObject.join)(sourceDir, itemName), (0,external_node_path_namespaceObject.join)(folderPath, itemName), { recursive: true });
        }
        (0,external_node_fs_namespaceObject.writeFileSync)(`${folderPath}.complete`, "");
        return folderPath;
    },
};
const exec = {
    // Like @actions/exec: resolve the tool with which(), echo the command line
    // and the child's stdout and stderr (both to stdout) unless silent, reject on
    // a nonzero exit unless ignoreReturnCode, and reject if the process fails to
    // start.
    async exec(commandLine, args = [], options = {}) {
        let toolPath = commandLine;
        if (!isRooted(toolPath) && toolPath.includes("/"))
            toolPath = (0,external_node_path_namespaceObject.resolve)(process.cwd(), toolPath);
        toolPath = await which(toolPath, true);
        if (!options.silent)
            process.stdout.write(`[command]${toolPath}${args.map((arg) => ` ${arg}`).join("")}${external_node_os_namespaceObject.EOL}`);
        return new Promise((resolvePromise, reject) => {
            const child = (0,external_node_child_process_namespaceObject.spawn)(toolPath, args, { env: options.env });
            let done = false;
            child.stdout.on("data", (data) => {
                options.listeners?.stdout?.(data);
                if (!options.silent)
                    process.stdout.write(data);
            });
            child.stderr.on("data", (data) => {
                options.listeners?.stderr?.(data);
                if (!options.silent)
                    process.stdout.write(data);
            });
            child.on("error", (error) => {
                if (done)
                    return;
                done = true;
                reject(new Error(`There was an error when attempting to execute the process '${toolPath}'. This may indicate the process failed to start. Error: ${error.message}`));
            });
            child.on("close", (code) => {
                if (done)
                    return;
                done = true;
                if (code !== 0 && !options.ignoreReturnCode) {
                    reject(new Error(`The process '${toolPath}' failed with exit code ${code}`));
                    return;
                }
                resolvePromise(code);
            });
        });
    },
};

;// CONCATENATED MODULE: ./src/main.ts




const TOOL_NAME = "tenki";
const INSTALL_URL = "https://tenki.cloud/install.sh";
const SUPPORTED_PLATFORMS = new Set(["linux/x64", "darwin/arm64"]);
const main_SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?(\+[A-Za-z0-9.]+)?$/;
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
    if (requestedVersion !== "latest" && !main_SEMVER.test(normalizedVersion)) {
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