import { describe, expect, it } from "bun:test";
import { SignJWT } from "jose";
import { createJWT } from "../jwt";

const secret = "0123456789abcdef0123456789abcdef";

describe("createJWT", () => {
  it("signs and verifies audience-bound, expiring admin sessions", async () => {
    const jwt = createJWT(secret);
    const token = await jwt.sign({ id: 1, v: 2 });
    const payload = await jwt.verify(token);

    expect(payload.id).toBe(1);
    expect(payload.v).toBe(2);
    expect(payload.iss).toBe("rin");
    expect(payload.aud).toBe("rin-admin");
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(typeof payload.jti).toBe("string");
  });

  it("rejects legacy tokens without issuer and audience claims", async () => {
    const key = new TextEncoder().encode(secret);
    const legacy = await new SignJWT({ id: 1, v: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(key);

    expect(await createJWT(secret).verify(legacy)).toBe(false);
  });

  it("rejects short signing secrets", () => {
    expect(() => createJWT("too-short")).toThrow("at least 32 bytes");
  });
});
