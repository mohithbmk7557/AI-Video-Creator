import { createProxyMiddleware } from "http-proxy-middleware";
import type { Request } from "express";

export const CLERK_PROXY_PATH = "/api/__clerk";

export function getClerkProxyHost(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-host"];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded;
  }
  return req.hostname ?? null;
}

export function clerkProxyMiddleware() {
  return createProxyMiddleware({
    target: "https://clerk.accounts.dev",
    changeOrigin: true,
    pathRewrite: { [`^${CLERK_PROXY_PATH}`]: "" },
    on: {
      proxyReq: (proxyReq, req) => {
        const host = getClerkProxyHost(req as Request);
        if (host) proxyReq.setHeader("x-forwarded-host", host);
      },
    },
  });
}
