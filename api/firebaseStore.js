import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs/promises';
import path from 'path';

let firestoreInstance = null;
let firebaseInitialized = false;
let initError = null;

// Array collections matching app domain
export const ARRAY_COLLECTIONS = new Set([
  'users', 'classes', 'materials', 'assignments', 'submissions',
  'missions', 'pointLedger', 'badges', 'userBadges', 'announcements',
  'chatMessages', 'notifications', 'auditLogs', 'quizzes',
  'quizSubmissions', 'paperSessions'
]);

// Memory cache for serverless performance
let cachedDb = null;
let cachedRevision = 0;
let cachedBoards = null;
let cachedBoardsRevision = 0;

/**
 * Mendeteksi dan menginisialisasi Firebase Admin SDK dari Environment Variables
 * Mendukung:
 * 1. FIREBASE_SERVICE_ACCOUNT: JSON string atau Base64 string
 * 2. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 * 3. File serviceAccountKey.json lokal
 */
export function initFirebase() {
  if (firebaseInitialized) return firestoreInstance;

  try {
    let credential = null;
    let projectId = process.env.FIREBASE_PROJECT_ID || 'gamificlasscibubur05';

    // 1. Cek FIREBASE_SERVICE_ACCOUNT (JSON atau Base64)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (!rawJson.startsWith('{')) {
        try {
          rawJson = Buffer.from(rawJson, 'base64').toString('utf-8');
        } catch (e) {
          // Tetap gunakan string awal jika bukan base64
        }
      }
      const sa = JSON.parse(rawJson);
      credential = cert(sa);
      projectId = sa.project_id || projectId;
    }
    // 2. Cek variabel pecahan (Vercel env standard)
    else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      credential = cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      });
    }

    // Inisialisasi Firebase App jika credential ditemukan
    if (credential) {
      const app = getApps().length === 0
        ? initializeApp({ credential, projectId })
        : getApps()[0];

      const databaseId = process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID;
      firestoreInstance = databaseId && databaseId !== '(default)'
        ? getFirestore(app, databaseId)
        : getFirestore(app);

      firestoreInstance.settings({ ignoreUndefinedProperties: true });
      firebaseInitialized = true;
      console.log(`🔥 Firebase Firestore initialized successfully (Project: ${projectId || 'default'})`);
      return firestoreInstance;
    }
  } catch (err) {
    initError = err.message;
    console.error('⚠️ Gagal inisialisasi Firebase Admin:', err.message);
  }

  return null;
}

export function isFirebaseEnabled() {
  if (!firebaseInitialized) {
    initFirebase();
  }
  return firestoreInstance !== null;
}

export function getFirebaseError() {
  return initError;
}

export function getFirestoreDb() {
  if (!firebaseInitialized) initFirebase();
  return firestoreInstance;
}

