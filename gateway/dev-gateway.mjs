// One address for both apps in local development — the same routing
// gateway/nginx.conf does in production:
//
//   /material/api/*  -> Material API   (prefix removed: the API serves /api/*)
//   everything else  -> the application (vinext dev server), Material screens included
//
// One origin means one cookie jar, which is what lets the Payment sign-in carry
// over to Material. No dependencies; websockets (both apps' hot reload) pass through.
import http from 'node:http';

const PORT = Number(process.env.GATEWAY_PORT ?? 8000);
const PAYMENT = { host: '127.0.0.1', port: Number(process.env.PAYMENT_PORT ?? 5173) };
const MATERIAL_API = { host: '127.0.0.1', port: Number(process.env.MATERIAL_API_PORT ?? 4100) };

function route(url = '/') {
  if (url.startsWith('/material/api/')) return { ...MATERIAL_API, path: url.slice('/material'.length) };
  return { ...PAYMENT, path: url };
}

function headersFor(req) {
  const h = { ...req.headers };
  const ip = req.socket.remoteAddress ?? '';
  h['x-forwarded-for'] = h['x-forwarded-for'] ? `${h['x-forwarded-for']}, ${ip}` : ip;
  h['x-forwarded-proto'] = 'http';
  h['x-forwarded-host'] = req.headers.host ?? '';
  return h;
}

const server = http.createServer((req, res) => {
  const t = route(req.url);
  const upstream = http.request(
    { host: t.host, port: t.port, path: t.path, method: req.method, headers: headersFor(req) },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.rawHeaders);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`Gateway: nothing answering on ${t.host}:${t.port} yet — is that app still starting?`);
  });
  req.pipe(upstream);
});

server.on('upgrade', (req, socket, head) => {
  const t = route(req.url);
  const upstream = http.request({
    host: t.host, port: t.port, path: t.path, method: req.method, headers: headersFor(req),
  });
  upstream.on('upgrade', (up, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${up.statusCode} ${up.statusMessage}`];
    for (let i = 0; i < up.rawHeaders.length; i += 2) lines.push(`${up.rawHeaders[i]}: ${up.rawHeaders[i + 1]}`);
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (upHead?.length) socket.write(upHead);
    if (head?.length) upSocket.write(head);
    upSocket.pipe(socket).pipe(upSocket);
    upSocket.on('error', () => socket.destroy());
    socket.on('error', () => upSocket.destroy());
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});

server.listen(PORT, () => {
  console.log(`gateway listening on http://localhost:${PORT}  (the application; Material API at /material/api)`);
});
