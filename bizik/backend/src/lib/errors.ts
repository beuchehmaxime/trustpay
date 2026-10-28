import { Prisma } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { captureError } from './observability';

/**
 * Application error carrying an HTTP status and a BiZik error code
 * (SRS Appendix C). Thrown anywhere in a service/controller and rendered by
 * {@link errorMiddleware} into the platform's standard error shape.
 */
/**
 * The single user-facing message for any technical/internal failure (unhandled
 * exceptions, DB/network errors, timeouts). Business errors carry their own
 * specific message via {@link AppError}; this is only for the ones the user
 * can't act on.
 */
export const GENERIC_ERROR_MESSAGE = 'We can not carry out this action now. Please try again later.';

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

/** Wrap an async route handler so thrown errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Terminal error handler - must be registered last (4-arg signature). */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      code: 'Q-422',
      message: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof AppError) {
    // A rate-limited caller is told how long to wait in the standard header as
    // well as the body, so a client that knows nothing about our error shapes
    // still backs off correctly.
    const retryAfter = (err.details as { retryAfterSeconds?: number } | undefined)
      ?.retryAfterSeconds;
    if (typeof retryAfter === 'number' && retryAfter > 0) {
      res.set('Retry-After', String(Math.ceil(retryAfter)));
    }
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }
  // Anything reaching here that is NOT a known, handled shape is a server
  // fault. Logging it was the whole of the previous detection capability; now
  // it is captured, so it can reach a monitoring service and - for the classes
  // that mean money broke - a person.
  // Unique-constraint violation (e.g. duplicate email or phone) → friendly 409.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = ([] as string[]).concat((err.meta?.target as string[]) ?? []).join(',');
    const field = target.includes('phone')
      ? 'phone number'
      : target.includes('email')
        ? 'email'
        : 'value';
    return res.status(409).json({ code: 'Q-409', message: `This ${field} is already in use.` });
  }
  // A body we could not parse is the CALLER's mistake, not a server fault, and
  // body-parser signals it with a SyntaxError carrying an HTTP status. Letting
  // it fall through to the 500 below both mislabels it and buries it: a real
  // client bug - a POST sending the literal `null` to an endpoint that takes no
  // body - looked like the server breaking, and every mark-as-read failed for
  // hours while the admin console showed nothing useful.
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    typeof (err as SyntaxError & { status?: number }).status === 'number' &&
    'body' in err
  ) {
    console.warn(`[http] malformed request body on ${req.method} ${req.path}: ${err.message}`);
    return res.status(400).json({ code: 'Q-400', message: 'The request body could not be read.' });
  }

  // Unexpected/internal failures (bugs, DB/network hiccups, upstream timeouts):
  // capture the real error server-side, but never leak technical detail to the
  // user. Captured rather than only logged, so a fault on a single unwatched
  // host can reach a monitoring service and leave evidence that monitoring
  // happens at all.
  captureError(err, {
    scope: `http ${req.method} ${req.path}`,
    severity: 'error',
    userId: (req as Request & { user?: { id?: string } }).user?.id,
  });
  return res.status(500).json({ code: 'Q-500', message: GENERIC_ERROR_MESSAGE });
}
