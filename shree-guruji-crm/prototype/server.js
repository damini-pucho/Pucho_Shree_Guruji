// Zero-dependency dev server: serves ./public and reloads the browser when a file changes.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const RELOAD = !process.argv.includes('--no-reload');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const clients = new Set();
const SNIPPET = '<script>new EventSource("/__reload").onmessage=()=>location.reload()</script>';

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain' }); return res.end('Bad address'); }

  if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (url === '/__reload') {
    if (!RELOAD) { res.writeHead(204); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }

  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file);
    if (ext === '.html' && RELOAD) data = Buffer.from(data.toString().replace('</body>', SNIPPET + '</body>'));
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// A browser that opens https://localhost gets "400 Bad Request" from a plain-http server. Say so in the terminal.
let warned = false;
server.on('connection', sock => sock.once('data', buf => {
  if (buf[0] === 0x16 && !warned) {
    warned = true;
    console.warn(`\n  The browser tried https://. This dev server is plain http — open  http://localhost:${PORT}  (not https).\n`);
  }
}));
server.on('clientError', (err, sock) => { if (sock.writable) sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already used by another program.\n  Close it, or run on another port:\n    Mac/Linux:   PORT=4000 npm run dev\n    Windows:     set PORT=4000 && npm run dev   (PowerShell: $env:PORT=4000; npm run dev)\n`);
  } else console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  Shree Guruji CRM is running.\n  Open:  http://localhost:${PORT}   (or http://127.0.0.1:${PORT})` + (RELOAD ? '\n  Auto-reload is on. Press Ctrl+C to stop.\n' : '\n'));
});

if (RELOAD) {
  let t;
  try {
    fs.watch(ROOT, { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => clients.forEach(c => c.write('data: reload\n\n')), 100); });
  } catch { fs.watch(ROOT, () => { clearTimeout(t); t = setTimeout(() => clients.forEach(c => c.write('data: reload\n\n')), 100); }); }
}
