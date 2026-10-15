import localforage from 'localforage';
import { db } from './firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';

export const COLLECTIONS = {
  USERS: 'users',
  SCHOOL: 'school',
  CLASSES: 'classes',
  MATERIALS: 'materials',
  MATERIAL_PROGRESS: 'materialProgress',
  ASSIGNMENTS: 'assignments',
  SUBMISSIONS: 'submissions',
  MISSIONS: 'missions',
  MISSION_PROGRESS: 'missionProgress',
  POINT_LEDGER: 'pointLedger',
  USER_STATS: 'userStats',
  BADGES: 'badges',
  USER_BADGES: 'userBadges',
  ANNOUNCEMENTS: 'announcements',
  CHAT_MESSAGES: 'chatMessages',
  USER_PRESENCE: 'userPresence',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'auditLogs',
  QUIZZES: 'quizzes',
  QUIZ_SUBMISSIONS: 'quizSubmissions',
  PAPER_SESSIONS: 'paperSessions',
};

const collectionCache = new Map<string, any[]>();
const collectionListeners = new Map<string, Set<(data: any[]) => void>>();
let lastServerRevision = 0;
let pollingInterval: any = null;
let isPermissionDenied = false;

// IndexedDB initialization for offline mode
const store = localforage.createInstance({
  name: 'GamiClassDB'
});

export function isFirestorePermissionDenied(): boolean {
  return isPermissionDenied;
}

function handleFirestoreError(operation: string, collName: string, id: any, err: any) {
  if (err?.code === 'permission-denied') {
    isPermissionDenied = true;
    console.warn(`[Firestore ${operation}] ⚠️ Izin Ditolak (permission-denied) pada ${collName}/${id}. Periksa Firestore Rules di Firebase Console!`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-permission-denied', {
        detail: { collection: collName, error: err.message }
      }));
    }
  } else {
    console.warn(`[Firestore ${operation}] Warning (${collName}/${id}):`, err?.message || err);
  }
}

export function cleanForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => cleanForFirestore(item));
  }
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = cleanForFirestore(val);
    }
  }
  return clean;
}

function notifyListeners(collection: string) {
  const items = collectionCache.get(collection) || [];
  const listeners = collectionListeners.get(collection);
  if (listeners && listeners.size > 0) {
    listeners.forEach(cb => {
      try { cb(items); } catch (e) {}
    });
  }
}

async function persistCache() {
  const obj: Record<string, any> = {};
  collectionCache.forEach((value, key) => {
    obj[key] = value;
  });
  await store.setItem('offline_db_cache_v5', obj);
}

function updateDocInCache(collection: string, docId: string, data: any) {
  let items = collectionCache.get(collection) || [];
  const idx = items.findIndex((item: any) => item && (item.id === docId || item.uid === docId));
  if (idx >= 0) {
    items = [...items];
    items[idx] = { ...items[idx], ...data };
  } else {
    items = [...items, data];
  }
  collectionCache.set(collection, items);
  notifyListeners(collection);
  persistCache();
}

function removeDocFromCache(collection: string, docId: string) {
  let items = collectionCache.get(collection) || [];
  items = items.filter((item: any) => item && item.id !== docId && item.uid !== docId);
  collectionCache.set(collection, items);
  notifyListeners(collection);
  persistCache();
}

function populateFullCache(db: Record<string, any>) {
  if (!db || typeof db !== 'object') return;
  Object.keys(db).forEach((coll) => {
    let val = db[coll];
    if (val == null) return;
    if (!Array.isArray(val) && typeof val === 'object') {
      val = Object.values(val);
    }
    if (Array.isArray(val)) {
      collectionCache.set(coll, val.filter((i: any) => i != null));
      notifyListeners(coll);
    }
  });
  persistCache();
}

// Load from offline storage immediately on boot
async function initOfflineCache() {
  try {
    const offlineDb = await store.getItem<Record<string, any>>('offline_db_cache_v5');
    if (offlineDb) populateFullCache(offlineDb);
  } catch (err) {
    console.warn('Failed to load offline DB:', err);
  }
}

