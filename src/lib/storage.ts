import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

// Phase 1: local filesystem storage. Swap this module for an S3/R2-backed
// implementation later — callers only depend on save/read/absolutePath.
const UPLOAD_ROOT = path.join(process.cwd(), "src", "data", "uploads");

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
