import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

/** Parses an id that must be a positive integer, rejecting "abc", "1.5", "-3" and friends. */
export function parseId(raw: unknown, field: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw badRequest(`${field} must be a positive integer`);
  }
  return value;
}

export function parseBoolean(raw: unknown, field: string): boolean {
  if (typeof raw === 'boolean') return raw;
  if (raw === 1 || raw === 0) return raw === 1;
  if (raw === 'true' || raw === 'false') return raw === 'true';
  throw badRequest(`${field} must be a boolean`);
}

export function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = handler(req, res, next) as unknown;
      if (result instanceof Promise) result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}
