#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { execFile } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { promisify } = require("node:util");
const { URL } = require("node:url");

const IMAGE_EXTENSIONS = new Set([".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const MIME_TYPES = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const appRoot = __dirname;
const execFileAsync = promisify(execFile);
let imageRoot = path.resolve(process.argv[2] || process.cwd());
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
let imageManifestPromise;

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/images") {
      await sendImageManifest(response, requestUrl);
      return;
    }

    if (requestUrl.pathname === "/api/select-folder") {
      await selectImageFolder(request, response);
      return;
    }

    if (requestUrl.pathname.startsWith("/image/")) {
      await sendImageFile(requestUrl.pathname, response);
      return;
    }

    await sendAppFile(requestUrl.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.on("error", (error) => {
  console.error(`Could not start Image Visor server: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Image Visor: http://${host}:${port}`);
  console.log(`Serving images from: ${imageRoot}`);
});

async function sendImageManifest(response, requestUrl) {
  const offset = Math.max(0, Number(requestUrl.searchParams.get("offset") || 0));
  const requestedLimit = Math.max(1, Number(requestUrl.searchParams.get("limit") || 100));
  const limit = Math.min(100, requestedLimit);
  const images = await getImageManifest();
  const page = images.slice(offset, offset + limit);

  sendJson(response, 200, {
    root: getRootLabel(),
    total: images.length,
    offset,
    limit,
    count: page.length,
    hasMore: offset + page.length < images.length,
    images: page,
  });
}

async function selectImageFolder(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const selectedPath = await openFolderPicker();
  if (!selectedPath) {
    sendJson(response, 200, { cancelled: true, root: getRootLabel() });
    return;
  }

  await setImageRoot(selectedPath);
  sendJson(response, 200, {
    cancelled: false,
    root: getRootLabel(),
    path: imageRoot,
  });
}

async function openFolderPicker() {
  if (process.platform !== "darwin") {
    throw new Error("Folder picker is only implemented for macOS right now");
  }

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Elige una carpeta de imagenes")',
    ]);
    return stdout.trim();
  } catch (error) {
    if (error.code === 1) {
      return "";
    }

    throw error;
  }
}

async function setImageRoot(nextRoot) {
  const resolvedRoot = path.resolve(nextRoot);
  const stat = await fsp.stat(resolvedRoot);

  if (!stat.isDirectory()) {
    throw new Error("Selected path is not a directory");
  }

  imageRoot = resolvedRoot;
  imageManifestPromise = undefined;
}

function getImageManifest() {
  if (!imageManifestPromise) {
    imageManifestPromise = findImages(imageRoot);
  }

  return imageManifestPromise;
}

function getRootLabel() {
  return path.basename(imageRoot) || imageRoot;
}

async function findImages(directory, baseDirectory = directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const images = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      images.push(...await findImages(fullPath, baseDirectory));
      continue;
    }

    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const relativePath = path.relative(baseDirectory, fullPath).split(path.sep).join("/");
    images.push({
      name: entry.name,
      path: relativePath,
      url: `/image/${encodePath(relativePath)}`,
    });
  }

  return images.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

async function sendImageFile(pathname, response) {
  const relativePath = decodeURIComponent(pathname.replace(/^\/image\//, ""));
  const filePath = resolveInside(imageRoot, relativePath);
  await sendFile(filePath, response);
}

async function sendAppFile(pathname, response) {
  const cleanPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\//, ""));
  const filePath = resolveInside(appRoot, cleanPath);
  await sendFile(filePath, response);
}

async function sendFile(filePath, response) {
  let stat;

  try {
    stat = await fsp.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    throw error;
  }

  if (!stat.isFile()) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  response.writeHead(200, {
    "Content-Length": stat.size,
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function resolveInside(root, relativePath) {
  const targetPath = path.resolve(root, relativePath);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (targetPath !== root && !targetPath.startsWith(rootWithSeparator)) {
    throw new Error("Path is outside allowed directory");
  }

  return targetPath;
}

function encodePath(relativePath) {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}
