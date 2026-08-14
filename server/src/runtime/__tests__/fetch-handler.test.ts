import { afterEach, describe, expect, it, mock } from "bun:test";

const getAppFetch = mock();

mock.module("../app-instance", () => ({
  getApp: () => ({
    fetch: getAppFetch,
  }),
}));

describe("handleFetch", () => {
  afterEach(() => {
    getAppFetch.mockReset();
  });

  it("does not serve frontend assets from the Worker", async () => {
    getAppFetch.mockResolvedValue(new Response("app-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const response = await handleFetch(new Request("http://localhost/assets/app.js"), {} as Env);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("routes /api/blob requests to the app", async () => {
    getAppFetch.mockResolvedValue(new Response("blob-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const response = await handleFetch(new Request("http://localhost/api/blob/images/test.txt"), {} as Env);

    expect(await response.text()).toBe("blob-body");
    expect(getAppFetch).toHaveBeenCalledTimes(1);
    expect(new URL(getAppFetch.mock.calls[0][0].url).pathname).toBe("/blob/images/test.txt");
  });

  it("routes the exact /api path to the app root", async () => {
    getAppFetch.mockResolvedValue(new Response("api-root", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const response = await handleFetch(new Request("http://localhost/api"), {} as Env);

    expect(await response.text()).toBe("api-root");
    expect(new URL(getAppFetch.mock.calls[0][0].url).pathname).toBe("/");
  });
});
