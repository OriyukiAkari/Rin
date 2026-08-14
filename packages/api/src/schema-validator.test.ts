import { describe, expect, it } from "bun:test";
import { t, validateSchema } from "./schema-validator";

describe("runtime schema validation", () => {
  const schema = t.Object({
    title: t.String(),
    published: t.Boolean(),
    tags: t.Array(t.String()),
    createdAt: t.Date({ optional: true }),
  }, { additionalProperties: false });

  it("accepts a matching payload", () => {
    expect(validateSchema(schema, { title: "Post", published: true, tags: ["rin"] }).success).toBe(true);
  });

  it("reports missing, mistyped, invalid-date, and unknown fields", () => {
    const result = validateSchema(schema, {
      published: "yes",
      tags: [1],
      createdAt: "not-a-date",
      extra: true,
    });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(5);
  });
});
