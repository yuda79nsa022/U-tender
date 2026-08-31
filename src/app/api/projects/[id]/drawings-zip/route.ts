import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import JSZip from "jszip";

// Bundles every drawing on a project into one .zip for download. Deliberately
// uses the normal session-based Supabase client (not the service-role
// client) so Row Level Security does the authorization for us — an owner
// sees their own project, an approved+subscribed+not-suspended contractor
// sees any open/closed/awarded project, and everyone else gets nothing,
// exactly matching what they'd already see on the project's page. No
// separate authorization logic to keep in sync with the RLS policies.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: project } = await supabase.from("projects").select("id, title").eq("id", params.id).single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: drawings } = await supabase
    .from("project_drawings")
    .select("file_path, file_name")
    .eq("project_id", project.id);

  if (!drawings?.length) {
    return NextResponse.json({ error: "No drawings on this project" }, { status: 404 });
  }

  const zip = new JSZip();
  let included = 0;

  for (const d of drawings) {
    const { data: blob, error } = await supabase.storage.from("project-drawings").download(d.file_path);
    if (error || !blob) continue; // best-effort — one missing/denied file shouldn't break the whole zip
    zip.file(d.file_name, await blob.arrayBuffer());
    included++;
  }

  if (included === 0) {
    return NextResponse.json({ error: "No accessible drawings" }, { status: 404 });
  }

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const zipBlob = new Blob([buffer], { type: "application/zip" });
  const safeTitle = project.title.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-") || "drawings";

  return new NextResponse(zipBlob, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle}-drawings.zip"`,
    },
  });
}
