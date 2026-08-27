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
  foldersPanel,
  adjustmentsPanel,
  sortPanel,
  sidebarScrim,
  themeToggleButton,
  recentFoldersList,
  emptyRecentFolders,
  collectionsList,
  emptyCollections,
  sortOptionButtons
} from "./dom.js";
import { openRecentFolder, refreshRecentFolder } from "./file-loader.js";
import { removeRecentFolder, renameRecentFolder } from "./storage.js";
import { COLLECTIONS_FOLDER_PREFIX, FAVORITES_FOLDER_PATH } from "./constants.js";
import { deleteCollection, renameCollection } from "./collections.js";
import { getAvailableFavorites, selectFolder } from "./viewer.js";

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
  Object.entries(SIDEBAR_PANELS).forEach(([key, { element, trigger }]) => {
    const isActive = key === nextPanel;
    element.classList.toggle("is-hidden", !isActive);
    trigger.setAttribute("aria-expanded", String(isActive));
    trigger.setAttribute("aria-pressed", String(isActive));
  });

  if (nextPanel === "sort") {
    renderSortOptions();
  }

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

  state.recentFolders.forEach((folder) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const refreshButton = document.createElement("button");
    const renameButton = document.createElement("button");
    const removeButton = document.createElement("button");
    const icon = document.createElement("i");
    const refreshIcon = document.createElement("i");
    const removeIcon = document.createElement("i");
    const renameIcon = document.createElement("i");
    const label = document.createElement("span");
    const count = document.createElement("span");

    item.className = "recent-folder-item";
    button.className = "recent-folder-button";
    button.type = "button";
    const displayName = folder.customName || folder.name;
    button.title = `${displayName}, ${getFolderPhotoCountLabel(folder)}`;
    button.setAttribute("aria-label", button.title);
    icon.className = "iconoir-folder";
    icon.setAttribute("aria-hidden", "true");
    label.className = "recent-folder-name";
    label.textContent = displayName;
    count.className = "recent-folder-count";
    count.textContent = Number.isInteger(folder.mediaCount) ? String(folder.mediaCount) : "–";
    count.setAttribute("aria-label", getFolderPhotoCountLabel(folder));
    refreshButton.className = "refresh-recent-button";
    refreshButton.type = "button";
    refreshButton.title = `Actualizar ${folder.name}`;
    refreshButton.setAttribute("aria-label", `Actualizar ${folder.name}`);
    refreshIcon.className = "iconoir-refresh";
    refreshIcon.setAttribute("aria-hidden", "true");
    renameButton.className = "rename-recent-button";
    renameButton.type = "button";
    renameButton.title = `Renombrar ${displayName}`;
    renameButton.setAttribute("aria-label", `Renombrar ${displayName}`);
    renameIcon.className = "iconoir-edit-pencil";
    renameIcon.setAttribute("aria-hidden", "true");
    removeButton.className = "remove-recent-button";
    removeButton.type = "button";
    removeButton.title = `Quitar ${folder.name}`;
    removeButton.setAttribute("aria-label", `Quitar ${folder.name} de recientes`);
    removeIcon.className = "iconoir-xmark";
    removeIcon.setAttribute("aria-hidden", "true");

    button.append(icon, label, count);
    button.addEventListener("click", async () => {
      await openRecentFolder(folder.id);
      closeSidebar();
    });
    refreshButton.append(refreshIcon);
    refreshButton.addEventListener("click", () => refreshRecentFolder(folder.id));
    renameButton.append(renameIcon);
    renameButton.addEventListener("click", () => {
      const nextName = window.prompt("Nombre local para esta carpeta:", displayName);
      if (nextName === null || !nextName.trim()) return;
      renameRecentFolder(folder.id, nextName);
    });
    removeButton.append(removeIcon);
    removeButton.addEventListener("click", () => removeRecentFolder(folder.id));
    item.append(button, renameButton, refreshButton, removeButton);
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
  const favoritePhotosCount = collectionsList.querySelector("#favoritePhotosCount");
  if (!favoritePhotosCount) return;
  favoritePhotosCount.textContent = String(favorites.length);
  favoritePhotosCount.setAttribute("aria-label", `${favorites.length} favoritos`);
}

