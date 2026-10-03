import express from 'express';
import cors from 'cors';
import { config } from './config';
import { requestLogger } from './middleware/requestLogger';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes';

const app = express();

// ─── Global Middleware ──────────────────────────────────
const corsOrigin =
  config.cors.origin === '*'
    ? '*'
    : config.cors.origin.includes(',')
    ? config.cors.origin.split(',').map((s) => s.trim())
    : config.cors.origin;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(requestLogger);

// ─── API Routes ─────────────────────────────────────────
app.use('/api', apiRouter);

// ─── Error Handling ─────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
