import { NOTICE_AUTO_HIDE_MS, THEME_SEQUENCE } from "./constants.js";
import { state } from "./state.js";
import { 
  appNotice, 
  appNoticeIcon, 
  appNoticeText,
  recentSidebar,
  menuButton,
  sidebarScrim,
  themeToggleButton,
  recentFoldersList,
  emptyRecentFolders,
  clearRecentFoldersButton,
  favoritePhotosCount,
  favoriteFolderButton
} from "./dom.js";
import { openRecentFolder, refreshRecentFolder } from "./file-loader.js";
import { removeRecentFolder, renameRecentFolder } from "./storage.js";
import { FAVORITES_FOLDER_PATH } from "./constants.js";
import { getAvailableFavorites, selectFolder } from "./viewer.js";

export function showNotice(message, type = "info") {
  const noticeType = ["info", "warning", "error"].includes(type) ? type : "info";
  const icons = {
    info: "fa-circle-info",
    warning: "fa-triangle-exclamation",
    error: "fa-circle-exclamation",
  };

  window.clearTimeout(state.noticeTimer);
  state.noticeTimer = 0;
  appNotice.classList.remove("notice-info", "notice-warning", "notice-error");
  appNotice.classList.add("is-visible", `notice-${noticeType}`);
  appNotice.setAttribute("aria-hidden", "false");
  appNotice.setAttribute("role", noticeType === "error" ? "alert" : "status");
  appNoticeText.textContent = message;
  appNoticeIcon.className = `fa-solid ${icons[noticeType]}`;

  if (noticeType !== "error") {
    state.noticeTimer = window.setTimeout(hideNotice, NOTICE_AUTO_HIDE_MS);
  }
}

export function hideNotice() {
  window.clearTimeout(state.noticeTimer);
  state.noticeTimer = 0;
  appNotice.classList.remove("is-visible");
  appNotice.setAttribute("aria-hidden", "true");
}

export function openSidebar() {
  document.body.classList.add("has-open-sidebar");
  recentSidebar.setAttribute("aria-hidden", "false");
  menuButton.setAttribute("aria-expanded", "true");
  sidebarScrim.hidden = false;
}

export function closeSidebar() {
  document.body.classList.remove("has-open-sidebar");
  recentSidebar.setAttribute("aria-hidden", "true");
  menuButton.setAttribute("aria-expanded", "false");
  sidebarScrim.hidden = true;
}

export function setThemePreference(theme, options = {}) {
  const nextTheme = ["light", "dark", "auto"].includes(theme) ? theme : "auto";
  document.documentElement.dataset.theme = nextTheme;
  themeToggleButton.setAttribute("aria-label", getThemeLabel(nextTheme));

  if (options.persist !== false) {
    localStorage.setItem("imageVisorTheme", nextTheme);
  }
}

export function cycleThemePreference() {
  const currentTheme = document.documentElement.dataset.theme || "auto";
  const currentIndex = THEME_SEQUENCE.indexOf(currentTheme);
  const nextTheme = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
  setThemePreference(nextTheme);
}

function getThemeLabel(theme) {
  const labels = {
    auto: "Modo automático",
    light: "Modo claro",
    dark: "Modo oscuro",
  };

  return labels[theme] || labels.auto;
}

