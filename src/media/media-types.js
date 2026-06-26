export const IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

export const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-m4v",
]);

export const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;
export const VIDEO_EXTENSION_PATTERN = /\.(m4v|mov|mp4|mpe?g)$/i;
