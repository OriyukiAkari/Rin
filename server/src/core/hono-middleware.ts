// Hono middleware for Rin server
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";
import type { AppContext, Variables, OAuth2Utils } from "./hono-types";
import { eq } from "drizzle-orm";
import { profileAsync } from "./server-timing";
import { createRuntimeServices } from "./runtime-services";

// Create container per request
export const initContainerMiddleware = createMiddleware<{
    Bindings: Env;
    Variables: Variables;
}>(async (c, next) => {
    await profileAsync(c, "init_container", async () => {
        const { db, cache, clientConfig, serverConfig } = createRuntimeServices(c.env);
        const jwt = await profileAsync(c, "init_jwt", async () => {
            const { default: createJWT } = await import('../utils/jwt');
            const secret = c.env.JWT_SECRET;
            if (!secret) {
                throw new Error('JWT_SECRET is not set');
            }
            return createJWT(secret);
        });

        let oauth2: OAuth2Utils | undefined = undefined;
        if (c.env.RIN_GITHUB_CLIENT_ID && c.env.RIN_GITHUB_CLIENT_SECRET) {
            oauth2 = await profileAsync(c, "init_oauth2", async () => {
                    const { createOAuthPlugin, GitHubProvider } = await import('../utils/oauth');
                    return createOAuthPlugin({
                        GitHub: new GitHubProvider({
                            clientId: c.env.RIN_GITHUB_CLIENT_ID,
                            clientSecret: c.env.RIN_GITHUB_CLIENT_SECRET
                        })
                    });
                });
        }

        c.set('db', db);
        c.set('cache', cache);
        c.set('serverConfig', serverConfig);
        c.set('clientConfig', clientConfig);
        c.set('jwt', jwt);
        c.set('oauth2', oauth2);
        c.set('admin', false);
        c.set('env', c.env);
    });

    await next();
});

// Auth middleware - derive user from JWT
export const authMiddleware = createMiddleware<{
    Bindings: Env;
    Variables: Variables;
}>(async (c, next) => {
    await profileAsync(c, "auth_middleware", async () => {
        const jwt = c.get('jwt');
        const db = c.get('db');

        const token = await profileAsync(c, "auth_token", () => {
            const authHeader = c.req.header('authorization');
            if (authHeader && authHeader.startsWith('Bearer ')) {
                return authHeader.substring(7);
            }
            return getCookie(c, 'token');
        });

        if (token && jwt) {
            const profile = await profileAsync(c, "auth_verify", () => jwt.verify(token));
            if (profile) {
                const { users } = await import("../db/schema");
                const user = await profileAsync(c, "auth_user_lookup", () => db.query.users.findFirst({
                    where: eq(users.id, profile.id)
                }));

                const creatorGitHubId = c.env.RIN_GITHUB_ADMIN_ID?.trim();
                if (
                    user &&
                    creatorGitHubId &&
                    user.openid === creatorGitHubId &&
                    user.permission === 1 &&
                    profile.v === user.authVersion
                ) {
                    c.set('uid', user.id);
                    c.set('username', user.username);
                    c.set('admin', true);
                }
            }
        }
    });

    await next();
});

// Helper to set JWT cookie
export function setJWTCookie(c: AppContext, token: string) {
    const secure = new URL(c.req.url).protocol === 'https:';
    setCookie(c, 'token', token, {
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        path: '/',
        httpOnly: true,
        secure,
        sameSite: 'Lax',
    });
}

// Helper to clear JWT cookie
export function clearJWTCookie(c: AppContext) {
    const secure = new URL(c.req.url).protocol === 'https:';
    setCookie(c, 'token', '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure,
        sameSite: 'Lax',
    });
}
