import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, Variables } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { setJWTCookie } from "../core/hono-middleware";
import { users } from "../db/schema";
import {
    BadRequestError,
    ForbiddenError,
    InternalServerError,
} from "../errors";
import { hashPassword, passwordNeedsUpgrade, verifyPassword } from "../utils/password";
import { enforceRateLimit, requestClientIdentifier } from "../utils/rate-limit";
import { loginSchema, validateSchema } from "@rin/api";

export function PasswordAuthService(): Hono<{
        Bindings: Env;
        Variables: Variables;
    }> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();
    // Login with username and password
    app.post("/login", async (c: AppContext) => {
        const jwt = c.get('jwt');
        const db = c.get('db');
        const env = c.env;

        // Check if admin credentials are configured
        const adminUsername = env.ADMIN_USERNAME;
        const adminPassword = env.ADMIN_PASSWORD;

        if (!adminUsername || !adminPassword) {
            throw new BadRequestError('Admin credentials not configured');
        }

        const body = await profileAsync(c, 'auth_login_parse', () => c.req.json());
        const validation = validateSchema(loginSchema, body);
        if (!validation.success) throw new BadRequestError(validation.errors[0]);
        const { username, password } = body as { username: string; password: string };

        if (!username || !password) {
            throw new BadRequestError('Username and password are required');
        }

        const loginAllowed = await profileAsync(c, 'auth_login_rate_limit', () => enforceRateLimit(
            db,
            env,
            'login',
            `${requestClientIdentifier(c.req.raw.headers)}:${username}`,
            10,
            900,
        ));
        if (!loginAllowed) {
            return c.json({
                success: false,
                error: { code: 'RATE_LIMITED', message: 'Too many login attempts' },
            }, 429);
        }

        // Check if this is the admin login
        if (username === adminUsername) {
            if (password !== adminPassword) {
                throw new ForbiddenError('Invalid credentials');
            }

            const expectedHash = await profileAsync(c, 'auth_admin_hash', () => hashPassword(adminPassword));

            // Find or create admin user
            let user = await profileAsync(c, 'auth_admin_lookup', () => db.query.users.findFirst({ 
                where: eq(users.openid, "admin") 
            }));

            if (!user) {
                // Create admin user if not exists
                const result = await profileAsync(c, 'auth_admin_insert', () => db.insert(users).values({
                    username: adminUsername,
                    openid: "admin",
                    avatar: "",
                    permission: 1,
                    password: expectedHash,
                }).returning({ insertedId: users.id }));

                if (!result || result.length === 0) {
                    throw new InternalServerError('Failed to create admin user');
                }

                user = await profileAsync(c, 'auth_admin_reload', () => db.query.users.findFirst({ 
                    where: eq(users.id, result[0].insertedId) 
                }));
            }

            if (!user) {
                throw new InternalServerError('Failed to get admin user');
            }

            if (!user.password || passwordNeedsUpgrade(user.password) || !(await verifyPassword(adminPassword, user.password))) {
                // Update admin password if changed
                await profileAsync(c, 'auth_admin_sync', () => db.update(users)
                    .set({ password: expectedHash, username: adminUsername })
                    .where(eq(users.id, user.id)));
            }

            // Generate JWT token
            const token = await profileAsync(c, 'auth_admin_token', () => jwt.sign({ id: user.id }));

            // Set JWT cookie using Hono helper
            setJWTCookie(c, token);

            return c.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    permission: user.permission === 1,
                }
            });
        }

        // Regular user login (if we want to support multiple users with passwords in the future)
        const user = await profileAsync(c, 'auth_user_lookup', () => db.query.users.findFirst({ 
            where: eq(users.username, username) 
        }));

        if (!user || !user.password) {
            throw new ForbiddenError('Invalid credentials');
        }

        if (!(await profileAsync(c, 'auth_user_verify', () => verifyPassword(password, user.password!)))) {
            throw new ForbiddenError('Invalid credentials');
        }

        if (passwordNeedsUpgrade(user.password)) {
            const upgradedPassword = await profileAsync(c, 'auth_user_upgrade_hash', () => hashPassword(password));
            await profileAsync(c, 'auth_user_upgrade', () => db.update(users)
                .set({ password: upgradedPassword })
                .where(eq(users.id, user.id)));
        }

        // Generate JWT token
        const token = await profileAsync(c, 'auth_user_token', () => jwt.sign({ id: user.id }));

        // Set JWT cookie using Hono helper
        setJWTCookie(c, token);

        return c.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                permission: user.permission === 1,
            }
        });
    });

    // Check if password login is available
    app.get("/status", async (c: AppContext) => {
        const env = c.env;
        
        return c.json({
            github: !!(env.RIN_GITHUB_CLIENT_ID && env.RIN_GITHUB_CLIENT_SECRET),
            password: !!(env.ADMIN_USERNAME && env.ADMIN_PASSWORD),
        });
    });

    return app;
}
