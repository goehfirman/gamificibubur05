import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import pg from 'pg';
import {
  initFirebase,
  isFirebaseEnabled,
  getFirestoreRevision,
  getFullDbFromFirestore,
  modifyFirestoreDb,
  updateFirestoreDoc,
  deleteFirestoreDoc,
  bulkDeleteFirestoreDocs,
  getBoardsFromFirestore,
  modifyFirestoreBoards,
  reconcilePointsAndLedger,
  getFirebaseError,
  ARRAY_COLLECTIONS
} from './firebaseStore.js';

const { Pool } = pg;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Inisialisasi Firebase Admin jika environment variables tersedia
initFirebase();

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Fallback PostgreSQL jika digunakan
let pool = null;
if (!isFirebaseEnabled() && (process.env.POSTGRES_URL || process.env.DATABASE_URL)) {
  pool = new Pool({
    connectionString: (process.env.POSTGRES_URL || process.env.DATABASE_URL).replace(/\?.*$/, ""),
    ssl: { rejectUnauthorized: false }
  });
  pool.query(`
    CREATE TABLE IF NOT EXISTS gamiclass_store (
      id VARCHAR(50) PRIMARY KEY,
      data JSONB NOT NULL
    );
  `).catch(err => console.error('Gagal inisialisasi Postgres:', err));
}

const __filename = fileURLToPath(import.meta.url || 'file://' + __dirname + '/index.js');
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BOARDS_FILE = path.join(DATA_DIR, 'boards.json');

// Local in-memory safety cache untuk development mode lokal
let localDbMemory = null;
let localBoardsMemory = null;

async function readLocalDbSafe() {
  if (localDbMemory && Object.keys(localDbMemory).length > 2) {
    return localDbMemory;
  }
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    localDbMemory = JSON.parse(data);
    return localDbMemory;
  } catch {
    return localDbMemory || {};
  }
}

async function writeLocalDbSafe(db) {
  localDbMemory = db;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.warn('Gagal menulis data/db.json lokal:', err.message);
  }
}

async function readLocalBoardsSafe() {
  if (localBoardsMemory && Array.isArray(localBoardsMemory)) {
    return localBoardsMemory;
  }
  try {
    const data = await fs.readFile(BOARDS_FILE, 'utf-8');
    localBoardsMemory = JSON.parse(data);
    return localBoardsMemory;
  } catch {
    return localBoardsMemory || [];
  }
}

async function writeLocalBoardsSafe(boards) {
  localBoardsMemory = boards;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(BOARDS_FILE, JSON.stringify(boards, null, 2));
  } catch (err) {
    console.warn('Gagal menulis data/boards.json lokal:', err.message);
  }
}

// ─── HELPER FUNCTIONS DATABASE ───────────────────────────────────────────────

async function getFullDb() {
  if (isFirebaseEnabled()) {
    return await getFullDbFromFirestore();
  }
  if (pool) {
    try {
      const result = await pool.query("SELECT data FROM gamiclass_store WHERE id = 'main_db'");
      if (result.rows.length > 0) return result.rows[0].data;
      try {
        const initialData = await fs.readFile(DB_FILE, 'utf-8');
        const parsed = JSON.parse(initialData);
        await pool.query("INSERT INTO gamiclass_store (id, data) VALUES ('main_db', $1)", [JSON.stringify(parsed)]);
        return parsed;
      } catch (e) {
        return {};
      }
    } catch (err) {
      return {};
    }
  }
  return await readLocalDbSafe();
}

