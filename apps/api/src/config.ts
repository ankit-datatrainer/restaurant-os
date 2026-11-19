import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable ${name}. Copy apps/api/.env.example to apps/api/.env and fill it in.`);
  }
  return v;
}

export const config = {
  // API_PORT wins so that tools which inject PORT for the web app (preview harnesses, IDEs)
  // never make the API bind to the website's port. Hosting platforms that set PORT still work.
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 4000),
  host: process.env.API_HOST || undefined,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  demoAdminEmail: process.env.DEMO_ADMIN_EMAIL ?? 'demo@restaurantos.app',
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD ?? 'demo1234',
} as const;

export const isProd = config.nodeEnv === 'production';
