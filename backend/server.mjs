import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import { convert } from "@opendataloader/pdf";

const PORT = Number(process.env.PORT || 8787);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 80);
const uploadsRoot = path.join(os.tmpdir(), "pdf-to-obsidian-uploads");

await fs.mkdir(uploadsRoot, { recursive: true });

const upload = multer({
  dest: uploadsRoot,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      callback(null, true);
      return;
    }
    callback(new Error("Only PDF files are accepted."));
  },
});

const app = express();
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  const java = getJavaInfo();
  response.json({
    ok: java.ok,
    service: "PDF to Obsidian Manually backend",
    parser: "@opendataloader/pdf",
    java,
  });
});

app.post("/api/parse", upload.single("pdf"), async (request, response, next) => {
  const java = getJavaInfo();
  if (!java.ok) {
    await removeUploadedFile(request.file);
    response.status(500).json({
      error: "OpenDataLoader PDF requires Java 11 or newer.",
      details: java.raw || "Java was not found.",
    });
    return;
  }

  if (!request.file) {
    response.status(400).json({ error: "Missing PDF upload field: pdf" });
    return;
  }

  const jobRoot = path.join(os.tmpdir(), `pdf-to-obsidian-${randomUUID()}`);
  const outputDir = path.join(jobRoot, "out");
  const inputPath = path.join(jobRoot, safeFilename(request.file.originalname));

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.rename(request.file.path, inputPath);

    const options = buildConvertOptions(request.body, outputDir);
    const log = await convert([inputPath], options);
    const files = await collectOutputFiles(outputDir);
    const markdownFile = files.find((file) => file.name.toLowerCase().endsWith(".md"));
    const jsonFile = files.find((file) => file.name.toLowerCase().endsWith(".json"));

    const markdown = markdownFile ? await fs.readFile(markdownFile.path, "utf8") : "";
    const json = jsonFile ? JSON.parse(await fs.readFile(jsonFile.path, "utf8")) : null;

    response.json({
      ok: true,
      sourceFile: request.file.originalname,
      markdown,
      json,
      files: files.map((file) => ({
        name: file.name,
        relativePath: path.relative(outputDir, file.path).replaceAll(path.sep, "/"),
        size: file.size,
      })),
      log,
    });
  } catch (error) {
    next(error);
  } finally {
    await fs.rm(jobRoot, { recursive: true, force: true });
    await removeUploadedFile(request.file);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: error.message || "OpenDataLoader PDF parsing failed.",
  });
});

app.listen(PORT, () => {
  const java = getJavaInfo();
  console.log(`PDF to Obsidian Manually backend listening on http://127.0.0.1:${PORT}`);
  if (!java.ok) {
    console.warn("Java 11+ is required by OpenDataLoader PDF.");
    console.warn(java.raw || "Java was not found.");
  }
});

function buildConvertOptions(body, outputDir) {
  return {
    outputDir,
    format: body.format || "markdown,json",
    quiet: true,
    imageOutput: body.imageOutput || "embedded",
    tableMethod: body.tableMethod || "cluster",
    readingOrder: body.readingOrder || "xycut",
    markdownWithHtml: body.markdownWithHtml !== "false",
    useStructTree: body.useStructTree === "true",
    keepLineBreaks: body.keepLineBreaks === "true",
    sanitize: body.sanitize === "true",
  };
}

async function collectOutputFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectOutputFiles(fullPath)));
      continue;
    }
    const stat = await fs.stat(fullPath);
    files.push({ name: entry.name, path: fullPath, size: stat.size });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function removeUploadedFile(file) {
  if (file?.path) {
    await fs.rm(file.path, { force: true }).catch(() => {});
  }
}

function safeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "upload.pdf";
}

function getJavaInfo() {
  const result = spawnSync("java", ["-version"], { encoding: "utf8" });
  const raw = `${result.stdout || ""}${result.stderr || ""}`.trim();

  if (result.error) {
    return { ok: false, raw: result.error.message };
  }

  const versionMatch = raw.match(/version "(?<version>[^"]+)"/);
  const version = versionMatch?.groups?.version || "";
  const major = parseJavaMajor(version);

  return {
    ok: Boolean(major && major >= 11),
    version,
    major,
    raw,
  };
}

function parseJavaMajor(version) {
  if (!version) return null;
  if (version.startsWith("1.")) {
    return Number(version.split(".")[1]);
  }
  return Number(version.split(".")[0]);
}
