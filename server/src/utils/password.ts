const PASSWORD_SCHEME = "pbkdf2_sha256";
const PASSWORD_ITERATIONS = 120_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt).buffer,
      iterations,
    },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return [
    PASSWORD_SCHEME,
    PASSWORD_ITERATIONS,
    toBase64(salt),
    toBase64(hash),
  ].join("$");
}

async function legacySha256(password: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(password: string, encoded: string) {
  const [scheme, iterationText, saltText, hashText] = encoded.split("$");
  if (scheme === PASSWORD_SCHEME && iterationText && saltText && hashText) {
    const iterations = Number.parseInt(iterationText, 10);
    if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false;
    try {
      const expected = fromBase64(hashText);
      const actual = await derivePassword(password, fromBase64(saltText), iterations);
      return constantTimeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  if (/^[a-f0-9]{64}$/i.test(encoded)) {
    return constantTimeEqual(
      new TextEncoder().encode(await legacySha256(password)),
      new TextEncoder().encode(encoded.toLowerCase()),
    );
  }

  return false;
}

export function passwordNeedsUpgrade(encoded: string) {
  return !encoded.startsWith(`${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$`);
}
