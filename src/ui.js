import { NOTICE_AUTO_HIDE_MS, THEME_SEQUENCE } from "./constants.js";
import { state } from "./state.js";
import {
  appNotice,
  appNoticeIcon,
  appNoticeText,
  appSidebar,
  sidebarToggleButton,
  menuButton,
  adjustmentsButton,
  sortButton,
  fullscreenAdjustmentsButton,
  sidebarTitle,
  foldersPanel,
  adjustmentsPanel,
  sortPanel,
  sidebarScrim,
  themeToggleButton,
  recentFoldersList,
  emptyRecentFolders,
  clearRecentFoldersButton,
  favoritePhotosCount,
  favoriteFolderButton,
  sortOptionButtons
} from "./dom.js";
import { openRecentFolder, refreshRecentFolder } from "./file-loader.js";
import { removeRecentFolder } from "./storage.js";
import { FAVORITES_FOLDER_PATH } from "./constants.js";
import { getAvailableFavorites, selectFolder, applyFolderFilter } from "./viewer.js";

const SIDEBAR_PANELS = {
  folders: { element: foldersPanel, trigger: menuButton, title: "Carpetas" },
  adjustments: { element: adjustmentsPanel, trigger: adjustmentsButton, title: "Controles" },
  sort: { element: sortPanel, trigger: sortButton, title: "Ordenar por" },
};

export function showNotice(message, type = "info") {
  const noticeType = ["info", "warning", "error"].includes(type) ? type : "info";
  const icons = {
    info: "iconoir-info-circle",
    warning: "iconoir-warning-triangle",
    error: "iconoir-warning-circle",
  };

  window.clearTimeout(state.noticeTimer);
  state.noticeTimer = 0;
  appNotice.classList.remove("notice-info", "notice-warning", "notice-error");
  appNotice.classList.add("is-visible", `notice-${noticeType}`);
  appNotice.setAttribute("aria-hidden", "false");
  appNotice.setAttribute("role", noticeType === "error" ? "alert" : "status");
  appNoticeText.textContent = message;
  appNoticeIcon.className = icons[noticeType];

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

export function openSidebar(panel = "folders") {
  const nextPanel = SIDEBAR_PANELS[panel] ? panel : "folders";

  if (nextPanel === "adjustments" && !state.images.length) {
    showNotice("Abre una carpeta para usar los controles de imagen.", "warning");
    return;
  }

  state.activeSidebarPanel = nextPanel;
  document.body.classList.add("has-open-sidebar");
  appSidebar.setAttribute("aria-hidden", "false");
  sidebarTitle.textContent = SIDEBAR_PANELS[nextPanel].title;

  Object.entries(SIDEBAR_PANELS).forEach(([key, { element, trigger }]) => {
    const isActive = key === nextPanel;
    element.classList.toggle("is-hidden", !isActive);
    trigger.setAttribute("aria-expanded", String(isActive));
    trigger.setAttribute("aria-pressed", String(isActive));
  });

  if (nextPanel === "sort") {
    renderSortOptions();
  }

  fullscreenAdjustmentsButton.setAttribute("aria-expanded", String(nextPanel === "adjustments"));
  fullscreenAdjustmentsButton.setAttribute("aria-pressed", String(nextPanel === "adjustments"));
  sidebarToggleButton.setAttribute("aria-expanded", "true");
  sidebarScrim.hidden = false;
}

export function toggleSidebar(panel = "folders") {
  const nextPanel = SIDEBAR_PANELS[panel] ? panel : "folders";
  const isOpen = document.body.classList.contains("has-open-sidebar");

  if (isOpen && state.activeSidebarPanel === nextPanel) {
    closeSidebar();
    return;
  }

  openSidebar(nextPanel);
}

export function closeSidebar() {
  document.body.classList.remove("has-open-sidebar");
  appSidebar.setAttribute("aria-hidden", "true");

  Object.values(SIDEBAR_PANELS).forEach(({ trigger }) => {
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-pressed", "false");
  });

  fullscreenAdjustmentsButton.setAttribute("aria-expanded", "false");
  fullscreenAdjustmentsButton.setAttribute("aria-pressed", "false");
  sidebarToggleButton.setAttribute("aria-expanded", "false");
  sidebarScrim.hidden = true;
}

export function renderSortOptions() {
  sortOptionButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.sortValue === state.sortBy));
  });
}

sortOptionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.sortBy = button.dataset.sortValue;
    renderSortOptions();
    applyFolderFilter({ keepIndex: true });
  });
});

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
    const refreshButton = document.createElement("button");
    const removeButton = document.createElement("button");
    const icon = document.createElement("i");
    const refreshIcon = document.createElement("i");
    const removeIcon = document.createElement("i");
    const label = document.createElement("span");
    const count = document.createElement("span");

    item.className = "recent-folder-item";
    button.className = "recent-folder-button";
    button.type = "button";
    button.title = `${folder.name}, ${getFolderPhotoCountLabel(folder)}`;
    button.setAttribute("aria-label", button.title);
    icon.className = "iconoir-folder";
    icon.setAttribute("aria-hidden", "true");
    label.className = "recent-folder-name";
    label.textContent = folder.name;
    count.className = "recent-folder-count";
    count.textContent = Number.isInteger(folder.mediaCount) ? String(folder.mediaCount) : "–";
    count.setAttribute("aria-label", getFolderPhotoCountLabel(folder));
    refreshButton.className = "refresh-recent-button";
    refreshButton.type = "button";
    refreshButton.title = `Actualizar ${folder.name}`;
    refreshButton.setAttribute("aria-label", `Actualizar ${folder.name}`);
    refreshIcon.className = "iconoir-refresh";
    refreshIcon.setAttribute("aria-hidden", "true");
    removeButton.className = "remove-recent-button";
    removeButton.type = "button";
    removeButton.title = `Quitar ${folder.name}`;
    removeButton.setAttribute("aria-label", `Quitar ${folder.name} de recientes`);
    removeIcon.className = "iconoir-xmark";
    removeIcon.setAttribute("aria-hidden", "true");

    button.append(icon, label, count);
    button.addEventListener("click", () => openRecentFolder(folder.id));
    refreshButton.append(refreshIcon);
    refreshButton.addEventListener("click", () => refreshRecentFolder(folder.id));
    removeButton.append(removeIcon);
    removeButton.addEventListener("click", () => removeRecentFolder(folder.id));
    item.append(button, refreshButton, removeButton);
    recentFoldersList.append(item);
  });
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
