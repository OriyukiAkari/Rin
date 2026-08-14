import { describe, expect, it } from "bun:test";
import { createViteArgs } from "./dev";

describe("createViteArgs", () => {
  it("binds local development to the loopback interface by default", () => {
    const args = createViteArgs(11498);
    expect(args).toContain("127.0.0.1");
    expect(args).not.toContain("0.0.0.0");
  });

  it("requires an explicit host to expose development on the network", () => {
    expect(createViteArgs(11498, "0.0.0.0")).toContain("0.0.0.0");
  });
});
