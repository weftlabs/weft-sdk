import {
  readStoredCredentials,
  type BootstrapCredentials,
  type LegacyBootstrapCredentials,
  type OAuthCredentials,
  type StoredCredentials,
  withCredentialsLock,
  writeStoredCredentials,
  writeStoredCredentialsWhileLocked,
} from "./credentials";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  readableBody,
  reserveResultDirectory,
  writeResultFile,
} from "./results";
import {
  type PaidFetchRequest,
  ResponseError,
  WeftClient,
  WeftError,
} from "@weftlabs/sdk";

export const EXIT_SUCCESS = 0;
export const EXIT_USAGE = 2;
export const EXIT_AUTH = 3;
export const EXIT_API = 4;
export const EXIT_INTERNAL = 5;

type Command =
  | "bootstrap"
  | "auth"
  | "skill"
  | "me"
  | "balance"
  | "search"
  | "fetch"
  | "purchases";

const COMMANDS: Command[] = [
  "bootstrap",
  "auth",
  "skill",
  "me",
  "balance",
  "search",
  "fetch",
  "purchases",
];

const WEFT_API_BASE = "https://weft.network";
const OAUTH_HOST_NAME = "Weft CLI";
const OAUTH_REFRESH_SKEW_MS = 60_000;
const PROCESS_OUTPUT_LIMIT = 8_192;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CORE_SKILL_NAMES = new Set(["weft", "weft-setup"]);

const COMMAND_HELP = {
  bootstrap: {
    description: "Bootstrap an agent account",
    usage: "weft bootstrap --email <email> --agent-name <name> --reason <text>",
    options: [
      "--email <email>",
      "--agent-name <name>",
      "--reason <text>",
      "[--base-url <url>]",
    ],
  },
  auth: {
    description: "Check bootstrap status",
    usage: "weft auth status",
    options: ["status"],
  },
  skill: {
    description: "Install the core Weft Skill or one optional workflow Skill",
    usage: "weft skill install [name --agent <agent> [--global]]",
    options: ["install", "[name]", "--agent <agent>", "--global"],
  },
  me: {
    description: "Return the authenticated principal",
    usage: "weft me",
    options: [],
  },
  balance: {
    description: "Return wallet balance and spending policy",
    usage: "weft balance",
    options: [],
  },
  search: {
    description: "Search for payable resources",
    usage: "weft search <query> [--max-results <1..50>]",
    options: ["--max-results <1..50>"],
  },
  fetch: {
    description: "Fetch a URL within an explicit spending limit",
    usage:
      "weft fetch <url> --max-cost-usd <amount> [--method <method>] [--body <json>] [--header <name:value>]... [--idempotency-key <key>] [--raw]",
    options: [
      "--max-cost-usd <amount>",
      "--method <method>",
      "--body <json>",
      "--header <name:value> (repeatable)",
      "--idempotency-key <key>",
      "--raw",
    ],
  },
  purchases: {
    description: "List purchases or return one purchase by ID",
    usage: "weft purchases [id] [--page <number>] [--per-page <1..100>]",
    options: ["--page <number>", "--per-page <1..100>"],
  },
} satisfies Record<
  Command,
  { description: string; usage: string; options: string[] }
>;

interface SkillInstallResult {
  status: "ok" | "skipped";
  reason?: string;
  installed: number;
  hosts: string[];
  warnings: string[];
}

type SkillInstaller = (options?: {
  force?: boolean;
  silent?: boolean;
}) => Promise<SkillInstallResult>;

/**
 * The Skill installer ships as a plain script beside `dist/`, and reads the
 * packed Skill relative to its own location. The specifier is built at runtime
 * so the bundler leaves it external and that relative path stays correct in the
 * published package.
 */
async function loadSkillInstaller(): Promise<SkillInstaller> {
  const specifier = new URL("../scripts/install-skill.mjs", import.meta.url)
    .href;
  const module = (await import(specifier)) as { installSkill: SkillInstaller };
  return module.installSkill;
}

/**
 * Best-effort Skill installation on any ordinary command. This is the safety
 * net for a user who never runs `weft skill install`, and it is what lets the
 * Skill appear in an agent host that was installed after the CLI. It is
 * idempotent, it stays silent, and it never fails the command the user asked
 * for.
 */
