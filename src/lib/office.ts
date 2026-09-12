import { execFile } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, stat } from "fs/promises";
import path from "path";
import { absoluteUploadPath } from "./storage";

const run = promisify(execFile);

// Converted PDFs live beside the page images, keyed by material, so the
// original upload is never touched and a re-parse reuses the conversion.
const CONVERTED_DIR = "converted";

// LibreOffice is not quick — a deck can take the better part of a minute on a
// cold start — but it must not be able to wedge the parse queue either.
const CONVERT_TIMEOUT_MS = 3 * 60 * 1000;

export const OFFICE_EXTENSIONS = [".ppt", ".pptx", ".doc", ".docx", ".odp", ".odt"];

export function isOfficeFile(filename: string) {
  const lower = filename.toLowerCase();
  return OFFICE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Renders an Office document to PDF and returns the absolute path.
 *
 * Everything downstream — text extraction, page images for figures, the
 * in-app preview — already speaks PDF, so converting once at the door is far
 * less work than teaching each of them a second format. The result is cached:
 * conversion is the slowest step in the pipeline by some margin.
 */
export async function officeToPdf(materialId: string, storagePath: string): Promise<string> {
  const outDir = absoluteUploadPath(path.join(CONVERTED_DIR, materialId));
  const source = absoluteUploadPath(storagePath);
  // LibreOffice names the output after the input, with the extension swapped.
  const outPath = path.join(outDir, path.basename(storagePath).replace(/\.[^.]+$/, "") + ".pdf");

  try {
    const cached = await stat(outPath);
    if (cached.size > 0) return outPath;
  } catch {
    // Not converted yet.
  }

  await mkdir(outDir, { recursive: true });
  try {
    await run(
      "soffice",
      [
        "--headless",
        "--norestore",
        // Its own profile per call: concurrent or interrupted runs otherwise
        // fight over the default one and hang waiting for a lock.
        `-env:UserInstallation=file://${path.join(outDir, ".lo-profile")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        outDir,
        source,
      ],
      { timeout: CONVERT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`无法转换 Office 文档（需要 LibreOffice）：${message}`);
  }

  // It exits 0 even when it converts nothing, so the output is what decides.
  try {
    const produced = await stat(outPath);
    if (produced.size > 0) return outPath;
  } catch {
    // fall through
  }
  throw new Error("Office 文档转换后没有产出 PDF（文件可能已损坏或受密码保护）");
}

export async function officePdfBuffer(materialId: string, storagePath: string) {
  return readFile(await officeToPdf(materialId, storagePath));
}

/** Path relative to the upload root, for callers that work in those terms. */
export async function officePdfRelativePath(materialId: string, storagePath: string) {
  const abs = await officeToPdf(materialId, storagePath);
  return path.relative(absoluteUploadPath(""), abs);
}
