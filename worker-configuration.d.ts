// Bindings declared in .openai/hosting.json and simulated in vite.config.ts.
// Keeps `env` from "cloudflare:workers" strongly typed in db/ and app/api/.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    IMAGES: {
      input(stream: ReadableStream): {
        transform(options: Record<string, unknown>): {
          output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
        };
      };
    };
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
  }
}

interface Env extends Cloudflare.Env {}
