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
// In-house stand-in for the few @actions/* calls this action makes. Each
// function follows @actions/core 3.0.1, @actions/exec 3.0.0 and @actions/io
// 3.0.2 (their Linux/macOS code paths; tenki ships only for those), so call
// sites are unchanged.





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
    getMultilineInput(name, options) {
        const inputs = core
            .getInput(name, options)
            .split("\n")
            .filter((line) => line !== "");
        if (options && options.trimWhitespace === false)
            return inputs;
        return inputs.map((line) => line.trim());
    },
    setOutput(name, value) {
        if (process.env.GITHUB_OUTPUT || "")
            return issueFileCommand("OUTPUT", prepareKeyValueMessage(name, value));
        process.stdout.write(external_node_os_namespaceObject.EOL);
        issueCommand("set-output", { name }, toCommandValue(value));
    },
    setSecret: (secret) => issueCommand("add-mask", {}, secret),
    addPath(inputPath) {
        if (process.env.GITHUB_PATH || "")
            issueFileCommand("PATH", inputPath);
        else
            issueCommand("add-path", {}, inputPath);
        process.env.PATH = `${inputPath}${external_node_path_namespaceObject.delimiter}${process.env.PATH}`;
    },
    info: (message) => void process.stdout.write(message + external_node_os_namespaceObject.EOL),
    warning: (message) => issueCommand("warning", {}, message),
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
const io = { which };
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

;// CONCATENATED MODULE: ./src/auth.ts
const API_KEY_PREFIXES = ["lx_", "tk_"];
/**
 * Environment for the tenki CLI. Credentials resolve in the order LUXOR_AUTH_TOKEN,
 * LUXOR_API_KEY, TENKI_AUTH_TOKEN, TENKI_API_KEY. A chosen LUXOR_* credential is passed
 * under the TENKI_* name released CLIs read, with the other TENKI_* credential removed.
 */
function cliEnv(env = process.env) {
    const out = { ...env };
    const token = env.LUXOR_AUTH_TOKEN?.trim();
    const apiKey = luxorApiKey(env);
    if (token) {
        out.TENKI_AUTH_TOKEN = token;
        delete out.TENKI_API_KEY;
    }
    else if (apiKey) {
        out.TENKI_API_KEY = apiKey;
        delete out.TENKI_AUTH_TOKEN;
    }
    return out;
}
// LUXOR_API_KEY is also the Luxor Mining Pool key name, so only lx_/tk_ values count as set.
function luxorApiKey(env) {
    const value = env.LUXOR_API_KEY?.trim();
    return API_KEY_PREFIXES.some((prefix) => value?.startsWith(prefix)) ? value : undefined;
}

;// CONCATENATED MODULE: ./src/inputs.ts

function readInputs() {
    const inputs = {
        template: core.getInput("template", { required: true }),
        file: core.getInput("file"),
        buildEnv: uniqueMultilineInput("build-env"),
        buildSecretEnv: uniqueMultilineInput("build-secret-env"),
        waitTimeout: core.getInput("wait-timeout") || "15m",
        waitDurable: parseBooleanInput(core.getInput("wait-durable"), true),
        publishRawImage: parseOptionalBooleanInput(core.getInput("publish-raw-image")),
    };
    for (const name of [...inputs.buildEnv, ...inputs.buildSecretEnv]) {
        validateEnvName(name);
        if (!(name in process.env)) {
            throw new Error(`environment variable ${JSON.stringify(name)} is not set`);
        }
    }
    for (const name of inputs.buildEnv) {
        if (/(token|secret|password|private[_-]?key)/i.test(name)) {
            core.warning(`build-env ${name} is stored in the build spec; use build-secret-env for secrets`);
        }
    }
    for (const name of inputs.buildSecretEnv) {
        const value = process.env[name];
        if (!value) {
            throw new Error(`build secret environment variable ${JSON.stringify(name)} is empty`);
        }
        core.setSecret(value);
    }
    return inputs;
}
function uniqueMultilineInput(name) {
    return [...new Set(core.getMultilineInput(name).map((value) => value.trim()).filter(Boolean))];
}
function validateEnvName(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`invalid environment variable name: ${name}`);
    }
}
function parseBooleanInput(value, defaultValue) {
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return defaultValue;
    if (["true", "1", "yes", "on"].includes(normalized))
        return true;
    if (["false", "0", "no", "off"].includes(normalized))
        return false;
    throw new Error(`invalid boolean input: ${value}`);
}
function parseOptionalBooleanInput(value) {
    if (!value.trim())
        return undefined;
    return parseBooleanInput(value, false);
}