async function fetchDeltaSync() {
  try {
    const res = await fetch(`/api/sync?since=${lastServerRevision}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.modified && data.db) {
        lastServerRevision = data.revision;
        populateFullCache(data.db);
      }
    }
  } catch (e) {
    // Silent fail -> stay offline
  }
}

// Start polling
if (typeof window !== 'undefined') {
  initOfflineCache().then(() => {
    fetchDeltaSync();
    pollingInterval = setInterval(fetchDeltaSync, 1500);
  });
}

/**
 * Menyimpan / memperbarui dokumen secara real-time ke Cloud Firestore Web SDK & Backend API
 */
export async function syncDocToFirestore(collectionName: string, docId: string, data: any) {
  const idStr = String(docId);
  updateDocInCache(collectionName, idStr, data);

  // 1. Direct write ke Cloud Firestore
  try {
    const docRef = doc(db, collectionName, idStr);
    await setDoc(docRef, cleanForFirestore(data), { merge: true });
    isPermissionDenied = false;
  } catch (err: any) {
    handleFirestoreError('syncDoc', collectionName, idStr, err);
  }

  // 2. Dual-sync ke Serverless API / Local API
  try {
    await fetch(`/api/collections/${collectionName}/${encodeURIComponent(idStr)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (err) {
    // Offline mode: already updated cache, will sync later
  }
}

/**
 * Menghapus banyak dokumen sekaligus secara real-time dari Cloud Firestore & Backend API
 */
export async function bulkDeleteFromFirestore(deletes: { collection: string, id: string }[]) {
  if (!Array.isArray(deletes) || deletes.length === 0) return;
  deletes.forEach(d => removeDocFromCache(d.collection, String(d.id)));

  // 1. Direct batch delete ke Cloud Firestore
  try {
    const batch = writeBatch(db);
    let count = 0;
    for (const d of deletes) {
      if (d.collection && d.id) {
        batch.delete(doc(db, d.collection, String(d.id)));
        count++;
      }
    }
    if (count > 0) {
      await batch.commit();
      isPermissionDenied = false;
      console.log(`[Firestore] Bulk delete ${count} dokumen berhasil di Cloud Firestore.`);
    }
  } catch (err: any) {
    handleFirestoreError('bulkDelete', 'multiple', deletes.length, err);
  }

  // 2. Dual-sync ke Serverless API / Local API
  try {
    await fetch('/api/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deletes })
    });
  } catch (err) {}
}

/**
 * Menghapus satu dokumen secara permanen dari Cloud Firestore & Backend API
 */
export async function deleteDocFromFirestore(collectionName: string, docId: string) {
  const idStr = String(docId);
  removeDocFromCache(collectionName, idStr);

  // 1. Direct delete ke Cloud Firestore
  try {
    const docRef = doc(db, collectionName, idStr);
    await deleteDoc(docRef);
    isPermissionDenied = false;
    console.log(`[Firestore] Dokumen ${collectionName}/${idStr} berhasil dihapus dari Cloud Firestore.`);
  } catch (err: any) {
    handleFirestoreError('deleteDoc', collectionName, idStr, err);
  }

  // 2. Dual-sync ke Serverless API / Local API
  try {
    await fetch(`/api/collections/${collectionName}/${encodeURIComponent(idStr)}`, { method: 'DELETE' });
  } catch (err) {}
}

/**
 * Memuat seluruh database: memprioritaskan API Backend, lalu Firestore Web SDK, lalu IndexedDB
 */
export async function loadAllFromFirestore() {
  const offlineDb = await store.getItem<Record<string, any>>('offline_db_cache_v3') || {};

  // 1. Coba ambil dari server API /api/db
  try {
    const res = await fetch('/api/db', { cache: 'no-store' });
    if (res.ok) {
      const serverDb = await res.json();
      if (serverDb && (serverDb.users?.length > 0 || Object.keys(serverDb).length > 2)) {
        populateFullCache(serverDb);
        return serverDb;
      }
    }
  } catch (err) {}

  // 2. Fallback: Coba ambil langsung dari Cloud Firestore Web SDK
  try {
    const loadedData: Record<string, any> = {};
    let hasData = false;

    for (const collName of Object.values(COLLECTIONS)) {
      try {
        const snap = await getDocs(collection(db, collName));
        if (!snap.empty) {
          hasData = true;
          loadedData[collName] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        }
      } catch (e) {}
    }

    if (hasData) {
      populateFullCache(loadedData);
      return loadedData;
    }
  } catch (err) {}

  return offlineDb;
}

export function subscribeToRealtimeCollection(collection: string, callback: (data: any[]) => void) {
  if (!collectionListeners.has(collection)) collectionListeners.set(collection, new Set());
  collectionListeners.get(collection)!.add(callback);
  
  if (collectionCache.has(collection)) {
    callback(collectionCache.get(collection)!);
  }
  return () => {
    const set = collectionListeners.get(collection);
    if (set) {
      set.delete(callback);
      if (set.size === 0) collectionListeners.delete(collection);
    }
  };
}

/**
 * Menyinkronkan seluruh database lokal ke Cloud Firestore & Backend API
 */
export async function syncAllStateToFirestore(data: any): Promise<boolean> {
  if (!data || typeof data !== 'object') return false;

  let directFirestoreOk = false;

  // 1. Direct upload ke Cloud Firestore dalam batch
  try {
    for (const collName of Object.values(COLLECTIONS)) {
      const items = data[collName];
      if (Array.isArray(items) && items.length > 0) {
        let batch = writeBatch(db);
        let opCount = 0;
        for (const item of items) {
          if (!item) continue;
          const id = String(item.id || item.uid || `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
          batch.set(doc(db, collName, id), cleanForFirestore(item), { merge: true });
          opCount++;
          if (opCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
        if (opCount > 0) {
          await batch.commit();
        }
      } else if (items && typeof items === 'object' && !Array.isArray(items)) {
        const entries = Object.entries(items);
        if (entries.length > 0) {
          let batch = writeBatch(db);
          let opCount = 0;
          for (const [key, val] of entries) {
            if (!val) continue;
            batch.set(doc(db, collName, key), cleanForFirestore(val), { merge: true });
            opCount++;
            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
          if (opCount > 0) {
            await batch.commit();
          }
        }
      }
    }
    directFirestoreOk = true;
    isPermissionDenied = false;
    console.log('✅ Berhasil menyinkronkan seluruh database ke Cloud Firestore!');
  } catch (err: any) {
    handleFirestoreError('syncAllState', 'all', 'batch', err);
  }

  // 2. Dual-sync ke Serverless API / Local API
  try {
    const res = await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      populateFullCache(data);
      return true;
    }
  } catch (err) {}

  populateFullCache(data);
  return directFirestoreOk;
}

export async function updateUserPresence(data: any) {
  return syncDocToFirestore(COLLECTIONS.USER_PRESENCE, data.userId, data);
}

export async function setUserOffline(userId: string) {
  return deleteDocFromFirestore(COLLECTIONS.USER_PRESENCE, userId);
}

export function isFirestoreQuotaExceeded() { return false; }
export function setFirestoreQuotaExceeded(val: boolean) {}
export function isQuotaError(err: any) { return false; }

export async function submitPaperAnswersBatch(sessionId: string, questionIndex: number, answers: any[]) {
  try {
    const res = await fetch(`/api/paper-sessions/${encodeURIComponent(sessionId)}/answers-batch`,  {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionIndex, answers }),
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

export async function submitPaperAnswer(sessionId: string, questionIndex: number, answer: any) {
  try {
    const res = await fetch(`/api/paper-sessions/${encodeURIComponent(sessionId)}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionIndex, answer }),
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

export async function controlPaperSession(sessionId: string, updates: any) {
  try {
    const res = await fetch(`/api/paper-sessions/${encodeURIComponent(sessionId)}/control`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

export async function seedFirestoreIfEmpty() {
  try {
    const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
    if (usersSnap.empty) {
      const offlineDb = await store.getItem<Record<string, any>>('offline_db_cache_v3');
      if (offlineDb && Object.keys(offlineDb).length > 2) {
        await syncAllStateToFirestore(offlineDb);
      }
    }
  } catch (err: any) {
    // Silent fail if permission-denied or offline
  }
  return true;
}
