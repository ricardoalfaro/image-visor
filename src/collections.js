import { COLLECTIONS_DB_NAME, COLLECTIONS_DB_STORE } from "./constants.js";
import { state } from "./state.js";

export async function loadCollections() {
  const records = await getAllCollectionRecords();
  state.collections = records.map(recordToCollection).filter(Boolean);
}

export function getCollection(id) {
  return state.collections.find((collection) => collection.id === id) || null;
}

export function getCollectionMedia(id) {
  return getCollection(id)?.media || [];
}

export function isMediaInCollection(id, media) {
  const key = getCollectionMediaKey(media);
  return Boolean(key && getCollection(id)?.media.some((item) => item.collectionKey === key));
}

export async function createCollection(name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName || hasCollectionName(normalizedName)) {
    return null;
  }

  const now = Date.now();
  const collection = { id: createCollectionId(), name: normalizedName, createdAt: now, updatedAt: now, media: [] };
  if (!await saveCollection(collection)) {
    return null;
  }

  state.collections = [...state.collections, collection];
  return collection;
}

export async function renameCollection(id, name) {
  const collection = getCollection(id);
  const normalizedName = normalizeName(name);
  if (!collection || !normalizedName || hasCollectionName(normalizedName, id)) {
    return false;
  }

  const updated = { ...collection, name: normalizedName, updatedAt: Date.now() };
  if (!await saveCollection(updated)) {
    return false;
  }

  state.collections = state.collections.map((item) => item.id === id ? updated : item);
  return true;
}

export async function deleteCollection(id) {
  const collection = getCollection(id);
  if (!collection || !await deleteCollectionRecord(id)) {
    return false;
  }

  state.collections = state.collections.filter((item) => item.id !== id);
  return true;
}

export async function toggleMediaInCollection(id, media) {
  const collection = getCollection(id);
  const key = getCollectionMediaKey(media);
  if (!collection || !key) {
    return null;
  }

  if (collection.media.some((item) => item.collectionKey === key)) {
    const updated = {
      ...collection,
      media: collection.media.filter((item) => item.collectionKey !== key),
      updatedAt: Date.now(),
    };
    if (!await saveCollection(updated)) {
      return null;
    }

    state.collections = state.collections.map((item) => item.id === id ? updated : item);
    return "removed";
  }

  const blob = await getMediaBlob(media);
  if (!blob) {
    return null;
  }

  const collectionMedia = {
    collectionKey: key,
    name: media.name,
    path: media.path,
    type: media.type,
    lastModified: media.lastModified || 0,
    folder: media.folder || "",
    groupFolder: media.groupFolder || "",
    blob,
  };
  const updated = { ...collection, media: [...collection.media, recordToMedia(collectionMedia)], updatedAt: Date.now() };
  if (!await saveCollection(updated)) {
    return null;
  }

  state.collections = state.collections.map((item) => item.id === id ? updated : item);
  return "added";
}

function normalizeName(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

function hasCollectionName(name, excludedId = "") {
  return state.collections.some((collection) => (
    collection.id !== excludedId && collection.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0
  ));
}

function getCollectionMediaKey(media) {
  if (!media?.path) return "";
  const size = media.file?.size || media.size || 0;
  return JSON.stringify([media.path, media.lastModified || 0, size]);
}

async function getMediaBlob(media) {
  if (media.file instanceof Blob) return media.file;
  if (!media.url) return null;

  try {
    const response = await fetch(media.url);
    return response.ok ? await response.blob() : null;
  } catch (error) {
    return null;
  }
}

function recordToCollection(record) {
  if (!record?.id || !record.name || !Array.isArray(record.media)) return null;
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt || 0,
    updatedAt: record.updatedAt || 0,
    media: record.media.map(recordToMedia).filter(Boolean),
  };
}

function recordToMedia(record) {
  if (!record?.collectionKey || !(record.blob instanceof Blob)) return null;
  return {
    collectionKey: record.collectionKey,
    file: record.blob,
    name: record.name || record.path,
    path: record.path,
    type: record.type || "image",
    lastModified: record.lastModified || 0,
    folder: record.folder || "",
    groupFolder: record.groupFolder || "",
  };
}

function collectionToRecord(collection) {
  return {
    ...collection,
    media: collection.media.map((media) => ({
      collectionKey: media.collectionKey,
      name: media.name,
      path: media.path,
      type: media.type,
      lastModified: media.lastModified,
      folder: media.folder,
      groupFolder: media.groupFolder,
      blob: media.file,
    })),
  };
}

function createCollectionId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function openCollectionsDatabase() {
  if (!("indexedDB" in window)) return null;
  if (!state.collectionsDbPromise) {
    state.collectionsDbPromise = new Promise((resolve) => {
      const request = indexedDB.open(COLLECTIONS_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(COLLECTIONS_DB_STORE)) {
          request.result.createObjectStore(COLLECTIONS_DB_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    });
  }
  return state.collectionsDbPromise;
}

async function getAllCollectionRecords() {
  const db = await openCollectionsDatabase();
  return db ? runCollectionRequest(db, "readonly", (store) => store.getAll(), []) : [];
}

async function saveCollection(collection) {
  const db = await openCollectionsDatabase();
  return db ? runCollectionRequest(db, "readwrite", (store) => store.put(collectionToRecord(collection)), null) !== null : false;
}

async function deleteCollectionRecord(id) {
  const db = await openCollectionsDatabase();
  if (!db) return false;
  await runCollectionRequest(db, "readwrite", (store) => store.delete(id), null);
  return true;
}

function runCollectionRequest(db, mode, createRequest, fallback) {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(COLLECTIONS_DB_STORE, mode);
      const request = createRequest(transaction.objectStore(COLLECTIONS_DB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = transaction.onerror = transaction.onabort = () => resolve(fallback);
    } catch (error) {
      resolve(fallback);
    }
  });
}
