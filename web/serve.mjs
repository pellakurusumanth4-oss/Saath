// Serves web/ on http://127.0.0.1:8099 for the AR camera page (web/ar/). On the phone, after
// `adb reverse tcp:8099 tcp:8099`, Chrome opens http://localhost:8099/ar/, which counts as a secure
// page, so WebXR is allowed. shortcut: needs the laptop plugged in; host web/ on HTTPS to go without it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript' };
http
  .createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
    const file = path.join(root, path.normalize(name));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404, { 'cache-control': 'no-store' }).end('not found');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(8099, '127.0.0.1', () => console.log('serving', root, 'on http://127.0.0.1:8099'));
