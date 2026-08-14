import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { clearJWTCookie, setJWTCookie } from "../core/hono-middleware";
import { users } from "../db/schema";
import { parsePublicHttpUrl } from "../utils/public-url";
import { updateProfileSchema, validateSchema } from "@rin/api";
import {
    BadRequestError,
    ForbiddenError,
    InternalServerError,
    NotFoundError
} from "../errors";

export function UserService(): Hono {
    const app = new Hono();

    const getCreatorGitHubId = (env: Env) => {
        const id = env.RIN_GITHUB_ADMIN_ID?.trim();
        return id && /^[1-9][0-9]*$/.test(id) ? id : null;
    };

    // GET /user/github - Redirect to GitHub OAuth
    app.get("/github", async (c: AppContext) => {
        const oauth2 = c.get('oauth2');

        if (!oauth2) {
            throw new BadRequestError('GitHub OAuth is not configured');
        }
        if (!getCreatorGitHubId(c.env)) {
            throw new BadRequestError('Creator GitHub ID is not configured');
        }

        const requestUrl = new URL(c.req.url);
        const callbackUrl = new URL('/callback', requestUrl.origin);
        const secure = requestUrl.protocol === 'https:';

        setCookie(c, 'redirect_to', callbackUrl.toString(), {
            path: '/',
            httpOnly: true,
            secure,
            sameSite: 'Lax',
        });

        const genState = await profileAsync(c, 'user_oauth_state', () => Promise.resolve(oauth2.generateState()));
        setCookie(c, 'state', genState, {
            path: '/',
            httpOnly: true,
            secure,
            sameSite: 'Lax',
        });

        return c.redirect(oauth2.createRedirectUrl(genState, "GitHub"), 302);
    });

    // GET /user/github/callback - GitHub OAuth callback
    app.get("/github/callback", async (c: AppContext) => {
        const oauth2 = c.get('oauth2');
        const jwt = c.get('jwt');
        const db = c.get('db');

        if (!oauth2) {
            throw new BadRequestError('GitHub OAuth is not configured');
        }
        const creatorGitHubId = getCreatorGitHubId(c.env);
        if (!creatorGitHubId) {
            throw new BadRequestError('Creator GitHub ID is not configured');
        }

        const query = c.req.query();
        const stateCookie = getCookie(c, 'state');

        // Verify state to prevent CSRF attacks
        if (query.state !== stateCookie) {
            throw new BadRequestError('Invalid state parameter');
        }

        // Clear state cookie
        deleteCookie(c, 'state', { path: '/' });

        // Exchange code for access token
        const gh_token = await profileAsync(c, 'user_oauth_authorize', () => oauth2.authorize("GitHub", query.code));
        if (!gh_token) {
            throw new BadRequestError('Failed to authorize with GitHub');
        }

        // Request https://api.github.com/user for user info
        const response = await profileAsync(c, 'user_github_fetch', () => fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${gh_token.accessToken}`,
                Accept: "application/json",
                "User-Agent": "rin"
            },
        }));

        if (!response.ok) {
            throw new BadRequestError('Failed to load GitHub profile');
        }

        const user: any = await profileAsync(c, 'user_github_parse', () => response.json());
        if (!user?.id || !(user.name || user.login) || !user.avatar_url) {
            throw new BadRequestError('Invalid GitHub profile');
        }
        if (String(user.id) !== creatorGitHubId) {
            clearJWTCookie(c);
            deleteCookie(c, 'redirect_to', { path: '/' });
            throw new ForbiddenError('GitHub account is not authorized');
        }
        const profile: {
            openid: string;
            username: string;
            avatar: string;
            permission: number | null;
        } = {
            openid: String(user.id),
            username: user.name || user.login,
            avatar: user.avatar_url,
            permission: 1
        };

        // Check if user exists
        const existingUser = await profileAsync(c, 'user_existing_lookup', () => db.query.users.findFirst({
            where: eq(users.openid, profile.openid)
        }));

        if (existingUser) {
            const nextAuthVersion = existingUser.authVersion + 1;
            await profileAsync(c, 'user_existing_update', () => db.update(users).set({
                avatar: profile.avatar,
                openid: profile.openid,
                permission: 1,
                authVersion: nextAuthVersion,
            }).where(eq(users.id, existingUser.id)));
            const authToken = await profileAsync(c, 'user_existing_token', () => jwt.sign({
                id: existingUser.id,
                v: nextAuthVersion,
            }));
            setJWTCookie(c, authToken);
        } else {
            const usernameExists = await db.query.users.findFirst({ where: eq(users.username, profile.username) });
            if (usernameExists) {
                profile.username = `${profile.username.slice(0, 60)}-${profile.openid}`;
            }
            const result = await profileAsync(c, 'user_insert', () => db.insert(users).values({
                ...profile,
                authVersion: 1,
            }).returning({ insertedId: users.id }));
            if (!result || result.length === 0) {
                throw new InternalServerError('Failed to register user');
            }

            const authToken = await profileAsync(c, 'user_insert_token', () => jwt.sign({
                id: result[0].insertedId,
                v: 1,
            }));
            setJWTCookie(c, authToken);
        }

        const redirectTo = getCookie(c, 'redirect_to');
        deleteCookie(c, 'redirect_to', { path: '/' });
        const requestOrigin = new URL(c.req.url).origin;
        const redirect_url = new URL(redirectTo || '/callback', requestOrigin);
        if (redirect_url.origin !== requestOrigin) {
            throw new BadRequestError('Invalid OAuth redirect target');
        }
        return c.redirect(redirect_url.toString(), 302);
    });

    // GET /user/profile - Get user profile
    app.get('/profile', async (c: AppContext) => {
        const uid = c.get('uid');
        const db = c.get('db');

        if (!uid) {
            throw new ForbiddenError('Authentication required');
        }

        const user = await profileAsync(c, 'user_profile_lookup', () => db.query.users.findFirst({ where: eq(users.id, uid) }));
        if (!user) {
            throw new NotFoundError('User');
        }

        return c.json({
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            permission: user.permission === 1,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    });

    // POST /user/logout - Logout user
    app.post('/logout', async (c: AppContext) => {
        const uid = c.get('uid');
        if (uid) {
            const db = c.get('db');
            const current = await db.query.users.findFirst({ where: eq(users.id, uid) });
            if (current) {
                await db.update(users)
                    .set({ authVersion: current.authVersion + 1 })
                    .where(eq(users.id, uid));
            }
        }
        clearJWTCookie(c);
        deleteCookie(c, 'auth_token', {
            path: '/',
            sameSite: 'Lax',
        });
        return c.json({ success: true });
    });

    // PUT /user/profile - Update user profile
    app.put('/profile', async (c: AppContext) => {
        const uid = c.get('uid');
        const db = c.get('db');

        if (!uid) {
            throw new ForbiddenError('Authentication required');
        }

        const body = await profileAsync(c, 'user_profile_parse', () => c.req.json());

        const validation = validateSchema(updateProfileSchema, body);
        if (!validation.success) throw new BadRequestError(validation.errors[0]);

        const { username, avatar } = body as { username?: string; avatar?: string };

        if (username === undefined && avatar === undefined) {
            throw new BadRequestError('At least one field (username or avatar) is required');
        }

        const updateData: { username?: string; avatar?: string } = {};
        if (username !== undefined) {
            if (typeof username !== 'string' || !username.trim() || username.trim().length > 80) {
                throw new BadRequestError('Invalid username');
            }
            const normalizedUsername = username.trim();
            const duplicate = await db.query.users.findFirst({
                where: and(eq(users.username, normalizedUsername), ne(users.id, uid)),
            });
            if (duplicate) throw new BadRequestError('Username already exists');
            updateData.username = normalizedUsername;
        }
        if (avatar !== undefined) {
            if (typeof avatar !== 'string' || avatar.length > 2048) {
                throw new BadRequestError('Invalid avatar URL');
            }
            if (avatar === '') {
                updateData.avatar = '';
            } else {
                const normalizedAvatar = parsePublicHttpUrl(avatar);
                if (!normalizedAvatar) throw new BadRequestError('Invalid avatar URL');
                updateData.avatar = normalizedAvatar;
            }
        }

        await profileAsync(c, 'user_profile_update', () => db.update(users).set(updateData).where(eq(users.id, uid)));

        return c.json({ success: true });
    });

    return app;
}
