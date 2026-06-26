export function createRenderRequest({
  photo,
  media,
  adjustments,
  target = null,
} = {}) {
  if (!photo && !media) {
    throw new Error("Render request requires a photo or media item");
  }

  return {
    photo,
    media,
    adjustments,
    target,
  };
}

export async function renderMedia(request) {
  return {
    request,
    result: null,
    renderedAt: Date.now(),
  };
}
