import { toAuthUser } from '../auth/auth.service';
import { canonicalCountry } from '../lib/domain';
import { AppError } from '../lib/errors';
import { isCountryEnabled } from '../lib/system-settings';
import { normalizePhone } from '../lib/phone';
import { UserRepository } from './user.repository';
import { UsernameService } from './username.service';
import { LookupInput, UpdateProfileInput } from './user.validation';

export const UserService = {
  async getMe(userId: string) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found');
    // Accounts created before handles existed get one on first sight, so every
    // user can be paid by name without a migration step.
    if (!user.username) {
      await UsernameService.ensureFor(user.id, user.fullName).catch(() => undefined);
      const refreshed = await UserRepository.findById(userId);
      if (refreshed) return toAuthUser(refreshed);
    }
    return toAuthUser(user);
  },

  /**
   * Is this email/phone already a BiZik account? Used by project creation to
   * show "X is on BiZik" so the inviter confirms the right person. Returns the
   * name on a match - nothing else is exposed.
   */
  async lookup(viewerId: string, input: LookupInput) {
    // Phone is the primary identity, so match on it first (normalised).
    const phone = input.phone ? normalizePhone(input.phone) : undefined;
    const match =
      (phone ? await UserRepository.findByPhone(phone) : null) ??
      (input.email ? await UserRepository.findByEmail(input.email) : null);
    if (!match) return { found: false };
    return { found: true, fullName: match.fullName, self: match.id === viewerId };
  },

  /** Update the user's own editable profile fields. */
  async updateMe(userId: string, input: UpdateProfileInput) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found');

    // Phone is the login identity AND how money is routed (deal invitations,
    // transfers by number), so it cannot be changed by editing a profile field:
    // that would let a stolen session re-point the account, or let someone claim
    // a number they do not control. Changing it has to prove the new number.
    let phone: string | undefined;
    if (input.phone !== undefined) {
      const requested = normalizePhone(input.phone);
      if (requested !== user.phone) {
        throw new AppError(
          400,
          'Q-400',
          'To change your phone number, verify the new number with the code we send you.',
        );
      }
    }

    // Email is optional and editable; '' clears it. Enforce uniqueness.
    let email: string | null | undefined;
    if (input.email !== undefined) {
      email = input.email ? input.email.toLowerCase().trim() : null;
      if (email) {
        const owner = await UserRepository.findByEmail(email);
        if (owner && owner.id !== userId) {
          throw new AppError(409, 'Q-409', 'This email is already linked to another account.');
        }
      }
    }

    // The country is load-bearing: it decides the home currency the whole wallet
    // is shown in, and whether KYC will even be accepted. An unrecognised
    // spelling silently falls back to USD, so a Cameroonian sees "USD 5,000"
    // where they meant FCFA - and a disabled market is accepted here only to be
    // refused later at verification, with no clue why. Resolve and check it at
    // the point it is set.
    let country: string | undefined;
    if (input.country !== undefined) {
      country = canonicalCountry(input.country) ?? undefined;
      if (!country) throw new AppError(400, 'Q-400', 'That is not a country we recognise.');
      if (!isCountryEnabled(country)) {
        throw new AppError(403, 'Q-403', 'BiZik is not available in that country yet.');
      }
    }

    const updated = await UserRepository.update(userId, {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(phone !== undefined ? { phone } : {}),
      // A new address is unverified until it is proven. Staff MFA codes go to
      // this address, so silently keeping `emailVerified` would let a stolen
      // session redirect them.
      ...(email !== undefined ? { email, emailVerified: false } : {}),
      ...(country !== undefined ? { country } : {}),
      ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
    });
    return toAuthUser(updated);
  },
};
