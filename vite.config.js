import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'

dotenv.config()

// Helper Vite plugin to serve Serverless API handlers locally inside the dev server
function localApiPlugin() {
  return {
    name: 'local-api-plugin',
    configureServer(server) {
      server.middlewares.use(bodyParser.json())
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api')) {
          return next()
        }

        // Decorate Response object with Express-like helpers
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (data) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };
        res.send = (data) => {
          res.end(data);
        };

        const parsedUrl = new URL(req.url, 'http://localhost');
        const endpoint = parsedUrl.pathname;

        try {
          if (endpoint === '/api/status') {
            const module = await server.ssrLoadModule('/api/status.js');
            return module.default(req, res);
          }
          if (endpoint === '/api/recite') {
            const module = await server.ssrLoadModule('/api/recite.js');
            return module.default(req, res);
          }
          if (endpoint === '/api/disambiguate') {
            const module = await server.ssrLoadModule('/api/disambiguate.js');
            return module.default(req, res);
          }
          if (endpoint === '/api/compounds') {
            const module = await server.ssrLoadModule('/api/compounds.js');
            return module.default(req, res);
          }
          if (endpoint === '/api/compose') {
            const module = await server.ssrLoadModule('/api/compose.js');
            return module.default(req, res);
          }
        } catch (err) {
          console.error("Vite API Plugin Error:", err);
          res.status(500).json({ error: err.message });
          return;
        }

        next();
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localApiPlugin()],
  base: './'
})
