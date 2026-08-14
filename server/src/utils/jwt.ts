import {
    SignJWT,
    jwtVerify,
    type JWTPayload,
    type JWSHeaderParameters,
    type KeyLike
} from 'jose'

export interface JWTPayloadSpec {
    iss?: string
    sub?: string
    aud?: string | string[]
    jti?: string
    nbf?: number
    exp?: number
    iat?: number
}

export interface JWTUtils {
    sign: (payload: any) => Promise<string>;
    verify: (jwt?: string) => Promise<any | false>;
}

export function createJWT(secret: string | Uint8Array | KeyLike): JWTUtils {
    if (!secret) throw new Error("Secret can't be empty");
    if (typeof secret === 'string' && new TextEncoder().encode(secret).byteLength < 32) {
        throw new Error('JWT_SECRET must contain at least 32 bytes');
    }

    const key = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
    const alg = 'HS256';
    const issuer = 'rin';
    const audience = 'rin-admin';

    return {
        sign: async (payload: any) => {
            const jwt = new SignJWT(payload)
                .setProtectedHeader({ alg })
                .setIssuer(issuer)
                .setAudience(audience)
                .setJti(crypto.randomUUID())
                .setIssuedAt()
                .setExpirationTime("24h");
            
            return jwt.sign(key);
        },
        verify: async (jwt?: string): Promise<any | false> => {
            if (!jwt) return false;

            try {
                const data = (await jwtVerify(jwt, key, {
                    algorithms: [alg],
                    issuer,
                    audience,
                })).payload;
                return data;
            } catch (_) {
                return false;
            }
        }
    };
}

export default createJWT;
