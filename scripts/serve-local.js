/**
 * Lightweight local development server for Brightlife SHG Portal.
 * Serves the compiled static portal on port 8088.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8088;
const PREVIEW_DIR = path.join(__dirname, "..", "preview");
const INDEX_FILE = path.join(PREVIEW_DIR, "index.html");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

  let safeUrl = req.url.split("?")[0];
  if (safeUrl === "/" || safeUrl === "/dashboard" || safeUrl === "/index.html") {
    safeUrl = "/index.html";
  }

  let filePath = path.join(PREVIEW_DIR, safeUrl);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = INDEX_FILE;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "text/html; charset=utf-8";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server Error: " + err.message);
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[BRIGHTLIFE LOCAL SERVER] Running at http://localhost:${PORT}/ and http://127.0.0.1:${PORT}/`);
  console.log(`[TARGET] Serving compiled portal from: ${PREVIEW_DIR}`);
});
