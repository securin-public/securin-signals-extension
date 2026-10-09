// Serves demo/index.html over http so the content script runs on it.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 5174);
const html = readFileSync(new URL('../demo/index.html', import.meta.url));

createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(port, '127.0.0.1', () => {
  console.log(`Demo page: http://127.0.0.1:${port}/`);
});
