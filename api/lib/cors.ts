import type { VercelRequest, VercelResponse } from "@vercel/node";

type CorsOptions = {
  origin?: string | string[];
  methods?: string[];
  headers?: string[];
};

const defaultOptions: CorsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  headers: ["Content-Type", "Authorization"],
};

export function cors(options: CorsOptions = {}) {
  const config = { ...defaultOptions, ...options };

  return function corsMiddleware(request: VercelRequest, response: VercelResponse) {
    const origin = Array.isArray(config.origin) ? config.origin.join(", ") : config.origin || "*";

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", config.methods?.join(", ") || "GET, POST, PUT, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", config.headers?.join(", ") || "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.status(200).end();
      return true;
    }

    return false;
  };
}

export function withCors(handler: (req: VercelRequest, res: VercelResponse) => void, options?: CorsOptions) {
  const corsMiddleware = cors(options);

  return function corsHandler(request: VercelRequest, response: VercelResponse) {
    const isPreflight = corsMiddleware(request, response);
    if (isPreflight) return;

    return handler(request, response);
  };
}
