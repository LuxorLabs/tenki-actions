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
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");
;// CONCATENATED MODULE: ./src/actions.ts
// In-house stand-in for the few @actions/* calls below; the namespaces mirror
// the toolkit APIs so call sites are unchanged.




const actions_escape = (value) => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const command = (level, message) => void process.stdout.write(`::${level}::${actions_escape(message)}\n`);
const inputEnv = (name) => `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
const core = {
    getInput(name, options = {}) {
        const value = (process.env[inputEnv(name)] ?? "").trim();
        if (options.required && !value)
            throw new Error(`Input required and not supplied: ${name}`);
        return value;
    },
    getMultilineInput(name) {
        return core.getInput(name).split("\n").map((line) => line.trim()).filter(Boolean);
    },
    setOutput(name, value) {
        const file = process.env.GITHUB_OUTPUT;
        if (!file)
            return command("set-output", `name=${name}::${value}`);
        const delimiter = `ghadelimiter_${(0,external_node_crypto_namespaceObject.randomUUID)()}`;
        (0,external_node_fs_namespaceObject.appendFileSync)(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
    },
    setSecret: (value) => void (value && command("add-mask", value)),
    addPath(dir) {
        const file = process.env.GITHUB_PATH;
        if (file)
            (0,external_node_fs_namespaceObject.appendFileSync)(file, `${dir}\n`);
        else
            command("add-path", dir);
    },
    info: (message) => void process.stdout.write(`${message}\n`),
    warning: (message) => command("warning", message),
    error: (message) => command("error", message),
    setFailed: (message) => void ((process.exitCode = 1), command("error", message)),
};
const io = {
    async which(tool, _required = false) {
        for (const dir of (process.env.PATH ?? "").split(external_node_path_namespaceObject.delimiter)) {
            if (!dir)
                continue;
            try {
                (0,external_node_fs_namespaceObject.accessSync)((0,external_node_path_namespaceObject.join)(dir, tool), external_node_fs_namespaceObject.constants.X_OK);
                return (0,external_node_path_namespaceObject.join)(dir, tool);
            }
            catch { }
        }
        return null;
    },
};
const exec = {
    exec(cmd, args, options = {}) {
        if (!options.silent)
            process.stdout.write(`[command]${cmd} ${args.join(" ")}\n`);
        return new Promise((resolve, reject) => {
            const child = (0,external_node_child_process_namespaceObject.spawn)(cmd, args, { env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
            const pipe = (source, listener) => void source.on("data", (chunk) => listener?.(chunk));
            pipe(child.stdout, options.listeners?.stdout);
            pipe(child.stderr, options.listeners?.stderr);
            // A failed spawn rejects like @actions/exec does, so a caller that passes
            // ignoreReturnCode still sees a missing binary as an error, not as a 127.
            child.on("error", (error) => {
                command("error", `${cmd} failed: ${error.message}`);
                reject(error);
            });
            child.on("close", (code) => {
                if (code !== 0 && code !== null && !options.ignoreReturnCode) {
                    reject(new Error(`${cmd} exited with code ${code}`));
                    return;
                }
                resolve(code ?? 1);
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