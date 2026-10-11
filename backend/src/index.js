import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { ApiError, log } from './utils.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import healthRoutes from './routes/health.js';
import adminRoutes from './routes/admin.js';
import { initRealtime } from './realtime.js';
import { resumePending } from './services/jobs.js';

const app = express();
app.set('trust proxy', 1); // Railway / reverse proxy
app.use(helmet());
// Web origins only; native Android requests have no Origin header and are unaffected by CORS.
app.use(cors({ origin: config.corsOrigins, credentials: false }));
app.use(express.json({ limit: '200kb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
// Stricter limit for credential endpoints
app.use('/api/v1/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 20 }));
app.use('/api/v1/auth/register', rateLimit({ windowMs: 60 * 60_000, limit: 20 }));

// Privacy-safe request log: method, path (no query string), status, duration.
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => log.info('req', { m: req.method, p: req.path.replace(/[0-9a-f-]{36}/g, ':id'), s: res.statusCode, ms: Date.now() - t }));
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/reports', authenticate, reportRoutes);
api.use('/admin', authenticate, adminRoutes);
api.use('/', authenticate, healthRoutes);
app.use('/api/v1', api);

app.use((_req, _res, next) => next(new ApiError(404, 'not_found', 'Route not found')));

// Consistent error shape: { error: { code, message, details? } }
app.use((err, _req, res, _next) => {
  let e = err;
  if (err?.code === 'LIMIT_FILE_SIZE') e = new ApiError(413, 'file_too_large', `Max upload is ${config.MAX_UPLOAD_MB} MB`);
  else if (err?.type === 'entity.parse.failed') e = new ApiError(400, 'bad_json', 'Malformed JSON');
  else if (!(err instanceof ApiError)) {
    log.error('unhandled', { name: err?.name });
    e = new ApiError(500, 'internal_error', 'Something went wrong');
  }
  res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
});

const server = http.createServer(app);
initRealtime(server);
server.listen(config.PORT, () => {
  log.info('listening', { port: config.PORT });
  resumePending();
});
