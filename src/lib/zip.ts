import JSZip from "jszip";

export interface ExtractedFile {
  name: string; // relative path inside the zip, e.g. "floor-plans/level-1.pdf"
  buffer: Buffer;
  contentType: string;
}

const JUNK_PATTERNS = [/^__MACOSX\//, /\.DS_Store$/, /^Thumbs\.db$/i, /desktop\.ini$/i];

function isJunk(path: string): boolean {
  return JUNK_PATTERNS.some((p) => p.test(path));
}

function guessContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "dwg":
      return "application/acad";
    default:
      return "application/octet-stream";
  }
}

// Extracts every real file out of an uploaded .zip, skipping directory
// entries and common OS junk (macOS resource forks, Thumbs.db, etc.) that
// would otherwise show up as confusing extra "drawings."
export async function extractZip(file: File): Promise<ExtractedFile[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const results: ExtractedFile[] = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (isJunk(path)) continue;

    const buffer = await entry.async("nodebuffer");
    if (buffer.length === 0) continue;

    results.push({ name: path, buffer, contentType: guessContentType(path) });
  }

  return results;
}

export function isZipFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}
