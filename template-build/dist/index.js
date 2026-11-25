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