async function modifyDb(modifierFn) {
  if (isFirebaseEnabled()) {
    return await modifyFirestoreDb(modifierFn);
  }
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query("SELECT data FROM gamiclass_store WHERE id = 'main_db' FOR UPDATE");
      let db = res.rows.length > 0 ? res.rows[0].data : {};
      
      if (Object.keys(db).length === 0) {
        try {
          db = JSON.parse(await fs.readFile(DB_FILE, 'utf-8'));
        } catch (e) {}
      }

      db = modifierFn(db);
      db = reconcilePointsAndLedger(db);
      db._revision = Date.now();
      
      await client.query(
        "INSERT INTO gamiclass_store (id, data) VALUES ('main_db', $1) ON CONFLICT (id) DO UPDATE SET data = $1",
        [JSON.stringify(db)]
      );
      await client.query('COMMIT');
      return db;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  let db = await readLocalDbSafe();
  db = modifierFn(db);
  db = reconcilePointsAndLedger(db);
  db._revision = Date.now();
  await writeLocalDbSafe(db);
  return db;
}

async function getBoards() {
  if (isFirebaseEnabled()) {
    return await getBoardsFromFirestore();
  }
  if (pool) {
    try {
      const result = await pool.query("SELECT data FROM gamiclass_store WHERE id = 'boards'");
      if (result.rows.length > 0) return result.rows[0].data;
      return [];
    } catch {
      return [];
    }
  }
  return await readLocalBoardsSafe();
}

async function modifyBoards(modifierFn) {
  if (isFirebaseEnabled()) {
    return await modifyFirestoreBoards(modifierFn);
  }
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query("SELECT data FROM gamiclass_store WHERE id = 'boards' FOR UPDATE");
      let boards = res.rows.length > 0 ? res.rows[0].data : [];
      boards = modifierFn(boards);
      await client.query(
        "INSERT INTO gamiclass_store (id, data) VALUES ('boards', $1) ON CONFLICT (id) DO UPDATE SET data = $1",
        [JSON.stringify(boards)]
      );
      await client.query('COMMIT');
      return boards;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  let boards = await readLocalBoardsSafe();
  boards = modifierFn(boards);
  await writeLocalBoardsSafe(boards);
  return boards;
}

// ─── API ENDPOINTS ──────────────────────────────────────────────────────────

app.get('/api/sync/events', (req, res) => res.status(204).end());
app.get('/api/stream', (req, res) => res.status(204).end());

// Smart Delta Sync
app.get('/api/sync', async (req, res) => {
  const since = req.query.since ? Number(req.query.since) : 0;
  
  if (isFirebaseEnabled()) {
    const currentRev = await getFirestoreRevision();
    if (since && currentRev && since === currentRev) {
      return res.json({ modified: false, revision: currentRev });
    }
    const db = await getFullDbFromFirestore();
    const revision = db._revision || currentRev || Date.now();
    if (since && since === revision) {
      return res.json({ modified: false, revision });
    }
    return res.json({ modified: true, revision, db });
  }

  if (pool) {
    try {
      const revRes = await pool.query("SELECT data->>'_revision' as rev FROM gamiclass_store WHERE id = 'main_db'");
      const currentRev = revRes.rows.length > 0 ? Number(revRes.rows[0].rev || 0) : 0;
      if (since && currentRev && since === currentRev) {
        return res.json({ modified: false, revision: currentRev });
      }
    } catch(e) {}
  }
  
  const db = await getFullDb();
  const revision = db._revision || Date.now();
  if (since && since === revision) {
    return res.json({ modified: false, revision });
  }
  res.json({ modified: true, revision, db });
});

app.get('/api/db', async (req, res) => {
  res.json(await getFullDb());
});

