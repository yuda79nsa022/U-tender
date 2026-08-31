import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Protects the /owner, /contractor, and /admin trees:
//  - must be logged in
//  - must have the matching role
//  - contractors must be verification_status = 'approved' to reach
//    the feed / offer / subscribe pages (verify + status stay open)
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && (path.startsWith("/owner") || path.startsWith("/contractor") || path.startsWith("/admin"))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (path.startsWith("/admin") && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    if (path.startsWith("/owner") && profile?.role !== "owner") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const contractorGatedPaths = ["/contractor/feed", "/contractor/subscribe", "/contractor/projects"];
    if (profile?.role === "contractor" && contractorGatedPaths.some((p) => path.startsWith(p))) {
      const { data: cp } = await supabase
        .from("contractor_profiles")
        .select("verification_status, is_suspended")
        .eq("user_id", user.id)
        .single();

      if (cp?.verification_status !== "approved" || cp?.is_suspended) {
        return NextResponse.redirect(new URL("/contractor/status", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/owner/:path*", "/contractor/:path*", "/admin/:path*"],
};
