import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

// Phase 1: local filesystem storage. Swap this module for an S3/R2-backed
// implementation later — callers only depend on save/read/absolutePath.
//
// Configurable so a second deployment on the same host keeps its own files.
// Sharing them would let a throwaway environment delete the real one's uploads.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "src", "data", "uploads");

export async function saveUpload(id: string, originalName: string, buffer: Buffer) {
  await mkdir(UPLOAD_ROOT, { recursive: true });
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${id}-${safeName}`;
  const fullPath = path.join(UPLOAD_ROOT, storedName);
  await writeFile(fullPath, buffer);
  // stored relative to UPLOAD_ROOT so the root can move without breaking DB rows
  return storedName;
}

export async function readUpload(storagePath: string) {
  return readFile(path.join(UPLOAD_ROOT, storagePath));
}

export function absoluteUploadPath(storagePath: string) {
  return path.join(UPLOAD_ROOT, storagePath);
}

/**
 * Removes every file a material owns: the upload itself and everything derived
 * from it.
 *
 * Derived artefacts live in directories keyed by material id — the PDF an
 * Office document was converted to, the PNGs rendered for cited pages — and
 * deleting only the upload leaves those behind for a row that no longer
 * exists. They are invisible, so nothing ever surfaces the leak.
 *
 * Missing files are not an error: the row is what says a material exists, and
 * a delete that fails because a file was already gone would leave the row.
 */
export async function deleteMaterialFiles(materialId: string, storagePath: string) {
  const targets = [
    storagePath ? path.join(UPLOAD_ROOT, storagePath) : null,
    path.join(UPLOAD_ROOT, "converted", materialId),
    path.join(UPLOAD_ROOT, "page-images", materialId),
  ].filter((p): p is string => p != null);

  for (const target of targets) {
    await rm(target, { recursive: true, force: true }).catch(() => {});
  }
}
