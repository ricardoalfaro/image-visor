#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { URL } = require("node:url");

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
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const VIDEO_EXTENSION_PATTERN = /\.(m4v|mov|mp4|mpe?g)$/i;

const appRoot = __dirname;
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const allowedMediaRoots = new Set();
const execFileAsync = promisify(execFile);

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/folder") {
      await sendFolderPayload(requestUrl.searchParams.get("path"), response);
      return;
    }

    if (requestUrl.pathname === "/api/choose-folder") {
      await chooseFolder(request, response);
      return;
    }

    if (requestUrl.pathname === "/media") {
      await sendMediaFile(requestUrl.searchParams.get("path"), response);
      return;
    }

    await sendAppFile(requestUrl.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.on("error", (error) => {
  console.error(`Could not start Image Viewer Pro server: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Image Viewer Pro: http://${host}:${port}`);
});

async function sendAppFile(pathname, response) {
  const cleanPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\//, ""));
  const filePath = resolveInside(appRoot, cleanPath);
  await sendFile(filePath, response);
}

async function sendFolderPayload(folderPath, response) {
  if (!folderPath) {
    sendJson(response, 400, { error: "Missing folder path" });
    return;
  }

  const rootPath = path.resolve(folderPath);
  const stat = await fsp.stat(rootPath);

  if (!stat.isDirectory()) {
    sendJson(response, 400, { error: "Path is not a folder" });
    return;
  }

  allowedMediaRoots.add(rootPath);

  const files = await collectMediaFiles(rootPath);
  sendJson(response, 200, {
    name: path.basename(rootPath) || rootPath,
    path: rootPath,
    files,
  });
}

async function chooseFolder(request, response) {
  const folderPath = await pickSystemFolder(request);

  if (!folderPath) {
    sendJson(response, 200, { cancelled: true });
    return;
  }

  await sendFolderPayload(folderPath, response);
}

async function pickSystemFolder(request) {
  if (process.platform === "darwin") {
    return await pickMacFolder(request);
  }

  return "";
}

async function pickMacFolder(request) {
  const controller = new AbortController();
  request.on("close", () => controller.abort());

  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to activate',
      "-e",
      'POSIX path of (choose folder with prompt "Elige una carpeta para Image Viewer Pro")',
    ], {
      signal: controller.signal,
      timeout: 120000,
    });

    return stdout.trim();
  } catch (error) {
    return "";
  }
}

async function collectMediaFiles(rootPath, currentPath = rootPath) {
  const entries = await fsp.readdir(currentPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectMediaFiles(rootPath, entryPath));
      continue;
    }

    if (!entry.isFile() || !isSupportedMediaPath(entryPath)) {
      continue;
    }

    const relativePath = path.relative(rootPath, entryPath).split(path.sep).join("/");
    files.push({
      name: entry.name,
      path: relativePath,
      type: getMediaType(entryPath),
      url: `/media?path=${encodeURIComponent(entryPath)}`,
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

function isSupportedMediaPath(filePath) {
  return IMAGE_EXTENSION_PATTERN.test(filePath) || VIDEO_EXTENSION_PATTERN.test(filePath);
}

function getMediaType(filePath) {
  return VIDEO_EXTENSION_PATTERN.test(filePath) ? "video" : "image";
}

async function sendMediaFile(filePath, response) {
  if (!filePath) {
    sendJson(response, 400, { error: "Missing media path" });
    return;
  }

  const targetPath = path.resolve(filePath);

  if (!isAllowedMediaPath(targetPath)) {
    sendJson(response, 403, { error: "Media path is not allowed" });
    return;
  }

  await sendFile(targetPath, response);
}

function isAllowedMediaPath(filePath) {
  for (const rootPath of allowedMediaRoots) {
    const rootWithSeparator = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;

    if (filePath === rootPath || filePath.startsWith(rootWithSeparator)) {
      return true;
    }
  }

  return false;
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
