import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  EXIT_API,
  EXIT_AUTH,
  EXIT_INTERNAL,
  EXIT_SUCCESS,
  EXIT_USAGE,
  runCli,
} from "../src/cli";
import { resolveCredentialsPath } from "../src/credentials";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    writeOut: (value: string) => out.push(value),
    writeErr: (value: string) => err.push(value),
  };
}

describe("weft CLI", () => {
  it("is the sole package owner of the weft executable", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(packageJson.bin).toEqual({ weft: "./bin/weft.mjs" });
    expect(packageJson.dependencies).toEqual({
      "@weftlabs/sdk": "workspace:*",
    });
  });

  it("never accepts an API key in argv", async () => {
    const io = capture();
    const code = await runCli(["balance", "--api-key", "wk_secret"], {
      ...io,
      env: {},
    });
    expect(code).toBe(EXIT_USAGE);
    expect(io.err.join("")).not.toContain("wk_secret");
    expect(JSON.parse(io.err[0])).toMatchObject({
      schema_version: "1",
      error: { code: "UNSAFE_CREDENTIAL_ARGUMENT" },
    });
  });

  it("describes all commands as machine-readable JSON without authentication", async () => {
    const io = capture();
    const code = await runCli(["--help"], { ...io, env: {} });

    expect(code).toBe(EXIT_SUCCESS);
    expect(io.err).toEqual([]);
    expect(JSON.parse(io.out[0])).toMatchObject({
      schema_version: "1",
      ok: true,
      command: "help",
      data: {
        usage: "weft <command> [options]",
        commands: [
          { name: "bootstrap" },
          { name: "auth" },
          { name: "skill" },
          { name: "me" },
          { name: "balance" },
          { name: "search" },
          { name: "fetch" },
          { name: "purchases" },
        ],
        authentication: ["WEFT_API_KEY", "--api-key-stdin"],
        exit_codes: { success: 0, usage: 2, auth: 3, api: 4, internal: 5 },
      },
    });
  });

  it("describes each command without authentication or a network call", async () => {
    const fetchApi = vi.fn();
    for (const command of [
      "bootstrap",
      "auth",
      "skill",
      "me",
      "balance",
      "search",
      "fetch",
      "purchases",
    ]) {
      const io = capture();
      expect(
        await runCli([command, "--help"], { ...io, env: {}, fetchApi }),
      ).toBe(EXIT_SUCCESS);
      expect(JSON.parse(io.out[0])).toMatchObject({
        schema_version: "1",
        ok: true,
        command: "help",
        data: { command },
      });
    }
    expect(fetchApi).not.toHaveBeenCalled();
  });

  it("bootstraps with single create request and stores bootstrap data atomically", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-bootstrap-"));
    const credFile = join(dir, "credentials.json");
    const io = capture();
    const responses = [
      {
        data: {
          id: "boot-id",
          status: "pending",
          capabilities: ["search", "status", "cancel"],
          expires_at: "2026-01-01T00:00:00Z",
          temporary_api_key: "temp-api-key-123",
          approval: {
            method: "email_link",
            interval: 42,
            expires_in: 1200,
            user_code: "ABCD-1234",
          },
        },
      },
    ];
    const fetchApi = vi
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) => {
        expect(_url).toBe("https://api.example/api/v1/account_bootstraps");
        const body = (init.body as string) ?? "";
        const item = responses.shift()!;
        if (_url.includes("/api/v1/account_bootstraps")) {
          const parsed = JSON.parse(body);
          expect(parsed.host_name).toBe("Weft CLI");
          expect(parsed.oauth_client_id).toBeUndefined();
          expect(parsed.requested_scopes).toBeUndefined();
          expect(parsed.oauth_client_name).toBeUndefined();
          expect(_url).toBe("https://api.example/api/v1/account_bootstraps");
        }

        return new Response(JSON.stringify(item), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

    const code = await runCli(
      [
        "bootstrap",
        "--email",
        "agent@example",
        "--agent-name",
        "agent-name",
        "--reason",
        "demo",
        "--base-url",
        "https://api.example",
      ],
      {
        ...io,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        fetchApi,
      },
    );

    expect(code).toBe(EXIT_SUCCESS);
    expect(fetchApi).toHaveBeenCalledTimes(1);
    const output = JSON.parse(io.out[0]);
    expect(output.data.status).toBe("pending");
    expect(output.data).not.toHaveProperty("temporary_api_key");
    expect(output.data).toHaveProperty("approval");

    const saved = JSON.parse(readFileSync(credFile, "utf8"));
    expect(saved).toMatchObject({
      base_url: "https://api.example",
      id: "boot-id",
      status: "pending",
      capabilities: ["search", "status", "cancel"],
      expires_at: "2026-01-01T00:00:00Z",
      approval: {
        interval: 42,
      },
      temporary_api_key: "temp-api-key-123",
    });
    expect(saved).not.toHaveProperty("type");
    expect(saved).not.toHaveProperty("bootstrap_id");
    expect(saved).not.toHaveProperty("device_code");
    expect(saved).not.toHaveProperty("client_id");
    expect(saved).not.toHaveProperty("polling_interval");
    const fileMode = statSync(credFile).mode & 0o777;
    const parentMode = statSync(dir).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(parentMode).toBe(0o700);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses USERPROFILE for the default credential path on Windows", () => {
    expect(resolveCredentialsPath({ USERPROFILE: "C:/Users/agent" })).toBe(
      "C:/Users/agent/.config/weft/credentials.json",
    );
  });

  it("rejects an argv credential even when help is requested", async () => {
    const io = capture();
    expect(
      await runCli(["balance", "--help", "--api-key", "wk_secret"], {
        ...io,
        env: {},
      }),
    ).toBe(EXIT_USAGE);
    expect(io.out).toEqual([]);
    expect(io.err.join("")).not.toContain("wk_secret");
    expect(JSON.parse(io.err[0]).error.code).toBe("UNSAFE_CREDENTIAL_ARGUMENT");
  });

  it("requires an environment or stdin credential", async () => {
    const io = capture();
    expect(await runCli(["me"], { ...io, env: {} })).toBe(EXIT_AUTH);
    expect(JSON.parse(io.err[0]).error.code).toBe("API_KEY_REQUIRED");
  });

  it("uses stored bootstrap temporary key for normal commands", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-stored-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        base_url: "https://api.example",
        id: "boot-id",
        status: "pending",
        capabilities: ["search", "status", "cancel"],
        expires_at: "2026-01-01T00:00:00Z",
        approval: {
          method: "email_link",
          expires_in: 1200,
          interval: 7,
        },
        temporary_api_key: "stored-temp-key",
      }),
    );

    const io = capture();
    const fetchApi = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            principal_type: "agent",
            id: 999,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );

    expect(
      await runCli(["--base-url", "https://runtime.example", "me"], {
        ...io,
        env: {
          WEFT_CREDENTIALS_FILE: credFile,
          WEFT_BASE_URL: "https://fallback.example",
          WEFT_API_KEY: "",
          HOME: "",
        },
        fetchApi,
      }),
    ).toBe(EXIT_SUCCESS);
    const auth = new Headers(fetchApi.mock.calls[0][1]?.headers).get(
      "authorization",
    );
    expect(auth).toBe("Bearer stored-temp-key");
    expect(fetchApi.mock.calls[0][0]).toBe("https://api.example/api/v1/me");
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not fall back to stored credentials for empty API key stdin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-empty-stdin-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        base_url: "https://api.example",
        id: "boot-id",
        status: "pending",
        capabilities: ["search", "status", "cancel"],
        expires_at: "2026-01-01T00:00:00Z",
        approval: {
          method: "email_link",
          expires_in: 1200,
          interval: 7,
        },
        temporary_api_key: "stored-temp-key",
      }),
    );
    const io = capture();
    const fetchApi = vi.fn();

    expect(
      await runCli(["me", "--api-key-stdin"], {
        ...io,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        readStdin: async () => "\n",
        fetchApi,
      }),
    ).toBe(EXIT_AUTH);
    expect(JSON.parse(io.err[0]).error.code).toBe("API_KEY_REQUIRED");
    expect(fetchApi).not.toHaveBeenCalled();
    rmSync(dir, { recursive: true, force: true });
  });

  it("checks auth status and returns pending", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-auth-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        base_url: "https://api.example",
        id: "boot-id",
        status: "pending",
        capabilities: ["search", "status", "cancel"],
        expires_at: "2026-01-01T00:00:00Z",
        approval: {
          method: "email_link",
          expires_in: 1200,
          interval: 7,
        },
        temporary_api_key: "stored-temp-key",
      }),
    );

    const io = capture();
    const fetchApi = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              id: "boot-id",
              status: "pending",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );

    expect(
      await runCli(
        ["auth", "status", "--base-url", "https://cli-arg.example"],
        {
          ...io,
          env: { WEFT_CREDENTIALS_FILE: credFile },
          fetchApi,
        },
      ),
    ).toBe(EXIT_SUCCESS);
    expect(JSON.parse(io.out[0])).toMatchObject({
      ok: true,
      data: {
        id: "boot-id",
        status: "pending",
      },
    });
    expect(fetchApi).toHaveBeenCalledWith(
      "https://api.example/api/v1/account_bootstraps/boot-id",
      expect.objectContaining({ method: "GET" }),
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("completes an in-flight bootstrap saved by the legacy CLI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-auth-legacy-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        version: 1,
        type: "bootstrap",
        base_url: "https://api.example",
        bootstrap_id: "legacy-boot-id",
        temporary_api_key: "legacy-temp-key",
        device_code: "legacy-device-code",
        client_id: "legacy-client-id",
        expiry: "2026-08-22T15:00:00Z",
        polling_interval: 5,
      }),
    );

    const io = capture();
    const fetchApi = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        expect(new Headers(init.headers).get("authorization")).toBe(
          "Bearer legacy-temp-key",
        );
        return new Response(JSON.stringify({ data: { status: "consumed" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        expect(init.body?.toString()).toBe(
          "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&device_code=legacy-device-code&client_id=legacy-client-id&name=Weft+CLI",
        );
        return new Response(
          JSON.stringify({
            access_token: "legacy-access-token",
            refresh_token: "legacy-refresh-token",
            token_type: "Bearer",
            scope: "balance fetch search",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      });

    expect(
      await runCli(["auth", "status"], {
        ...io,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        fetchApi,
      }),
    ).toBe(EXIT_SUCCESS);
    expect(fetchApi.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example/api/v1/account_bootstraps/legacy-boot-id",
      "https://api.example/oauth/token",
    ]);
    expect(JSON.parse(io.out[0])).toMatchObject({
      ok: true,
      data: {
        status: "consumed",
        authentication: "oauth",
        scope: "balance fetch search",
      },
    });
    expect(JSON.stringify(io)).not.toContain("legacy-access-token");
    expect(JSON.parse(readFileSync(credFile, "utf8"))).toMatchObject({
      type: "oauth",
      base_url: "https://api.example",
      client_id: "legacy-client-id",
      access_token: "legacy-access-token",
      refresh_token: "legacy-refresh-token",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not replace credentials written during a legacy exchange", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-auth-legacy-race-"));
    const credFile = join(dir, "credentials.json");
    const legacy = {
      version: 1,
      type: "bootstrap",
      base_url: "https://legacy.example",
      bootstrap_id: "legacy-boot-id",
      temporary_api_key: "legacy-temp-key",
      device_code: "legacy-device-code",
      client_id: "legacy-client-id",
      expiry: "2026-08-22T15:00:00Z",
      polling_interval: 5,
    };
    const replacement = {
      base_url: "https://new.example",
      id: "new-boot-id",
      status: "pending",
      capabilities: ["search", "status", "cancel"],
      expires_at: "2026-08-22T16:00:00Z",
      approval: { method: "email_link", expires_in: 1800, interval: 5 },
      temporary_api_key: "new-temp-key",
    };
    writeFileSync(credFile, JSON.stringify(legacy));

    const io = capture();
    const fetchApi = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { status: "consumed" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementationOnce(async () => {
        writeFileSync(credFile, JSON.stringify(replacement));
        return new Response(
          JSON.stringify({
            access_token: "stale-access-token",
            refresh_token: "stale-refresh-token",
            token_type: "Bearer",
            scope: "balance fetch search",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      });

    expect(
      await runCli(["auth", "status"], {
        ...io,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        fetchApi,
      }),
    ).toBe(EXIT_AUTH);
    expect(JSON.parse(io.err[0]).error.code).toBe("CREDENTIALS_CHANGED");
    expect(JSON.parse(readFileSync(credFile, "utf8"))).toEqual(replacement);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not restore stale status over a new bootstrap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-auth-status-race-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        base_url: "https://old.example",
        id: "old-boot-id",
        status: "pending",
        capabilities: ["search", "status", "cancel"],
        expires_at: "2026-08-22T15:00:00Z",
        approval: { method: "email_link", expires_in: 1800, interval: 5 },
        temporary_api_key: "old-temp-key",
      }),
    );

    let statusStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      statusStarted = resolve;
    });
    let finishStatus!: (response: Response) => void;
    const statusResponse = new Promise<Response>((resolve) => {
      finishStatus = resolve;
    });
    const statusIo = capture();
    const statusRun = runCli(["auth", "status"], {
      ...statusIo,
      env: { WEFT_CREDENTIALS_FILE: credFile },
      fetchApi: vi.fn(async () => {
        statusStarted();
        return statusResponse;
      }),
    });
    await started;

    const bootstrapIo = capture();
    expect(
      await runCli(
        [
          "bootstrap",
          "--email",
          "agent@example.com",
          "--agent-name",
          "Agent",
          "--reason",
          "Test",
          "--base-url",
          "https://new.example",
        ],
        {
          ...bootstrapIo,
          env: { WEFT_CREDENTIALS_FILE: credFile },
          fetchApi: vi.fn(
            async () =>
              new Response(
                JSON.stringify({
                  data: {
                    id: "new-boot-id",
                    status: "pending",
                    capabilities: ["search", "status", "cancel"],
                    expires_at: "2026-08-22T16:00:00Z",
                    approval: {
                      method: "email_link",
                      expires_in: 1800,
                      interval: 5,
                    },
                    temporary_api_key: "new-temp-key",
                  },
                }),
                {
                  status: 201,
                  headers: { "content-type": "application/json" },
                },
              ),
          ),
        },
      ),
    ).toBe(EXIT_SUCCESS);

    finishStatus(
      new Response(
        JSON.stringify({
          data: {
            id: "old-boot-id",
            status: "claimed",
            capabilities: ["identity", "search", "balance"],
            expires_at: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    expect(await statusRun).toBe(EXIT_AUTH);
    expect(JSON.parse(statusIo.err[0]).error.code).toBe("CREDENTIALS_CHANGED");
    expect(JSON.parse(readFileSync(credFile, "utf8"))).toMatchObject({
      base_url: "https://new.example",
      id: "new-boot-id",
      temporary_api_key: "new-temp-key",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the same bootstrap token after claim and writes merged status", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-auth-claimed-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        base_url: "https://api.example",
        id: "boot-id",
        status: "pending",
        capabilities: ["search", "status", "cancel"],
        expires_at: "2026-01-01T00:00:00Z",
        approval: {
          method: "email_link",
          expires_in: 1200,
          interval: 7,
        },
        temporary_api_key: "stored-temp-key",
      }),
    );

    const io = capture();
    const fetchApi = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        if (url.includes("/api/v1/account_bootstraps/")) {
          expect((init.headers as Record<string, string>).authorization).toBe(
            "Bearer stored-temp-key",
          );
          return new Response(
            JSON.stringify({
              data: {
                id: "boot-id",
                status: "claimed",
                capabilities: [
                  "identity",
                  "search",
                  "balance",
                  "fetch",
                  "purchases",
                  "status",
                  "revoke",
                ],
                expires_at: null,
                approval: {
                  method: "email_link",
                  expires_in: 0,
                  interval: 11,
                },
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        throw new Error(`unexpected url: ${url}`);
      });

    expect(
      await runCli(["auth", "status"], {
        ...io,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        fetchApi,
      }),
    ).toBe(EXIT_SUCCESS);
    const output = JSON.parse(io.out[0]);
    expect(output.data).toMatchObject({
      id: "boot-id",
      status: "claimed",
      capabilities: [
        "identity",
        "search",
        "balance",
        "fetch",
        "purchases",
        "status",
        "revoke",
      ],
      expires_at: null,
      approval: {
        interval: 11,
      },
    });
    expect(JSON.stringify(output)).not.toContain("stored-temp-key");

    const after = JSON.parse(readFileSync(credFile, "utf8"));
    expect(after).toMatchObject({
      id: "boot-id",
      status: "claimed",
      capabilities: [
        "identity",
        "search",
        "balance",
        "fetch",
        "purchases",
        "status",
        "revoke",
      ],
      temporary_api_key: "stored-temp-key",
    });

    const repeated = capture();
    const repeatedFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              id: "boot-id",
              status: "claimed",
              capabilities: [
                "identity",
                "search",
                "balance",
                "fetch",
                "purchases",
                "status",
                "revoke",
              ],
              expires_at: null,
              approval: {
                method: "email_link",
                expires_in: 0,
                interval: 11,
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    expect(
      await runCli(["auth", "status"], {
        ...repeated,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        fetchApi: repeatedFetch,
      }),
    ).toBe(EXIT_SUCCESS);
    expect(JSON.parse(repeated.out[0])).toMatchObject({
      ok: true,
      data: { status: "claimed" },
    });
    expect(repeatedFetch).toHaveBeenCalledTimes(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("treats revoked bootstrap status as an authentication failure without printing the bearer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-auth-revoked-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        base_url: "https://api.example",
        id: "boot-id",
        status: "claimed",
        capabilities: [
          "identity",
          "search",
          "balance",
          "fetch",
          "purchases",
          "status",
          "revoke",
        ],
        expires_at: null,
        approval: {
          method: "email_link",
          expires_in: 0,
          interval: 7,
        },
        temporary_api_key: "revoked-bootstrap-secret",
      }),
    );
    const io = capture();

    expect(
      await runCli(["auth", "status"], {
        ...io,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        fetchApi: async () =>
          new Response(
            JSON.stringify({
              error: { code: "unauthorized", message: "Invalid credential" },
            }),
            { status: 401, headers: { "content-type": "application/json" } },
          ),
      }),
    ).toBe(EXIT_AUTH);
    expect(io.out).toEqual([]);
    expect(io.err.join(" ")).not.toContain("revoked-bootstrap-secret");
    rmSync(dir, { recursive: true, force: true });
  });

  it("refreshes OAuth credentials with an invalid expiry before an API call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-refresh-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        version: 1,
        type: "oauth",
        base_url: "https://api.example",
        client_id: "client-id",
        access_token: "expired-access-token",
        refresh_token: "old-refresh-token",
        token_type: "Bearer",
        scope: "balance fetch search",
        expiry: "not-a-date",
      }),
    );
    const io = capture();
    const fetchApi = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        if (url === "https://api.example/oauth/token") {
          const form = new URLSearchParams(init.body as string);
          expect(form.get("grant_type")).toBe("refresh_token");
          expect(form.get("refresh_token")).toBe("old-refresh-token");
          expect(form.get("client_id")).toBe("client-id");
          return new Response(
            JSON.stringify({
              access_token: "new-access-token",
              refresh_token: "new-refresh-token",
              token_type: "Bearer",
              expires_in: 1200,
              scope: "balance fetch search",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        expect(new Headers(init.headers).get("authorization")).toBe(
          "Bearer new-access-token",
        );
        return new Response(JSON.stringify({ data: { id: 16 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

    expect(
      await runCli(["me"], {
        ...io,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        fetchApi,
      }),
    ).toBe(EXIT_SUCCESS);
    expect(fetchApi).toHaveBeenCalledTimes(2);
    expect(io.out.join("")).not.toContain("new-access-token");
    expect(io.out.join("")).not.toContain("new-refresh-token");
    expect(JSON.parse(readFileSync(credFile, "utf8"))).toMatchObject({
      client_id: "client-id",
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not print secrets returned by a failed OAuth refresh", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-refresh-error-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        version: 1,
        type: "oauth",
        base_url: "https://api.example",
        client_id: "client-id",
        access_token: "expired-access-token",
        refresh_token: "old-refresh-token",
        token_type: "Bearer",
        scope: "balance fetch search",
        expiry: "not-a-date",
      }),
    );
    const io = capture();
    const fetchApi = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "old-refresh-token was rejected",
            refresh_token: "server-echoed-refresh-token",
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    );

    expect(
      await runCli(["me"], {
        ...io,
        env: { WEFT_CREDENTIALS_FILE: credFile },
        fetchApi,
      }),
    ).toBe(EXIT_AUTH);
    expect(JSON.parse(io.err[0])).toMatchObject({
      error: {
        code: "OAUTH_TOKEN_ERROR",
        message: "OAuth token request failed with HTTP 401",
      },
    });
    expect(io.err.join(" ")).not.toContain("old-refresh-token");
    expect(io.err.join(" ")).not.toContain("server-echoed-refresh-token");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rotates one refresh token only once across concurrent commands", async () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-cli-refresh-race-"));
    const credFile = join(dir, "credentials.json");
    writeFileSync(
      credFile,
      JSON.stringify({
        version: 1,
        type: "oauth",
        base_url: "https://api.example",
        client_id: "client-id",
        access_token: "expired-access-token",
        refresh_token: "old-refresh-token",
        token_type: "Bearer",
        scope: "balance fetch search",
        expiry: "2020-01-01T00:00:00.000Z",
      }),
    );
    let releaseRefresh!: () => void;
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    const refreshReleased = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshCalls = 0;
    const fetchApi = vi.fn(async (url: string, init: RequestInit) => {
      if (url === "https://api.example/oauth/token") {
        refreshCalls += 1;
        markRefreshStarted();
        await refreshReleased;
        return new Response(
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            token_type: "Bearer",
            expires_in: 1200,
            scope: "balance fetch search",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      expect(new Headers(init.headers).get("authorization")).toBe(
        "Bearer new-access-token",
      );
      return new Response(JSON.stringify({ data: { id: 16 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const dependencies = {
      env: { WEFT_CREDENTIALS_FILE: credFile },
      fetchApi,
    };

    const first = runCli(["me"], { ...capture(), ...dependencies });
    await refreshStarted;
    const second = runCli(["me"], { ...capture(), ...dependencies });
    releaseRefresh();

    expect(await Promise.all([first, second])).toEqual([
      EXIT_SUCCESS,
      EXIT_SUCCESS,
    ]);
    expect(refreshCalls).toBe(1);
    expect(fetchApi).toHaveBeenCalledTimes(3);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses stdin auth and emits a stable success envelope", async () => {
    const io = capture();
    const fetchApi = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { principal_type: "user", id: 1 } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const code = await runCli(
      ["me", "--api-key-stdin", "--base-url", "https://api.example"],
      {
        ...io,
        env: {},
        readStdin: async () => "wk_stdin\n",
        fetchApi,
      },
    );
    expect(code).toBe(EXIT_SUCCESS);
    expect(JSON.parse(io.out[0])).toMatchObject({
      schema_version: "1",
      ok: true,
      command: "me",
    });
    expect(
      new Headers(fetchApi.mock.calls[0][1]?.headers).get("authorization"),
    ).toBe("Bearer wk_stdin");
  });

  it("requires a fetch cost and generates an idempotency key", async () => {
    const missing = capture();
    expect(
      await runCli(["fetch", "https://merchant.example"], {
        ...missing,
        env: { WEFT_API_KEY: "wk_test" },
      }),
    ).toBe(EXIT_USAGE);

    const io = capture();
    const fetchApi = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 200,
            headers: {},
            body_base64: "",
            paid_usd: "0",
            held_usd: "0",
            payment_status: "free",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    expect(
      await runCli(
        [
          "fetch",
          "https://merchant.example",
          "--max-cost-usd",
          "0.10",
          "--raw",
        ],
        {
          ...io,
          env: {
            WEFT_API_KEY: "wk_test",
            WEFT_BASE_URL: "https://api.example",
          },
          fetchApi,
          generateIdempotencyKey: () => "generated-key",
        },
      ),
    ).toBe(EXIT_SUCCESS);
    expect(
      new Headers(fetchApi.mock.calls[0][1]?.headers).get("idempotency-key"),
    ).toBe("generated-key");
    expect(JSON.parse(io.out[0]).meta).toEqual({
      idempotency_key: "generated-key",
    });
  });

  it("forwards --body JSON and --header on fetch", async () => {
    const io = capture();
    const fetchApi = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 200,
            headers: {},
            body_base64: "",
            paid_usd: "0",
            held_usd: "0",
            payment_status: "free",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    expect(
      await runCli(
        [
          "fetch",
          "https://win.oneshotagent.com/v1/tools/enrich/profile",
          "--max-cost-usd",
          "0.05",
          "--method",
          "POST",
          "--body",
          '{"linkedin_url":"https://www.linkedin.com/in/x/"}',
          "--header",
          "X-Agent-ID: agent-1",
          "--raw",
        ],
        {
          ...io,
          env: {
            WEFT_API_KEY: "wk_test",
            WEFT_BASE_URL: "https://api.example",
          },
          fetchApi,
          generateIdempotencyKey: () => "body-key",
        },
      ),
    ).toBe(EXIT_SUCCESS);
    const sent = JSON.parse(String(fetchApi.mock.calls[0][1]?.body ?? "{}"));
    expect(sent.method).toBe("POST");
    expect(sent.body).toBe('{"linkedin_url":"https://www.linkedin.com/in/x/"}');
    expect(sent.headers).toEqual({ "X-Agent-ID": "agent-1" });
  });

  it("returns the paid-fetch retry identity after an uncertain failure", async () => {
    const io = capture();
    const fetchApi = vi.fn(async () => {
      throw new Error("request timed out");
    });

    expect(
      await runCli(
        [
          "fetch",
          "https://merchant.example",
          "--max-cost-usd",
          "0.10",
          "--raw",
        ],
        {
          ...io,
          env: { WEFT_API_KEY: "wk_test" },
          fetchApi,
          generateIdempotencyKey: () => "retry-after-timeout",
        },
      ),
    ).toBe(EXIT_INTERNAL);
    expect(
      new Headers(fetchApi.mock.calls[0][1]?.headers).get("idempotency-key"),
    ).toBe("retry-after-timeout");
    expect(JSON.parse(io.err[0])).toMatchObject({
      ok: false,
      command: "fetch",
      error: { code: "NETWORK_ERROR" },
      meta: { idempotency_key: "retry-after-timeout" },
    });
  });

  it("preserves API error details and maps auth status to exit 3", async () => {
    const io = capture();
    const fetchApi = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "POLICY_VIOLATION", message: "limit reached" },
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );
    const code = await runCli(["balance"], {
      ...io,
      env: { WEFT_API_KEY: "wk_test" },
      fetchApi,
    });
    expect(code).toBe(EXIT_AUTH);
    expect(JSON.parse(io.err[0])).toMatchObject({
      schema_version: "1",
      ok: false,
      command: "balance",
      error: { code: "POLICY_VIOLATION", message: "limit reached" },
    });
  });

  it("maps other 4xx to exit 4 and 5xx to exit 5", async () => {
    for (const [status, exitCode] of [
      [422, EXIT_API],
      [502, EXIT_INTERNAL],
    ] as const) {
      const io = capture();
      const code = await runCli(["search", "weather"], {
        ...io,
        env: { WEFT_API_KEY: "wk_test" },
        fetchApi: async () =>
          new Response(JSON.stringify({ error: "UPSTREAM_ERROR" }), {
            status,
            headers: { "content-type": "application/json" },
          }),
      });
      expect(code).toBe(exitCode);
    }
  });

  it("enforces search and pagination bounds before calling the API", async () => {
    const fetchApi = vi.fn();
    for (const args of [
      ["search", "weather", "--max-results", "51"],
      ["purchases", "--per-page", "101"],
    ]) {
      const io = capture();
      expect(
        await runCli(args, {
          ...io,
          env: { WEFT_API_KEY: "wk_test" },
          fetchApi,
        }),
      ).toBe(EXIT_USAGE);
    }
    expect(fetchApi).not.toHaveBeenCalled();
  });

  it("exposes skill install and rejects any other skill argument", async () => {
    const help = capture();
    expect(await runCli(["--help"], { ...help, env: {} })).toBe(EXIT_SUCCESS);
    const commands = JSON.parse(help.out.join("")).data.commands.map(
      (entry: { name: string }) => entry.name,
    );
    expect(commands).toContain("skill");

    const fetchApi = vi.fn();
    for (const args of [
      ["skill"],
      ["skill", "uninstall"],
      ["skill", "a", "b"],
    ]) {
      const io = capture();
      expect(await runCli(args, { ...io, env: {}, fetchApi })).toBe(EXIT_USAGE);
      expect(JSON.parse(io.err.join("")).error.code).toBe("INVALID_ARGUMENT");
    }
    expect(fetchApi).not.toHaveBeenCalled();
  });

  it("installs one optional workflow without Weft authentication", async () => {
    const io = capture();
    const runProcess = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "installed",
      stderr: "",
    });

    expect(
      await runCli(
        [
          "skill",
          "install",
          "weft-flights-search",
          "--agent",
          "codex",
          "--global",
        ],
        { ...io, env: {}, runProcess, platform: "darwin" },
      ),
    ).toBe(EXIT_SUCCESS);

    expect(runProcess).toHaveBeenCalledWith("npx", [
      "--yes",
      "skills",
      "add",
      "weftlabs/skills",
      "--skill",
      "weft-flights-search",
      "--agent",
      "codex",
      "--yes",
      "--global",
    ]);
    expect(JSON.parse(io.out.join(""))).toMatchObject({
      schema_version: "1",
      ok: true,
      command: "skill",
      data: {
        status: "installed",
        skill: "weft-flights-search",
        agent: "codex",
        scope: "global",
      },
    });
  });

  it("uses Node to run the npx program on Windows without a shell", async () => {
    const io = capture();
    const runProcess = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "installed",
      stderr: "",
    });
    const nodeExecutable = "C:\\Program Files\\nodejs\\node.exe";
    const npxCliPath =
      "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js";

    expect(
      await runCli(
        ["skill", "install", "weft-flights-search", "--agent", "codex"],
        {
          ...io,
          env: {},
          runProcess,
          platform: "win32",
          nodeExecutable,
          npxCliPath,
        },
      ),
    ).toBe(EXIT_SUCCESS);

    expect(runProcess).toHaveBeenCalledWith(nodeExecutable, [
      npxCliPath,
      "--yes",
      "skills",
      "add",
      "weftlabs/skills",
      "--skill",
      "weft-flights-search",
      "--agent",
      "codex",
      "--yes",
    ]);
  });

  it("validates optional workflow installs before starting a process", async () => {
    const runProcess = vi.fn();
    for (const args of [
      ["skill", "install", "weft-flights-search"],
      ["skill", "install", "weft-flights-search", "--agent", "Bad Agent"],
      ["skill", "install", "../private", "--agent", "codex"],
      ["skill", "install", "weft", "--agent", "codex"],
      ["skill", "install", "weft-setup", "--agent", "codex"],
    ]) {
      const io = capture();
      expect(await runCli(args, { ...io, env: {}, runProcess })).toBe(
        EXIT_USAGE,
      );
      expect(JSON.parse(io.err.join("")).error.message).toBeTruthy();
    }
    expect(runProcess).not.toHaveBeenCalled();
  });

  it("returns an actionable typed error when workflow installation fails", async () => {
    const io = capture();
    const runProcess = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "No matching skill",
    });

    expect(
      await runCli(
        ["skill", "install", "missing-skill", "--agent", "codex", "--global"],
        { ...io, env: {}, runProcess, platform: "darwin" },
      ),
    ).toBe(EXIT_INTERNAL);

    const error = JSON.parse(io.err.join(""));
    expect(error).toMatchObject({
      schema_version: "1",
      ok: false,
      command: "skill",
      error: {
        code: "SKILL_INSTALL_FAILED",
        message: expect.stringContaining("npx --yes skills add"),
        details: {
          executable: "npx",
          arguments: [
            "--yes",
            "skills",
            "add",
            "weftlabs/skills",
            "--skill",
            "missing-skill",
            "--agent",
            "codex",
            "--yes",
            "--global",
          ],
          exit_code: 1,
          stderr: "No matching skill",
        },
      },
    });
    expect(error.error.message).toContain("--global");
  });
});
