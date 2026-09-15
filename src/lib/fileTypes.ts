import type { MaterialType } from "@prisma/client";

/** Extensions the parser can actually do something with, by resulting type. */
const BY_EXTENSION: Record<string, MaterialType> = {
  ".pdf": "PDF",
  ".html": "HTML",
  ".htm": "HTML",
  ".ppt": "OFFICE",
  ".pptx": "OFFICE",
  ".doc": "OFFICE",
  ".docx": "OFFICE",
  ".odp": "OFFICE",
  ".odt": "OFFICE",
  ".txt": "TEXT",
  ".md": "TEXT",
  ".markdown": "TEXT",
  ".csv": "TEXT",
  ".png": "IMAGE",
  ".jpg": "IMAGE",
  ".jpeg": "IMAGE",
  ".webp": "IMAGE",
  ".gif": "IMAGE",
  ".bmp": "IMAGE",
};

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

function extensionOf(filename: string) {
  const at = filename.toLowerCase().lastIndexOf(".");
  return at < 0 ? "" : filename.toLowerCase().slice(at);
}

/** The material type for a filename, or null if nothing can read it. */
export function materialTypeOf(filename: string): MaterialType | null {
  return BY_EXTENSION[extensionOf(filename)] ?? null;
}

export function imageMimeOf(filename: string): string {
  return IMAGE_MIME[extensionOf(filename)] ?? "application/octet-stream";
}

/** For the file input's accept attribute and for telling the user. */
export const ACCEPTED_EXTENSIONS = Object.keys(BY_EXTENSION).join(",");
