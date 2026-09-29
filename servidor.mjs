// Servidor local para desenvolvimento, sem dependências (npm start).
// Os módulos JS do navegador não carregam abrindo o index.html direto do
// disco (file://), então é preciso servir a pasta por HTTP.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const PORTA = Number(process.env.PORT) || 5500;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

createServer(async (req, res) => {
  try {
    const caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let arquivo = resolve(RAIZ, `.${caminho}`);
    // Nunca sai da pasta do projeto (ex.: /../../arquivo)
    if (!arquivo.startsWith(resolve(RAIZ) + sep) && arquivo !== resolve(RAIZ)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(arquivo).catch(() => null))?.isDirectory()) arquivo = join(arquivo, 'index.html');
    const conteudo = await readFile(arquivo);
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(arquivo).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(conteudo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado');
  }
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`Gestão de Reuniões rodando em http://localhost:${PORTA}`);
});
