type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface Env {
  TAB_SHARING_ENABLED?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  AUTH_REDIRECT_ORIGIN?: string;
  RESEND_API_KEY?: string;
  CONTACT_LIMIT?: RateLimit;
  ASSETS: Fetcher;
  ROOM: DurableObjectNamespace;
}
