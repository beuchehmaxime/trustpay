import { NextFunction, Request, Response } from 'express';

import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import { roleCan } from '../lib/permissions';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

/**
 * Redis key holding the epoch-seconds cutoff before which a user's access
 * tokens are invalid. Set on logout / password reset / 2FA changes to honour
 * SRS FR-AUTH-007 ("logout invalidates all tokens for that user").
 */
export const revokeBeforeKey = (userId: string) => `auth:revoke-before:${userId}`;

/**
 * Marks ONE sign-in as revoked. "Sign out this device" used to write a
 * `revokedAt` on the Session row that nothing ever read, so a stolen session
 * kept working; access tokens now carry their session id and are checked here.
 */
export const revokedSessionKey = (sessionId: string) => `auth:session-revoked:${sessionId}`;

/** Require a valid, non-revoked access token. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'Q-401', 'Authentication required');
    }
    const claims = verifyAccessToken(header.slice(7));

    const cutoff = await redis.get(revokeBeforeKey(claims.sub));
    if (cutoff && claims.iat && claims.iat < Number(cutoff)) {
      throw new AppError(401, 'Q-401', 'Session has been revoked');
    }
    if (claims.sid && (await redis.get(revokedSessionKey(claims.sid)))) {
      throw new AppError(401, 'Q-401', 'Session has been revoked');
    }

    req.user = { id: claims.sub, role: claims.role };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, 'Q-401', 'Invalid or expired token'));
  }
}

/**
 * Attach the user if there is one, and carry on if there is not.
 *
 * For endpoints that serve both. The analytics ingest is the case it exists
 * for: most of the funnel happens before anyone signs up, so it has to accept
 * anonymous visitors, but an event from someone signed in is far more useful
 * with their id on it.
 *
 * A bad or expired token is treated exactly like no token - anonymous - rather
 * than as an error. The caller asked to be identified if possible, not to be
 * refused, and failing the request would break the very visitors it is meant to
 * measure.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const claims = verifyAccessToken(header.slice(7));
    const cutoff = await redis.get(revokeBeforeKey(claims.sub));
    if (cutoff && claims.iat && claims.iat < Number(cutoff)) return next();
    if (claims.sid && (await redis.get(revokedSessionKey(claims.sid)))) return next();
    req.user = { id: claims.sub, role: claims.role };
  } catch {
    // Anonymous. Deliberately silent: an expired token on an analytics beacon
    // is an ordinary event, not a problem worth a log line per page view.
  }
  next();
}

/**
 * Require the authenticated user to hold one of `roles` (case-insensitive).
 * Must be chained after {@link requireAuth}. Used to gate the admin /
 * compliance surfaces such as the KYC review queue (SRS MOD-09, FR-ADM-001).
 */
export function requireRole(...roles: string[]) {
  const allowed = new Set(roles.map((r) => r.toLowerCase()));
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role?.toLowerCase();
    if (!role || !allowed.has(role)) {
      return next(new AppError(403, 'Q-403', 'You do not have access to this resource.'));
    }
    next();
  };
}

/**
 * RBAC gate: require the authenticated user to be a platform operator whose
 * assigned {@link AdminRole} grants `perm` (super-admin roles grant everything).
 * Must be chained after {@link requireAuth}. This is the enforcement point for
 * every admin/platform action.
 */
export function requirePermission(perm: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.id;
      if (!uid) return next(new AppError(401, 'Q-401', 'Authentication required'));
      const user = await prisma.user.findUnique({
        where: { id: uid },
        include: { adminRole: true },
      });
      if (!user?.adminRole) {
        return next(new AppError(403, 'Q-403', 'You do not have access to the admin console.'));
      }
      if (roleCan(user.adminRole, perm)) return next();
      return next(
        new AppError(403, 'Q-403', 'You do not have permission to perform this action.'),
      );
    } catch (err) {
      next(
        err instanceof AppError
          ? err
          : new AppError(403, 'Q-403', 'Permission check failed.'),
      );
    }
  };
}
