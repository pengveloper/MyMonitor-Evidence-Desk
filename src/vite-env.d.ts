/// <reference types="vite/client" />

interface Window {
  umami?: {
    // Tracker calls are async. Umami v3.1.0 swallows its internal fetch
    // failures, while test/extension wrappers can still return a rejecting
    // promise, so the facade must retain and observe the real return value.
    track: (event: string, data?: Record<string, unknown>) => void | Promise<unknown>;
    identify: (data: Record<string, unknown>) => void | Promise<unknown>;
  };
}

// Defined only by the independent synthetic demo build. Absent in personal production.
declare const __EVIDENCE_DESK_STATIC__: boolean;
declare const __APP_VERSION__: string;
declare const __BUILD_HASH__: string;
declare const __CLERK_JS_VERSION__: string;
declare const __VERCEL_ANALYTICS_ENABLED__: boolean;

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_WS_API_URL?: string;
  readonly VITE_MYMONITOR_PROFILE?: string;
  readonly VITE_MYMONITOR_JASYNQ_BRIDGE_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
