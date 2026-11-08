#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
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
if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
  throw new Error("Desktop server is loopback-only. Use tv-server.js for authenticated, read-only LAN sharing.");
}
const allowedMediaRoots = new Set();
const execFileAsync = promisify(execFile);
const TV_SOCKET = path.join(os.homedir(), ".image-viewer-pro-tv", "control.sock");
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
const APP_FILES = new Set(["index.html", "app.js", "styles.css"]);
const APP_DIRECTORIES = new Set(["src", "assets"]);

// Blocks DNS rebinding (unexpected Host) and requests started by other websites (Origin / Sec-Fetch-Site).
function isLocalHost(request) {
  const hostname = String(request.headers.host || "").replace(/:\d+$/, "").toLowerCase();
  return LOCAL_HOSTNAMES.has(hostname);
}

function isSameOriginRequest(request) {
  const site = request.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") {
    return false;
  }
  const origin = request.headers.origin;
  return !origin || origin === `http://${request.headers.host}`;
}

const server = http.createServer(async (request, response) => {
  try {
    if (!isLocalHost(request)) {
      sendJson(response, 421, { error: "Unexpected host" });
      return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if ((requestUrl.pathname.startsWith("/api/") || request.method === "DELETE") && !isSameOriginRequest(request)) {
      sendJson(response, 403, { error: "Cross-site request blocked" });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/tv/")) {
      await handleTvApi(requestUrl.pathname, request, response);
      return;
    }

    if (requestUrl.pathname === "/api/folder") {
      await sendFolderPayload(requestUrl.searchParams.get("path"), response);
      return;
    }

    if (requestUrl.pathname === "/api/choose-folder") {
      await chooseFolder(request, response);
      return;
    }

    if (requestUrl.pathname === "/media" && request.method === "DELETE") {
      await deleteMediaFile(requestUrl.searchParams.get("path"), response);
      return;
    }

    if (requestUrl.pathname === "/media") {
      await sendMediaFile(requestUrl.searchParams.get("path"), request, response);
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

async function handleTvApi(pathname, request, response) {
  const routes = {
    "/api/tv/status": "GET",
    "/api/tv/pair": "POST",
    "/api/tv/galleries": "POST",
    "/api/tv/collections": "POST",
    "/api/tv/revoke": "POST",
  };

  // Photo upload for collections: streamed straight to the TV service.
  const upload = /^\/api\/tv\/collections\/([A-Za-z0-9_-]{1,64})\/([a-f0-9]{64}\.[a-z]+)$/.exec(pathname);
  if (upload && request.method === "PUT") {
    await proxyTvUpload(request, response, `/collections/${upload[1]}/${upload[2]}`);
    return;
  }

  if (routes[pathname] !== request.method) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  let body;
  if (request.method === "POST") {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 1_000_000) {
        sendJson(response, 413, { error: "Request too large" });
        return;
      }
    }
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (error) {
      sendJson(response, 400, { error: "Invalid JSON" });
      return;
    }
  }

  const reply = await callTvService(request.method, pathname.replace("/api/tv", ""), body);

  if (!reply) {
    sendJson(response, pathname === "/api/tv/status" ? 200 : 503, {
      running: false,
      error: "El servicio de Apple TV no está activo. Ejecuta: node tv-server.js install-service",
    });
    return;
  }

  sendJson(response, reply.status, reply.body);
}

function proxyTvUpload(request, response, route) {
  return new Promise((resolve) => {
    const headers = { "Content-Type": "application/octet-stream" };
    if (request.headers["content-length"]) {
      headers["Content-Length"] = request.headers["content-length"];
    }

    const req = http.request({ socketPath: TV_SOCKET, path: route, method: "PUT", headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          sendJson(response, res.statusCode, JSON.parse(data));
        } catch (error) {
          sendJson(response, 502, { error: "Respuesta no válida del servicio" });
        }
        resolve();
      });
    });
    req.on("error", () => {
      sendJson(response, 503, { error: "El servicio de Apple TV no está activo." });
      resolve();
    });
    request.pipe(req);
  });
}

// The Apple TV service listens on a private Unix socket (0600), not on the network.
function callTvService(method, route, body) {
  return new Promise((resolve) => {
    const req = http.request({
      socketPath: TV_SOCKET, path: route, method, timeout: 5000,
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (error) {
          resolve({ status: 502, body: { error: "Respuesta no válida del servicio" } });
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function sendAppFile(pathname, response) {
  const cleanPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\//, ""));
  const [first] = cleanPath.split("/");
  const isAppAsset = cleanPath.includes("/") ? APP_DIRECTORIES.has(first) : APP_FILES.has(cleanPath);

  if (!isAppAsset) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

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

    const stat = await fsp.stat(entryPath);
    const relativePath = path.relative(rootPath, entryPath).split(path.sep).join("/");
    files.push({
      name: entry.name,
      path: relativePath,
      type: getMediaType(entryPath),
      url: `/media?path=${encodeURIComponent(entryPath)}&v=${Math.trunc(stat.mtimeMs)}`,
      lastModified: stat.mtimeMs,
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

async function sendMediaFile(filePath, request, response) {
  if (!filePath) {
    sendJson(response, 400, { error: "Missing media path" });
    return;
  }

  const targetPath = path.resolve(filePath);

  if (!isAllowedMediaPath(targetPath)) {
    sendJson(response, 403, { error: "Media path is not allowed" });
    return;
  }

  await sendFile(targetPath, response, {
    rangeHeader: request.headers.range,
    cacheControl: "private, max-age=86400",
    method: request.method,
  });
}

async function deleteMediaFile(filePath, response) {
  if (!filePath) {
    sendJson(response, 400, { error: "Missing media path" });
    return;
  }

  const targetPath = path.resolve(filePath);

  if (!isAllowedMediaPath(targetPath)) {
    sendJson(response, 403, { error: "Media path is not allowed" });
    return;
  }

  try {
    await fsp.unlink(targetPath);
    sendJson(response, 200, { deleted: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    sendJson(response, 500, { error: error.message });
  }
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

async function sendFile(filePath, response, options = {}) {
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

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": options.cacheControl || "no-cache",
    "Content-Type": contentType,
    "Last-Modified": stat.mtime.toUTCString(),
  };
  const range = parseByteRange(options.rangeHeader, stat.size);

  if (range === null) {
    response.writeHead(416, {
      ...headers,
      "Content-Range": `bytes */${stat.size}`,
    });
    response.end();
    return;
  }

  if (range) {
    headers["Content-Length"] = range.end - range.start + 1;
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${stat.size}`;
    response.writeHead(206, headers);

    if (options.method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(filePath, range).pipe(response);
    return;
  }

  headers["Content-Length"] = stat.size;
  response.writeHead(200, headers);

  if (options.method === "HEAD") {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

function parseByteRange(rangeHeader, fileSize) {
  if (!rangeHeader) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || fileSize <= 0) {
    return null;
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return null;
  }

  let start;
  let end;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : fileSize - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= fileSize || end < start) {
      return null;
    }
    end = Math.min(end, fileSize - 1);
  }

  return { start, end };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
  });
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
