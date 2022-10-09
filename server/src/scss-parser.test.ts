import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import parseScss, { __dirname } from "./scss-parser";

describe("SCSS parser", () => {
  test("parsing a SCSS library example", async () => {
    const expectedResult = JSON.parse(
      readFileSync(join(__dirname, "../testFixture/parsed-scss.json"), {
        encoding: "utf-8",
      })
    );
    const result = await parseScss(
      join(__dirname, "../testFixture/style.scss")
    );
    expect(result).toEqual(expectedResult);
  });
});
