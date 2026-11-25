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

;// CONCATENATED MODULE: ./src/env.ts

function collectForwardedEnv(input, prefix) {
    const result = new Map();
    const trimmed = input.trim();
    if (!trimmed)
        return result;
    const names = trimmed === "*"
        ? Object.keys(process.env).filter((name) => name.startsWith(prefix))
        : trimmed
            .split(/\r?\n/)
            .map((name) => name.trim())
            .filter(Boolean);
    for (const name of names) {
        const value = process.env[name];
        if (value === undefined) {
            core.warning(`env var ${name} is not set; skipping`);
            continue;
        }
        core.setSecret(value);
        result.set(name, value);
    }
    core.info(`forwarding env vars: ${Array.from(result.keys()).join(", ") || "none"}`);
    return result;
}

;// CONCATENATED MODULE: ./src/tenki.ts


async function requireTenki() {
    const found = await io.which("tenki", false);
    if (!found) {
        throw new Error("tenki not found on PATH; add 'LuxorLabs/tenki-actions/setup-cli@v1' step before this one");
    }
}
async function tenkiJSON(args, env = {}) {
    let stdout = "";
    let stderr = "";
    const exitCode = await exec.exec("tenki", args, {
        silent: true,
        ignoreReturnCode: true,
        env: { ...cliEnv(), ...env },
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
        const detail = stderr.trim() || stdout.trim() || `tenki exited ${exitCode}`;
        throw new Error(detail);
    }
    try {
        return JSON.parse(stdout);
    }
    catch (error) {
        const lines = stdout
            .trim()
            .split(/\r?\n/)
            .filter(Boolean);
        const lastJSONLine = [...lines].reverse().find((line) => line.trim().startsWith("{"));
        if (lastJSONLine) {
            return JSON.parse(lastJSONLine);
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`failed to parse tenki JSON output: ${detail} (got ${stdout.length} bytes of non-JSON)`);
    }
}

;// CONCATENATED MODULE: external "node:fs/promises"
const promises_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs/promises");
;// CONCATENATED MODULE: ./src/inputs.ts



async function readInputs() {
    const mode = core.getInput("mode", { required: true });
    const setupScript = await resolveSetupScript();
    const baseImageId = core.getInput("base-image-id");
    const inputs = {
        mode,
        name: core.getInput("name"),
        templateId: core.getInput("template-id"),
        image: core.getInput("image"),
        visibility: core.getInput("visibility") || "public",
        setupScript,
        baseImageId: baseImageId || (mode === "create" ? "sandbox" : ""),
        tags: core.getInput("tags"),
        cpu: core.getInput("cpu"),
        memoryMb: core.getInput("memory-mb"),
        diskSizeGb: core.getInput("disk-size-gb"),
        env: core.getInput("env"),
        envPrefix: core.getInput("env-prefix") || "TENKI_TPL_",
        waitTimeout: core.getInput("wait-timeout") || "15m",
        waitDurable: parseBooleanInput(core.getInput("wait-durable"), true),
        publishRawImage: parseOptionalBooleanInput(core.getInput("publish-raw-image")),
        configFields: [],
        baseImageIdSet: baseImageId !== "",
    };
    inputs.configFields = configFields(inputs);
    validate(inputs);
    return inputs;
}
function validate(inputs) {
    const errors = [];
    if (!["create", "update", "build-only", "publish-only"].includes(inputs.mode)) {
        errors.push(`invalid mode: ${inputs.mode}`);
    }
    if (inputs.mode === "create") {
        if (inputs.templateId)
            errors.push("incompatible inputs: template-id is not allowed with mode create");
        if (!inputs.name)
            errors.push("incompatible inputs: name is required with mode create");
        if (!inputs.setupScript)
            errors.push("incompatible inputs: setup-script or setup-script-path is required with mode create");
    }
    else if (!inputs.templateId) {
        errors.push(`incompatible inputs: template-id is required with mode ${inputs.mode}`);
    }
    if (inputs.mode === "update" && inputs.configFields.length === 0) {
        errors.push("incompatible inputs: update requires at least one config field");
    }
    if ((inputs.mode === "build-only" || inputs.mode === "publish-only") && inputs.configFields.length > 0) {
        errors.push(`incompatible inputs: config fields are not accepted with mode ${inputs.mode}`);
    }
    if (inputs.mode === "build-only" && inputs.image) {
        errors.push("incompatible inputs: image is not accepted with mode build-only");
    }
    if (inputs.mode === "build-only" && inputs.visibility !== "public") {
        errors.push("incompatible inputs: visibility is not accepted with mode build-only");
    }
    if (!["private", "public"].includes(inputs.visibility)) {
        errors.push(`invalid visibility: ${inputs.visibility}`);
    }
    if (inputs.visibility !== "public" && !inputs.image) {
        errors.push("incompatible inputs: visibility requires image");
    }
    if (inputs.mode === "publish-only" && inputs.publishRawImage !== undefined) {
        errors.push("incompatible inputs: publish-raw-image is not accepted with mode publish-only");
    }
    if (errors.length > 0) {
        for (const error of errors)
            core.error(error);
        throw new Error(errors[0]);
    }
}
function configFields(inputs) {
    const fields = [];
    if (inputs.setupScript)
        fields.push("setup-script");
    if (inputs.baseImageIdSet)
        fields.push("base-image-id");
    if (inputs.tags)
        fields.push("tags");
    if (inputs.cpu)
        fields.push("cpu");
    if (inputs.memoryMb)
        fields.push("memory-mb");
    if (inputs.diskSizeGb)
        fields.push("disk-size-gb");
    if (inputs.env)
        fields.push("env");
    return fields;
}
function parseBooleanInput(value, defaultValue) {
    const v = value.trim().toLowerCase();
    if (v === "")
        return defaultValue;
    if (["true", "1", "yes", "on"].includes(v))
        return true;
    if (["false", "0", "no", "off"].includes(v))
        return false;
    throw new Error(`invalid boolean input: ${value}`);
}
function parseOptionalBooleanInput(value) {
    const v = value.trim();
    if (v === "")
        return undefined;
    return parseBooleanInput(v, false);
}
async function resolveSetupScript() {
    const inline = core.getInput("setup-script");
    const scriptPath = core.getInput("setup-script-path");
    if (inline && scriptPath) {
        core.error("incompatible inputs: setup-script and setup-script-path are mutually exclusive");
        throw new Error("incompatible inputs: setup-script and setup-script-path are mutually exclusive");
    }
    if (inline)
        return inline;
    if (!scriptPath)
        return "";
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const resolved = external_node_path_namespaceObject.isAbsolute(scriptPath) ? scriptPath : external_node_path_namespaceObject.join(workspace, scriptPath);
    return (0,promises_namespaceObject.readFile)(resolved, "utf8");
}

;// CONCATENATED MODULE: ./src/main.ts





async function run() {
    core.warning("template-publish is deprecated; migrate to LuxorLabs/tenki-actions/template-build@v1");
    const env = cliEnv();
    const token = env.TENKI_AUTH_TOKEN?.trim();
    const apiKey = env.TENKI_API_KEY?.trim();
    if (!token && !apiKey) {
        core.error("missing LUXOR_AUTH_TOKEN, LUXOR_API_KEY, TENKI_AUTH_TOKEN or TENKI_API_KEY env var");
        throw new Error("missing LUXOR_AUTH_TOKEN, LUXOR_API_KEY, TENKI_AUTH_TOKEN or TENKI_API_KEY env var");
    }
    if (token)
        core.setSecret(token);
    if (apiKey)
        core.setSecret(apiKey);
    await requireTenki();
    const inputs = await readInputs();
    const forwarded = collectForwardedEnv(inputs.env, inputs.envPrefix);
    const forwardedArgs = Array.from(forwarded.entries()).flatMap(([name, value]) => ["--env", `${name}=${value}`]);
    let templateId = inputs.templateId;
    let build;
    let publication;
    const waitTimeout = inputs.waitTimeout;
    const waitDurable = inputs.waitDurable;
    if (inputs.mode === "create") {
        core.info("creating template");
        const created = await step("create", () => tenkiJSON([
            "sandbox",
            "template",
            "create",
            "--name",
            inputs.name,
            "--setup-script",
            inputs.setupScript,
            ...configArgs(inputs),
            ...forwardedArgs,
            "--json",
        ]));
        templateId = created.template_id;
        build = await buildTemplate(templateId, waitTimeout, waitDurable, inputs.publishRawImage);
        publication = await publishTemplate(templateId, inputs);
    }
    else if (inputs.mode === "update") {
        core.info("updating template");
        await step("update", () => tenkiJSON([
            "sandbox",
            "template",
            "update",
            templateId,
            ...configArgs(inputs),
            ...forwardedArgs,
            "--json",
        ]));
        build = await buildTemplate(templateId, waitTimeout, waitDurable, inputs.publishRawImage);
        publication = await publishTemplate(templateId, inputs);
    }
    else if (inputs.mode === "build-only") {
        build = await buildTemplate(templateId, waitTimeout, waitDurable, inputs.publishRawImage);
    }
    else {
        publication = await publishTemplate(templateId, inputs);
    }
    const snapshotId = publication?.snapshot_id ?? build?.snapshot_id ?? "";
    const rawImage = await rawImageOutputs(snapshotId);
    core.setOutput("template-id", templateId);
    core.setOutput("artifact-id", publication?.artifact_id ?? publication?.publication_id ?? "");
    core.setOutput("snapshot-id", snapshotId);
    core.setOutput("raw-image-available", rawImage.available ? "true" : "false");
    core.setOutput("raw-image-url", rawImage.url);
    core.setOutput("raw-image-expires-at", rawImage.expiresAt);
    core.setOutput("image", publication?.image ?? "");
    core.setOutput("publication-id", publication?.artifact_id ?? publication?.publication_id ?? "");
    core.setOutput("template-build-id", build?.template_build_id ?? publication?.template_build_id ?? "");
    core.setOutput("template-build-state", build?.template_build_state ?? publication?.template_build_state ?? "");
}
function configArgs(inputs) {
    const args = [];
    if (inputs.baseImageId && (inputs.mode === "create" || inputs.baseImageIdSet)) {
        args.push("--base-image", inputs.baseImageId);
    }
    if (inputs.mode === "update" && inputs.setupScript)
        args.push("--setup-script", inputs.setupScript);
    if (inputs.tags)
        args.push("--tags", inputs.tags);
    if (inputs.cpu)
        args.push("--cpu", inputs.cpu);
    if (inputs.memoryMb)
        args.push("--memory-mb", inputs.memoryMb);
    if (inputs.diskSizeGb)
        args.push("--disk-size-gb", inputs.diskSizeGb);
    return args;
}
async function buildTemplate(templateId, waitTimeout, waitDurable, publishRawImage) {
    const args = ["sandbox", "template", "build", templateId, "--wait", "--wait-timeout", waitTimeout, "--json"];
    if (waitDurable)
        args.push("--wait-durable");
    if (publishRawImage !== undefined)
        args.push(`--publish-raw-image=${publishRawImage ? "true" : "false"}`);
    const build = await step("build", () => tenkiJSON(args));
    if (build.template_build_state === "failed") {
        throw new Error(build.failure_reason ? `template build failed: ${build.failure_reason}` : "template build failed");
    }
    return build;
}
async function rawImageOutputs(snapshotId) {
    if (!snapshotId) {
        return { available: false, url: "", expiresAt: "" };
    }
    const snapshot = await step("snapshot", () => tenkiJSON(["sandbox", "snapshot", "get", snapshotId, "--json"]));
    if (!snapshot.raw_image_available) {
        return { available: false, url: "", expiresAt: "" };
    }
    const download = await step("snapshot download url", () => tenkiJSON([
        "sandbox",
        "snapshot",
        "download-url",
        snapshotId,
        "--file",
        "raw-image",
        "--json",
    ]));
    return { available: true, url: download.url ?? "", expiresAt: download.expires_at ?? "" };
}
async function publishTemplate(templateId, inputs) {
    if (!inputs.image) {
        return step("publish", () => tenkiJSON(["sandbox", "template", "publish", templateId, "--json"]));
    }
    return step("publish", () => tenkiJSON([
        "sandbox",
        "registry",
        "publish",
        "--from-template",
        templateId,
        "--image",
        inputs.image,
        "--visibility",
        inputs.visibility,
        "--json",
    ]));
}
async function step(name, fn) {
    try {
        return await fn();
    }
    catch (error) {
        core.error(`${name} failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
run().catch((error) => {
    core.setFailed(error instanceof Error ? error.message : String(error));
});


//# sourceMappingURL=index.js.map