app.put('/api/db', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Invalid body' });
  const finalDb = await modifyDb((db) => {
    Object.keys(req.body).forEach(k => {
      const incomingVal = req.body[k];
      const existingVal = db[k];
      if (k === 'users' && Array.isArray(incomingVal) && Array.isArray(existingVal)) {
        const incomingMap = new Map(incomingVal.map(u => [u.uid, u]));
        db.users = existingVal.map(existing => {
          const incoming = incomingMap.get(existing.uid);
          return incoming ? { ...existing, ...incoming } : existing;
        });
        const existingUids = new Set(existingVal.map(u => u.uid));
        incomingVal.forEach(u => {
          if (!existingUids.has(u.uid)) db.users.push(u);
        });
      } else if (ARRAY_COLLECTIONS.has(k) && Array.isArray(incomingVal) && Array.isArray(existingVal)) {
        const existingMap = new Map(existingVal.map(item => [item?.id, item]));
        incomingVal.forEach(item => {
          if (item && item.id) {
            const ex = existingMap.get(item.id);
            existingMap.set(item.id, ex ? { ...ex, ...item } : item);
          }
        });
        db[k] = Array.from(existingMap.values());
      } else if (typeof incomingVal === 'object' && incomingVal !== null && !Array.isArray(incomingVal)) {
        db[k] = { ...(existingVal || {}), ...incomingVal };
      } else {
        if (incomingVal !== undefined) db[k] = incomingVal;
      }
    });
    return reconcilePointsAndLedger(db);
  });
  res.json({ success: true, revision: finalDb._revision });
});

app.get('/api/collections/:collection', async (req, res) => {
  const { collection } = req.params;
  const db = await getFullDb();
  let items = db[collection] || [];
  if (!Array.isArray(items) && typeof items === 'object' && items !== null) {
    items = Object.values(items);
  }
  res.json(items.filter(i => i != null));
});

app.put('/api/collections/:collection/:id', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Invalid body' });
  const { collection, id } = req.params;

  if (isFirebaseEnabled()) {
    const revision = await updateFirestoreDoc(collection, id, req.body);
    return res.json({ success: true, revision });
  }

  const finalDb = await modifyDb((db) => {
    const isArray = ARRAY_COLLECTIONS.has(collection) || Array.isArray(db[collection]);
    if (!db[collection]) db[collection] = isArray ? [] : {};

    if (Array.isArray(db[collection])) {
      const idx = db[collection].findIndex(item => item && (item.id === id || item.uid === id));
      if (idx >= 0) db[collection][idx] = { ...db[collection][idx], ...req.body };
      else db[collection].push(req.body);
    } else {
      db[collection][id] = { ...(db[collection][id] || {}), ...req.body };
    }
    return db;
  });
  res.json({ success: true, revision: finalDb._revision });
});

app.post('/api/bulk-delete', async (req, res) => {
  const { deletes } = req.body;
  if (!Array.isArray(deletes)) return res.json({ success: true });

  if (isFirebaseEnabled()) {
    const revision = await bulkDeleteFirestoreDocs(deletes);
    return res.json({ success: true, revision });
  }
  
  const finalDb = await modifyDb((db) => {
    for (const { collection, id } of deletes) {
      if (db[collection]) {
        if (Array.isArray(db[collection])) {
          db[collection] = db[collection].filter(item => item && item.id !== id && item.uid !== id);
        } else {
          delete db[collection][id];
        }
      }
    }
    return db;
  });
  res.json({ success: true, revision: finalDb._revision });
});

app.delete('/api/collections/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;

  if (isFirebaseEnabled()) {
    const revision = await deleteFirestoreDoc(collection, id);
    return res.json({ success: true, revision });
  }

  const finalDb = await modifyDb((db) => {
    if (db[collection]) {
      if (Array.isArray(db[collection])) {
        db[collection] = db[collection].filter(item => item && item.id !== id && item.uid !== id);
      } else {
        delete db[collection][id];
      }
    }
    return db;
  });
  res.json({ success: true, revision: finalDb._revision });
});

// ─── Boards API ────────────────────────────────────────────────────────
app.get('/api/boards', async (req, res) => res.json(await getBoards()));

app.post('/api/boards', async (req, res) => {
  await modifyBoards((boards) => { boards.unshift(req.body); return boards; });
  res.json(req.body);
});

app.patch('/api/boards/:id', async (req, res) => {
  await modifyBoards((boards) => {
    const idx = boards.findIndex(b => b.id === req.params.id);
    if (idx >= 0) boards[idx] = { ...boards[idx], ...req.body, updatedAt: new Date().toISOString() };
    return boards;
  });
  res.json({ success: true });
});

