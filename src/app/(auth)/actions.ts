"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ensureDocumentRows } from "@/app/contractor/verify/actions";

export async function signup(formData: FormData) {
  const supabase = createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const role = formData.get("role") as "owner" | "contractor";

  if (!email || !password || !fullName || !role) {
    redirect(`/signup?error=${encodeURIComponent("All fields are required.")}`);
  }

  const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !data.user) {
    redirect(`/signup?error=${encodeURIComponent(signUpError?.message ?? "Could not create account.")}`);
  }

  const userId = data.user!.id;

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    role,
    full_name: fullName,
  });
  if (profileError) {
    redirect(`/signup?error=${encodeURIComponent(profileError.message)}`);
  }

  if (role === "contractor") {
    const companyName = (formData.get("company_name") as string) || fullName;
    const { error: cpError } = await supabase.from("contractor_profiles").insert({
      user_id: userId,
      company_name: companyName,
    });
    if (cpError) {
      redirect(`/signup?error=${encodeURIComponent(cpError.message)}`);
    }
    // Seed a "not_submitted" row for every active document requirement
    // so the verification checklist has something to render immediately.
    await ensureDocumentRows(userId);
  }

  // Supabase requires email confirmation by default — data.session is null
  // until the user clicks the confirmation link. Route accordingly rather
  // than assuming they're logged in yet.
  if (!data.session) {
    redirect(`/login?notice=${encodeURIComponent("Check your email to confirm your account, then log in.")}`);
  }

  redirect(role === "owner" ? "/owner/dashboard" : "/contractor/verify");
}

export async function login(formData: FormData) {
  const supabase = createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Invalid email or password.")}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user!.id)
    .single();

  if (profile?.role === "admin") redirect("/admin/requirements");
  if (profile?.role === "owner") redirect("/owner/dashboard");
  redirect("/contractor/verify");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