// ─── HELPER POINT RECONCILIATION ─────────────────────────────────────────────
export function reconcilePointsAndLedger(dbObj) {
  if (!dbObj || typeof dbObj !== 'object') return dbObj;
  if (Array.isArray(dbObj.pointLedger)) {
    const seenKeys = new Set();
    const dedupedLedger = [];
    dbObj.pointLedger.forEach(l => {
      if (!l) return;
      const key = l.idempotencyKey || l.id;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        dedupedLedger.push(l);
      }
    });
    dbObj.pointLedger = dedupedLedger;
  }
  if (dbObj.userStats && typeof dbObj.userStats === 'object' && Array.isArray(dbObj.pointLedger)) {
    const ledgerByUser = {};
    dbObj.pointLedger.forEach(l => {
      if (!l || !l.userId) return;
      ledgerByUser[l.userId] = ledgerByUser[l.userId] || [];
      ledgerByUser[l.userId].push(l);
    });
    Object.keys(dbObj.userStats).forEach(uid => {
      const userLedgers = ledgerByUser[uid] || [];
      if (userLedgers.length > 0) {
        const ledgerTotal = Math.max(0, userLedgers.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
        const academicTotal = Math.max(0, userLedgers.filter(l => l.category === 'academic').reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
        const partTotal = Math.max(0, ledgerTotal - academicTotal);
        dbObj.userStats[uid] = {
          ...dbObj.userStats[uid],
          totalPoints: ledgerTotal,
          academicPoints: academicTotal,
          participationPoints: partTotal,
        };
      }
    });
  }
  return dbObj;
}

// ─── AUTO SEEDING FROM LOCAL JSON JIKA FIRESTORE KOSONG ─────────────────────
let isSeeding = false;
export async function seedFirestoreIfEmpty() {
  if (!isFirebaseEnabled() || isSeeding) return;
  const db = getFirestoreDb();
  
  try {
    const metaRef = db.collection('_system').doc('metadata');
    const metaSnap = await metaRef.get();
    if (metaSnap.exists && metaSnap.data()?.initialized) {
      return; // Sudah diinisialisasi
    }

    isSeeding = true;
    console.log('🌱 Firestore kosong terdeteksi. Memulai auto-seeding dari data lokal...');

    const DATA_DIR = path.join(process.cwd(), 'data');
    let localDb = {};
    let localBoards = [];

    try {
      localDb = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'db.json'), 'utf-8'));
    } catch (e) {
      console.warn('Tidak dapat membaca data/db.json untuk seeding:', e.message);
    }

    try {
      localBoards = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'boards.json'), 'utf-8'));
    } catch (e) {}

    // Simpan singletons (school, userStats, dll)
    const singletons = {
      school: localDb.school || {},
      userStats: localDb.userStats || {},
      currentClassId: localDb.currentClassId || '',
      currentUserId: localDb.currentUserId || '',
      materialProgress: localDb.materialProgress || {},
      missionProgress: localDb.missionProgress || {},
      userPresence: localDb.userPresence || {},
    };
    await db.collection('_system').doc('singletons').set(singletons);

    // Simpan collections dalam batch (maksimum 400 per commit untuk keamanan)
    let batch = db.batch();
    let opCount = 0;

    for (const collName of ARRAY_COLLECTIONS) {
      const items = localDb[collName];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (!item) continue;
          const docId = String(item.id || item.uid || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
          const docRef = db.collection(collName).doc(docId);
          batch.set(docRef, item);
          opCount++;

          if (opCount >= 400) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
          }
        }
      }
    }

    // Seeding boards
    if (Array.isArray(localBoards)) {
      for (const board of localBoards) {
        if (!board || !board.id) continue;
        const docRef = db.collection('boards').doc(board.id);
        batch.set(docRef, board);
        opCount++;
        if (opCount >= 400) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    const now = Date.now();
    await metaRef.set({
      initialized: true,
      revision: now,
      seededAt: new Date().toISOString(),
    });

    cachedRevision = now;
    console.log('✅ Auto-seeding Firestore berhasil diselesaikan!');
  } catch (err) {
    console.error('❌ Gagal saat auto-seeding Firestore:', err);
  } finally {
    isSeeding = false;
  }
}

// ─── REVISION CHECK ─────────────────────────────────────────────────────────
export async function getFirestoreRevision() {
  if (!isFirebaseEnabled()) return 0;
  const db = getFirestoreDb();
  try {
    const metaSnap = await db.collection('_system').doc('metadata').get();
    if (metaSnap.exists) {
      return Number(metaSnap.data()?.revision || 0);
    }
  } catch (e) {
    console.warn('Gagal membaca revision Firestore:', e.message);
  }
  return 0;
}

