import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCliArgs, parseDotenv } from "./boardBenchmarkConfig.js";

describe("board benchmark config helpers", () => {
  it("parses cli arguments with defaults and overrides", () => {
    expect(parseCliArgs([])).toEqual({
      config: "board_benchmark_config.json",
      dotenvFile: ".env",
    });

    expect(parseCliArgs(["--config", "custom.json", "--dotenv-file", ".env.local"])).toEqual({
      config: "custom.json",
      dotenvFile: ".env.local",
    });
  });

  it("parses dotenv files and ignores comments", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-config-"));
    const dotenvPath = path.join(tempDir, ".env");

    fs.writeFileSync(
      dotenvPath,
      "# comment\nOPENAI_API_KEY=test-key\nSPACED = \"hello world\"\nEMPTY=\n",
      "utf8",
    );

    expect(parseDotenv(dotenvPath)).toEqual({
      OPENAI_API_KEY: "test-key",
      SPACED: "hello world",
      EMPTY: "",
    });
    expect(parseDotenv(path.join(tempDir, "missing.env"))).toEqual({});
  });
});
