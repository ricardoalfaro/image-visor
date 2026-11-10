import { state } from "./state.js";
import {
  tvLinkButton, tvLinkDialog, tvLinkStatus, tvLinkCode, tvLinkHelp,
  tvLinkRevokeButton, tvLinkCloseButton, tvLinkNewCodeButton, tvLinkSyncButton,
} from "./dom.js";
import { showNotice } from "./ui.js";
import { getFavoriteKey } from "./favorites.js";

const COLLECTIONS_SYNCED_KEY = "imageVisorTvCollectionsSynced";
const PROFILE_KEY = "imageVisorTvProfileId";
let syncTimer = 0;
let collectionsSyncing = false;
let collectionsDirty = false;

const CODE_LIFETIME_MS = 5 * 60 * 1000;
let countdownTimer = 0;
let statusTimer = 0;
let codeExpiresAt = 0;

// Linking only works with the local Node server, which can read real folder paths.
function isLocalServerHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function tvApi(route, body) {
  try {
    const response = await fetch(`/api/tv/${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    return { ok: response.ok, ...(await response.json()) };
  } catch (error) {
    return { ok: false, running: false };
  }
}

/** Folders opened through the local server have a real path the Apple TV service can read. */
export function getShareableFolders() {
  return state.recentFolders
    .filter((folder) => folder.source === "server" && folder.path)
    .map((folder) => ({ path: folder.path, name: folder.customName || folder.name }));
}

export async function syncTvGalleries() {
  if (!isLocalServerHost()) {
    return null;
  }

  // Explicit action: whatever this browser profile has replaces the TV's list, even if it is empty.
  return await tvApi("galleries", { folders: getShareableFolders(), owner: getProfileId() });
}

/** Random id of this browser profile, so the service knows which profile synced last. */
function getProfileId() {
  try {
    let id = localStorage.getItem(PROFILE_KEY);

    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PROFILE_KEY, id);
    }

    return id;
  } catch (error) {
    return "";
  }
}

/** Changes made here reach the TV by themselves, but only while this profile is the one that synced last. */
function scheduleAutoSync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(async () => {
    const status = await tvApi("status");

    if (status.running && status.owner && status.owner === getProfileId()) {
      await syncTvGalleries();
      await syncTvCollections();
    }
  }, 1200);
}

/** "Sincronizar con TV": this browser profile becomes the content of the Apple TV. */
async function syncNow() {
  tvLinkSyncButton.disabled = true;
  const label = tvLinkSyncButton.textContent;
  tvLinkSyncButton.textContent = "Sincronizando…";

  try {
    const galleries = await syncTvGalleries();
    await syncTvCollections();

    if (galleries && galleries.ok === false) {
      showNotice(galleries.error || "No se pudo sincronizar con la TV.", "warning");
    } else {
      const count = getShareableFolders().length;
      showNotice(`TV sincronizada: ${count} ${count === 1 ? "galería" : "galerías"}.`, "info");
    }
  } finally {
    tvLinkSyncButton.textContent = label;
    tvLinkSyncButton.disabled = false;
  }
}

/** Collections and Favoritos only exist in this browser, so their photos are copied to the TV service. */
function getCollectionGroups() {
  const groups = state.collections.map((collection) => ({ id: collection.id, name: collection.name, media: collection.media }));

  if (state.favoriteMedia.length) {
    groups.unshift({ id: "favorites", name: "Favoritos", media: state.favoriteMedia });
  }

  return groups;
}

function getItemKey(media) {
  return media.collectionKey || getFavoriteKey(media);
}

export async function syncTvCollections() {
  if (!isLocalServerHost()) {
    return;
  }

  // One sync at a time; changes made meanwhile trigger one more pass.
  if (collectionsSyncing) {
    collectionsDirty = true;
    return;
  }

  collectionsSyncing = true;

  try {
    do {
      collectionsDirty = false;
      const groups = getCollectionGroups();
      const blobsByFile = new Map();
      const collections = groups.map((group) => ({
        id: group.id,
        name: group.name,
        items: group.media
          .filter((media) => media.type !== "video" && media.file instanceof Blob)
          .map((media) => {
            const key = getItemKey(media);
            blobsByFile.set(`${group.id}\u0000${key}`, media.file);
            return { key, name: media.name, size: media.file.size, type: media.file.type };
          }),
      }));
      const result = await tvApi("collections", { collections });

      if (!result.ok) {
        return;
      }

      try {
        localStorage.setItem(COLLECTIONS_SYNCED_KEY, "true");
      } catch (error) {}

      for (const { collection, file, key } of result.missing || []) {
        const blob = blobsByFile.get(`${collection}\u0000${key}`);

        if (blob) {
          await fetch(`/api/tv/collections/${collection}/${file}`, { method: "PUT", body: blob, headers: { "Content-Type": "application/octet-stream" } }).catch(() => {});
        }
      }
    } while (collectionsDirty);
  } finally {
    collectionsSyncing = false;
  }
}

function formatCode(code) {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

function setCode(code) {
  tvLinkCode.textContent = code ? formatCode(code) : "— — — —  — — — —";
  tvLinkCode.classList.remove("is-expired");
}

function startCountdown() {
  window.clearInterval(countdownTimer);
  countdownTimer = window.setInterval(() => {
    const remaining = codeExpiresAt - Date.now();

    if (remaining <= 0) {
      window.clearInterval(countdownTimer);
      tvLinkCode.classList.add("is-expired");
      tvLinkHelp.textContent = "El código caducó. Pulsa «Nuevo código».";
      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
    tvLinkHelp.textContent = `En el Apple TV abre la app, elige «Fotos locales» e introduce este código. Caduca en ${minutes}:${seconds}.`;
  }, 1000);
}

function describeStatus(status) {
  if (!status.running) {
    tvLinkStatus.textContent = "El servicio de Apple TV no está activo. En una terminal ejecuta: node tv-server.js install-service";
    return;
  }

  const count = getShareableFolders().length;
  const skipped = state.recentFolders.filter((folder) => folder.source !== "server" || !folder.path).length;
  const paired = status.paired ? "Hay una TV vinculada. " : "Aún no hay ninguna TV vinculada. ";
  const shared = `${count} ${count === 1 ? "carpeta compartida" : "carpetas compartidas"}`;
  const note = skipped ? ` · ${skipped} del navegador no se pueden compartir (ábrelas con el selector del servidor)` : "";
  tvLinkStatus.textContent = `${paired}${shared}${note}.`;
  tvLinkRevokeButton.hidden = !status.paired;
}

async function requestCode() {
  tvLinkNewCodeButton.disabled = true;

  try {
    const result = await tvApi("pair", {});

    if (!result.ok || !result.code) {
      setCode("");
      tvLinkHelp.textContent = result.error || "No se pudo generar el código.";
      return;
    }

    setCode(result.code);
    codeExpiresAt = Date.now() + CODE_LIFETIME_MS;
    startCountdown();
  } finally {
    tvLinkNewCodeButton.disabled = false;
  }
}

async function refreshStatus() {
  const status = await tvApi("status");
  describeStatus(status);

  return status;
}

export function isTvLinkOpen() {
  return tvLinkDialog.getAttribute("aria-hidden") === "false";
}

export async function openTvLinkDialog() {
  tvLinkDialog.setAttribute("aria-hidden", "false");
  tvLinkRevokeButton.hidden = true;
  setCode("");
  tvLinkHelp.textContent = "Generando código…";
  tvLinkCloseButton.focus();

  const status = await refreshStatus();

  if (!status.running) {
    tvLinkHelp.textContent = "";
    tvLinkNewCodeButton.disabled = true;
    tvLinkSyncButton.disabled = true;
    return;
  }

  tvLinkNewCodeButton.disabled = false;
  tvLinkSyncButton.disabled = false;
  await requestCode();

  // Show "TV vinculada" as soon as the Apple TV uses the code.
  window.clearInterval(statusTimer);
  statusTimer = window.setInterval(async () => {
    const latest = await tvApi("status");

    if (latest.paired && codeExpiresAt > Date.now()) {
      window.clearInterval(countdownTimer);
      codeExpiresAt = 0;
      setCode("");
      tvLinkCode.textContent = "✓ Vinculada";
      tvLinkHelp.textContent = "Las galerías ya aparecen en tu Apple TV.";
      describeStatus(latest);
    }
  }, 2000);
}

export function closeTvLinkDialog() {
  window.clearInterval(countdownTimer);
  window.clearInterval(statusTimer);
  tvLinkDialog.setAttribute("aria-hidden", "true");
  tvLinkButton.focus();
}

export async function initializeTvLink() {
  if (!isLocalServerHost()) {
    return;
  }

  tvLinkButton.hidden = false;
  tvLinkButton.classList.remove("is-hidden");
  tvLinkButton.addEventListener("click", openTvLinkDialog);
  tvLinkCloseButton.addEventListener("click", closeTvLinkDialog);
  tvLinkNewCodeButton.addEventListener("click", requestCode);
  tvLinkDialog.addEventListener("click", (event) => {
    if (event.target === tvLinkDialog) closeTvLinkDialog();
  });
  tvLinkRevokeButton.addEventListener("click", async () => {
    const result = await tvApi("revoke", {});
    showNotice(result.ok ? "Se desvincularon todas las TV." : "No se pudo desvincular.", result.ok ? "info" : "warning");
    await refreshStatus();
  });

  // The button gives this profile control of the TV; the last profile to sync wins.
  tvLinkSyncButton.addEventListener("click", syncNow);
  window.addEventListener("image-visor:recent-folders-updated", scheduleAutoSync);
  window.addEventListener("image-visor:collections-updated", scheduleAutoSync);
}
