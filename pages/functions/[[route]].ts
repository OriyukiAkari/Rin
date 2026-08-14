interface ServiceFetcher {
  fetch(request: Request): Promise<Response>;
}

interface PagesEnv {
  RIN_API: ServiceFetcher;
}

interface PagesContext {
  request: Request;
  env: PagesEnv;
}

/**
 * Keep the browser on the Pages origin while forwarding dynamic routes to the
 * Worker over Cloudflare's internal service-binding transport.
 */
export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  return env.RIN_API.fetch(request);
}
