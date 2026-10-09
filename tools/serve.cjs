const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {root, assets, serviceWorker} = require('./web-assets.cjs');
const base = '/' + (process.env.MATCHUP_BASE_PATH || '').split('/').filter(Boolean).join('/');
const prefix = base === '/' ? '/' : base + '/';
const files = new Map([[prefix, 'index.html'], ...assets.map(file => [prefix + file, file]), [prefix + 'sw.js', 'sw.js']]);
const types = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html; charset=utf-8', '.png':'image/png', '.mp4':'video/mp4', '.webmanifest':'application/manifest+json'};
http.createServer((req, res) => {
  const file = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!file || !fs.existsSync(path.join(root, file))) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
  if (file === 'sw.js') { res.end(serviceWorker()); return; }
  const location = path.join(root, ...file.split('/'));
  const size = fs.statSync(location).size;
  if (file.endsWith('.mp4')) {
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.headers.range && req.method === 'GET') {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const start = range?.[1] ? Number(range[1]) : Math.max(0, size - Number(range?.[2]));
      const end = range?.[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (!range || !(range[1] || range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return;
      }
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(location, { start, end }).pipe(res); return;
    }
  }
  res.setHeader('Content-Length', size);
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(location).pipe(res);
}).listen(Number(process.env.SPARK_TEST_PORT || 8089), '127.0.0.1');