;// CONCATENATED MODULE: ./src/tenki.ts


class TenkiCommandError extends Error {
    output;
    constructor(message, output) {
        super(message);
        this.output = output;
        this.name = "TenkiCommandError";
    }
}
async function requireTenki() {
    const found = await io.which("tenki", false);
    if (!found) {
        throw new Error("tenki not found on PATH; add 'LuxorLabs/tenki-actions/setup-cli@v1' before this action");
    }
}
async function tenkiJSON(args) {
    let stdout = "";
    let stderr = "";
    const exitCode = await exec.exec("tenki", args, {
        silent: true,
        ignoreReturnCode: true,
        env: cliEnv(),
        listeners: {
            stdout: (data) => {
                stdout += data.toString();
            },
            stderr: (data) => {
                stderr += data.toString();
            },
        },
    });
    if (exitCode !== 0) {
        throw new TenkiCommandError(stderr.trim() || stdout.trim() || `tenki exited ${exitCode}`, parseJSON(stdout));
    }
    const parsed = parseJSON(stdout);
    if (parsed !== undefined)
        return parsed;
    throw new Error(`failed to parse tenki JSON output (got ${stdout.length} bytes of non-JSON)`);
}
function parseJSON(stdout) {
    try {
        return JSON.parse(stdout);
    }
    catch {
        return undefined;
    }
}

;// CONCATENATED MODULE: ./src/main.ts




// The CLI forwards these as ephemeral build secrets even when absent from
// build-secret-env, so register them for masking to match.
const AUTO_SECRET_ENV = ["GIT_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
async function run() {
    maskAuth();
    maskAutoDetectedSecrets();
    await requireTenki();
    const inputs = readInputs();
    const args = [
        "template",
        "build",
        inputs.template,
        "--wait-timeout",
        inputs.waitTimeout,
        "--json",
    ];
    if (inputs.file)
        args.push("--file", inputs.file);
    for (const name of inputs.buildEnv)
        args.push("--build-env", name);
    for (const name of inputs.buildSecretEnv)
        args.push("--build-secret-env", name);
    if (inputs.waitDurable)
        args.push("--wait-durable");
    if (inputs.publishRawImage !== undefined) {
        args.push(`--publish-raw-image=${inputs.publishRawImage ? "true" : "false"}`);
    }
    core.info(`building template ${inputs.template}`);
    let build;
    try {
        build = await tenkiJSON(args);
    }
    catch (error) {
        if (error instanceof TenkiCommandError && error.output) {
            setOutputs(error.output);
        }
        throw error;
    }
    setOutputs(build);
    if (build.template_build_state !== "succeeded") {
        throw new Error(build.failure_reason || `template build finished in state ${build.template_build_state}`);
    }
    if (!build.image_digest_ref) {
        throw new Error("template build succeeded without an immutable image digest ref");
    }
}
function maskAuth() {
    const env = cliEnv();
    const token = env.TENKI_AUTH_TOKEN?.trim();
    const apiKey = env.TENKI_API_KEY?.trim();
    if (!token && !apiKey) {
        throw new Error("missing LUXOR_AUTH_TOKEN, LUXOR_API_KEY, TENKI_AUTH_TOKEN or TENKI_API_KEY env var");
    }
    if (token)
        core.setSecret(token);
    if (apiKey)
        core.setSecret(apiKey);
}
function maskAutoDetectedSecrets() {
    // Mask-only, never appended to build-secret-env; non-empty check mirrors the
    // CLI so we register exactly what it forwards.
    for (const name of AUTO_SECRET_ENV) {
        const value = process.env[name];
        if (value)
            core.setSecret(value);
    }
}
function setOutputs(build) {
    core.setOutput("image", build.image_digest_ref ?? "");
    core.setOutput("image-digest-ref", build.image_digest_ref ?? "");
    core.setOutput("image-digest", build.image_digest ?? "");
    core.setOutput("template-id", build.template_id);
    core.setOutput("template-build-id", build.template_build_id);
    core.setOutput("template-build", String(build.template_build));
    core.setOutput("template-build-state", build.template_build_state);
    core.setOutput("snapshot-id", build.snapshot_id ?? "");
    core.setOutput("spec-hash", build.spec_hash ?? "");
    core.setOutput("failure-reason", build.failure_reason ?? "");
}
run().catch((error) => {
    core.setFailed(error instanceof Error ? error.message : String(error));
});


//# sourceMappingURL=index.js.map