export const state = {
  images: [],
  allMedia: [],
  folders: [],
  activeFolderPath: "",
  sortBy: "name",
  activeIndex: -1,
  zoom: 100,
  sourceLabel: "Carpeta local",
  currentObjectUrl: "",
  folderThumbnailObjectUrls: [],
  isPlaying: false,
  shuffleEnabled: false,
  slideshowTimer: 0,
  panX: 0,
  panY: 0,
  dragState: null,
  fullscreenPan: null,
  fullscreenSelection: null,
  fullscreenZoom: {
    active: false,
    scale: 1,
    x: 0,
    y: 0,
  },
  recentFolders: [],
  recentDbPromise: null,
  recentFolderFiles: new Map(),
  noticeTimer: 0,
};

export function clearActiveObjectUrl() {
  if (state.currentObjectUrl) {
    URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = "";
  }
}

export function clearFolderThumbnailObjectUrls() {
  for (const objectUrl of state.folderThumbnailObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
  state.folderThumbnailObjectUrls = [];
}