export async function bumpFirestoreRevision(customRev) {
  if (!isFirebaseEnabled()) return Date.now();
  const db = getFirestoreDb();
  const rev = customRev || Date.now();
  try {
    await db.collection('_system').doc('metadata').set({
      revision: rev,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    cachedRevision = rev;
  } catch (e) {
    console.warn('Gagal memperbarui revision Firestore:', e.message);
  }
  return rev;
}

// ─── GET FULL DATABASE DARI FIRESTORE ───────────────────────────────────────
export async function getFullDbFromFirestore() {
  if (!isFirebaseEnabled()) return {};
  await seedFirestoreIfEmpty();
  const db = getFirestoreDb();

  const currentRev = await getFirestoreRevision();
  if (cachedDb && cachedRevision && currentRev && cachedRevision === currentRev) {
    return cachedDb;
  }

  try {
    // Ambil singletons dan seluruh collections secara paralel
    const singletonsPromise = db.collection('_system').doc('singletons').get();
    const collPromises = Array.from(ARRAY_COLLECTIONS).map(async (collName) => {
      const snap = await db.collection(collName).get();
      const docs = snap.docs.map(doc => doc.data()).filter(Boolean);
      return { collName, docs };
    });

    const [singletonsSnap, ...collectionsResults] = await Promise.all([
      singletonsPromise,
      ...collPromises
    ]);

    const result = {
      _revision: currentRev || Date.now(),
      school: {},
      userStats: {},
      materialProgress: {},
      missionProgress: {},
      userPresence: {},
      currentClassId: '',
      currentUserId: '',
    };

    if (singletonsSnap.exists) {
      const sData = singletonsSnap.data() || {};
      Object.assign(result, sData);
    }

    for (const { collName, docs } of collectionsResults) {
      result[collName] = docs;
    }

    cachedDb = result;
    cachedRevision = currentRev || result._revision;
    return result;
  } catch (err) {
    console.error('Gagal mengambil full DB dari Firestore:', err);
    return cachedDb || {};
  }
}

// ─── MODIFY DATABASE DI FIRESTORE ───────────────────────────────────────────
export async function modifyFirestoreDb(modifierFn) {
  if (!isFirebaseEnabled()) throw new Error('Firebase is not enabled');
  const db = getFirestoreDb();

  // Ambil state terkini
  let currentDb = await getFullDbFromFirestore();
  const modified = modifierFn(JSON.parse(JSON.stringify(currentDb)));
  const finalDb = reconcilePointsAndLedger(modified);
  const newRev = Date.now();
  finalDb._revision = newRev;

  try {
    // Simpan singletons
    const singletons = {
      school: finalDb.school || {},
      userStats: finalDb.userStats || {},
      materialProgress: finalDb.materialProgress || {},
      missionProgress: finalDb.missionProgress || {},
      userPresence: finalDb.userPresence || {},
      currentClassId: finalDb.currentClassId || '',
      currentUserId: finalDb.currentUserId || '',
    };
    await db.collection('_system').doc('singletons').set(singletons, { merge: true });

    // Update dokumen collections yang berubah
    // Note: untuk efisiensi kita simpan batch jika ada array collection
    let batch = db.batch();
    let opCount = 0;

    for (const collName of ARRAY_COLLECTIONS) {
      const newItems = finalDb[collName];
      const oldItems = currentDb[collName] || [];
      if (!Array.isArray(newItems)) continue;

      // Cari item baru / terupdate
      const oldMap = new Map((oldItems || []).map(i => [String(i?.id || i?.uid), JSON.stringify(i)]));
      for (const item of newItems) {
        if (!item) continue;
        const id = String(item.id || item.uid);
        if (!id) continue;
        const serialized = JSON.stringify(item);
        if (oldMap.get(id) !== serialized) {
          batch.set(db.collection(collName).doc(id), item);
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
          }
        }
      }

      // Cari item yang dihapus
      const newIds = new Set(newItems.map(i => String(i?.id || i?.uid)));
      for (const oldItem of oldItems) {
        if (!oldItem) continue;
        const oldId = String(oldItem.id || oldItem.uid);
        if (oldId && !newIds.has(oldId)) {
          batch.delete(db.collection(collName).doc(oldId));
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
          }
        }
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    await bumpFirestoreRevision(newRev);
    cachedDb = finalDb;
    cachedRevision = newRev;
    return finalDb;
  } catch (err) {
    console.error('Gagal menulis perubahan ke Firestore:', err);
    throw err;
  }
}

// ─── GRANULAR COLLECTION OPERATIONS (FAST & LIGHTWEIGHT) ────────────────────
export async function updateFirestoreDoc(collection, docId, data) {
  if (!isFirebaseEnabled()) return;
  const db = getFirestoreDb();
  const idStr = String(docId);

  // Jika update singletons
  if (['school', 'userStats', 'materialProgress', 'missionProgress', 'userPresence'].includes(collection)) {
    const singletonsRef = db.collection('_system').doc('singletons');
    await singletonsRef.set({
      [collection]: { [idStr]: data }
    }, { merge: true });
  } else {
    // Array collection
    const docRef = db.collection(collection).doc(idStr);
    await docRef.set(data, { merge: true });
  }

  const newRev = await bumpFirestoreRevision();
  if (cachedDb) {
    if (ARRAY_COLLECTIONS.has(collection)) {
      cachedDb[collection] = cachedDb[collection] || [];
      const idx = cachedDb[collection].findIndex(i => String(i?.id || i?.uid) === idStr);
      if (idx >= 0) cachedDb[collection][idx] = { ...cachedDb[collection][idx], ...data };
      else cachedDb[collection].push(data);
    }
    cachedDb._revision = newRev;
  }
  return newRev;
}

export async function deleteFirestoreDoc(collection, docId) {
  if (!isFirebaseEnabled()) return;
  const db = getFirestoreDb();
  const idStr = String(docId);

  if (['school', 'userStats', 'materialProgress', 'missionProgress', 'userPresence'].includes(collection)) {
    // Singletons
    const snap = await db.collection('_system').doc('singletons').get();
    if (snap.exists) {
      const data = snap.data();
      if (data[collection] && data[collection][idStr]) {
        delete data[collection][idStr];
        await db.collection('_system').doc('singletons').set(data);
      }
    }
  } else {
    await db.collection(collection).doc(idStr).delete();
  }

  // Jika menghapus user, bersihkan juga teacherIds di classes & singletons.userStats
  if (collection === 'users') {
    try {
      const classesSnap = await db.collection('classes').get();
      const batch = db.batch();
      let hasUpdate = false;
      classesSnap.docs.forEach(docSnap => {
        const c = docSnap.data();
        if (Array.isArray(c?.teacherIds) && c.teacherIds.includes(idStr)) {
          batch.update(docSnap.ref, {
            teacherIds: c.teacherIds.filter(t => t !== idStr)
          });
          hasUpdate = true;
        }
      });
      if (hasUpdate) await batch.commit();

      const snap = await db.collection('_system').doc('singletons').get();
      if (snap.exists) {
        const data = snap.data();
        if (data.userStats && data.userStats[idStr]) {
          delete data.userStats[idStr];
          await db.collection('_system').doc('singletons').set(data);
        }
      }
    } catch (e) {
      console.warn('Gagal membersihkan dependensi user di Firestore:', e.message);
    }
  }

  const newRev = await bumpFirestoreRevision();
  if (cachedDb) {
    if (Array.isArray(cachedDb[collection])) {
      cachedDb[collection] = cachedDb[collection].filter(i => String(i?.id || i?.uid) !== idStr);
    } else if (cachedDb[collection] && typeof cachedDb[collection] === 'object') {
      delete cachedDb[collection][idStr];
    }
    if (collection === 'users') {
      if (Array.isArray(cachedDb.classes)) {
        cachedDb.classes.forEach(c => {
          if (Array.isArray(c.teacherIds)) {
            c.teacherIds = c.teacherIds.filter(t => t !== idStr);
          }
        });
      }
      if (cachedDb.userStats && cachedDb.userStats[idStr]) {
        delete cachedDb.userStats[idStr];
      }
    }
    cachedDb._revision = newRev;
  }
  return newRev;
}

export async function bulkDeleteFirestoreDocs(deletes) {
  if (!isFirebaseEnabled() || !Array.isArray(deletes)) return;
  const db = getFirestoreDb();
  let batch = db.batch();
  let opCount = 0;

  for (const { collection, id } of deletes) {
    if (!collection || !id) continue;
    const docRef = db.collection(collection).doc(String(id));
    batch.delete(docRef);
    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  const newRev = await bumpFirestoreRevision();
  if (cachedDb) {
    for (const { collection, id } of deletes) {
      const idStr = String(id);
      if (Array.isArray(cachedDb[collection])) {
        cachedDb[collection] = cachedDb[collection].filter(i => String(i?.id || i?.uid) !== idStr);
      } else if (cachedDb[collection] && typeof cachedDb[collection] === 'object') {
        delete cachedDb[collection][idStr];
      }
      if (collection === 'users') {
        if (Array.isArray(cachedDb.classes)) {
          cachedDb.classes.forEach(c => {
            if (Array.isArray(c.teacherIds)) {
              c.teacherIds = c.teacherIds.filter(t => t !== idStr);
            }
          });
        }
        if (cachedDb.userStats && cachedDb.userStats[idStr]) {
          delete cachedDb.userStats[idStr];
        }
      }
    }
    cachedDb._revision = newRev;
  }
  return newRev;
}

// ─── BOARDS OPERATIONS DI FIRESTORE ─────────────────────────────────────────
export async function getBoardsFromFirestore() {
  if (!isFirebaseEnabled()) return [];
  const db = getFirestoreDb();

  try {
    const snap = await db.collection('boards').get();
    const boards = snap.docs.map(doc => doc.data()).filter(Boolean);
    cachedBoards = boards;
    return boards;
  } catch (err) {
    console.error('Gagal mengambil boards dari Firestore:', err);
    return cachedBoards || [];
  }
}

export async function modifyFirestoreBoards(modifierFn) {
  if (!isFirebaseEnabled()) return [];
  const db = getFirestoreDb();
  let boards = await getBoardsFromFirestore();
  boards = modifierFn(JSON.parse(JSON.stringify(boards)));

  try {
    let batch = db.batch();
    let count = 0;
    for (const b of boards) {
      if (!b || !b.id) continue;
      batch.set(db.collection('boards').doc(String(b.id)), b);
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
    cachedBoards = boards;
    return boards;
  } catch (err) {
    console.error('Gagal menyimpan boards ke Firestore:', err);
    throw err;
  }
}
