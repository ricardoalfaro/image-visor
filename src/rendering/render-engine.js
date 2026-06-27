import { createDevelopAdjustments } from "../develop/index.js";

export const RENDER_TARGET_TYPES = Object.freeze({
  DOM_IMAGE: "dom-image",
  CANVAS: "canvas",
  BITMAP: "bitmap",
  OBJECT_URL: "object-url",
  NONE: "none",
});

export const RENDER_RESULT_TYPES = Object.freeze({
  SOURCE_URL: "source-url",
  SOURCE_FILE: "source-file",
  BITMAP: "bitmap",
  CANVAS: "canvas",
  OBJECT_URL: "object-url",
  NONE: "none",
});

export function createRenderRequest({
  photo,
  media,
  adjustments = photo?.adjustments,
  operations = getPhotoOperations(photo),
  target = null,
} = {}) {
  if (!photo && !media) {
    throw new Error("Render request requires a photo or media item");
  }

  return {
    photo,
    media,
    adjustments: createDevelopAdjustments(adjustments),
    operations: Array.isArray(operations) ? [...operations] : [],
    target,
  };
}

function getPhotoOperations(photo) {
  if (Array.isArray(photo?.history)) {
    return photo.history;
  }

  return Array.isArray(photo?.history?.past) ? photo.history.past : [];
}

export function createRenderResult({
  type = RENDER_RESULT_TYPES.NONE,
  value = null,
  metadata = {},
  request,
} = {}) {
  return {
    type,
    value,
    metadata,
    request,
    renderedAt: Date.now(),
  };
}

export function createRenderingEngine({ renderPhoto = renderSourcePassthrough } = {}) {
  return {
    render(request) {
      const renderRequest = createRenderRequest(request);
      return renderPhoto(renderRequest);
    },
  };
}

export async function renderMedia(request) {
  return await createRenderingEngine().render(request);
}

async function renderSourcePassthrough(request) {
  const source = request.photo?.source || request.media || {};
  const media = request.media || {};

  if (source.url || media.url) {
    return createRenderResult({
      type: RENDER_RESULT_TYPES.SOURCE_URL,
      value: source.url || media.url,
      metadata: getRenderMetadata(request),
      request,
    });
  }

  if (source.file || media.file) {
    return createRenderResult({
      type: RENDER_RESULT_TYPES.SOURCE_FILE,
      value: source.file || media.file,
      metadata: getRenderMetadata(request),
      request,
    });
  }

  return createRenderResult({
    metadata: getRenderMetadata(request),
    request,
  });
}

function getRenderMetadata(request) {
  return {
    mediaType: request.photo?.metadata?.mediaType || request.media?.type || "image",
    hasAdjustments: Object.entries(request.adjustments).some(([key, value]) => {
      const defaultValue = createDevelopAdjustments()[key];
      return JSON.stringify(value) !== JSON.stringify(defaultValue);
    }),
  };
}
