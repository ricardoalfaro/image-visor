import {
  IMAGE_TYPES,
  VIDEO_TYPES,
  IMAGE_EXTENSION_PATTERN,
  VIDEO_EXTENSION_PATTERN,
} from "./constants.js";

export function isSupportedMedia(file) {
  if (IMAGE_TYPES.has(file.type)) {
    return true;
  }

  if (VIDEO_TYPES.has(file.type)) {
    return true;
  }

  return IMAGE_EXTENSION_PATTERN.test(file.name) || VIDEO_EXTENSION_PATTERN.test(file.name);
}

export function getMediaType(file) {
  if (VIDEO_TYPES.has(file.type) || VIDEO_EXTENSION_PATTERN.test(file.name)) {
    return "video";
  }

  return "image";
}

export function getDisplayPath(file) {
  return file.webkitRelativePath || file.name;
}

export function getLocalRelativePath(file) {
  const displayPath = getDisplayPath(file);
  const normalizedPath = displayPath.replace(/\\/g, "/");
  const firstSlashIndex = normalizedPath.indexOf("/");

  if (!file.webkitRelativePath || firstSlashIndex === -1) {
    return normalizedPath;
  }

  return normalizedPath.slice(firstSlashIndex + 1);
}

export function getFolderPath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  return lastSlashIndex === -1 ? "" : normalizedPath.slice(0, lastSlashIndex);
}

export function getTopLevelFolder(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const firstSlashIndex = normalizedPath.indexOf("/");
  return firstSlashIndex === -1 ? "" : normalizedPath.slice(0, firstSlashIndex);
}

export function getFoldersFromMedia(media) {
  const counts = new Map();

  for (const item of media) {
    if (!item.groupFolder) {
      continue;
    }

    counts.set(item.groupFolder, (counts.get(item.groupFolder) || 0) + 1);
  }

  return Array.from(counts, ([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function intersectRects(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function createRecentFolderToken() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getBrowserSelectedFolderName(files) {
  const firstPath = files[0]?.webkitRelativePath || "";
  const normalizedPath = firstPath.replace(/\\/g, "/");
  const firstSlashIndex = normalizedPath.indexOf("/");

  if (firstSlashIndex <= 0) {
    return "";
  }

  return normalizedPath.slice(0, firstSlashIndex);
}
