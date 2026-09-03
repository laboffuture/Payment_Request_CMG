// Isolated so the static `cloudflare:workers` specifier sits behind a dynamic
// import boundary. Importing it eagerly crashes any non-Workers runtime at module
// load (Node throws ERR_UNSUPPORTED_ESM_URL_SCHEME), which took down `vinext start`
// and the rendered-html test before the app could even respond.
export { env } from "cloudflare:workers";
