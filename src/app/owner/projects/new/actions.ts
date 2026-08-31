"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { uploadDrawingsForProject } from "@/lib/drawings";

export async function createProject(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = formData.get("title") as string;
  const address = formData.get("address") as string;
  const description = formData.get("description") as string;
  const trade = formData.get("trade") as string;
  const bidDeadline = formData.get("bid_deadline") as string;

  if (!title || !address || !bidDeadline) {
    redirect(`/owner/projects/new?error=${encodeURIComponent("Title, address, and deadline are required.")}`);
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user!.id,
      title,
      address,
      description: description || null,
      trade: trade || null,
      bid_deadline: new Date(bidDeadline).toISOString(),
    })
    .select()
    .single();

  if (projectError || !project) {
    redirect(`/owner/projects/new?error=${encodeURIComponent(projectError?.message ?? "Could not create project.")}`);
  }

  // Drawings are optional at creation time — an owner can add more later.
  // A .zip is transparently extracted into individual drawings.
  const files = formData.getAll("drawings") as File[];
  await uploadDrawingsForProject(supabase, project!.id, files);

  redirect(`/owner/projects/${project!.id}`);
}
