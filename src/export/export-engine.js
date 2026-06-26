export function createExportRequest({
  photo,
  media,
  adjustments,
  format = "image/jpeg",
  quality = 0.92,
} = {}) {
  if (!photo && !media) {
    throw new Error("Export request requires a photo or media item");
  }

  return {
    photo,
    media,
    adjustments,
    format,
    quality,
  };
}

export async function exportMedia() {
  throw new Error("Export engine is not implemented yet");
}