async function installSkillInBackground(): Promise<void> {
  try {
    const installSkill = await loadSkillInstaller();
    await installSkill({ silent: true });
  } catch {
    // Deliberately ignored — `weft skill install` is the surface that reports
    // installation problems.
  }
}

interface BootstrapCreateResponse {
  data: Omit<BootstrapCredentials, "base_url">;
}

interface BootstrapStatus {
  data: {
    id?: string;
    status: string;
    expires_at?: string | null;
    capabilities?: string[];
    approval?: BootstrapCredentials["approval"];
  };
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

const GLOBAL_OPTIONS = ["--api-key-stdin", "--base-url <url>", "--help", "-h"];

export interface CliDependencies {
  env?: Record<string, string | undefined>;
  fetchApi?: typeof fetch;
  readStdin?: () => Promise<string>;
  writeOut?: (value: string) => void | Promise<void>;
  writeErr?: (value: string) => void;
  generateIdempotencyKey?: () => string;
  runProcess?: ProcessRunner;
  platform?: NodeJS.Platform;
  nodeExecutable?: string;
  npxCliPath?: string;
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type ProcessRunner = (
  command: string,
  args: string[],
) => Promise<ProcessResult>;

interface ParsedArgs {
  command: Command;
  apiKeyStdin: boolean;
  baseUrl?: string;
  positionals: string[];
  options: Map<string, string | true | string[]>;
}

class CliError extends Error {
  constructor(
    readonly exitCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function takeValue(
  args: string[],
  index: number,
  option: string,
): [string, number] {
  const value = args[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new CliError(
      EXIT_USAGE,
      "INVALID_ARGUMENT",
      `${option} requires a value`,
    );
  }
  return [value, index + 1];
}

function appendBounded(current: string, chunk: Buffer | string): string {
  return `${current}${chunk.toString()}`.slice(-PROCESS_OUTPUT_LIMIT);
}

function defaultRunProcess(
  command: string,
  args: string[],
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: appendBounded(stderr, error.message),
      });
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

function resolveNpxCliPath(
  env: Record<string, string | undefined>,
  nodeExecutable: string,
): string | undefined {
  const executableDirectory = dirname(nodeExecutable);
  const candidates = [
    ...(env.npm_execpath
      ? [join(dirname(env.npm_execpath), "npx-cli.js")]
      : []),
    join(executableDirectory, "node_modules", "npm", "bin", "npx-cli.js"),
    join(
      executableDirectory,
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npx-cli.js",
    ),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function npxProcessInvocation(
  processArgs: string[],
  dependencies: CliDependencies,
  env: Record<string, string | undefined>,
): { executable: string; arguments: string[] } {
  if ((dependencies.platform ?? process.platform) !== "win32") {
    return { executable: "npx", arguments: processArgs };
  }

  const nodeExecutable = dependencies.nodeExecutable ?? process.execPath;
  const npxCliPath =
    dependencies.npxCliPath ?? resolveNpxCliPath(env, nodeExecutable);
  if (!npxCliPath) {
    throw new CliError(
      EXIT_INTERNAL,
      "NPX_NOT_FOUND",
      "Could not find the npm npx program. Install npm, then run the command again.",
    );
  }
  return {
    executable: nodeExecutable,
    arguments: [npxCliPath, ...processArgs],
  };
}

function rejectUnsafeCredentialArgument(args: string[]): void {
  if (args.some((arg) => arg === "--api-key" || arg.startsWith("--api-key="))) {
    throw new CliError(
      EXIT_USAGE,
      "UNSAFE_CREDENTIAL_ARGUMENT",
      "API keys are accepted only through WEFT_API_KEY or --api-key-stdin",
    );
  }
}

function requestedHelp(args: string[]): Command | "all" | undefined {
  const isHelp = (value: string) => value === "--help" || value === "-h";
  if (args.length === 1 && isHelp(args[0])) return "all";
  if (
    args.length === 2 &&
    COMMANDS.includes(args[0] as Command) &&
    isHelp(args[1])
  ) {
    return args[0] as Command;
  }
  return undefined;
}

function helpData(command: Command | "all") {
  if (command !== "all") {
    return {
      command,
      ...COMMAND_HELP[command],
      global_options: GLOBAL_OPTIONS,
    };
  }
  return {
    usage: "weft <command> [options]",
    commands: COMMANDS.map((name) => ({ name, ...COMMAND_HELP[name] })),
    global_options: GLOBAL_OPTIONS,
    authentication: ["WEFT_API_KEY", "--api-key-stdin"],
    exit_codes: { success: 0, usage: 2, auth: 3, api: 4, internal: 5 },
  };
}

function parseArgs(args: string[]): ParsedArgs {
  let command: Command | undefined;
  let apiKeyStdin = false;
  let baseUrl: string | undefined;
  const positionals: string[] = [];
  const options = new Map<string, string | true | string[]>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--api-key-stdin") {
      apiKeyStdin = true;
    } else if (arg === "--base-url") {
      [baseUrl, index] = takeValue(args, index, arg);
    } else if (arg === "--global" || arg === "--raw") {
      options.set(arg.slice(2), true);
    } else if (arg.startsWith("--")) {
      const [value, nextIndex] = takeValue(args, index, arg);
      const name = arg.slice(2);
      if (name === "header") {
        const previous = options.get(name);
        if (typeof previous === "string") {
          options.set(name, [previous, value]);
        } else if (Array.isArray(previous)) {
          previous.push(value);
        } else {
          options.set(name, value);
        }
      } else {
        options.set(name, value);
      }
      index = nextIndex;
    } else if (!command) {
      if (!COMMANDS.includes(arg as Command)) {
        throw new CliError(
          EXIT_USAGE,
          "UNKNOWN_COMMAND",
          `Unknown command: ${arg}`,
        );
      }
      command = arg as Command;
    } else {
      positionals.push(arg);
    }
  }

  if (!command) {
    throw new CliError(
      EXIT_USAGE,
      "COMMAND_REQUIRED",
      "Command required: bootstrap, auth, me, balance, search, fetch, or purchases",
    );
  }

  return { command, apiKeyStdin, baseUrl, positionals, options };
}

function positiveInteger(
  value: string | true | string[] | undefined,
  option: string,
  maximum?: number,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new CliError(
      EXIT_USAGE,
      "INVALID_ARGUMENT",
      `${option} must be a positive integer`,
    );
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(
      EXIT_USAGE,
      "INVALID_ARGUMENT",
      `${option} must be a positive integer`,
    );
  }
  if (maximum != null && parsed > maximum) {
    throw new CliError(
      EXIT_USAGE,
      "INVALID_ARGUMENT",
      `${option} must be at most ${maximum}`,
    );
  }
  return parsed;
}

function requiredOption(
  options: Map<string, string | true | string[]>,
  name: string,
): string {
  const value = options.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new CliError(EXIT_USAGE, "MISSING_ARGUMENT", `--${name} is required`);
  }
  return value;
}

function fetchHeaders(
  raw: string | true | string[] | undefined,
  hasJsonBody: boolean,
): PaidFetchRequest["headers"] {
  const values =
    typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const headers: Record<string, string> = {};
  for (const rawHeader of values) {
    const colon = rawHeader.indexOf(":");
    if (colon <= 0) {
      throw new CliError(
        EXIT_USAGE,
        "INVALID_ARGUMENT",
        "--header must be Name:Value",
      );
    }
    headers[rawHeader.slice(0, colon).trim()] = rawHeader
      .slice(colon + 1)
      .trim();
  }
  if (
    hasJsonBody &&
    !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")
  ) {
    headers["content-type"] = "application/json";
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function baseApiUrl(
  baseUrl: string | undefined,
  env: Record<string, string | undefined>,
): string {
  const raw = baseUrl ?? env.WEFT_BASE_URL ?? WEFT_API_BASE;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function resolveApiKeyFromStored(
  credentials?: StoredCredentials,
): string | undefined {
  if (!credentials) return undefined;
  if (
    "access_token" in credentials &&
    typeof credentials.access_token === "string" &&
    credentials.access_token.trim()
  ) {
    return credentials.access_token;
  }
  if (
    "temporary_api_key" in credentials &&
    typeof credentials.temporary_api_key === "string" &&
    credentials.temporary_api_key.trim()
  ) {
    return credentials.temporary_api_key;
  }
  return undefined;
}

function isOAuthCredentials(
  credentials: StoredCredentials | undefined,
): credentials is OAuthCredentials {
  return Boolean(
    credentials && "type" in credentials && credentials.type === "oauth",
  );
}

function isLegacyBootstrapCredentials(
  credentials: StoredCredentials | undefined,
): credentials is LegacyBootstrapCredentials {
  return Boolean(
    credentials && "type" in credentials && credentials.type === "bootstrap",
  );
}

function oauthNeedsRefresh(credentials: OAuthCredentials): boolean {
  const expiry = Date.parse(credentials.expiry);
  return (
    !Number.isFinite(expiry) || expiry <= Date.now() + OAUTH_REFRESH_SKEW_MS
  );
}

async function refreshOAuthCredentials(
  fetchApi: typeof fetch,
  env: Record<string, string | undefined>,
  stored: OAuthCredentials,
): Promise<OAuthCredentials> {
  const token = await requestJson<OAuthTokenResponse>(
    fetchApi,
    `${stored.base_url}/oauth/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: stored.refresh_token,
        client_id: stored.client_id,
      }).toString(),
    },
    true,
  );
  const refreshed: OAuthCredentials = {
    ...stored,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    scope: token.scope,
    expiry: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  };
  await writeStoredCredentialsWhileLocked(env, refreshed);
  return refreshed;
}

function noSecretFields(data: object): Record<string, unknown> {
  return {
    ...data,
    temporary_api_key: undefined,
    access_token: undefined,
    refresh_token: undefined,
    client_secret: undefined,
  };
}

async function requestJson<T>(
  fetchApi: typeof fetch,
  url: string,
  init: RequestInit,
  redactError = false,
): Promise<T> {
  const response = await fetchApi(url, init);
  if (!response.ok) {
    if (redactError) {
      throw new CliError(
        response.status === 401 || response.status === 403
          ? EXIT_AUTH
          : response.status >= 500
            ? EXIT_INTERNAL
            : EXIT_API,
        "OAUTH_TOKEN_ERROR",
        `OAuth token request failed with HTTP ${response.status}`,
      );
    }
    throw new ResponseError(response);
  }

  return (await response.json()) as T;
}

function withCredentials(
  headers: Record<string, string>,
  apiKey: string,
): Record<string, string> {
  return {
    ...headers,
    authorization: `Bearer ${apiKey}`,
  };
}

function ensureOnly(
  options: Map<string, string | true | string[]>,
  allowed: string[],
): void {
  for (const name of options.keys()) {
    if (!allowed.includes(name)) {
      throw new CliError(
        EXIT_USAGE,
        "UNKNOWN_OPTION",
        `Unknown option: --${name}`,
      );
    }
  }
}

async function responseDetails(error: ResponseError): Promise<unknown> {
  try {
    return await error.response.json();
  } catch {
    return undefined;
  }
}

async function normalizeError(error: unknown): Promise<CliError> {
  if (error instanceof CliError) return error;
  if (error instanceof WeftError) {
    // status 0 is a transport failure with no API response; it exits like an
    // internal failure, not an API rejection.
    const exitCode =
      error.status === 401 || error.status === 403
        ? EXIT_AUTH
        : error.status >= 500 || error.status === 0
          ? EXIT_INTERNAL
          : EXIT_API;
    return new CliError(exitCode, error.code, error.message, error.details);
  }
  if (error instanceof ResponseError) {
    const details = await responseDetails(error);
    const body = details as
      | {
          error?: { code?: string; message?: string } | string;
          error_description?: string;
        }
      | undefined;
    const nested = typeof body?.error === "object" ? body.error : undefined;
    const code =
      nested?.code ??
      (typeof body?.error === "string"
        ? body.error
        : `HTTP_${error.response.status}`);
    const message =
      nested?.message ??
      body?.error_description ??
      `Weft API returned HTTP ${error.response.status}`;
    const exitCode =
      error.response.status === 401 || error.response.status === 403
        ? EXIT_AUTH
        : error.response.status >= 500
          ? EXIT_INTERNAL
          : EXIT_API;
    return new CliError(exitCode, code, message, details);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new CliError(EXIT_INTERNAL, "INTERNAL_ERROR", message);
}

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function defaultWriteOut(value: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // The write callback reports failure before the stream emits its error.
    // Keep the one-shot listener until that event to prevent an uncaught EPIPE.
    const onError = (error: Error) => reject(error);
    process.stdout.once("error", onError);
    process.stdout.write(value, (error) => {
      if (error) {
        reject(error);
      } else {
        process.stdout.removeListener("error", onError);
        resolve();
      }
    });
  });
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const outputWriter = dependencies.writeOut ?? defaultWriteOut;
  const writeErr =
    dependencies.writeErr ?? ((value) => process.stderr.write(value));
  let command = "unknown";
  let idempotencyKey: string | undefined;
  let schemaVersion = "1";
  let meta: Record<string, unknown> | undefined;
  let deliveryReceipt: Record<string, unknown> | undefined;
  const fetchApi = dependencies.fetchApi ?? fetch;
  const writeOut = async (value: string) => {
    try {
      await outputWriter(value);
    } catch {
      throw new CliError(
        EXIT_INTERNAL,
        command === "fetch" ? "RESULT_OUTPUT_FAILED" : "OUTPUT_FAILED",
        "Cannot write stdout. Use the saved result paths below if present. Otherwise keep this receipt and retry the same fetch with --idempotency-key and the same key.",
        deliveryReceipt === undefined
          ? undefined
          : { receipt: deliveryReceipt },
      );
    }
  };

  try {
    rejectUnsafeCredentialArgument(args);
    const help = requestedHelp(args);
    if (help !== undefined) {
      command = "help";
      await writeOut(
        `${JSON.stringify({
          schema_version: "1",
          ok: true,
          command,
          data: helpData(help),
        })}\n`,
      );
      return EXIT_SUCCESS;
    }

    const parsed = parseArgs(args);
    command = parsed.command;
    const env = dependencies.env ?? process.env;
    const baseUrl = baseApiUrl(parsed.baseUrl, env);

    if (parsed.command === "skill") {
      if (
        parsed.positionals[0] !== "install" ||
        parsed.positionals.length > 2
      ) {
        throw new CliError(
          EXIT_USAGE,
          "INVALID_ARGUMENT",
          "skill requires 'install' and accepts at most one Skill name",
        );
      }

      const skillName = parsed.positionals[1];
      if (skillName) {
        ensureOnly(parsed.options, ["agent", "global"]);
        const agent = requiredOption(parsed.options, "agent");
        if (!SKILL_NAME_PATTERN.test(skillName)) {
          throw new CliError(
            EXIT_USAGE,
            "INVALID_ARGUMENT",
            "Skill name must contain only lowercase letters, numbers, and single hyphens",
          );
        }
        if (CORE_SKILL_NAMES.has(skillName)) {
          throw new CliError(
            EXIT_USAGE,
            "INVALID_ARGUMENT",
            `Use 'weft skill install' without a name to install the core ${skillName} Skill`,
          );
        }
        if (!SKILL_NAME_PATTERN.test(agent)) {
          throw new CliError(
            EXIT_USAGE,
            "INVALID_ARGUMENT",
            "Agent name must contain only lowercase letters, numbers, and single hyphens",
          );
        }

        const processArgs = [
          "--yes",
          "skills",
          "add",
          "weftlabs/skills",
          "--skill",
          skillName,
          "--agent",
          agent,
          "--yes",
          ...(parsed.options.get("global") === true ? ["--global"] : []),
        ];
        const invocation = npxProcessInvocation(processArgs, dependencies, env);
        const result = await (dependencies.runProcess ?? defaultRunProcess)(
          invocation.executable,
          invocation.arguments,
        );
        if (result.exitCode !== 0) {
          const remediation = `npx ${processArgs.join(" ")}`;
          throw new CliError(
            EXIT_INTERNAL,
            "SKILL_INSTALL_FAILED",
            `Could not install ${skillName}. Run '${remediation}' directly for more detail.`,
            {
              executable: invocation.executable,
              arguments: invocation.arguments,
              exit_code: result.exitCode,
              stderr: result.stderr,
            },
          );
        }
        await writeOut(
          `${JSON.stringify({
            schema_version: "1",
            ok: true,
            command,
            data: {
              status: "installed",
              skill: skillName,
              agent,
              scope:
                parsed.options.get("global") === true ? "global" : "project",
            },
          })}\n`,
        );
        return EXIT_SUCCESS;
      }

      ensureOnly(parsed.options, []);
      const installSkill = await loadSkillInstaller();
      const result = await installSkill({ force: true });
      await writeOut(
        `${JSON.stringify({
          schema_version: "1",
          ok: true,
          command,
          data: {
            status: result.status,
            installed: result.installed,
            hosts: result.hosts,
            ...(result.reason === undefined ? {} : { reason: result.reason }),
            ...(result.warnings.length === 0
              ? {}
              : { warnings: result.warnings }),
          },
        })}\n`,
      );
      return EXIT_SUCCESS;
    }

    await installSkillInBackground();

    if (parsed.command === "bootstrap") {
      ensureOnly(parsed.options, ["email", "agent-name", "reason"]);
      if (parsed.positionals.length !== 0) {
        throw new CliError(
          EXIT_USAGE,
          "INVALID_ARGUMENT",
          "bootstrap does not accept positional arguments",
        );
      }
      const email = requiredOption(parsed.options, "email");
      const agentName = requiredOption(parsed.options, "agent-name");
      const reason = requiredOption(parsed.options, "reason");

      const bootstrap = await requestJson<BootstrapCreateResponse>(
        fetchApi,
        `${baseUrl}/api/v1/account_bootstraps`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            agent_name: agentName,
            host_name: OAUTH_HOST_NAME,
            reason,
          }),
        },
      );

      const stored: BootstrapCredentials = {
        ...bootstrap.data,
        base_url: baseUrl,
      };

      await writeStoredCredentials(env, stored);

      await writeOut(
        `${JSON.stringify({
          schema_version: "1",
          ok: true,
          command,
          data: noSecretFields(stored),
        })}\n`,
      );
      return EXIT_SUCCESS;
    }

    if (parsed.command === "auth") {
      ensureOnly(parsed.options, []);
      if (
        parsed.positionals.length !== 1 ||
        parsed.positionals[0] !== "status"
      ) {
        throw new CliError(
          EXIT_USAGE,
          "INVALID_ARGUMENT",
          "auth requires 'status'",
        );
      }

      const stored = await readStoredCredentials(env);
      if (isOAuthCredentials(stored)) {
        await writeOut(
          `${JSON.stringify({
            schema_version: "1",
            ok: true,
            command,
            data: {
              status: "consumed",
              authentication: "oauth",
              scope: stored.scope,
            },
          })}\n`,
        );
        return EXIT_SUCCESS;
      }
      if (isLegacyBootstrapCredentials(stored)) {
        const status = await requestJson<BootstrapStatus>(
          fetchApi,
          `${stored.base_url}/api/v1/account_bootstraps/${stored.bootstrap_id}`,
          {
            method: "GET",
            headers: withCredentials({}, stored.temporary_api_key),
          },
        );
        if (
          status.data.status !== "claimed" &&
          status.data.status !== "consumed"
        ) {
          await writeOut(
            `${JSON.stringify({
              schema_version: "1",
              ok: true,
              command,
              data: { status: status.data.status },
            })}\n`,
          );
          return EXIT_SUCCESS;
        }

        const token = await requestJson<OAuthTokenResponse>(
          fetchApi,
          `${stored.base_url}/oauth/token`,
          {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              device_code: stored.device_code,
              client_id: stored.client_id,
              name: "Weft CLI",
            }).toString(),
          },
          true,
        );
        const oauth: OAuthCredentials = {
          version: 1,
          type: "oauth",
          base_url: stored.base_url,
          client_id: stored.client_id,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          token_type: token.token_type,
          scope: token.scope,
          expiry: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        };
        const active = await withCredentialsLock(env, async () => {
          const current = await readStoredCredentials(env);
          if (isOAuthCredentials(current)) return current;
          if (
            !isLegacyBootstrapCredentials(current) ||
            JSON.stringify(current) !== JSON.stringify(stored)
          ) {
            throw new CliError(
              EXIT_AUTH,
              "CREDENTIALS_CHANGED",
              "Stored credentials changed; rerun auth status",
            );
          }
          await writeStoredCredentialsWhileLocked(env, oauth);
          return oauth;
        });
        await writeOut(
          `${JSON.stringify({
            schema_version: "1",
            ok: true,
            command,
            data: {
              status: "consumed",
              authentication: "oauth",
              scope: active.scope,
            },
          })}\n`,
        );
        return EXIT_SUCCESS;
      }
      if (!stored) {
        throw new CliError(
          EXIT_AUTH,
          "BOOTSTRAP_REQUIRED",
          "Run weft bootstrap before auth status",
        );
      }

      const status = await requestJson<BootstrapStatus>(
        fetchApi,
        `${stored.base_url}/api/v1/account_bootstraps/${stored.id}`,
        {
          method: "GET",
          headers: withCredentials({}, stored.temporary_api_key),
        },
      );

      const merged: BootstrapCredentials = {
        base_url: stored.base_url,
        id: status.data.id ?? stored.id,
        status: status.data.status,
        capabilities: status.data.capabilities ?? stored.capabilities,
        expires_at:
          status.data.expires_at === undefined
            ? stored.expires_at
            : status.data.expires_at,
        approval: status.data.approval ?? stored.approval,
        temporary_api_key: stored.temporary_api_key,
      };
      const active = await withCredentialsLock(env, async () => {
        const current = await readStoredCredentials(env);
        if (JSON.stringify(current) !== JSON.stringify(stored)) {
          throw new CliError(
            EXIT_AUTH,
            "CREDENTIALS_CHANGED",
            "Stored credentials changed; rerun auth status",
          );
        }
        await writeStoredCredentialsWhileLocked(env, merged);
        return merged;
      });

      await writeOut(
        `${JSON.stringify({
          schema_version: "1",
          ok: true,
          command,
          data: noSecretFields(active),
        })}\n`,
      );
      return EXIT_SUCCESS;
    }

    const rawKey = parsed.apiKeyStdin
      ? await (dependencies.readStdin ?? defaultReadStdin)()
      : env.WEFT_API_KEY;
    let apiKey = rawKey?.trim();
    let authenticatedBaseUrl = baseUrl;
    if (parsed.apiKeyStdin && !apiKey) {
      throw new CliError(
        EXIT_AUTH,
        "API_KEY_REQUIRED",
        "--api-key-stdin requires a non-empty API key",
      );
    }
    if (!apiKey && !parsed.apiKeyStdin) {
      let stored = await readStoredCredentials(env);
      if (isOAuthCredentials(stored) && oauthNeedsRefresh(stored)) {
        stored = await withCredentialsLock(env, async () => {
          const current = await readStoredCredentials(env);
          if (isOAuthCredentials(current) && oauthNeedsRefresh(current)) {
            return refreshOAuthCredentials(fetchApi, env, current);
          }
          return current;
        });
      }
      apiKey = resolveApiKeyFromStored(stored);
      if (stored) {
        authenticatedBaseUrl = stored.base_url;
      }
    }

    if (!apiKey) {
      throw new CliError(
        EXIT_AUTH,
        "API_KEY_REQUIRED",
        "Set WEFT_API_KEY, pass --api-key-stdin, or store credentials",
      );
    }

    const client = new WeftClient({
      apiKey,
      baseUrl: authenticatedBaseUrl,
      fetchApi,
    });

    let data: unknown;
    if (parsed.command === "me") {
      ensureOnly(parsed.options, []);
      data = await client.me();
    } else if (parsed.command === "balance") {
      ensureOnly(parsed.options, []);
      data = await client.balance();
    } else if (parsed.command === "search") {
      ensureOnly(parsed.options, ["max-results"]);
      if (parsed.positionals.length !== 1) {
        throw new CliError(
          EXIT_USAGE,
          "INVALID_ARGUMENT",
          "search requires exactly one query",
        );
      }
      data = await client.search({
        query: parsed.positionals[0],
        maxResults: positiveInteger(
          parsed.options.get("max-results"),
          "--max-results",
          50,
        ),
      });
    } else if (parsed.command === "fetch") {
      ensureOnly(parsed.options, [
        "max-cost-usd",
        "method",
        "body",
        "header",
        "idempotency-key",
        "raw",
      ]);
      const raw = parsed.options.has("raw");
      schemaVersion = raw ? "1" : "2";
      if (parsed.positionals.length !== 1) {
        throw new CliError(
          EXIT_USAGE,
          "INVALID_ARGUMENT",
          "fetch requires exactly one URL",
        );
      }
      const maxCostUsd = requiredOption(parsed.options, "max-cost-usd");
      if (!/^\d+(?:\.\d+)?$/.test(maxCostUsd)) {
        throw new CliError(
          EXIT_USAGE,
          "INVALID_ARGUMENT",
          "--max-cost-usd must be a non-negative decimal",
        );
      }
      const method = parsed.options.get("method");
      const rawBody = parsed.options.get("body");
      let body: PaidFetchRequest["body"];
      if (typeof rawBody === "string") {
        try {
          JSON.parse(rawBody);
        } catch {
          throw new CliError(
            EXIT_USAGE,
            "INVALID_ARGUMENT",
            "--body must be JSON",
          );
        }
        body = rawBody;
      }
      const headers = fetchHeaders(
        parsed.options.get("header"),
        typeof rawBody === "string",
      );
      const request: PaidFetchRequest = {
        url: parsed.positionals[0],
        maxCostUsd,
        method:
          typeof method === "string"
            ? (method.toUpperCase() as PaidFetchRequest["method"])
            : undefined,
        body,
        headers,
      };
      const explicitKey = parsed.options.get("idempotency-key");
      idempotencyKey =
        typeof explicitKey === "string"
          ? explicitKey
          : (dependencies.generateIdempotencyKey ?? randomUUID)();
      let resultDirectory: string | undefined;
      if (!raw) {
        try {
          resultDirectory = await reserveResultDirectory(env);
        } catch {
          throw new CliError(
            EXIT_INTERNAL,
            "RESULT_STORAGE_UNAVAILABLE",
            "Cannot reserve local result storage. Set WEFT_RESULTS_DIR to a directory you own that is writable only by you, with no symlink at that path, then retry. No fetch was sent.",
          );
        }
      }
      const response = await client.fetch(request, { idempotencyKey });
      meta = { idempotency_key: idempotencyKey };
      data = response;
      const { bodyBase64, ...receipt } = response;
      deliveryReceipt = receipt;
      if (resultDirectory) {
        const savedPath = join(resultDirectory, "body");
        const receiptPath = join(resultDirectory, "receipt.json");
        const bytes =
          typeof bodyBase64 === "string"
            ? Buffer.from(bodyBase64, "base64")
            : undefined;
        if (!bytes || bytes.toString("base64") !== bodyBase64) {
          throw new CliError(
            EXIT_INTERNAL,
            "RESULT_DECODE_FAILED",
            "Fetch returned invalid Base64. No body was saved. Keep this receipt and retry the same request with --idempotency-key and the same key; if it persists, report the artifact ID to support.",
            { receipt, file_complete: false },
          );
        }
        try {
          meta = {
            ...meta,
            saved_path: savedPath,
            receipt_path: receiptPath,
            byte_count: bytes.length,
          };
          await writeResultFile(
            receiptPath,
            `${JSON.stringify({ schema_version: "2", meta, data: receipt })}\n`,
          );
          await writeResultFile(savedPath, bytes);
          data = { ...receipt, ...readableBody(bytes, response.headers) };
        } catch {
          throw new CliError(
            EXIT_INTERNAL,
            "RESULT_STORAGE_FAILED",
            "Fetch returned, but local result delivery failed. Keep this receipt. Check local storage, then retry the same request with --idempotency-key and the key below. Do not use a new key.",
            {
              receipt,
              saved_path: savedPath,
              receipt_path: receiptPath,
              file_complete: false,
            },
          );
        }
      }
    } else {
      ensureOnly(parsed.options, ["page", "per-page"]);
      if (parsed.positionals.length > 1) {
        throw new CliError(
          EXIT_USAGE,
          "INVALID_ARGUMENT",
          "purchases accepts at most one purchase ID",
        );
      }
      data = parsed.positionals[0]
        ? await client.purchase(
            positiveInteger(parsed.positionals[0], "purchase ID")!,
          )
        : await client.purchases({
            page: positiveInteger(parsed.options.get("page"), "--page"),
            perPage: positiveInteger(
              parsed.options.get("per-page"),
              "--per-page",
              100,
            ),
          });
    }

    await writeOut(
      `${JSON.stringify({
        schema_version: schemaVersion,
        ok: true,
        command,
        ...(meta === undefined ? {} : { meta }),
        data,
      })}\n`,
    );
    return EXIT_SUCCESS;
  } catch (error) {
    const normalized = await normalizeError(error);
    writeErr(
      `${JSON.stringify({
        schema_version: schemaVersion,
        ok: false,
        command,
        ...(idempotencyKey === undefined
          ? {}
          : { meta: { ...meta, idempotency_key: idempotencyKey } }),
        error: {
          code: normalized.code,
          message: normalized.message,
          ...(normalized.details === undefined
            ? {}
            : { details: normalized.details }),
        },
      })}\n`,
    );
    return normalized.exitCode;
  }
}
