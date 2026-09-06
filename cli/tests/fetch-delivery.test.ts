import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_INTERNAL, EXIT_SUCCESS, runCli } from "../src/cli";

const roots: string[] = [];
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "weft-delivery-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const args = [
  "fetch",
  "https://merchant.example/data",
  "--max-cost-usd",
  "0.10",
];
const receipt = {
  status: 200,
  paid_usd: "0.00",
  held_usd: "0.000892",
  payment_status: "pending",
  tx_hash: null,
  protocol: "x402",
  artifact_id: 42,
};
function fixture(
  bytes: Buffer,
  headers: Record<string, string> = { "content-type": "text/plain" },
) {
  const root = tempRoot();
  const out: string[] = [];
  const err: string[] = [];
  const response = () =>
    new Response(
      JSON.stringify({
        ...receipt,
        headers,
        body_base64: bytes.toString("base64"),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  const fetchApi = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => response(),
  );
  const dependencies = {
    env: {
      WEFT_API_KEY: "wk_test_secret",
      WEFT_BASE_URL: "https://api.example",
      WEFT_RESULTS_DIR: root,
    },
    fetchApi,
    generateIdempotencyKey: () => "retry-delivery-key",
    writeOut: (value: string) => {
      // The bytes and receipt must exist before the first stdout write.
      const output = JSON.parse(value);
      if (output.schema_version === "2") {
        expect(readFileSync(output.meta.saved_path)).toEqual(bytes);
        expect(
          JSON.parse(readFileSync(output.meta.receipt_path, "utf8")).meta
            .idempotency_key,
        ).toBe("retry-delivery-key");
      }
      out.push(value);
    },
    writeErr: (value: string) => err.push(value),
  };
  return { root, out, err, fetchApi, dependencies, response };
}

describe("fetch result delivery", () => {
  it.each(["0", "0.00"])(
    "delivers SIWX retrieval with a %s spending ceiling",
    async (ceiling) => {
      const bytes = Buffer.from('{"status":"COMPLETED","output":{"value":1}}');
      const f = fixture(bytes);
      f.fetchApi.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              ...receipt,
              held_usd: null,
              payment_status: "not_required",
              headers: { "content-type": "application/json" },
              body_base64: bytes.toString("base64"),
            }),
            { headers: { "content-type": "application/json" } },
          ),
      );
      expect(
        await runCli(
          [
            "fetch",
            "https://merchant.example/runs/1",
            "--method",
            "GET",
            "--max-cost-usd",
            ceiling,
          ],
          f.dependencies,
        ),
      ).toBe(EXIT_SUCCESS);
      expect(f.fetchApi).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(String(f.fetchApi.mock.calls[0][1]?.body)),
      ).toMatchObject({
        url: "https://merchant.example/runs/1",
        method: "GET",
        max_cost_usd: ceiling,
      });
      const output = JSON.parse(f.out[0]);
      expect(output.data).toMatchObject({
        paymentStatus: "not_required",
        paidUsd: "0.00",
        heldUsd: null,
        txHash: null,
        artifactId: 42,
        body: bytes.toString("utf8"),
      });
      expect(readFileSync(output.meta.saved_path)).toEqual(bytes);
      expect(
        JSON.parse(readFileSync(output.meta.receipt_path, "utf8")).data
          .paymentStatus,
      ).toBe("not_required");
    },
  );

  it.each([49_999, 50_001, 199_999, 200_001])(
    "saves and returns every text byte at %i characters in one fetch",
    async (size) => {
      const middle = Math.floor(size / 2);
      const text =
        "START" +
        "x".repeat(middle - 5) +
        "MIDDLE" +
        "y".repeat(size - middle - 9) +
        "END";
      const bytes = Buffer.from(text);
      const f = fixture(bytes);
      expect(await runCli(args, f.dependencies)).toBe(EXIT_SUCCESS);
      expect(f.err).toEqual([]);
      expect(f.fetchApi).toHaveBeenCalledTimes(1);
      expect(f.fetchApi.mock.calls[0][0]).toBe(
        "https://api.example/api/v1/fetch",
      );
      expect(
        new Headers(f.fetchApi.mock.calls[0][1]?.headers).get(
          "idempotency-key",
        ),
      ).toBe("retry-delivery-key");
      const output = JSON.parse(f.out[0]);
      expect(output.schema_version).toBe("2");
      expect(output.data.body).toBe(text);
      expect(output.data).toMatchObject({
        paidUsd: "0.00",
        heldUsd: "0.000892",
        paymentStatus: "pending",
        artifactId: 42,
        body_encoding: "utf-8",
      });
      expect(output.data).not.toHaveProperty("bodyBase64");
      expect(output.meta.byte_count).toBe(bytes.length);
      expect(isAbsolute(output.meta.saved_path)).toBe(true);
      expect(statSync(dirname(output.meta.saved_path)).mode & 0o777).toBe(
        0o700,
      );
      expect(statSync(output.meta.saved_path).mode & 0o777).toBe(0o600);
      expect(statSync(output.meta.receipt_path).mode & 0o777).toBe(0o600);
      expect(f.out[0].indexOf("saved_path")).toBeLessThan(
        f.out[0].indexOf("START"),
      );
      expect(f.out[0].indexOf("retry-delivery-key")).toBeLessThan(
        f.out[0].indexOf("START"),
      );
      expect(f.out[0]).not.toContain("wk_test_secret");
      const savedReceipt = JSON.parse(
        readFileSync(output.meta.receipt_path, "utf8"),
      );
      expect(savedReceipt.data).not.toHaveProperty("body");
      expect(savedReceipt.data).not.toHaveProperty("bodyBase64");
    },
  );

  it.each([
    "",
    "\uFEFFGrüezi 👩🏽‍💻 日本語\r\n",
    '{ "huge":9007199254740993123, "a":1, "a":2 }\n',
  ])("preserves exact UTF-8 and JSON text %j", async (body) => {
    const f = fixture(Buffer.from(body), {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(await runCli(args, f.dependencies)).toBe(EXIT_SUCCESS);
    expect(JSON.parse(f.out[0]).data.body).toBe(body);
  });

  it.each([
    [Buffer.from([0xff, 0xfe, 0x80]), { "content-type": "text/plain" }],
    [Buffer.from([0, 1, 2, 3]), { "content-type": "application/octet-stream" }],
    [Buffer.from("ascii binary"), { "content-type": "image/png" }],
    [
      Buffer.from("compressed"),
      { "content-type": "text/plain", "content-encoding": "gzip" },
    ],
    [
      Buffer.from("not UTF-16"),
      { "content-type": "text/plain; charset=utf-16" },
    ],
  ] as const)(
    "delivers binary or encoded bodies only through the saved file %#",
    async (bytes, headers) => {
      const f = fixture(bytes, headers);
      expect(await runCli(args, f.dependencies)).toBe(EXIT_SUCCESS);
      const output = JSON.parse(f.out[0]);
      expect(output.data.body_encoding).toBe("file");
      expect(output.data).not.toHaveProperty("body");
      expect(output.data).not.toHaveProperty("bodyBase64");
      expect(f.out[0]).not.toContain(bytes.toString("base64"));
    },
  );

  it("keeps raw schema 1 and does not require storage", async () => {
    const bytes = Buffer.from([0xff, 0, 0x80]);
    const f = fixture(bytes);
    writeFileSync(join(f.root, "not-a-directory"), "untouched");
    f.dependencies.env.WEFT_RESULTS_DIR = join(f.root, "not-a-directory");
    expect(await runCli([...args, "--raw"], f.dependencies)).toBe(EXIT_SUCCESS);
    expect(JSON.parse(f.out[0])).toMatchObject({
      schema_version: "1",
      data: { bodyBase64: bytes.toString("base64") },
      meta: { idempotency_key: "retry-delivery-key" },
    });
    expect(readdirSync(f.root)).toEqual(["not-a-directory"]);
    expect(f.fetchApi).toHaveBeenCalledTimes(1);
  });

  it("reserves storage before any purchase and reports a local failure", async () => {
    const f = fixture(Buffer.from("data"));
    writeFileSync(join(f.root, "blocked"), "untouched");
    f.dependencies.env.WEFT_RESULTS_DIR = join(f.root, "blocked");
    expect(await runCli(args, f.dependencies)).toBe(EXIT_INTERNAL);
    expect(f.fetchApi).not.toHaveBeenCalled();
    expect(f.out).toEqual([]);
    expect(JSON.parse(f.err[0]).error.code).toBe("RESULT_STORAGE_UNAVAILABLE");
  });

  it("rejects a symlink storage root before purchase", async () => {
    const f = fixture(Buffer.from("data"));
    mkdirSync(join(f.root, "real"));
    symlinkSync(join(f.root, "real"), join(f.root, "link"));
    f.dependencies.env.WEFT_RESULTS_DIR = join(f.root, "link");
    expect(await runCli(args, f.dependencies)).toBe(EXIT_INTERNAL);
    expect(f.fetchApi).not.toHaveBeenCalled();
    expect(readdirSync(join(f.root, "real"))).toEqual([]);
  });

  it("rejects a root writable by other users without changing its permissions", async () => {
    const f = fixture(Buffer.from("data"));
    chmodSync(f.root, 0o777);
    expect(await runCli(args, f.dependencies)).toBe(EXIT_INTERNAL);
    expect(f.fetchApi).not.toHaveBeenCalled();
    expect(statSync(f.root).mode & 0o777).toBe(0o777);
  });

  it("saves a large binary result without Base64 in stdout", async () => {
    const bytes = Buffer.alloc(250_001, 0x80);
    bytes.set(Buffer.from("MIDDLE"), 125_000);
    bytes.set(Buffer.from("END"), bytes.length - 3);
    const f = fixture(bytes, { "content-type": "application/octet-stream" });
    expect(await runCli(args, f.dependencies)).toBe(EXIT_SUCCESS);
    expect(JSON.parse(f.out[0]).meta.byte_count).toBe(bytes.length);
    expect(f.out[0].length).toBeLessThan(2000);
    expect(f.fetchApi).toHaveBeenCalledTimes(1);
  });

  it("preserves an explicit retry key on a default fetch with an uncertain network result", async () => {
    const f = fixture(Buffer.from("data"));
    f.fetchApi.mockImplementation(async () => {
      throw new TypeError("connection lost");
    });
    expect(
      await runCli(
        [...args, "--idempotency-key", "same-request-key"],
        f.dependencies,
      ),
    ).toBe(EXIT_INTERNAL);
    expect(f.fetchApi).toHaveBeenCalledTimes(1);
    expect(
      new Headers(f.fetchApi.mock.calls[0][1]?.headers).get("idempotency-key"),
    ).toBe("same-request-key");
    expect(JSON.parse(f.err[0])).toMatchObject({
      schema_version: "2",
      meta: { idempotency_key: "same-request-key" },
    });
  });

  it("does not overwrite a payload path and retains the paid receipt and retry key after storage failure", async () => {
    const f = fixture(Buffer.from("paid data"));
    f.fetchApi.mockImplementation(async () => {
      const [directory] = readdirSync(f.root);
      writeFileSync(join(f.root, directory, "body"), "do not overwrite");
      return f.response();
    });
    expect(await runCli(args, f.dependencies)).toBe(EXIT_INTERNAL);
    expect(f.fetchApi).toHaveBeenCalledTimes(1);
    expect(f.out).toEqual([]);
    const output = JSON.parse(f.err[0]);
    expect(output).toMatchObject({
      schema_version: "2",
      meta: { idempotency_key: "retry-delivery-key" },
      error: {
        code: "RESULT_STORAGE_FAILED",
        details: {
          receipt: {
            paidUsd: "0.00",
            heldUsd: "0.000892",
            paymentStatus: "pending",
            artifactId: 42,
          },
        },
      },
    });
    expect(output.error.message).toContain("--idempotency-key");
    expect(f.err[0]).not.toContain("bodyBase64");
    const [directory] = readdirSync(f.root);
    expect(readFileSync(join(f.root, directory, "body"), "utf8")).toBe(
      "do not overwrite",
    );
    expect(
      JSON.parse(readFileSync(join(f.root, directory, "receipt.json"), "utf8"))
        .data.paymentStatus,
    ).toBe("pending");
  });

  it("uses separate private paths for repeated fetches and ignores upstream filenames", async () => {
    const f = fixture(Buffer.from("data"), {
      "content-type": "text/plain",
      "content-disposition": 'attachment; filename="../../executable.sh"',
    });
    expect(await runCli(args, f.dependencies)).toBe(EXIT_SUCCESS);
    expect(await runCli(args, f.dependencies)).toBe(EXIT_SUCCESS);
    const paths = f.out.map((value) => JSON.parse(value).meta.saved_path);
    expect(paths[0]).not.toBe(paths[1]);
    expect(paths[0]).not.toContain("executable.sh");
  });

  it("keeps the receipt in stderr when even the receipt file cannot be saved", async () => {
    const f = fixture(Buffer.from("paid data"));
    f.fetchApi.mockImplementation(async () => {
      const [directory] = readdirSync(f.root);
      rmSync(join(f.root, directory), { recursive: true });
      return f.response();
    });
    expect(await runCli(args, f.dependencies)).toBe(EXIT_INTERNAL);
    expect(f.fetchApi).toHaveBeenCalledTimes(1);
    expect(f.out).toEqual([]);
    expect(JSON.parse(f.err[0])).toMatchObject({
      meta: { idempotency_key: "retry-delivery-key" },
      error: {
        code: "RESULT_STORAGE_FAILED",
        details: {
          file_complete: false,
          receipt: {
            artifactId: 42,
            heldUsd: "0.000892",
            paymentStatus: "pending",
          },
        },
      },
    });
    expect(f.err[0]).not.toContain(Buffer.from("paid data").toString("base64"));
  });

  it.each(["!!!", "SGVsbG8=!!", "A", "Zh=="])(
    "rejects corrupt Base64 %j without claiming a saved result",
    async (body_base64) => {
      const f = fixture(Buffer.from("unused"));
      f.fetchApi.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ ...receipt, headers: {}, body_base64 }),
          ),
      );
      expect(await runCli(args, f.dependencies)).toBe(EXIT_INTERNAL);
      expect(f.out).toEqual([]);
      expect(f.fetchApi).toHaveBeenCalledTimes(1);
      expect(JSON.parse(f.err[0])).toMatchObject({
        meta: { idempotency_key: "retry-delivery-key" },
        error: {
          code: "RESULT_DECODE_FAILED",
          details: { receipt: { artifactId: 42, heldUsd: "0.000892" } },
        },
      });
      const [directory] = readdirSync(f.root);
      expect(readdirSync(join(f.root, directory))).not.toContain("body");
    },
  );

  it("retains paths and the receipt when stdout fails after saving", async () => {
    const f = fixture(Buffer.from("paid data"));
    f.dependencies.writeOut = () => {
      throw new Error("broken pipe");
    };
    expect(await runCli(args, f.dependencies)).toBe(EXIT_INTERNAL);
    const output = JSON.parse(f.err[0]);
    expect(output).toMatchObject({
      meta: { idempotency_key: "retry-delivery-key", byte_count: 9 },
      error: {
        code: "RESULT_OUTPUT_FAILED",
        details: { receipt: { artifactId: 42, paymentStatus: "pending" } },
      },
    });
    expect(readFileSync(output.meta.saved_path, "utf8")).toBe("paid data");
    expect(f.fetchApi).toHaveBeenCalledTimes(1);
  });
});
