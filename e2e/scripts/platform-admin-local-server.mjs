import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const host = '127.0.0.1';
const port = 4174;
const root = resolve(process.cwd(), 'apps/platform-admin');
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
  if (pathname === '/config.js') {
    response.writeHead(200, { 'content-type': types['.js'], 'cache-control': 'no-store' });
    response.end(
      "window.HABITTA_ADMIN_CONFIG={supabaseUrl:'http://platform-admin-e2e.invalid',supabaseAnonKey:'local-e2e-anon',apiBaseUrl:'http://platform-admin-e2e.invalid'};",
    );
    return;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = normalize(join(root, relative));
  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port, host, () => console.log(`Platform Admin E2E server listening on ${host}:${port}`));
