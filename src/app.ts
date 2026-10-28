import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { errorMiddleware } from './lib/errors';
import healthRoutes from './routes/health';
import scrubRoutes from './routes/scrub';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  // Evidence payloads carry transcripts and chat logs, which are bigger than
  // a form post but nowhere near unbounded - an uncapped body is a free way
  // to exhaust the process.
  app.use(express.json({ limit: '2mb' }));

  app.use(healthRoutes);
  app.use('/api/v1', scrubRoutes);

  app.use(errorMiddleware);
  return app;
}
