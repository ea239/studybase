import { execFile } from "child_process";
import { mkdir, readFile, readdir, rename, rm } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { absoluteUploadPath } from "./storage";

const run = promisify(execFile);

// Rendering the whole page, not the embedded images: in real lecture decks the
// figures worth showing (timing diagrams, topology sketches) are vector art
// drawn in PowerPoint, so `pdfimages` misses them entirely and returns only
// the repeated decorative stock photo from the section-divider slides.
//
// Pages are rendered lazily on first view and cached on disk, so a 90-page
// deck costs nothing until someone actually reads a note citing a page.
const DPI = 110;

function cacheDir(materialId: string) {
  return absoluteUploadPath(path.join("page-images", materialId));
}

export async function clearPageImageCache(materialId: string) {
  await rm(cacheDir(materialId), { recursive: true, force: true });
}

/**
 * Returns the PNG bytes for one page, rendering and caching it on first call.
 * Returns null when the page can't be rendered (not a PDF, page out of range,
 * pdftoppm missing) — page images are an enhancement, never load-bearing.
 */
export async function renderPdfPage(
  materialId: string,
  pdfStoragePath: string,
  pageNumber: number
): Promise<Buffer | null> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;

  const dir = cacheDir(materialId);
  const cached = path.join(dir, `${pageNumber}.png`);
  try {
    return await readFile(cached);
  } catch {
    // not cached yet
  }

  try {
    await mkdir(dir, { recursive: true });
    // pdftoppm appends its own "-<page>" suffix, so render to a temp prefix
    // and rename, keeping the cache filename predictable.
    const prefix = path.join(dir, `tmp-${pageNumber}`);
    await run(
      "pdftoppm",
      ["-png", "-r", String(DPI), "-f", String(pageNumber), "-l", String(pageNumber),
       absoluteUploadPath(pdfStoragePath), prefix],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    const produced = (await readdir(dir)).find((f) => f.startsWith(`tmp-${pageNumber}-`));
    if (!produced) return null;
    await rename(path.join(dir, produced), cached);
    return await readFile(cached);
  } catch (err) {
    console.error(`[page-image] 渲染失败 material=${materialId} page=${pageNumber}:`, err);
    return null;
  }
}
