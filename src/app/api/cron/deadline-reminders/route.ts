import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOwnerDeadlineApproaching } from "@/lib/email";

// Intended to be hit by an external scheduler (Vercel Cron, a Supabase
// pg_cron job, a GitHub Actions scheduled workflow — this project doesn't
// assume one specific host) roughly once an hour. Protected by a shared
// secret rather than a user session, since the caller isn't a browser.
//
// Uses the service-role client because this runs with no user context at
// all — there's no auth.uid() for RLS to check against.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, title, owner_id, bid_deadline, offers(count)")
    .eq("status", "open")
    .eq("deadline_reminder_sent", false)
    .gte("bid_deadline", now.toISOString())
    .lte("bid_deadline", in24h.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const p of projects ?? []) {
    const offerCount = (p.offers as unknown as { count: number }[])?.[0]?.count ?? 0;
    await notifyOwnerDeadlineApproaching({
      ownerId: p.owner_id,
      projectTitle: p.title,
      projectId: p.id,
      offerCount,
    });
    await supabase.from("projects").update({ deadline_reminder_sent: true }).eq("id", p.id);
    sent++;
  }

  return NextResponse.json({ checked: projects?.length ?? 0, sent });
}
