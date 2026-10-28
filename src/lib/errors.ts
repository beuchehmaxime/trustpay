import type { NextFunction, Request, Response } from 'express';

/**
 * One error shape, matching Bizik's so the two services speak the same
 * language across the boundary.
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Terminal error handler.
 *
 * Anything unrecognised is a server fault and gets one flat message - never
 * raw detail. An error here can be carrying a fragment of a case file, and a
 * case file is the thing this service exists to keep quiet about.
 */
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }
  console.error('[trustpay] unhandled:', (err as Error)?.message);
  return res.status(500).json({
    code: 'Q-500',
    message: 'We could not process that request.',
  });
}
