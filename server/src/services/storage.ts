import { Hono } from "hono";
import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { getStorageObject, putStorageObject } from "../utils/storage";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/gif", "gif"],
    ["image/webp", "webp"],
]);
const ALLOWED_PUBLIC_TYPES = new Set([
    ...ALLOWED_UPLOAD_TYPES.keys(),
    "image/x-icon",
    "image/vnd.microsoft.icon",
]);

export function resolvePublicStorageKey(env: Env, rawKey: string) {
    let key: string;
    try {
        key = decodeURIComponent(rawKey);
    } catch {
        return null;
    }

    if (!key || key.includes("\\") || key.includes("\0") || key.startsWith("/")) {
        return null;
    }
    const segments = key.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
        return null;
    }

    const publicFolder = (env.S3_FOLDER || "images").replace(/^\/+|\/+$/g, "");
    if (!publicFolder || !key.startsWith(`${publicFolder}/`)) {
        return null;
    }
    return key;
}

function buf2hex(buffer: ArrayBuffer) {
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

export function StorageService(): Hono {
    const app = new Hono();

    // POST /storage
    app.post('/', async (c: AppContext) => {
        const uid = c.get('uid');
        const admin = c.get('admin');
        const env = c.get('env');

        if (!uid) {
            return c.text('Unauthorized', 401);
        }

        if (!admin) {
            return c.text('Permission denied', 403);
        }

        const body = await profileAsync(c, 'storage_parse', () => c.req.parseBody());
        const file = body.file as File;

        if (!file || typeof file.arrayBuffer !== 'function') {
            return c.text('File is required', 400);
        }

        if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE) {
            return c.text('Invalid file size', 400);
        }

        const suffix = ALLOWED_UPLOAD_TYPES.get(file.type);
        if (!suffix) {
            return c.text('Disallowed file type', 400);
        }
        
        const fileBuffer = await profileAsync(c, 'storage_file_buffer', () => file.arrayBuffer());
        const hashArray = await profileAsync(c, 'storage_hash', () => crypto.subtle.digest(
            { name: 'SHA-256' },
            fileBuffer
        ));
        const hash = buf2hex(hashArray);
        const hashkey = `${hash}.${suffix}`;
        
        try {
            const result = await profileAsync(c, 'storage_put', () => putStorageObject(env, hashkey, file, file.type, new URL(c.req.url).origin));
            return c.json({ url: result.url });
        } catch (e: any) {
            console.error(e.message);
            const status = e.message?.includes('is not defined') ? 500 : 400;
            return c.text(e.message, status);
        }
    });

    return app;
}

export function BlobService(): Hono {
    const app = new Hono();

    app.get("/*", async (c: AppContext) => {
        const env = c.get("env");
        const rawKey = c.req.path.replace(/^\/blob\/?/, "");
        const key = resolvePublicStorageKey(env, rawKey);

        if (!key) {
            return c.text("Not found", 404);
        }

        try {
            const response = await profileAsync(c, "blob_fetch", () => getStorageObject(env, key));

            if (!response) {
                return c.text("Not found", 404);
            }

            const headers = new Headers(response.headers);
            const contentType = headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
            if (!contentType || !ALLOWED_PUBLIC_TYPES.has(contentType)) {
                return c.text("Not found", 404);
            }
            headers.set("X-Content-Type-Options", "nosniff");
            headers.set("Content-Security-Policy", "default-src 'none'; sandbox");

            return new Response(response.body, {
                status: response.status,
                headers,
            });
        } catch (error) {
            console.error("Blob fetch failed:", error);
            return c.text("Blob fetch failed", 500);
        }
    });

    return app;
}
