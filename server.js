import { fileURLToPath } from 'url';
import path from 'path';
import reciteHandler from './api/recite.js';
import statusHandler from './api/status.js';
import disambiguateHandler from './api/disambiguate.js';
import compoundsHandler from './api/compounds.js';
import composeHandler from './api/compose.js';

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Map local server routes to our shared API handlers
app.get('/api/status', statusHandler);
app.post('/api/recite', reciteHandler);
app.post('/api/disambiguate', disambiguateHandler);
app.post('/api/compounds', compoundsHandler);
app.post('/api/compose', composeHandler);

// Serve frontend static files compiled by Vite in the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CHANT Server is running on port ${PORT}`);
});
