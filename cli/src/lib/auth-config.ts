const FORBIDDEN_JWT_SECRETS = new Set([
  "your-jwt-secret-key",
  "jwt-secret",
  "change-me",
  "changeme",
  "secret",
]);

export type CreatorAuthEnvironment = Record<string, string | undefined>;

export function validateCreatorAuthConfig(source: CreatorAuthEnvironment) {
  const errors: string[] = [];
  const clientId = source.RIN_GITHUB_CLIENT_ID?.trim();
  const clientSecret = source.RIN_GITHUB_CLIENT_SECRET?.trim();
  const adminId = source.RIN_GITHUB_ADMIN_ID?.trim();
  const jwtSecret = source.JWT_SECRET?.trim();

  if (!clientId) errors.push("RIN_GITHUB_CLIENT_ID is required");
  if (!clientSecret) errors.push("RIN_GITHUB_CLIENT_SECRET is required");
  if (!adminId || !/^[1-9][0-9]*$/.test(adminId)) {
    errors.push("RIN_GITHUB_ADMIN_ID must be the creator's numeric GitHub user ID");
  }
  if (!jwtSecret) {
    errors.push("JWT_SECRET is required");
  } else if (FORBIDDEN_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
    errors.push("JWT_SECRET must not use a documented placeholder value");
  }
  if (jwtSecret && new TextEncoder().encode(jwtSecret).byteLength < 32) {
    errors.push("JWT_SECRET must contain at least 32 bytes");
  }

  return errors;
}

export function assertCreatorAuthConfig(source: CreatorAuthEnvironment) {
  const errors = validateCreatorAuthConfig(source);
  if (errors.length > 0) {
    throw new Error(`Invalid creator-only authentication configuration:\n- ${errors.join("\n- ")}`);
  }
}