app.put('/api/boards/:id/elements', async (req, res) => {
  await modifyBoards((boards) => {
    const idx = boards.findIndex(b => b.id === req.params.id);
    if (idx >= 0) {
      boards[idx].elements = boards[idx].elements || {};
      boards[idx].elements[req.body.id] = req.body;
    }
    return boards;
  });
  res.json({ success: true });
});

app.delete('/api/boards/:id/elements/:elementId', async (req, res) => {
  await modifyBoards((boards) => {
    const idx = boards.findIndex(b => b.id === req.params.id);
    if (idx >= 0 && boards[idx].elements) {
      delete boards[idx].elements[req.params.elementId];
      boards[idx].updatedAt = new Date().toISOString();
    }
    return boards;
  });
  res.json({ success: true });
});

app.delete('/api/boards/:id/elements', async (req, res) => {
  await modifyBoards((boards) => {
    const idx = boards.findIndex(b => b.id === req.params.id);
    if (idx >= 0) {
      boards[idx].elements = {};
      boards[idx].updatedAt = new Date().toISOString();
    }
    return boards;
  });
  res.json({ success: true });
});

app.delete('/api/boards/:id', async (req, res) => {
  await modifyBoards((boards) => boards.filter(b => b.id !== req.params.id));
  res.json({ success: true });
});

app.put('/api/boards/:id/participants/:userId', async (req, res) => {
  await modifyBoards((boards) => {
    const idx = boards.findIndex(b => b.id === req.params.id);
    if (idx >= 0) {
      boards[idx].activeParticipants = boards[idx].activeParticipants || {};
      boards[idx].activeParticipants[req.params.userId] = req.body;
    }
    return boards;
  });
  res.json({ success: true });
});

// ─── Paper Mode ──────────────────────────────
app.post('/api/paper-sessions/:id/answers-batch', async (req, res) => {
  const { id } = req.params;
  const { questionIndex, answers } = req.body;
  if (!Array.isArray(answers) || answers.length === 0) return res.json({ success: true });
  
  await modifyDb((db) => {
    if (!db.paperSessions) db.paperSessions = [];
    let session = db.paperSessions.find(s => s && s.id === id);
    if (!session) {
      session = { id, currentQuestionIndex: questionIndex, status: 'active', answersByQuestion: {} };
      db.paperSessions.push(session);
    }
    session.answersByQuestion = session.answersByQuestion || {};
    session.answersByQuestion[questionIndex] = session.answersByQuestion[questionIndex] || {};
    for (const ans of answers) {
      session.answersByQuestion[questionIndex][ans.studentId] = { ...ans, timestamp: Date.now() };
    }
    return db;
  });
  res.json({ success: true, count: answers.length });
});

app.post('/api/paper-sessions/:id/answer', async (req, res) => {
  const { id } = req.params;
  const { questionIndex, answer } = req.body;
  await modifyDb((db) => {
    if (!db.paperSessions) db.paperSessions = [];
    let session = db.paperSessions.find(s => s && s.id === id);
    if (!session) {
      session = { id, currentQuestionIndex: questionIndex, status: 'active', answersByQuestion: {} };
      db.paperSessions.push(session);
    }
    session.answersByQuestion = session.answersByQuestion || {};
    session.answersByQuestion[questionIndex] = session.answersByQuestion[questionIndex] || {};
    session.answersByQuestion[questionIndex][answer.studentId] = { ...answer, timestamp: Date.now() };
    return db;
  });
  res.json({ success: true });
});

app.patch('/api/paper-sessions/:id/control', async (req, res) => {
  const { id } = req.params;
  await modifyDb((db) => {
    if (!db.paperSessions) db.paperSessions = [];
    let idx = db.paperSessions.findIndex(s => s && s.id === id);
    if (idx < 0) {
      db.paperSessions.push({ id, ...req.body });
    } else {
      db.paperSessions[idx] = { ...db.paperSessions[idx], ...req.body };
    }
    return db;
  });
  res.json({ success: true });
});

