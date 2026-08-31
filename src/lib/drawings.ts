import { SupabaseClient } from "@supabase/supabase-js";
import { isZipFile, extractZip } from "@/lib/zip";

// Used by both project creation and "add more drawings" on an existing
// project. A zip is transparently extracted into one project_drawings row
// per file inside it (so a contractor can browse/download individual
// drawings, not just one opaque archive); anything else is uploaded as-is.
// One bad file/zip entry doesn't block the rest — each is best-effort.
export async function uploadDrawingsForProject(
  supabase: SupabaseClient,
  projectId: string,
  files: File[]
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    if (!file || file.size === 0) continue;

    if (isZipFile(file)) {
      let entries;
      try {
        entries = await extractZip(file);
      } catch {
        failed++;
        continue;
      }

      for (const entry of entries) {
        const path = `${projectId}/${Date.now()}-${sanitizePathSegment(entry.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("project-drawings")
          .upload(path, entry.buffer, { contentType: entry.contentType });

        if (uploadError) {
          failed++;
          continue;
        }

        const { error: dbError } = await supabase
          .from("project_drawings")
          .insert({ project_id: projectId, file_path: path, file_name: entry.name });

        dbError ? failed++ : uploaded++;
      }
      continue;
    }

    const path = `${projectId}/${Date.now()}-${sanitizePathSegment(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("project-drawings").upload(path, file);
    if (uploadError) {
      failed++;
      continue;
    }

    const { error: dbError } = await supabase
      .from("project_drawings")
      .insert({ project_id: projectId, file_path: path, file_name: file.name });

    dbError ? failed++ : uploaded++;
  }

  return { uploaded, failed };
}

// Storage paths can't safely contain arbitrary characters from a zip
// entry's internal path — keep the slashes (they become subfolders in
// the bucket, matching the zip's own folder structure) but strip
// anything else that could break a path segment.
function sanitizePathSegment(name: string): string {
  return name
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .join("/");
}
