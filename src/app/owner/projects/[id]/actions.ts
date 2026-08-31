"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyContractorOfferDecision } from "@/lib/email";
import { uploadDrawingsForProject } from "@/lib/drawings";

export async function addDrawings(projectId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: project } = await supabase.from("projects").select("owner_id").eq("id", projectId).single();
  if (!project || project.owner_id !== user.id) throw new Error("Project not found.");

  const files = formData.getAll("drawings") as File[];
  await uploadDrawingsForProject(supabase, projectId, files);

  revalidatePath(`/owner/projects/${projectId}`);
}

export async function approveOffer(projectId: string, offerId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Confirm this project actually belongs to the caller — RLS backs this
  // up too, but failing fast here gives a clearer error than a silent
  // no-op update.
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, status, title")
    .eq("id", projectId)
    .single();

  if (!project || project.owner_id !== user.id) {
    throw new Error("Project not found.");
  }
  if (project.status === "awarded") {
    throw new Error("This project has already been awarded.");
  }

  const { error: approveError } = await supabase
    .from("offers")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", offerId);
  if (approveError) throw approveError;

  const { data: rejectedOffers, error: rejectError } = await supabase
    .from("offers")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .neq("id", offerId)
    .select("contractor_id");
  if (rejectError) throw rejectError;

  const { error: projectError } = await supabase
    .from("projects")
    .update({ status: "awarded" })
    .eq("id", projectId);
  if (projectError) throw projectError;

  // Best-effort — notification failures never roll back the award itself.
  const { data: winningOffer } = await supabase.from("offers").select("contractor_id").eq("id", offerId).single();
  if (winningOffer) {
    await notifyContractorOfferDecision({
      contractorId: winningOffer.contractor_id,
      projectTitle: project.title,
      approved: true,
    });
  }
  await Promise.all(
    (rejectedOffers ?? []).map((o) =>
      notifyContractorOfferDecision({ contractorId: o.contractor_id, projectTitle: project.title, approved: false })
    )
  );

  revalidatePath(`/owner/projects/${projectId}`);
  revalidatePath("/owner/dashboard");
}

export async function submitReview(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const projectId = formData.get("project_id") as string;
  const contractorId = formData.get("contractor_id") as string;
  const rating = parseInt(formData.get("rating") as string, 10);
  const comment = formData.get("comment") as string;

  if (!rating || rating < 1 || rating > 5) {
    throw new Error("Choose a rating between 1 and 5.");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, status")
    .eq("id", projectId)
    .single();

  if (!project || project.owner_id !== user.id) throw new Error("Project not found.");
  if (project.status !== "awarded") throw new Error("You can only review a project after it's awarded.");

  const { error: reviewError } = await supabase.from("reviews").insert({
    project_id: projectId,
    owner_id: user.id,
    contractor_id: contractorId,
    rating,
    comment: comment || null,
  });
  if (reviewError) throw reviewError;

  // Recompute the contractor's public average rather than trusting an
  // incrementally-maintained counter, so it can never drift out of sync.
  const { data: allReviews } = await supabase.from("reviews").select("rating").eq("contractor_id", contractorId);
  const reviewCount = allReviews?.length ?? 0;
  const avgRating = reviewCount ? allReviews!.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;

  const { error: profileError } = await supabase
    .from("contractor_profiles")
    .update({ avg_rating: Math.round(avgRating * 10) / 10, review_count: reviewCount })
    .eq("user_id", contractorId);
  if (profileError) throw profileError;

  revalidatePath(`/owner/projects/${projectId}`);
}
