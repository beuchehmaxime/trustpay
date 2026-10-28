import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Persistence for the user's own account record. */
export const UserRepository = {
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
  findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, fullName: true },
    });
  },
  findByPhone(phone: string) {
    return prisma.user.findUnique({
      where: { phone },
      select: { id: true, fullName: true },
    });
  },
  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },
};
