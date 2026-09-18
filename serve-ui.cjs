const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const html = path.join(__dirname, 'image-to-slice', 'dist', 'ui.html');
http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(html).pipe(res);
}).listen(18788, '127.0.0.1', () => console.log('Image To Slice UI: http://127.0.0.1:18788'));
