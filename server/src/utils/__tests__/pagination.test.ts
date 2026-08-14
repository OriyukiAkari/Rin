import { describe, expect, it } from "bun:test";
import { parsePagination } from "../pagination";

describe("parsePagination", () => {
  it("uses safe defaults for malformed, negative, or zero values", () => {
    expect(parsePagination("NaN", "-10")).toEqual({ pageIndex: 0, limit: 20 });
    expect(parsePagination("0", "0")).toEqual({ pageIndex: 0, limit: 20 });
  });

  it("caps page and limit values", () => {
    expect(parsePagination("999999", "500")).toEqual({ pageIndex: 99_999, limit: 50 });
  });
});
