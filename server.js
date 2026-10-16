import app from './api/index.js';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');

// Serve SPA frontend in local dev
app.use(express.static(DIST_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 3033;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gami-Class Local Development Server running on port ${PORT}`);
  if (process.env.POSTGRES_URL || process.env.DATABASE_URL) {
    console.log(`📦 Connected to PostgreSQL / Supabase`);
  } else {
    console.log(`🗄️  Running in Local Offline Mode (data/db.json)`);
  }
});