export function renderRecentFolders() {
  recentFoldersList.innerHTML = "";
  emptyRecentFolders.classList.toggle("is-hidden", state.recentFolders.length > 0);
  clearRecentFoldersButton.classList.toggle("is-hidden", state.recentFolders.length === 0);

  state.recentFolders.forEach((folder) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const editButton = document.createElement("button");
    const refreshButton = document.createElement("button");
    const removeButton = document.createElement("button");
    const icon = document.createElement("i");
    const editIcon = document.createElement("i");
    const refreshIcon = document.createElement("i");
    const removeIcon = document.createElement("i");
    const label = document.createElement("span");
    const count = document.createElement("span");
    const displayName = getFolderDisplayName(folder);

    item.className = "recent-folder-item";
    button.className = "recent-folder-button";
    button.type = "button";
    button.title = `${displayName}, ${getFolderPhotoCountLabel(folder)}`;
    button.setAttribute("aria-label", button.title);
    icon.className = "fa-solid fa-folder";
    icon.setAttribute("aria-hidden", "true");
    label.className = "recent-folder-name";
    label.textContent = displayName;
    count.className = "recent-folder-count";
    count.textContent = Number.isInteger(folder.mediaCount) ? String(folder.mediaCount) : "–";
    count.setAttribute("aria-label", getFolderPhotoCountLabel(folder));
    editButton.className = "edit-recent-button";
    editButton.type = "button";
    editButton.title = `Renombrar ${displayName}`;
    editButton.setAttribute("aria-label", `Renombrar ${displayName}`);
    editIcon.className = "fa-solid fa-pen";
    editIcon.setAttribute("aria-hidden", "true");
    refreshButton.className = "refresh-recent-button";
    refreshButton.type = "button";
    refreshButton.title = `Actualizar ${displayName}`;
    refreshButton.setAttribute("aria-label", `Actualizar ${displayName}`);
    refreshIcon.className = "fa-solid fa-rotate-right";
    refreshIcon.setAttribute("aria-hidden", "true");
    removeButton.className = "remove-recent-button";
    removeButton.type = "button";
    removeButton.title = `Quitar ${displayName}`;
    removeButton.setAttribute("aria-label", `Quitar ${displayName} de recientes`);
    removeIcon.className = "fa-solid fa-xmark";
    removeIcon.setAttribute("aria-hidden", "true");

    button.append(icon, label, count);
    button.addEventListener("click", () => openRecentFolder(folder.id));
    editButton.append(editIcon);
    editButton.addEventListener("click", () => beginFolderRename(item, folder));
    refreshButton.append(refreshIcon);
    refreshButton.addEventListener("click", () => refreshRecentFolder(folder.id));
    removeButton.append(removeIcon);
    removeButton.addEventListener("click", async () => {
      await removeRecentFolder(folder.id);
      renderRecentFolders();
    });
    item.append(button, editButton, refreshButton, removeButton);
    recentFoldersList.append(item);
  });
}

function getFolderDisplayName(folder) {
  return folder.alias?.trim() || folder.name;
}

function beginFolderRename(item, folder) {
  if (item.classList.contains("is-renaming")) {
    return;
  }

  const input = document.createElement("input");
  let finished = false;
  input.className = "folder-rename-input";
  input.type = "text";
  input.value = getFolderDisplayName(folder);
  input.maxLength = 80;
  input.setAttribute("aria-label", `Renombrar ${getFolderDisplayName(folder)}`);
  item.classList.add("is-renaming");
  item.append(input);
  input.focus();
  input.select();

  const finish = (save) => {
    if (finished) return;
    finished = true;
    const nextAlias = input.value.trim();
    item.classList.remove("is-renaming");
    input.remove();

    if (save) {
      renameRecentFolder(folder.id, nextAlias === folder.name ? "" : nextAlias);
      renderRecentFolders();
    }
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

function getFolderPhotoCountLabel(folder) {
  if (!Number.isInteger(folder.mediaCount)) {
    return "cantidad pendiente";
  }

  return `${folder.mediaCount} ${folder.mediaCount === 1 ? "foto" : "fotos"}`;
}

export function renderFavorites() {
  const favorites = getAvailableFavorites();
  favoritePhotosCount.textContent = String(favorites.length);
  favoritePhotosCount.setAttribute("aria-label", `${favorites.length} favoritos`);
  favoriteFolderButton.disabled = favorites.length === 0;
  favoriteFolderButton.setAttribute("aria-label", `Abrir Favoritos, ${favorites.length} fotos`);
}

favoriteFolderButton.addEventListener("click", async () => {
  closeSidebar();
  await selectFolder(FAVORITES_FOLDER_PATH);
});

export function getRecentFolderMeta(folder) {
  if (state.recentFolderFiles.has(folder.id)) {
    return "Abrir en esta sesión";
  }

  if (folder.source === "browser" && folder.canReopen) {
    return "Abrir copia guardada";
  }

  if (folder.source === "server") {
    return "Abrir carpeta";
  }

  if (folder.source === "handle") {
    return "Abrir con permiso";
  }

  return "Requiere elegir de nuevo";
}