export function renderCollections() {
  for (const objectUrl of state.collectionCoverObjectUrls.values()) URL.revokeObjectURL(objectUrl);
  state.collectionCoverObjectUrls.clear();
  collectionsList.innerHTML = "";
  emptyCollections.classList.toggle("is-hidden", state.collections.length > 0);

  const favorites = getAvailableFavorites();
  const favoriteItem = document.createElement("li");
  const favoriteButton = document.createElement("button");
  const favoriteIcon = document.createElement("i");
  const favoriteLabel = document.createElement("span");
  const favoriteCount = document.createElement("span");
  favoriteItem.className = "recent-folder-item permanent-collection-item";
  favoriteButton.className = "recent-folder-button";
  favoriteButton.type = "button";
  favoriteButton.title = `Favoritos, ${favorites.length} fotos`;
  favoriteButton.setAttribute("aria-label", `Abrir Favoritos, ${favorites.length} fotos`);
  const favoriteMedia = favorites.find((media) => media.type === "image") || favorites[0];
  if (favoriteMedia?.file instanceof Blob) {
    const coverUrl = URL.createObjectURL(favoriteMedia.file);
    state.collectionCoverObjectUrls.set("favorite", coverUrl);
    favoriteIcon.className = "collection-cover";
    favoriteIcon.style.backgroundImage = `url("${coverUrl}")`;
    favoriteIcon.setAttribute("aria-label", "Portada de Favoritos");
  } else {
    favoriteIcon.className = "iconoir-star";
    favoriteIcon.setAttribute("aria-hidden", "true");
  }
  favoriteLabel.className = "recent-folder-name";
  favoriteLabel.textContent = "Favoritos";
  favoriteCount.id = "favoritePhotosCount";
  favoriteCount.className = "recent-folder-count";
  favoriteCount.textContent = String(favorites.length);
  favoriteCount.setAttribute("aria-label", `${favorites.length} favoritos`);
  favoriteButton.append(favoriteIcon, favoriteLabel, favoriteCount);
  favoriteButton.addEventListener("click", async () => {
    await selectFolder(FAVORITES_FOLDER_PATH);
    closeSidebar();
  });
  favoriteItem.append(favoriteButton);
  collectionsList.append(favoriteItem);

  state.collections.forEach((collection) => {
    const item = document.createElement("li");
    const openButton = document.createElement("button");
    const renameButton = document.createElement("button");
    const removeButton = document.createElement("button");
    const icon = document.createElement("i");
    const label = document.createElement("span");
    const count = document.createElement("span");

    item.className = "recent-folder-item";
    openButton.className = "recent-folder-button";
    openButton.type = "button";
    openButton.title = `${collection.name}, ${collection.media.length} fotos`;
    openButton.setAttribute("aria-label", `Abrir colección ${collection.name}, ${collection.media.length} fotos`);
    const coverMedia = collection.media.find((media) => media.type === "image") || collection.media[0];
    if (coverMedia?.file instanceof Blob) {
      const coverUrl = URL.createObjectURL(coverMedia.file);
      state.collectionCoverObjectUrls.set(collection.id, coverUrl);
      icon.className = "collection-cover";
      icon.style.backgroundImage = `url("${coverUrl}")`;
      icon.setAttribute("aria-label", `Portada de ${collection.name}`);
    } else {
      icon.className = "iconoir-bookmark";
      icon.setAttribute("aria-hidden", "true");
    }
    label.className = "recent-folder-name";
    label.textContent = collection.name;
    count.className = "recent-folder-count";
    count.textContent = String(collection.media.length);
    count.setAttribute("aria-label", `${collection.media.length} fotos`);
    openButton.append(icon, label, count);
    openButton.addEventListener("click", async () => {
      await selectFolder(`${COLLECTIONS_FOLDER_PREFIX}${collection.id}`);
      closeSidebar();
    });

    renameButton.className = "refresh-recent-button";
    renameButton.type = "button";
    renameButton.title = `Renombrar ${collection.name}`;
    renameButton.setAttribute("aria-label", renameButton.title);
    renameButton.innerHTML = '<i class="iconoir-edit-pencil" aria-hidden="true"></i>';
    renameButton.addEventListener("click", async () => {
      const name = window.prompt("Nuevo nombre de la colección:", collection.name);
      if (name === null || !name.trim()) return;
      if (!await renameCollection(collection.id, name)) {
        showNotice("No se pudo renombrar la colección. Revisa que el nombre no esté repetido.", "warning");
        return;
      }
      renderCollections();
    });

    removeButton.className = "remove-recent-button";
    removeButton.type = "button";
    removeButton.title = `Eliminar colección ${collection.name}`;
    removeButton.setAttribute("aria-label", removeButton.title);
    removeButton.innerHTML = '<i class="iconoir-trash" aria-hidden="true"></i>';
    removeButton.addEventListener("click", async () => {
      if (!window.confirm(`¿Eliminar la colección “${collection.name}”? Los archivos originales no se eliminarán.`)) return;
      if (!await deleteCollection(collection.id)) {
        showNotice("No se pudo eliminar la colección.", "error");
        return;
      }
      renderCollections();
    });

    item.append(openButton, renameButton, removeButton);
    collectionsList.append(item);
  });
}

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