// ─── AI Extraction ───────────────────────────────────────────────────────
app.post('/api/ai/extract-quiz', async (req, res) => {
  try {
    const { text, imageBase64, mimeType, instructions } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(400).json({ error: 'GEMINI_API_KEY belum dikonfigurasi.', requiresKey: true });
    }
    const ai = new GoogleGenAI({ apiKey });
    const contents = [];
    if (imageBase64) contents.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '') } });
    if (text) contents.push(`Konten: ${text}`);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: "Ekstrak soal menjadi JSON array. [{\"id_soal\":\"q1\",\"teks_soal\":\"...\",\"pilihan\":{\"A\":\"..\",\"B\":\"..\",\"C\":\"..\",\"D\":\"..\"},\"kunci_jawaban\":\"A\"}] HANYA KEMBALIKAN ARRAY JSON.",
        responseMimeType: 'application/json',
      }
    });
    res.json({ success: true, questions: JSON.parse(response.text) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', (req, res) => {
  res.status(400).json({ error: 'Serverless deployment expects Base64 embedding. Upload failed.' });
});

// ─── HEALTH CHECK DIAGNOSTIK ──────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let dbProvider = 'Offline (Local JSON data/db.json)';
  let dbStatus = 'OK';
  let errorMsg = null;

  if (isFirebaseEnabled()) {
    dbProvider = 'Firebase Firestore';
    try {
      const rev = await getFirestoreRevision();
      dbStatus = `Connected to Firebase Firestore! (Revision: ${rev})`;
    } catch (e) {
      dbStatus = 'Connection Error';
      errorMsg = e.message;
    }
  } else if (pool) {
    dbProvider = 'PostgreSQL';
    try {
      const resCheck = await pool.query('SELECT 1 as connected');
      dbStatus = resCheck.rows.length > 0 ? 'Connected to PostgreSQL!' : 'Failed';
    } catch(e) {
      dbStatus = 'Connection Error';
      errorMsg = e.message;
    }
  } else {
    errorMsg = 'No remote database configured. On Vercel, set FIREBASE_SERVICE_ACCOUNT or (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) in Environment Variables.';
  }

  res.json({
    status: 'OK',
    provider: dbProvider,
    database: dbStatus,
    error: errorMsg,
    env: {
      hasFirebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      hasFirebaseIndividualKeys: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY),
      hasPostgres: !!(process.env.POSTGRES_URL || process.env.DATABASE_URL),
      hasGemini: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    }
  });
});

// ─── AUTO CLEANUP (CRON) ──────────────────────────────────────────────────
app.get('/api/cleanup', async (req, res) => {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - THIRTY_DAYS_MS;

  let cleanedChat = 0;
  let cleanedBoards = 0;

  // 1. Bersihkan Pesan Chat & Notifikasi Lama dari main_db
  await modifyDb((db) => {
    if (Array.isArray(db.chatMessages)) {
      const initialLength = db.chatMessages.length;
      db.chatMessages = db.chatMessages.filter(msg => {
        if (!msg.createdAt) return true;
        return new Date(msg.createdAt).getTime() > cutoffTime;
      });
      cleanedChat = initialLength - db.chatMessages.length;
    }
    if (Array.isArray(db.notifications)) {
      db.notifications = db.notifications.filter(n => {
        if (!n.createdAt) return true;
        return new Date(n.createdAt).getTime() > cutoffTime;
      });
    }
    return db;
  });

  // 2. Bersihkan Papan Ide (Kolaborasi) yang sudah > 30 hari tidak disentuh
  await modifyBoards((boards) => {
    const initialLength = boards.length;
    boards = boards.filter(b => {
      const lastUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return lastUpdated > cutoffTime;
    });
    cleanedBoards = initialLength - boards.length;
    return boards;
  });

  res.json({
    success: true,
    message: "Auto-cleanup berhasil dijalankan.",
    deleted_items: {
      old_chats: cleanedChat,
      old_boards: cleanedBoards
    }
  });
});

export default app;
