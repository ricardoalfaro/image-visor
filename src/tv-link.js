import { state } from "./state.js";
import {
  tvLinkButton, tvLinkDialog, tvLinkStatus, tvLinkCode, tvLinkHelp, tvLinkFingerprint,
  tvLinkRevokeButton, tvLinkCloseButton, tvLinkNewCodeButton,
} from "./dom.js";
import { showNotice } from "./ui.js";

const CODE_LIFETIME_MS = 5 * 60 * 1000;
let countdownTimer = 0;
let statusTimer = 0;
let syncTimer = 0;
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
  const folders = getShareableFolders();

  // Never wipe the TV's list because this browser profile has no history yet.
  if (!isLocalServerHost() || !folders.length) {
    return null;
  }

  return await tvApi("galleries", { folders });
}

function scheduleSync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(syncTvGalleries, 800);
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
    await syncTvGalleries();
    const result = await tvApi("pair", {});

    if (!result.ok || !result.code) {
      setCode("");
      tvLinkHelp.textContent = result.error || "No se pudo generar el código.";
      return;
    }

    setCode(result.code);
    tvLinkFingerprint.textContent = result.fingerprint || "—";
    codeExpiresAt = Date.now() + CODE_LIFETIME_MS;
    startCountdown();
  } finally {
    tvLinkNewCodeButton.disabled = false;
  }
}

async function refreshStatus() {
  const status = await tvApi("status");
  describeStatus(status);

  if (status.fingerprint) {
    tvLinkFingerprint.textContent = status.fingerprint;
  }

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
    return;
  }

  tvLinkNewCodeButton.disabled = false;
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

  // Keep the Apple TV's galleries equal to the folders added on the desktop.
  window.addEventListener("image-visor:recent-folders-updated", scheduleSync);
  syncTvGalleries();
}
