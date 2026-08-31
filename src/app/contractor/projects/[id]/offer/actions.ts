"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { notifyOwnerNewOffer } from "@/lib/email";

export async function submitOffer(projectId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contractorProfile } = await supabase
    .from("contractor_profiles")
    .select("verification_status, subscription_status, company_name")
    .eq("user_id", user!.id)
    .single();

  if (contractorProfile?.verification_status !== "approved") {
    redirect("/contractor/status");
  }
  const subscribed =
    contractorProfile?.subscription_status === "active" || contractorProfile?.subscription_status === "trialing";
  if (!subscribed) {
    redirect("/contractor/subscribe");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("status, bid_deadline, title, owner_id")
    .eq("id", projectId)
    .single();

  if (!project || project.status !== "open" || new Date(project.bid_deadline) < new Date()) {
    redirect(`/contractor/projects/${projectId}/offer?error=${encodeURIComponent("Bidding on this project is closed.")}`);
  }

  const amount = parseFloat((formData.get("amount") as string)?.replace(/[^0-9.]/g, ""));
  const timelineEstimate = formData.get("timeline_estimate") as string;
  const message = formData.get("message") as string;

  if (!amount || amount <= 0) {
    redirect(`/contractor/projects/${projectId}/offer?error=${encodeURIComponent("Enter a valid bid amount.")}`);
  }

  // upsert on the (project_id, contractor_id) unique constraint — a
  // contractor revising their bid before the deadline updates the same
  // row rather than creating a duplicate.
  const { error } = await supabase.from("offers").upsert(
    {
      project_id: projectId,
      contractor_id: user!.id,
      amount,
      timeline_estimate: timelineEstimate || null,
      message: message || null,
      status: "submitted",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,contractor_id" }
  );

  if (error) {
    redirect(`/contractor/projects/${projectId}/offer?error=${encodeURIComponent(error.message)}`);
  }

  // Best-effort — a failed notification email should never block the bid
  // itself, which is why notifyOwnerNewOffer swallows its own errors.
  await notifyOwnerNewOffer({
    ownerId: project!.owner_id,
    projectTitle: project!.title,
    projectId,
    contractorName: contractorProfile?.company_name ?? "A contractor",
    amount,
  });

  revalidatePath("/contractor/feed");
  revalidatePath(`/contractor/projects/${projectId}/offer`);
  redirect("/contractor/feed");
}

export async function withdrawOffer(projectId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("offers")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("contractor_id", user!.id);

  if (error) throw error;

  revalidatePath("/contractor/feed");
  revalidatePath(`/contractor/projects/${projectId}/offer`);
}
