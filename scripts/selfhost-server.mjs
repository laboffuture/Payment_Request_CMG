// Runs the built Worker in workerd for self-hosting, without wrangler's developer tooling.
//
// `wrangler dev` attaches a DevTools inspector to the runtime and relays every request and
// every database query (with its response body) through an inspector proxy. Nothing ever
// reads that stream in production, and the memory it holds grew until the service hit its
// limit and was killed - several times a day. Starting the worker through wrangler's API
// lets the inspector be switched off, which the command line cannot do.
//
// Same config file, same port and same storage folder as before (`.wrangler/state`).
import { unstable_startWorker } from "wrangler";

const port = Number(process.env.PORT || 4101);
const worker = await unstable_startWorker({
  config: "wrangler.selfhost.jsonc",
  dev: {
    inspector: false,
    remote: false,
    watch: false,
    liveReload: false,
    persist: process.env.PERSIST_TO || ".wrangler/state",
    server: { hostname: "127.0.0.1", port },
  },
});
await worker.ready;
console.log(`[selfhost] worker ready on 127.0.0.1:${port} (inspector off)`);

const stop = async () => {
  try { await worker.dispose(); } finally { process.exit(0); }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
