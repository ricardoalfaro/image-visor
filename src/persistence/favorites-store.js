import { FAVORITES_DB_NAME, FAVORITES_DB_STORE, FAVORITES_KEY } from "../constants.js";
import { state } from "../state.js";

export function getFavoriteKey(media) {
  if (media?.favoriteKey) {
    return media.favoriteKey;
  }

  if (!media?.path) {
    return "";
  }

  const size = media.file?.size || media.size || 0;
  return JSON.stringify([media.path, media.lastModified || 0, size]);
}

export function isFavorite(media) {
  return state.favoriteKeys.has(getFavoriteKey(media)) || state.favoriteKeys.has(getLegacyFavoriteKey(media));
}

export async function loadFavorites() {
  try {
    const storedKeys = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    state.favoriteKeys = new Set(
      Array.isArray(storedKeys) ? storedKeys.filter((key) => typeof key === "string") : [],
    );
  } catch (error) {
    state.favoriteKeys = new Set();
  }

  const records = await getAllFavoriteRecords();
  state.favoriteMedia = records.map(recordToMedia).filter(Boolean);

  for (const media of state.favoriteMedia) {
    state.favoriteKeys.add(getFavoriteKey(media));
  }

  saveFavoriteKeys();
}

export async function syncAvailableFavorites(mediaItems) {
  const persistedKeys = new Set(state.favoriteMedia.map(getFavoriteKey));

  for (const media of mediaItems) {
    if (!isFavorite(media)) {
      continue;
    }

    const key = getFavoriteKey(media);
    const legacyKey = getLegacyFavoriteKey(media);

    if (!persistedKeys.has(key)) {
      const persisted = await persistFavoriteMedia(media, key);
      if (!persisted) {
        continue;
      }
      persistedKeys.add(key);
    }

    state.favoriteKeys.add(key);
    state.favoriteKeys.delete(legacyKey);
  }

  saveFavoriteKeys();
}

export async function toggleFavorite(media) {
  const key = getFavoriteKey(media);
  const legacyKey = getLegacyFavoriteKey(media);

  if (!key) {
    return false;
  }

  if (state.favoriteKeys.has(key) || state.favoriteKeys.has(legacyKey)) {
    state.favoriteKeys.delete(key);
    state.favoriteKeys.delete(legacyKey);
    state.favoriteMedia = state.favoriteMedia.filter((item) => getFavoriteKey(item) !== key);
    await deleteFavoriteRecord(key);
    saveFavoriteKeys();
    return false;
  }

  const persisted = await persistFavoriteMedia(media, key);
  if (!persisted) {
    return false;
  }

  state.favoriteKeys.add(key);
  saveFavoriteKeys();
  return true;
}

async function persistFavoriteMedia(media, key) {
  const blob = await getMediaBlob(media);

  if (!blob) {
    return false;
  }

  const record = {
    key,
    name: media.name,
    path: media.path,
    type: media.type,
    lastModified: media.lastModified || 0,
    folder: media.folder || "",
    groupFolder: media.groupFolder || "",
    blob,
  };
  const stored = await putFavoriteRecord(record);

  if (!stored) {
    return false;
  }

  const favoriteMedia = recordToMedia(record);
  state.favoriteMedia = [
    ...state.favoriteMedia.filter((item) => getFavoriteKey(item) !== key),
    favoriteMedia,
  ];
  return true;
}

async function getMediaBlob(media) {
  if (media.file instanceof Blob) {
    return media.file;
  }

  if (!media.url) {
    return null;
  }

  try {
    const response = await fetch(media.url);
    return response.ok ? await response.blob() : null;
  } catch (error) {
    return null;
  }
}

function recordToMedia(record) {
  if (!record?.key || !(record.blob instanceof Blob)) {
    return null;
  }

  return {
    favoriteKey: record.key,
    file: record.blob,
    name: record.name || record.path,
    path: record.path,
    type: record.type || "image",
    lastModified: record.lastModified || 0,
    folder: record.folder || "",
    groupFolder: record.groupFolder || "",
  };
}

function saveFavoriteKeys() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favoriteKeys]));
  } catch (error) {}
}

function getLegacyFavoriteKey(media) {
  return media?.path ? `${state.sourceLabel}\u0000${media.path}` : "";
}

async function openFavoritesDatabase() {
  if (!("indexedDB" in window)) {
    return null;
  }

  if (!state.favoriteDbPromise) {
    state.favoriteDbPromise = new Promise((resolve) => {
      const request = indexedDB.open(FAVORITES_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(FAVORITES_DB_STORE)) {
          request.result.createObjectStore(FAVORITES_DB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  return state.favoriteDbPromise;
}

async function getAllFavoriteRecords() {
  const db = await openFavoritesDatabase();
  if (!db) return [];
  return await runFavoriteRequest(db, "readonly", (store) => store.getAll(), []);
}

async function putFavoriteRecord(record) {
  const db = await openFavoritesDatabase();
  if (!db) return false;
  return await runFavoriteRequest(db, "readwrite", (store) => store.put(record), null) !== null;
}

async function deleteFavoriteRecord(key) {
  const db = await openFavoritesDatabase();
  if (!db) return;
  await runFavoriteRequest(db, "readwrite", (store) => store.delete(key), null);
}

function runFavoriteRequest(db, mode, createRequest, fallback) {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(FAVORITES_DB_STORE, mode);
      const request = createRequest(transaction.objectStore(FAVORITES_DB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(fallback);
      transaction.onerror = () => resolve(fallback);
      transaction.onabort = () => resolve(fallback);
    } catch (error) {
      resolve(fallback);
    }
  });
}
