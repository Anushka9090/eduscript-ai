import { openDB } from 'idb';

const DB_NAME = 'eduscript';
const DB_VERSION = 1;

let _db = null;

async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('transcripts')) {
        const ts = db.createObjectStore('transcripts', { keyPath: 'wordId' });
        ts.createIndex('by-session', 'sessionId');
      }
    },
  });
  return _db;
}

export async function saveSession(session) {
  try {
    const db = await getDB();
    await db.put('sessions', { ...session, updatedAt: Date.now() });
  } catch (err) {
    console.warn('[DB] saveSession failed:', err);
  }
}

export async function loadSession(id) {
  try {
    const db = await getDB();
    return await db.get('sessions', id);
  } catch (err) {
    console.warn('[DB] loadSession failed:', err);
    return null;
  }
}

export async function saveWords(sessionId, words) {
  try {
    const db = await getDB();
    const tx = db.transaction('transcripts', 'readwrite');
    await Promise.all(words.map((w) => tx.store.put({ ...w, wordId: w.id, sessionId })));
    await tx.done;
  } catch (err) {
    console.warn('[DB] saveWords failed:', err);
  }
}

export async function getSessionWords(sessionId) {
  try {
    const db = await getDB();
    return await db.getAllFromIndex('transcripts', 'by-session', sessionId);
  } catch (err) {
    console.warn('[DB] getSessionWords failed:', err);
    return [];
  }
}
