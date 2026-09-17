const DB_NAME = 'hesabdari-offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'mutation_queue';
const SNAPSHOT_STORE = 'snapshots';

function assertBrowser() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('ذخیره‌سازی آفلاین در این مرورگر در دسترس نیست.');
  }
}

function openDatabase() {
  assertBrowser();
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        queue.createIndex('by_user_created', ['userId', 'createdAt']);
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export async function enqueueMutation({ userId, table, operation, payload, targetId = null }) {
  if (!userId || !table || !operation) throw new Error('اطلاعات عملیات آفلاین کامل نیست.');
  const db = await openDatabase();
  const entry = {
    id: makeId(),
    userId,
    table,
    operation,
    payload,
    targetId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  const transaction = db.transaction(QUEUE_STORE, 'readwrite');
  transaction.objectStore(QUEUE_STORE).add(entry);
  await transactionDone(transaction);
  db.close();
  return entry;
}

export async function pendingMutationCount(userId) {
  const entries = await queuedMutations(userId);
  return entries.length;
}

export async function queuedMutations(userId) {
  const db = await openDatabase();
  const transaction = db.transaction(QUEUE_STORE, 'readonly');
  const index = transaction.objectStore(QUEUE_STORE).index('by_user_created');
  const entries = await requestResult(index.getAll(IDBKeyRange.bound([userId, ''], [userId, '\uffff'])));
  await transactionDone(transaction);
  db.close();
  return entries;
}

export async function cacheSnapshot(userId, name, data) {
  const db = await openDatabase();
  const transaction = db.transaction(SNAPSHOT_STORE, 'readwrite');
  transaction.objectStore(SNAPSHOT_STORE).put({ key: `${userId}:${name}`, userId, data, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
  db.close();
}

export async function readSnapshot(userId, name) {
  const db = await openDatabase();
  const transaction = db.transaction(SNAPSHOT_STORE, 'readonly');
  const snapshot = await requestResult(transaction.objectStore(SNAPSHOT_STORE).get(`${userId}:${name}`));
  await transactionDone(transaction);
  db.close();
  return snapshot?.data || null;
}

async function removeMutation(id) {
  const db = await openDatabase();
  const transaction = db.transaction(QUEUE_STORE, 'readwrite');
  transaction.objectStore(QUEUE_STORE).delete(id);
  await transactionDone(transaction);
  db.close();
}

async function recordFailure(entry, message) {
  const db = await openDatabase();
  const transaction = db.transaction(QUEUE_STORE, 'readwrite');
  transaction.objectStore(QUEUE_STORE).put({ ...entry, attempts: entry.attempts + 1, lastError: message });
  await transactionDone(transaction);
  db.close();
}

export async function syncQueuedMutations({ userId, client }) {
  const entries = await queuedMutations(userId);
  let synced = 0;
  for (const entry of entries) {
    let request;
    if (entry.operation === 'create') request = client.from(entry.table).insert(entry.payload);
    if (entry.operation === 'update') request = client.from(entry.table).update(entry.payload).eq('id', entry.targetId);
    if (entry.operation === 'delete') request = client.from(entry.table).delete().eq('id', entry.targetId);
    if (!request) {
      await recordFailure(entry, 'نوع عملیات آفلاین نامعتبر است.');
      continue;
    }
    const { error } = await request;
    if (error) {
      await recordFailure(entry, error.message || 'خطا در همگام‌سازی');
      continue;
    }
    await removeMutation(entry.id);
    synced += 1;
  }
  return { synced, pending: (await queuedMutations(userId)).length };
}

export async function clearOfflineData(userId) {
  const db = await openDatabase();
  const transaction = db.transaction([QUEUE_STORE, SNAPSHOT_STORE], 'readwrite');
  const queue = transaction.objectStore(QUEUE_STORE).index('by_user_created');
  const queued = await requestResult(queue.getAll(IDBKeyRange.bound([userId, ''], [userId, '\uffff'])));
  queued.forEach((entry) => transaction.objectStore(QUEUE_STORE).delete(entry.id));
  const snapshots = await requestResult(transaction.objectStore(SNAPSHOT_STORE).getAll());
  snapshots.filter((snapshot) => snapshot.userId === userId).forEach((snapshot) => transaction.objectStore(SNAPSHOT_STORE).delete(snapshot.key));
  await transactionDone(transaction);
  db.close();
}
