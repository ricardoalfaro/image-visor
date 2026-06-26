import {
  RECENT_FOLDERS_KEY,
  RECENT_FOLDERS_LIMIT,
  RECENT_DB_NAME,
  RECENT_DB_STORE,
  RECENT_BROWSER_FILES_STORE,
} from "../constants.js";
import { state } from "../state.js";
import { renderRecentFolders } from "../ui.js";
import { getMediaType, isSupportedMedia } from "../media/media-utils.js";

function isValidRecentFolder(folder) {
  return Boolean(folder && typeof folder.id === "string" && typeof folder.name === "string");
}

function isPersistentRecentFolder(folder) {
  return folder.canReopen || folder.source === "server" || folder.source === "handle";
}

export function saveRecentFolders() {
  localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(state.recentFolders));
}

export async function loadRecentFolders() {
  try {
    const storedFolders = JSON.parse(localStorage.getItem(RECENT_FOLDERS_KEY) || "[]");
    state.recentFolders = Array.isArray(storedFolders)
      ? storedFolders.filter(isValidRecentFolder).filter(isPersistentRecentFolder).slice(0, RECENT_FOLDERS_LIMIT)
      : [];
    await hydrateStoredFolderCounts();
    saveRecentFolders();
  } catch (error) {
    state.recentFolders = [];
  }
}

export async function rememberRecentFolder(folder) {
  if (!folder?.id || !folder?.name) {
    return;
  }

  const nextFolder = {
    id: folder.id,
    name: folder.name,
    canReopen: Boolean(folder.canReopen),
    path: folder.path || "",
    source: folder.source || "browser",
    mediaCount: state.allMedia.filter((item) => item.type === "image").length,
    visitedAt: Date.now(),
  };
  state.recentFolders = [
    nextFolder,
    ...state.recentFolders.filter((recentFolder) => recentFolder.id !== nextFolder.id),
  ].slice(0, RECENT_FOLDERS_LIMIT);
  
  saveRecentFolders();
  renderRecentFolders();

  if (folder.handle) {
    await storeDirectoryHandle(nextFolder.id, folder.handle);
  }
}

async function hydrateStoredFolderCounts() {
  for (const folder of state.recentFolders) {
    if (Number.isInteger(folder.mediaCount) || folder.source !== "browser" || !folder.canReopen) {
      continue;
    }

    const storedFolder = await getStoredBrowserFolderFiles(folder.id);
    if (!storedFolder?.files) {
      continue;
    }

    folder.mediaCount = storedFolder.files.filter((item) => (
      isSupportedMedia(item.file) && getMediaType(item.file) === "image"
    )).length;
  }
}

export async function removeRecentFolder(folderId) {
  state.recentFolders = state.recentFolders.filter((folder) => folder.id !== folderId);
  state.recentFolderFiles.delete(folderId);
  saveRecentFolders();
  await removeStoredBrowserFolder(folderId);
  renderRecentFolders();
}

export async function markRecentFolderNotReopenable(folderId) {
  const recentFolder = state.recentFolders.find((folder) => folder.id === folderId);

  if (!recentFolder) {
    return;
  }

  recentFolder.canReopen = false;
  saveRecentFolders();
  renderRecentFolders();
}

export async function clearRecentFolders() {
  state.recentFolders = [];
  state.recentFolderFiles = new Map();
  localStorage.removeItem(RECENT_FOLDERS_KEY);
  await clearStoredBrowserFolders();
  renderRecentFolders();
}

export async function openRecentDatabase() {
  if (!("indexedDB" in window)) {
    return null;
  }

  if (!state.recentDbPromise) {
    state.recentDbPromise = new Promise((resolve) => {
      const request = indexedDB.open(RECENT_DB_NAME, 2);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(RECENT_DB_STORE)) {
          request.result.createObjectStore(RECENT_DB_STORE);
        }

        if (!request.result.objectStoreNames.contains(RECENT_BROWSER_FILES_STORE)) {
          request.result.createObjectStore(RECENT_BROWSER_FILES_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  return state.recentDbPromise;
}

export async function storeDirectoryHandle(folderId, directoryHandle) {
  const db = await openRecentDatabase();
  if (!db) return;
  await runStoreRequest(db, RECENT_DB_STORE, "readwrite", (store) => store.put(directoryHandle, folderId));
}

export async function getStoredDirectoryHandle(folderId) {
  const db = await openRecentDatabase();
  if (!db) return null;
  return await runStoreRequest(db, RECENT_DB_STORE, "readonly", (store) => store.get(folderId));
}

export async function storeBrowserFolderFiles(folderId, files, name) {
  const db = await openRecentDatabase();
  if (!db) return false;
  
  const payload = {
    name,
    files,
    storedAt: Date.now(),
  };
  const result = await runStoreRequest(
    db,
    RECENT_BROWSER_FILES_STORE,
    "readwrite",
    (store) => store.put(payload, folderId),
  );
  return result !== null;
}

export async function getStoredBrowserFolderFiles(folderId) {
  const db = await openRecentDatabase();
  if (!db) return null;
  return await runStoreRequest(db, RECENT_BROWSER_FILES_STORE, "readonly", (store) => store.get(folderId));
}

export async function clearStoredBrowserFolders() {
  const db = await openRecentDatabase();
  if (!db) return;
  await runStoreRequest(db, RECENT_BROWSER_FILES_STORE, "readwrite", (store) => store.clear());
}

export async function removeStoredBrowserFolder(folderId) {
  const db = await openRecentDatabase();
  if (!db) return;
  await runStoreRequest(db, RECENT_BROWSER_FILES_STORE, "readwrite", (store) => store.delete(folderId));
}

function runStoreRequest(db, storeName, mode, createRequest) {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(storeName, mode);
      const request = createRequest(transaction.objectStore(storeName));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch (error) {
      resolve(null);
    }
  });
}
