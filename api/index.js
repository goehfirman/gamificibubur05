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

// Konfigurasi Database Provider: Supabase / PostgreSQL / Firebase / Local
const isPostgresConfigured = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const isPostgresPreferred = process.env.DB_PROVIDER === 'supabase' || 
                            process.env.DB_PROVIDER === 'postgres' || 
                            !isFirebaseEnabled();
const usePostgres = isPostgresConfigured && isPostgresPreferred;

let pool = null;
if (usePostgres) {
  try {
    const rawPgUrl = (process.env.POSTGRES_URL || process.env.DATABASE_URL || "")
      .replace(/[^\x20-\x7E]/g, "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\?.*$/, "");

    pool = new Pool({
      connectionString: rawPgUrl,
      ssl: { rejectUnauthorized: false }
    });
    pool.query(`
      CREATE TABLE IF NOT EXISTS gamiclass_store (
        id VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL
      );
    `).then(() => {
      console.log('⚡ Connected to PostgreSQL / Supabase store successfully');
    }).catch(err => console.error('Gagal inisialisasi Postgres:', err));
  } catch (err) {
    console.error('Error saat membuat connection pool Postgres:', err);
  }
}

export function isUsingPostgres() {
  return pool !== null;
}

export function isUsingFirebase() {
  return !isUsingPostgres() && isFirebaseEnabled();
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
  if (isUsingPostgres()) {
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
  if (isUsingFirebase()) {
    return await getFullDbFromFirestore();
  }
  return await readLocalDbSafe();
}

async function modifyDb(modifierFn) {
  if (isUsingPostgres()) {
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

  if (isUsingFirebase()) {
    return await modifyFirestoreDb(modifierFn);
  }

  let db = await readLocalDbSafe();
  db = modifierFn(db);
  db = reconcilePointsAndLedger(db);
  db._revision = Date.now();
  await writeLocalDbSafe(db);
  return db;
}

async function getBoards() {
  if (isUsingPostgres()) {
    try {
      const result = await pool.query("SELECT data FROM gamiclass_store WHERE id = 'boards'");
      if (result.rows.length > 0) return result.rows[0].data;
      return [];
    } catch {
      return [];
    }
  }
  if (isUsingFirebase()) {
    return await getBoardsFromFirestore();
  }
  return await readLocalBoardsSafe();
}

async function modifyBoards(modifierFn) {
  if (isUsingPostgres()) {
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

  if (isUsingFirebase()) {
    return await modifyFirestoreBoards(modifierFn);
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
  
  if (isUsingPostgres()) {
    try {
      const revRes = await pool.query("SELECT data->>'_revision' as rev FROM gamiclass_store WHERE id = 'main_db'");
      const currentRev = revRes.rows.length > 0 ? Number(revRes.rows[0].rev || 0) : 0;
      if (since && currentRev && since === currentRev) {
        return res.json({ modified: false, revision: currentRev });
      }
    } catch(e) {}
    const db = await getFullDb();
    const revision = db._revision || Date.now();
    if (since && since === revision) {
      return res.json({ modified: false, revision });
    }
    return res.json({ modified: true, revision, db });
  }

  if (isUsingFirebase()) {
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
      if (k === 'users' && Array.isArray(incomingVal)) {
        db.users = incomingVal;
      } else if (ARRAY_COLLECTIONS.has(k) && Array.isArray(incomingVal)) {
        db[k] = incomingVal;
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

  if (isUsingFirebase()) {
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

  if (isUsingFirebase()) {
    const revision = await bulkDeleteFirestoreDocs(deletes);
    return res.json({ success: true, revision });
  }
  
  const finalDb = await modifyDb((db) => {
    for (const { collection, id } of deletes) {
      const idStr = String(id);
      if (db[collection]) {
        if (Array.isArray(db[collection])) {
          db[collection] = db[collection].filter(item => item && String(item.id || item.uid) !== idStr);
        } else {
          delete db[collection][idStr];
        }
      }
      if (collection === 'users') {
        if (Array.isArray(db.classes)) {
          db.classes.forEach(c => {
            if (Array.isArray(c.teacherIds)) {
              c.teacherIds = c.teacherIds.filter(tId => String(tId) !== idStr);
            }
          });
        }
        if (db.userStats && db.userStats[idStr]) {
          delete db.userStats[idStr];
        }
      }
    }
    return db;
  });
  res.json({ success: true, revision: finalDb._revision });
});

app.delete('/api/collections/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  const idStr = String(id);

  if (isUsingFirebase()) {
    const revision = await deleteFirestoreDoc(collection, id);
    return res.json({ success: true, revision });
  }

  const finalDb = await modifyDb((db) => {
    if (db[collection]) {
      if (Array.isArray(db[collection])) {
        db[collection] = db[collection].filter(item => item && String(item.id || item.uid) !== idStr);
      } else {
        delete db[collection][idStr];
      }
    }
    if (collection === 'users') {
      if (Array.isArray(db.classes)) {
        db.classes.forEach(c => {
          if (Array.isArray(c.teacherIds)) {
            c.teacherIds = c.teacherIds.filter(tId => String(tId) !== idStr);
          }
        });
      }
      if (db.userStats && db.userStats[idStr]) {
        delete db.userStats[idStr];
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

// ─── RESET DATABASE KE 0 ──────────────────────────────────────────────────
app.post('/api/reset', async (req, res) => {
  try {
    const cleanDb = {
      school: {
        id: "sch_merdeka_01",
        name: "SD Negeri Harapan Bangsa",
        logoUrl: "",
        academicYear: "2026/2027",
        timezone: "Asia/Jakarta",
        npsn: "20108890",
        address: "Jl. Raya Pekayon No. 9, Pasar Rebo, Jakarta Timur",
        principalName: "Hj. Siti Aminah, M.Pd.",
        motto: "Cerdas, Berkarakter, dan Berprestasi Unggul",
        contactEmail: "sdnegeripekayon09@gmail.com",
        contactPhone: "(021) 8712345",
        settings: {
          leaderboardMode: "top10_self",
          allowLateSubmission: true
        }
      },
      users: [
        {
          id: "admin",
          uid: "admin",
          role: "admin",
          status: "active",
          classIds: [],
          username: "admin",
          password: "admin",
          displayName: "Administrator",
          searchName: "administrator admin",
          avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=Admin&backgroundColor=10b981",
          schoolId: "sch_merdeka_01",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      classes: [],
      materials: [],
      materialProgress: {},
      assignments: [],
      submissions: {},
      missions: [],
      missionProgress: {},
      pointLedger: [],
      userStats: {},
      badges: [
        {
          id: "bdg_first_submission",
          name: "Langkah Pertama",
          description: "Mengumpulkan tugas pertamamu di kelas!",
          iconName: "Sparkles",
          category: "academic",
          criteria: "Kirim 1 tugas",
          rarity: "common"
        },
        {
          id: "bdg_early_bird",
          name: "Juara Tepat Waktu",
          description: "Mengumpulkan tugas 12 jam sebelum batas tenggat.",
          iconName: "Clock",
          category: "streak",
          criteria: "Kumpul tugas cepat",
          rarity: "rare"
        },
        {
          id: "bdg_bookworm",
          name: "Kutu Buku Cilik",
          description: "Membaca dan menuntaskan 5 modul materi pelajaran.",
          iconName: "BookMarked",
          category: "academic",
          criteria: "Selesaikan 5 materi",
          rarity: "rare"
        },
        {
          id: "bdg_perfect_score",
          name: "Nilai Sempurna",
          description: "Meraih skor 100 pada tugas atau kuis.",
          iconName: "Award",
          category: "academic",
          criteria: "Dapat nilai 100",
          rarity: "epic"
        },
        {
          id: "bdg_point_master",
          name: "Bintang Prestasi",
          description: "Mencapai total 500 poin pembelajaran.",
          iconName: "Star",
          category: "special",
          criteria: "Kumpulkan 500 poin",
          rarity: "legendary"
        }
      ],
      userBadges: [],
      announcements: [],
      chatMessages: [],
      notifications: [],
      auditLogs: [],
      quizzes: [],
      quizSubmissions: [],
      paperSessions: [],
      currentClassId: "",
      currentUserId: "admin",
      _revision: Date.now()
    };

    if (isUsingPostgres()) {
      await pool.query(
        "INSERT INTO gamiclass_store (id, data) VALUES ('main_db', $1) ON CONFLICT (id) DO UPDATE SET data = $1",
        [JSON.stringify(cleanDb)]
      );
      await pool.query(
        "INSERT INTO gamiclass_store (id, data) VALUES ('boards', $1) ON CONFLICT (id) DO UPDATE SET data = $1",
        [JSON.stringify([])]
      );
    }
    await writeLocalDbSafe(cleanDb);
    await writeLocalBoardsSafe([]);

    console.log('🔄 Database has been completely reset to 0 in Supabase and Local.');
    res.json({ success: true, message: 'Database reset to clean state (0) successfully', revision: cleanDb._revision });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── HEALTH CHECK DIAGNOSTIK ──────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let dbProvider = 'Offline (Local JSON data/db.json)';
  let dbStatus = 'OK';
  let errorMsg = null;

  if (isUsingPostgres()) {
    dbProvider = process.env.DB_PROVIDER === 'supabase' ? 'Supabase (PostgreSQL)' : 'PostgreSQL';
    try {
      const resCheck = await pool.query('SELECT 1 as connected');
      dbStatus = resCheck.rows.length > 0 ? 'Connected to Supabase / PostgreSQL!' : 'Failed';
    } catch(e) {
      dbStatus = 'Connection Error';
      errorMsg = e.message;
    }
  } else if (isUsingFirebase()) {
    dbProvider = 'Firebase Firestore';
    try {
      const rev = await getFirestoreRevision();
      dbStatus = `Connected to Firebase Firestore! (Revision: ${rev})`;
    } catch (e) {
      dbStatus = 'Connection Error';
      errorMsg = e.message;
    }
  } else {
    errorMsg = 'No remote database configured. On Vercel, set POSTGRES_URL (Supabase) or Firebase credentials in Environment Variables.';
  }

  res.json({
    status: 'OK',
    provider: dbProvider,
    database: dbStatus,
    error: errorMsg,
    env: {
      hasPostgres: !!(process.env.POSTGRES_URL || process.env.DATABASE_URL),
      hasFirebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      hasFirebaseIndividualKeys: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY),
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
