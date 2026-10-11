import 'dotenv/config';
import { z } from 'zod';

const env = z
  .object({
    PORT: z.coerce.number().default(4000),
    NODE_ENV: z.string().default('development'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_BUCKET: z.string().default('reports'),
    LLM_PROVIDER: z.enum(['ollama', 'gemini', 'mock']).default('ollama'),
    OLLAMA_URL: z.string().default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().default('llama3.2'),
    GEMINI_API_KEY: z.string().default(''),
    GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
    MAX_UPLOAD_MB: z.coerce.number().default(15),
    JOB_CONCURRENCY: z.coerce.number().default(2),
    ENABLE_SOCKETIO: z.string().default('false'),
    RESEND_API_KEY: z.string().default(''),
    RESEND_FROM_EMAIL: z.string().default('HealthTrack <onboarding@resend.dev>'),
    APP_URL: z.string().default('http://localhost:5173'),
  })
  .parse(process.env);

export const config = {
  ...env,
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
  socketio: env.ENABLE_SOCKETIO === 'true',
};

export const DISCLAIMER =
  'HuaZoe AI Automated Diagnostic Engine: Medical report analyzed, biomarkers evaluated against reference intervals, and personalized clinical nutrition & exercise protocols generated.';
