import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { AdminContext } from './context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createStaticRoutes(ctx: AdminContext): Hono {
  const app = new Hono();
  const spaPath = path.resolve(__dirname, '../../../viewer/admin/index.html');

  app.get('/admin', (c) => {
    if (fs.existsSync(spaPath)) {
      let html = fs.readFileSync(spaPath, 'utf-8');
      const token = c.req.query('token');
      const page = c.req.query('page') || '';
      const embed = c.req.query('embed');
      if (embed) {
        html = html.replace('</head>', '<style>.sidebar{display:none!important}.main{padding:0!important;height:100vh!important;width:100%!important}</style></head>');
      }
      if (token) {
        const injectScript = '<script>localStorage.setItem("admin_token","' + token + '");</script>';
        html = html.replace('</head>', injectScript + '</head>');
      }
      if (page) {
        html = html.replace("useState('dashboard')", "useState('" + page + "')");
      }
      return new Response(html, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } });
    }
    return c.text('Admin Portal not found', 404);
  });

  const jsFiles = ['kb-graph-renderer.js', 'gesture-fsm.js', 'camera-physics.js', 'zoom-animator.js', 'map-controls.js', 'lod-clustering.js', 'lod-manager.js', 'lod-animation.js'];
  for (const file of jsFiles) {
    app.get('/admin/' + file, (c) => {
      const fp = path.resolve(__dirname, '../../../viewer/admin/' + file);
      if (fs.existsSync(fp)) return new Response(fs.readFileSync(fp, 'utf-8'), { headers: { 'Content-Type': 'application/javascript' } });
      return c.text('Not found', 404);
    });
  }

  app.get('/admin/*', (c) => {
    if (fs.existsSync(spaPath)) {
      const html = fs.readFileSync(spaPath, 'utf-8');
      return c.html(html);
    }
    return c.text('Admin Portal not found', 404);
  });

  return app;
}
