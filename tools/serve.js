// Servidor estático para desarrollo local de la PWA (que es buildless: no hay
// bundler ni node_modules, se sirven los archivos tal cual).
// Uso: node tools/serve.js [carpeta] [puerto]
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || 'app');
const port = Number(process.argv[3] || 5173);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  const ruta = decodeURIComponent(req.url.split('?')[0]);
  let archivo = path.join(root, ruta);
  if (ruta.endsWith('/')) archivo = path.join(archivo, 'index.html');

  // No servir nada fuera de la carpeta raíz.
  if (!archivo.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Prohibido');
    return;
  }

  fs.readFile(archivo, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado: ' + ruta);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      // Sin caché: en desarrollo queremos ver el cambio, no lo que guardó el
      // navegador. El Service Worker ya maneja el caché real en producción.
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(port, () => {
  console.log(`Sirviendo ${root} en http://localhost:${port}`);
});
