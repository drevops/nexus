/**
 * Minimal, dependency-free static file server for a folder.
 *
 * createStaticServer() returns a node:http server that serves the files under
 * `root` and is not yet listening. ES modules don't load over file://, so the
 * app is always served over HTTP.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function createStaticServer(root) {
  const base = resolve(root);

  return createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) {
        pathname += 'index.html';
      }

      // The separator keeps a sibling folder whose name starts with the
      // root's name out.
      const file = normalize(join(base, pathname));
      if (!file.startsWith(base + sep)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  });
}
