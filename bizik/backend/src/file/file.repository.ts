import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** Persistence for uploaded files (S3/local object metadata). */
export const FileRepository = {
  create(data: Prisma.FileUncheckedCreateInput) {
    return prisma.file.create({ data });
  },
  findById(id: string) {
    return prisma.file.findUnique({ where: { id } });
  },
  findManyByIds(ids: string[]) {
    return prisma.file.findMany({ where: { id: { in: ids } } });
  },
};
