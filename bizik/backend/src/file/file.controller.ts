import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { readObjectStream } from '../lib/storage';
import { FileService } from './file.service';

const viewer = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user;
};

export const FileController = {
  /** Stream a stored file to its owner or a privileged reviewer. */
  download: asyncHandler(async (req: Request, res: Response) => {
    const file = await FileService.getForViewer(req.params.id, viewer(req));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    readObjectStream(file.objectKey)
      .on('error', () => {
        if (!res.headersSent) {
          res.status(404).json({ code: 'Q-404', message: 'File contents missing' });
        }
      })
      .pipe(res);
  }),
};
