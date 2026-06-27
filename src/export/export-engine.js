import { createDevelopAdjustments } from "../develop/index.js";
import {
  RENDER_RESULT_TYPES,
  renderMedia,
} from "../rendering/index.js";

export const EXPORT_RESULT_TYPES = Object.freeze({
  BLOB: "blob",
  NONE: "none",
});

export function createExportRequest({
  photo,
  media,
  adjustments = photo?.adjustments,
  format = "image/jpeg",
  quality = 0.92,
  filename = getDefaultExportFilename(photo, media, format),
} = {}) {
  if (!photo && !media) {
    throw new Error("Export request requires a photo or media item");
  }

  return {
    photo,
    media,
    adjustments: createDevelopAdjustments(adjustments),
    format,
    quality: normalizeQuality(quality),
    filename,
  };
}

export function createExportResult({
  type = EXPORT_RESULT_TYPES.NONE,
  blob = null,
  filename = "",
  request,
  metadata = {},
} = {}) {
  return {
    type,
    blob,
    filename,
    request,
    metadata,
    exportedAt: Date.now(),
  };
}

export function createExportEngine({ render = renderMedia } = {}) {
  return {
    async export(request) {
      const exportRequest = createExportRequest(request);
      const renderResult = await render({
        photo: exportRequest.photo,
        media: exportRequest.media,
        adjustments: exportRequest.adjustments,
      });
      const blob = await getExportBlob(renderResult, exportRequest);

      return createExportResult({
        type: blob ? EXPORT_RESULT_TYPES.BLOB : EXPORT_RESULT_TYPES.NONE,
        blob,
        filename: exportRequest.filename,
        request: exportRequest,
        metadata: {
          renderResultType: renderResult.type,
          format: exportRequest.format,
        },
      });
    },
  };
}

export async function exportMedia(request) {
  return await createExportEngine().export(request);
}

async function getExportBlob(renderResult, exportRequest) {
  if (renderResult.type === RENDER_RESULT_TYPES.SOURCE_FILE && renderResult.value instanceof Blob) {
    return renderResult.value;
  }

  if (renderResult.type === RENDER_RESULT_TYPES.OBJECT_URL || renderResult.type === RENDER_RESULT_TYPES.SOURCE_URL) {
    return await fetchBlob(renderResult.value);
  }

  if (renderResult.type === RENDER_RESULT_TYPES.CANVAS && renderResult.value?.toBlob) {
    return await canvasToBlob(renderResult.value, exportRequest.format, exportRequest.quality);
  }

  return null;
}

async function fetchBlob(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.blob() : null;
  } catch (error) {
    return null;
  }
}

function canvasToBlob(canvas, format, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, format, quality);
  });
}

function normalizeQuality(quality) {
  const numericQuality = Number(quality);

  if (!Number.isFinite(numericQuality)) {
    return 0.92;
  }

  return Math.min(1, Math.max(0, numericQuality));
}

function getDefaultExportFilename(photo, media, format) {
  const sourceName = photo?.metadata?.name || media?.name || "export";
  const extension = format.split("/").at(-1) || "jpg";
  const baseName = sourceName.replace(/\.[^.]+$/, "");

  return `${baseName}.${extension === "jpeg" ? "jpg" : extension}`;
}
