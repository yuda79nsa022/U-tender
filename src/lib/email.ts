import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

// Lazily instantiated so a missing RESEND_API_KEY doesn't crash the app
// at import time — only when an email is actually attempted.
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = "U-Tender <notifications@u-tender.example>"; // replace with your verified Resend sending domain

// Every send is wrapped so a Resend/network failure never breaks the
// calling flow (a bid still gets submitted even if the notification
// email fails) — it's logged instead.
async function send(to: string, subject: string, html: string) {
  const resend = getResend();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping email to ${to}: ${subject}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`[email] failed to send "${subject}" to ${to}:`, err);
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export async function notifyOwnerNewOffer(params: {
  ownerId: string;
  projectTitle: string;
  projectId: string;
  contractorName: string;
  amount: number;
}) {
  const email = await getUserEmail(params.ownerId);
  if (!email) return;

  await send(
    email,
    `New offer on ${params.projectTitle}`,
    `<p><strong>${params.contractorName}</strong> submitted an offer of $${params.amount.toLocaleString()} on <strong>${params.projectTitle}</strong>.</p>
     <p><a href="${appUrl()}/owner/projects/${params.projectId}">Review offers</a></p>`
  );
}

export async function notifyContractorOfferDecision(params: {
  contractorId: string;
  projectTitle: string;
  approved: boolean;
}) {
  const email = await getUserEmail(params.contractorId);
  if (!email) return;

  const subject = params.approved
    ? `Your offer was approved — ${params.projectTitle}`
    : `Update on your offer for ${params.projectTitle}`;
  const body = params.approved
    ? `<p>Good news — your offer on <strong>${params.projectTitle}</strong> was approved.</p>`
    : `<p>The owner of <strong>${params.projectTitle}</strong> went with another offer this time.</p>`;

  await send(email, subject, `${body}<p><a href="${appUrl()}/contractor/feed">View open projects</a></p>`);
}

export async function notifyOwnerDeadlineApproaching(params: {
  ownerId: string;
  projectTitle: string;
  projectId: string;
  offerCount: number;
}) {
  const email = await getUserEmail(params.ownerId);
  if (!email) return;

  await send(
    email,
    `Bidding closes soon — ${params.projectTitle}`,
    `<p><strong>${params.projectTitle}</strong> stops accepting offers in less than 24 hours.
     You currently have ${params.offerCount} offer${params.offerCount === 1 ? "" : "s"}.</p>
     <p><a href="${appUrl()}/owner/projects/${params.projectId}">Review offers</a></p>`
  );
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
