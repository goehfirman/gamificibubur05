import localforage from 'localforage';
import { db } from './firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { broadcastSupabaseUpdate, subscribeToSupabaseEvents } from './supabase';

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
const firestoreUnsubs = new Map<string, () => void>();
let lastServerRevision = 0;
let pollingInterval: any = null;
let isPermissionDenied = false;
let quotaExceededState = false;

// Mode Supabase / Server Primary: Matikan interaksi langsung client dengan Cloud Firestore
// agar kuota harian Firebase tidak tersedot dan listener Firestore tidak menimpa data baru
export const IS_SUPABASE_OR_SERVER_PRIMARY = true;

// IndexedDB initialization for offline mode
const store = localforage.createInstance({
  name: 'GamiClassDB'
});

export function isFirestorePermissionDenied(): boolean {
  return isPermissionDenied;
}

export function isFirestoreQuotaExceeded(): boolean {
  return IS_SUPABASE_OR_SERVER_PRIMARY || quotaExceededState;
}

export function setFirestoreQuotaExceeded(val: boolean) {
  quotaExceededState = val;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', {
      detail: { exceeded: val }
    }));
  }
}

export function isQuotaError(err: any): boolean {
  return err?.code === 'resource-exhausted' ||
    err?.code === 8 ||
    (typeof err?.message === 'string' && err.message.includes('RESOURCE_EXHAUSTED'));
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
  } else if (isQuotaError(err)) {
    setFirestoreQuotaExceeded(true);
    firestoreUnsubs.forEach((unsub) => {
      try { unsub(); } catch (e) {}
    });
    firestoreUnsubs.clear();
    console.warn(`[Firestore ${operation}] ⚠️ Kuota Firestore Harian Tercapai (RESOURCE_EXHAUSTED). Menggunakan sinkronisasi database server/lokal.`);
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

export async function resetAllClientData() {
  collectionCache.clear();
  try {
    await store.clear();
    localStorage.removeItem('gamiclass_data_v3');
    localStorage.removeItem('deleted_item_ids_v1');
    localStorage.removeItem('gamificlass_deleted_ids_v2');
    localStorage.removeItem('classroom_gamifikasi_v5_data');
    localStorage.removeItem('offline_db_cache_v5');
    sessionStorage.removeItem('gamiclass_session_user');
    sessionStorage.removeItem('classroom_gamifikasi_session_user');
  } catch (e) {}
}

function populateFullCache(db: Record<string, any>) {
  if (!db || typeof db !== 'object') return;
  const now = Date.now();
  Object.keys(db).forEach((coll) => {
    let val = db[coll];
    if (val == null) return;
    if (!Array.isArray(val) && typeof val === 'object') {
      val = Object.values(val);
    }
    if (Array.isArray(val)) {
      const incoming = val.filter((i: any) => i != null);
      const incomingIds = new Set(incoming.map((i: any) => String(i?.id || i?.uid)));

      // Pertahankan item lokal yang baru dibuat / diupdate dalam 60 detik terakhir agar tidak hilang terhapus oleh race condition
      const currentCache = collectionCache.get(coll) || [];
      const pendingLocal = currentCache.filter((item: any) => {
        const id = String(item?.id || item?.uid);
        if (!id || incomingIds.has(id)) return false;
        const time = item?.updatedAt || item?.createdAt ? new Date(item.updatedAt || item.createdAt).getTime() : now;
        return (now - time < 60000);
      });

      const merged = [...incoming, ...pendingLocal];
      collectionCache.set(coll, merged);
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

// Start polling & Realtime Push
if (typeof window !== 'undefined') {
  initOfflineCache().then(() => {
    fetchDeltaSync();
    pollingInterval = setInterval(fetchDeltaSync, 1500);
    // Realtime Push via Supabase Broadcast
    subscribeToSupabaseEvents(() => {
      fetchDeltaSync();
    });
  });
}

/**
 * Menyimpan / memperbarui dokumen secara real-time ke Cloud Firestore Web SDK & Backend API
 */
export async function syncDocToFirestore(collectionName: string, docId: string, data: any) {
  const idStr = String(docId);
  updateDocInCache(collectionName, idStr, data);

  // 1. Dual-sync ke Serverless API / Local API (paralel & non-blocking)
  const apiPromise = (async () => {
    try {
      const res = await fetch(`/api/collections/${collectionName}/${encodeURIComponent(idStr)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.revision) {
          lastServerRevision = json.revision;
        }
      }
    } catch (err) {
      console.warn(`[API syncDoc] ${collectionName}/${idStr}:`, err);
    }
  })();

  // 2. Direct write ke Cloud Firestore dengan timeout 2500ms HANYA JIKA BUKAN mode Supabase
  const firestorePromise = (async () => {
    if (IS_SUPABASE_OR_SERVER_PRIMARY || isFirestoreQuotaExceeded()) return;
    try {
      const docRef = doc(db, collectionName, idStr);
      const writeTask = setDoc(docRef, cleanForFirestore(data), { merge: true });
      const timeoutTask = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 2500)
      );
      await Promise.race([writeTask, timeoutTask]);
      isPermissionDenied = false;
    } catch (err: any) {
      handleFirestoreError('syncDoc', collectionName, idStr, err);
    }
  })();

  await Promise.allSettled([apiPromise, firestorePromise]);
  broadcastSupabaseUpdate(collectionName, idStr);
}

/**
 * Menghapus banyak dokumen sekaligus secara real-time dari Cloud Firestore & Backend API
 */
export async function bulkDeleteFromFirestore(deletes: { collection: string, id: string }[]) {
  if (!Array.isArray(deletes) || deletes.length === 0) return;
  deletes.forEach(d => {
    removeDocFromCache(d.collection, String(d.id));
  });

  // 1. Dual-sync ke Serverless API / Local API (paralel & non-blocking)
  const apiPromise = (async () => {
    try {
      const res = await fetch('/api/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletes })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.revision) lastServerRevision = json.revision;
      }
    } catch (err) {
      console.warn('[API bulkDelete]:', err);
    }
  })();

  // 2. Direct batch delete ke Cloud Firestore HANYA JIKA BUKAN mode Supabase
  const firestorePromise = (async () => {
    if (IS_SUPABASE_OR_SERVER_PRIMARY || isFirestoreQuotaExceeded()) return;
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
        const batchTask = batch.commit();
        const timeoutTask = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 2500)
        );
        await Promise.race([batchTask, timeoutTask]);
        isPermissionDenied = false;
        console.log(`[Firestore] Bulk delete ${count} dokumen berhasil di Cloud Firestore.`);
      }
    } catch (err: any) {
      handleFirestoreError('bulkDelete', 'multiple', deletes.length, err);
    }
  })();

  await Promise.allSettled([apiPromise, firestorePromise]);
  deletes.forEach(d => broadcastSupabaseUpdate(d.collection, String(d.id)));
}

/**
 * Menghapus satu dokumen secara permanen dari Cloud Firestore & Backend API
 */
export async function deleteDocFromFirestore(collectionName: string, docId: string) {
  const idStr = String(docId);
  removeDocFromCache(collectionName, idStr);

  // 1. Dual-sync ke Serverless API / Local API (paralel & non-blocking)
  const apiPromise = (async () => {
    try {
      const res = await fetch(`/api/collections/${collectionName}/${encodeURIComponent(idStr)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const json = await res.json();
        if (json.revision) lastServerRevision = json.revision;
      }
    } catch (err) {
      console.warn(`[API deleteDoc] ${collectionName}/${idStr}:`, err);
    }
  })();

  // 2. Direct delete ke Cloud Firestore HANYA JIKA BUKAN mode Supabase
  const firestorePromise = (async () => {
    if (IS_SUPABASE_OR_SERVER_PRIMARY || isFirestoreQuotaExceeded()) return;
    try {
      const docRef = doc(db, collectionName, idStr);
      const deleteTask = deleteDoc(docRef);
      const timeoutTask = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 2500)
      );
      await Promise.race([deleteTask, timeoutTask]);
      isPermissionDenied = false;
      console.log(`[Firestore] Dokumen ${collectionName}/${idStr} berhasil dihapus dari Cloud Firestore.`);
    } catch (err: any) {
      handleFirestoreError('deleteDoc', collectionName, idStr, err);
    }
  })();

  await Promise.allSettled([apiPromise, firestorePromise]);
  broadcastSupabaseUpdate(collectionName, idStr);
}

/**
 * Memuat seluruh database: memprioritaskan API Backend (Supabase / PostgreSQL / Serverless)
 */
export async function loadAllFromFirestore() {
  // 1. Coba ambil langsung dari server API /api/db (Supabase / Serverless)
  try {
    const res = await fetch('/api/db', { cache: 'no-store' });
    if (res.ok) {
      const serverDb = await res.json();
      if (serverDb && typeof serverDb === 'object') {
        populateFullCache(serverDb);
        return serverDb;
      }
    }
  } catch (err) {
    console.warn('Gagal load dari /api/db:', err);
  }

  // Jika IS_SUPABASE_OR_SERVER_PRIMARY aktif, jangan pernah memanggil Firestore SDK agar tidak timeout
  if (IS_SUPABASE_OR_SERVER_PRIMARY) {
    const offlineDb = await store.getItem<Record<string, any>>('offline_db_cache_v5') || {};
    return offlineDb;
  }

  // 2. Fallback: Coba ambil langsung dari Cloud Firestore Web SDK dengan timeout
  try {
    const loadedData: Record<string, any> = {};
    let hasData = false;

    for (const collName of Object.values(COLLECTIONS)) {
      try {
        const fetchTask = getDocs(collection(db, collName));
        const timeoutTask = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('FIRESTORE_GET_TIMEOUT')), 3000)
        );
        const snap: any = await Promise.race([fetchTask, timeoutTask]);
        if (!snap.empty) {
          hasData = true;
          loadedData[collName] = snap.docs.map((d: any) => ({ ...d.data(), id: d.id }));
        }
      } catch (e) {}
    }

    if (hasData) {
      populateFullCache(loadedData);
      return loadedData;
    }
  } catch (err) {}

  const offlineDb = await store.getItem<Record<string, any>>('offline_db_cache_v5') || {};
  return offlineDb;
}

function ensureFirestoreRealtimeListener(collName: string) {
  if (typeof window === 'undefined') return;
  if (isFirestoreQuotaExceeded()) return;
  if (firestoreUnsubs.has(collName)) return;

  try {
    const collRef = collection(db, collName);
    const unsub = onSnapshot(collRef, (snapshot) => {
      if (snapshot.empty && !collectionCache.has(collName)) {
        return;
      }
      const firestoreItems = snapshot.docs.map(d => ({ ...d.data(), id: d.id, uid: d.id }));
      if (firestoreItems.length > 0) {
        const now = Date.now();
        const existing = collectionCache.get(collName) || [];
        const incomingIds = new Set(firestoreItems.map((i: any) => String(i?.id || i?.uid)));
        const pendingLocal = existing.filter((item: any) => {
          const id = String(item?.id || item?.uid);
          if (!id || incomingIds.has(id)) return false;
          const created = item?.createdAt ? new Date(item.createdAt).getTime() : now;
          return now - created < 60000;
        });
        collectionCache.set(collName, [...firestoreItems, ...pendingLocal]);
        notifyListeners(collName);
        persistCache();
      }
    }, (err) => {
      handleFirestoreError('onSnapshot', collName, 'all', err);
    });
    firestoreUnsubs.set(collName, unsub);
  } catch (err) {
    console.warn(`[Firestore onSnapshot setup] ${collName}:`, err);
  }
}

export function subscribeToRealtimeCollection(collection: string, callback: (data: any[]) => void) {
  if (!collectionListeners.has(collection)) collectionListeners.set(collection, new Set());
  collectionListeners.get(collection)!.add(callback);
  
  ensureFirestoreRealtimeListener(collection);

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

  // 1. Dual-sync ke Serverless API / Local API (Supabase / Serverless)
  try {
    const res = await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.revision) lastServerRevision = json.revision;
      populateFullCache(data);
      return true;
    }
  } catch (err) {
    console.warn('[API syncAllState]:', err);
  }

  // Jika IS_SUPABASE_OR_SERVER_PRIMARY aktif, lewati upload langsung Firestore
  if (IS_SUPABASE_OR_SERVER_PRIMARY || isFirestoreQuotaExceeded()) {
    populateFullCache(data);
    return true;
  }

  let directFirestoreOk = false;

  // 2. Direct upload ke Cloud Firestore dalam batch (fallback hanya untuk Firebase murni)
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

  populateFullCache(data);
  return directFirestoreOk;
}

export async function updateUserPresence(data: any) {
  return syncDocToFirestore(COLLECTIONS.USER_PRESENCE, data.userId, data);
}

export async function setUserOffline(userId: string) {
  return deleteDocFromFirestore(COLLECTIONS.USER_PRESENCE, userId);
}

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
  if (IS_SUPABASE_OR_SERVER_PRIMARY || isFirestoreQuotaExceeded()) {
    return true;
  }
  try {
    const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
    if (usersSnap.empty) {
      const offlineDb = await store.getItem<Record<string, any>>('offline_db_cache_v5');
      if (offlineDb && Object.keys(offlineDb).length > 2) {
        await syncAllStateToFirestore(offlineDb);
      }
    }
  } catch (err: any) {
    // Silent fail if permission-denied or offline
  }
  return true;
}
