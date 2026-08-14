import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { UserService } from '../user';
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Variables, JWTUtils, OAuth2Utils } from "../../core/hono-types";
import { setupTestApp, TestCacheImpl, cleanupTestDB, createMockEnv } from '../../../tests/fixtures';
import type { Database } from 'bun:sqlite';

describe('UserService', () => {
    let db: any;
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;

    beforeEach(async () => {
        const ctx = await setupTestApp(UserService);
        db = ctx.db;
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;
        
        // Add error handler
        app.onError((err, c) => {
            const error = err as any;
            if (error.code && error.statusCode) {
                return c.json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details,
                    },
                }, error.statusCode as any);
            }
            return c.json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: err.message || 'An unexpected error occurred',
                },
            }, 500);
        });
        
        // Seed test data
        await seedTestData(sqlite);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    async function seedTestData(sqlite: Database) {
        sqlite.exec(`
            INSERT INTO users (id, username, avatar, permission, openid) VALUES 
                (1, 'user1', 'avatar1.png', 0, '123'),
                (2, 'admin', 'admin.png', 1, '456')
        `);
    }

    describe('GET /github - Initiate GitHub OAuth', () => {
        it('should redirect to GitHub OAuth', async () => {
            const res = await app.request('/github', {
                method: 'GET',
                headers: { 'Referer': 'http://localhost:5173/' }
            }, env);
            
            expect(res.status).toBe(302);
            const location = res.headers.get('Location');
            expect(location).toContain('github.com');
            expect(location).toContain('state=');
        });

        it('should not trust or require a referer header', async () => {
            const res = await app.request('/github', { method: 'GET' }, env);
            
            expect(res.status).toBe(302);
        });

        it('should return 400 if OAuth not configured', async () => {
            const envNoOAuth = createMockEnv({
                RIN_GITHUB_CLIENT_ID: '',
                RIN_GITHUB_CLIENT_SECRET: '',
            });
            
            const appNoOAuth = new Hono<{ Bindings: Env; Variables: Variables }>();
            appNoOAuth.use(createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
                c.set('db', db);
                c.set('cache', new TestCacheImpl());
                c.set('serverConfig', new TestCacheImpl());
                c.set('clientConfig', new TestCacheImpl());
                c.set('jwt', {
                    sign: async (payload: any) => `mock_token_${payload.id}`,
                    verify: async (token: string) => null,
                } as JWTUtils);
                c.set('oauth2', undefined);
                c.set('env', envNoOAuth);
                await next();
            }));
            appNoOAuth.route('/', UserService());
            
            // Error handler for appNoOAuth
            appNoOAuth.onError((err, c) => {
                const error = err as any;
                if (error.code && error.statusCode) {
                    return c.json({
                        success: false,
                        error: {
                            code: error.code,
                            message: error.message,
                            details: error.details,
                        },
                    }, error.statusCode as any);
                }
                return c.json({
                    success: false,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: err.message || 'An unexpected error occurred',
                    },
                }, 500);
            });
            
            const res = await appNoOAuth.request('/github', {
                method: 'GET',
                headers: { 'Referer': 'http://localhost:5173/' }
            }, envNoOAuth);
            
            expect(res.status).toBe(400);
            const data = await res.json() as { error: { message: string } };
            expect(data.error.message).toBe('GitHub OAuth is not configured');
        });

        it('should set redirect_to cookie', async () => {
            const res = await app.request('/github', {
                method: 'GET',
                headers: { 'Referer': 'http://localhost:5173/feed/123' }
            }, env);
            
            expect(res.status).toBe(302);
            const setCookie = res.headers.get('Set-Cookie');
            expect(setCookie).toContain('redirect_to');
        });
    });

    describe('GET /github/callback - GitHub OAuth callback', () => {
        it('should authenticate the existing creator and preserve admin access', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => {
                return new Response(JSON.stringify({
                    id: 456,
                    login: 'admin',
                    name: 'Admin',
                    avatar_url: 'https://github.com/avatar.png'
                }), { status: 200 });
            };

            try {
                const res = await app.request('/github/callback?code=valid_code&state=mock_state', {
                    method: 'GET',
                    headers: {
                        'Cookie': 'state=mock_state; redirect_to=http://localhost/callback'
                    }
                }, env);
                
                expect(res.status).toBe(302);
                const location = res.headers.get('Location');
                expect(location).toContain('/callback');
                const creator = sqlite.prepare("SELECT permission FROM users WHERE openid = '456'").get() as { permission: number };
                expect(creator.permission).toBe(1);
            } finally {
                global.fetch = originalFetch;
            }
        });

        it('should create the configured creator as an admin without exposing a token in the redirect', async () => {
            sqlite.exec("DELETE FROM users");
            env.RIN_GITHUB_ADMIN_ID = '789';
            const originalFetch = global.fetch;
            global.fetch = async () => new Response(JSON.stringify({
                id: 789,
                login: 'new-user',
                avatar_url: 'https://avatars.githubusercontent.com/u/789',
            }), { status: 200 });

            try {
                const res = await app.request('/github/callback?code=valid_code&state=mock_state', {
                    headers: { Cookie: 'state=mock_state; redirect_to=http://localhost/callback' },
                }, env);
                expect(res.status).toBe(302);
                expect(res.headers.get('Location')).toBe('http://localhost/callback');
                const inserted = sqlite.prepare("SELECT permission FROM users WHERE openid = '789'").get() as { permission: number };
                expect(inserted.permission).toBe(1);
            } finally {
                global.fetch = originalFetch;
            }
        });

        it('should reject any GitHub account other than the configured creator', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => new Response(JSON.stringify({
                id: 789,
                login: 'intruder',
                avatar_url: 'https://avatars.githubusercontent.com/u/789',
            }), { status: 200 });

            try {
                const res = await app.request('/github/callback?code=valid_code&state=mock_state', {
                    headers: { Cookie: 'state=mock_state; redirect_to=http://localhost/callback' },
                }, env);
                expect(res.status).toBe(403);
                expect(sqlite.prepare("SELECT id FROM users WHERE openid = '789'").get()).toBeNull();
                expect(res.headers.get('Set-Cookie')).not.toContain('token=mock_token_');
            } finally {
                global.fetch = originalFetch;
            }
        });

        it('should reject invalid state', async () => {
            const res = await app.request('/github/callback?code=valid_code&state=wrong_state', {
                method: 'GET',
                headers: {
                    'Cookie': 'state=mock_state; redirect_to=http://localhost:5173/callback'
                }
            }, env);
            
            expect(res.status).toBe(400);
            const data = await res.json() as { error: { message: string } };
            expect(data.error.message).toBe('Invalid state parameter');
        });
    });

    describe('GET /profile - Get user profile', () => {
        it('should return user profile', async () => {
            const res = await app.request('/profile', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer mock_token_1' }
            }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.id).toBe(1);
            expect(data.username).toBe('user1');
            expect(data.avatar).toBe('avatar1.png');
            expect(data.permission).toBe(false);
        });

        it('should return admin permission for admin user', async () => {
            const res = await app.request('/profile', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer mock_token_2' }
            }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.permission).toBe(true);
        });

        it('should require authentication', async () => {
            const res = await app.request('/profile', { method: 'GET' }, env);
            
            expect(res.status).toBe(403);
        });
    });

    describe('PUT /profile - Update profile', () => {
        it('should update username', async () => {
            const res = await app.request('/profile', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: 'newname' }),
            }, env);
            
            expect(res.status).toBe(200);
            
            // Verify update
            const dbResult = sqlite.prepare(`SELECT username FROM users WHERE id = 1`).all() as any[];
            expect(dbResult[0]?.username).toBe('newname');
        });

        it('should update avatar', async () => {
            const res = await app.request('/profile', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ avatar: 'https://new-avatar.png' }),
            }, env);
            
            expect(res.status).toBe(200);
            
            const dbResult = sqlite.prepare(`SELECT avatar FROM users WHERE id = 1`).all() as any[];
            expect(dbResult[0]?.avatar).toBe('https://new-avatar.png/');
        });

        it('should require authentication', async () => {
            const res = await app.request('/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'test' }),
            }, env);
            
            expect(res.status).toBe(403);
        });

        it('should require at least one field', async () => {
            const res = await app.request('/profile', {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            }, env);
            
            expect(res.status).toBe(400);
        });
    });

    describe('POST /logout - Logout', () => {
        it('should clear token cookie', async () => {
            const res = await app.request('/logout', { method: 'POST' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data).toBeDefined();
        });

        it('should revoke the current server-side session version', async () => {
            const before = sqlite.prepare("SELECT auth_version FROM users WHERE id = 1").get() as { auth_version: number };
            const res = await app.request('/logout', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);
            const after = sqlite.prepare("SELECT auth_version FROM users WHERE id = 1").get() as { auth_version: number };

            expect(res.status).toBe(200);
            expect(after.auth_version).toBe(before.auth_version + 1);
        });
    });
});
