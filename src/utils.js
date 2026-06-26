export {
  isSupportedMedia,
  getMediaType,
  getDisplayPath,
  getLocalRelativePath,
  getFolderPath,
  getTopLevelFolder,
  getFoldersFromMedia,
  getBrowserSelectedFolderName,
} from "./media/media-utils.js";

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
