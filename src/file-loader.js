import { BROWSER_PICKER_WARNING, LOCAL_FOLDER_PICKER_ENDPOINT } from "./constants.js";
import { state, clearActiveObjectUrl, clearFolderThumbnailObjectUrls } from "./state.js";
import { 
  folderInput,
  serverButton,
} from "./dom.js";
import { showNotice, hideNotice, closeSidebar, renderFavorites } from "./ui.js";
import { getLocalRelativePath, getBrowserSelectedFolderName, getFolderPath, getTopLevelFolder, isSupportedMedia, getMediaType, createRecentFolderToken } from "./utils.js";
import { 
  storeBrowserFolderFiles,
  rememberRecentFolder,
  getStoredBrowserFolderFiles,
  markRecentFolderNotReopenable,
  getStoredDirectoryHandle,
  removeRecentFolder,
  getPhotoHistory
} from "./storage.js";
import { renderActiveImage, stopSlideshow } from "./viewer.js";
import { setZoom, resetFullscreenZoom } from "./zoom-pan.js";
import { syncAvailableFavorites } from "./favorites.js";
import { applyHistoryToPhoto, createPhotoModelsFromMediaItems } from "./develop/index.js";

export async function handleBrowserFolderIntent() {
  showNotice(BROWSER_PICKER_WARNING, "warning");
}

export async function handleFolderSelection(event) {
  const selectedFiles = Array.from(event.target.files || []);
  const files = selectedFiles.map((file) => ({
    file,
    path: getLocalRelativePath(file),
  }));
  const folderName = getBrowserSelectedFolderName(selectedFiles) || "Carpeta local";
  const recentFolderId = `browser:${folderName}`;
  await loadLocalFiles(files, folderName);
  state.recentFolderFiles.set(recentFolderId, { files, name: folderName });
  const isPersisted = await storeBrowserFolderFiles(recentFolderId, files, folderName);
  await rememberRecentFolder({
    id: recentFolderId,
    name: folderName,
    canReopen: isPersisted,
    source: "browser",
  });

  if (!isPersisted) {
    showNotice("La carpeta quedo disponible solo hasta que refresques la pagina.", "warning");
  }

  folderInput.value = "";
}

export async function loadLocalFolder() {
  hideNotice();
  serverButton.disabled = true;

  try {
    if (isLocalServerHost() && await loadFolderFromLocalServer()) {
      return;
    }

    if ("showDirectoryPicker" in window) {
      await loadFolderFromDirectoryPicker();
      return;
    }

    if (isLocalServerHost()) {
      showNotice("No se pudo abrir el selector local. Reinicia el server y vuelve a intentar.", "warning");
      return;
    }

    showNotice(BROWSER_PICKER_WARNING, "warning");
    folderInput.click();
  } finally {
    serverButton.disabled = false;
  }
}

function isLocalServerHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function loadFolderFromLocalServer() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120000);

  try {
    showNotice("Abriendo selector de carpeta del sistema...", "warning");
    const response = await fetch(LOCAL_FOLDER_PICKER_ENDPOINT, { signal: controller.signal });

    if (!response.ok) {
      return false;
    }

    const folder = await response.json();

    if (folder.cancelled) {
      return true;
    }

    await loadServerFolder(folder);
    hideNotice();
    return true;
  } catch (error) {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadFolderFromDirectoryPicker() {
  if (!("showDirectoryPicker" in window)) {
    return false;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
    const files = await collectDirectoryFiles(directoryHandle);
    const recentFolderId = await getRecentDirectoryFolderId(directoryHandle);
    await loadLocalFiles(files, directoryHandle.name || "Carpeta local");
    await rememberRecentFolder({
      id: recentFolderId,
      name: directoryHandle.name || "Carpeta local",
      canReopen: true,
      source: "handle",
      handle: directoryHandle,
    });
    return true;
  } catch (error) {
    if (error.name !== "AbortError") {
      showNotice("No se pudo abrir la carpeta local desde el navegador.", "warning");
    }

    return true;
  }
}

export async function openRecentFolder(folderId) {
  const recentFolder = state.recentFolders.find((folder) => folder.id === folderId);

  if (!recentFolder) {
    return;
  }

  if (state.recentFolderFiles.has(recentFolder.id)) {
    const cachedFolder = state.recentFolderFiles.get(recentFolder.id);
    closeSidebar();
    hideNotice();
    await loadLocalFiles(cachedFolder.files, cachedFolder.name || recentFolder.name);
    await rememberRecentFolder(recentFolder);
    return;
  }

  if (recentFolder.source === "browser" && recentFolder.canReopen) {
    const storedFolder = await getStoredBrowserFolderFiles(recentFolder.id);

    if (storedFolder?.files?.length) {
      closeSidebar();
      hideNotice();
      state.recentFolderFiles.set(recentFolder.id, storedFolder);
      await loadLocalFiles(storedFolder.files, storedFolder.name || recentFolder.name);
      await rememberRecentFolder(recentFolder);
      return;
    }

    await markRecentFolderNotReopenable(recentFolder.id);
  }

  if (recentFolder.source === "server" && recentFolder.path) {
    closeSidebar();
    hideNotice();

    try {
      await loadServerFolderByPath(recentFolder.path);
    } catch (error) {
      showNotice("No se pudo abrir esa carpeta reciente. Puede que se haya movido o eliminado.", "error");
    }

    return;
  }

  if (!recentFolder.canReopen) {
    showNotice("Esta carpeta no pudo conservarse despues del refresh. Elige la carpeta nuevamente para actualizarla.", "warning");
    closeSidebar();
    return;
  }

  try {
    const directoryHandle = await getStoredDirectoryHandle(folderId);

    if (!directoryHandle) {
      removeRecentFolder(folderId);
      showNotice("Ya no se encontro el permiso de esa carpeta. Elige la carpeta nuevamente.", "warning");
      return;
    }

    const hasPermission = await ensureDirectoryPermission(directoryHandle);

    if (!hasPermission) {
      showNotice("No se pudo obtener permiso para abrir esa carpeta.", "warning");
      return;
    }

    closeSidebar();
    hideNotice();
    const files = await collectDirectoryFiles(directoryHandle);
    await loadLocalFiles(files, directoryHandle.name || recentFolder.name);
    await rememberRecentFolder({
      ...recentFolder,
      name: directoryHandle.name || recentFolder.name,
      canReopen: true,
      source: "handle",
      handle: directoryHandle,
    });
  } catch (error) {
    showNotice("No se pudo abrir la carpeta reciente.", "error");
  }
}

export async function refreshRecentFolder(folderId) {
  const recentFolder = state.recentFolders.find((folder) => folder.id === folderId);

  if (!recentFolder) {
    return;
  }

  closeSidebar();
  hideNotice();

  try {
    if (recentFolder.source === "server" && recentFolder.path) {
      await loadServerFolderByPath(recentFolder.path);
      showNotice("Carpeta actualizada.", "info");
      return;
    }

    if (recentFolder.source === "handle") {
      const directoryHandle = await getStoredDirectoryHandle(recentFolder.id);

      if (!directoryHandle) {
        removeRecentFolder(recentFolder.id);
        showNotice("Ya no se encontro el permiso de esa carpeta. Elige la carpeta nuevamente.", "warning");
        return;
      }

      const hasPermission = await ensureDirectoryPermission(directoryHandle);

      if (!hasPermission) {
        showNotice("No se pudo obtener permiso para actualizar esa carpeta.", "warning");
        return;
      }

      const files = await collectDirectoryFiles(directoryHandle);
      await loadLocalFiles(files, directoryHandle.name || recentFolder.name);
      await rememberRecentFolder({
        ...recentFolder,
        name: directoryHandle.name || recentFolder.name,
        canReopen: true,
        source: "handle",
        handle: directoryHandle,
      });
      showNotice("Carpeta actualizada.", "info");
      return;
    }

    showNotice("Para actualizar esta carpeta, elige la carpeta nuevamente.", "warning");
  } catch (error) {
    showNotice("No se pudo actualizar esa carpeta.", "error");
  }
}

async function loadServerFolderByPath(folderPath) {
  const response = await fetch(`/api/folder?path=${encodeURIComponent(folderPath)}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Could not load folder");
  }

  await loadServerFolder(await response.json());
}

async function loadServerFolder(folder) {
  const media = (folder.files || []).map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type,
    url: item.url,
    lastModified: item.lastModified || 0,
    folder: getFolderPath(item.path),
    groupFolder: getTopLevelFolder(item.path),
  }));

  await loadMediaItems(media, folder.name || "Carpeta local");
  await rememberRecentFolder({
    id: `server:${folder.path}`,
    name: folder.name || "Carpeta local",
    path: folder.path,
    canReopen: true,
    source: "server",
  });
}

async function collectDirectoryFiles(directoryHandle, parentPath = "") {
  const files = [];

  for await (const [name, handle] of directoryHandle.entries()) {
    if (name.startsWith(".")) {
      continue;
    }

    const path = parentPath ? `${parentPath}/${name}` : name;

    if (handle.kind === "directory") {
      files.push(...await collectDirectoryFiles(handle, path));
      continue;
    }

    if (handle.kind !== "file") {
      continue;
    }

    files.push({
      file: await handle.getFile(),
      path,
    });
  }

  return files;
}

async function loadLocalFiles(files, label) {
  const media = files
    .filter((item) => isSupportedMedia(item.file))
    .map((item) => {
      return {
        file: item.file,
        name: item.file.name,
        path: item.path,
        type: getMediaType(item.file),
        lastModified: item.file.lastModified || 0,
        folder: getFolderPath(item.path),
        groupFolder: getTopLevelFolder(item.path),
      };
    });

  await loadMediaItems(media, label);
}

import { getFoldersFromMedia } from "./utils.js";
import { applyFolderFilter } from "./viewer.js";

async function loadMediaItems(media, label) {
  clearActiveObjectUrl();
  clearFolderThumbnailObjectUrls();
  state.sourceLabel = label || "Carpeta local";
  stopSlideshow();

  state.allMedia = media;
  state.photos = createPhotoModelsFromMediaItems(state.allMedia)
    .map((photo) => applyHistoryToPhoto(photo, getPhotoHistory(photo.id)));
  await syncAvailableFavorites(state.allMedia);
  state.folders = getFoldersFromMedia(state.allMedia);
  state.activeFolderPath = "";
  applyFolderFilter();
  renderFavorites();

  state.activeIndex = state.images.length > 0 ? 0 : -1;
  setZoom(100);
  resetFullscreenZoom();
  await renderActiveImage();
}

export async function closeViewer() {
  stopSlideshow();
  clearActiveObjectUrl();
  clearFolderThumbnailObjectUrls();
  resetFullscreenZoom();
  state.sourceLabel = "Carpeta local";
  state.images = [];
  state.allMedia = [];
  state.photos = [];
  state.folders = [];
  state.activeFolderPath = "";
  renderFavorites();
  state.activeIndex = -1;
  folderInput.value = "";
  setZoom(100);
  await renderActiveImage();
}

async function getRecentDirectoryFolderId(directoryHandle) {
  if (directoryHandle.isSameEntry) {
    for (const recentFolder of state.recentFolders) {
      if (!recentFolder.canReopen) {
        continue;
      }

      const storedHandle = await getStoredDirectoryHandle(recentFolder.id);

      if (storedHandle && await directoryHandle.isSameEntry(storedHandle)) {
        return recentFolder.id;
      }
    }
  }

  return `fs:${directoryHandle.name || "Carpeta local"}:${createRecentFolderToken()}`;
}

async function ensureDirectoryPermission(directoryHandle) {
  if (!directoryHandle.queryPermission || !directoryHandle.requestPermission) {
    return true;
  }

  const permission = await directoryHandle.queryPermission({ mode: "read" });

  if (permission === "granted") {
    return true;
  }

  return await directoryHandle.requestPermission({ mode: "read" }) === "granted";
}
