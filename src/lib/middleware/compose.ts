import type { NextRequest } from "next/server";

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<Response>;
type Middleware = (handler: RouteHandler) => RouteHandler;

export function compose(...middlewares: Middleware[]) {
  return (handler: RouteHandler): RouteHandler =>
    middlewares.reduceRight((next, middleware) => middleware(next), handler);
}
