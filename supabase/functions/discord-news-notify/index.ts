import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const webhook = Deno.env.get("DISCORD_NEWS_WEBHOOK_URL");
    const siteUrl = Deno.env.get("SITE_URL") || "";

    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Supabase function secrets are incomplete" }, 500);
    if (!webhook) return json({ error: "DISCORD_NEWS_WEBHOOK_URL is not configured" }, 500);

    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profileError) return json({ error: "Could not verify administrator" }, 500);
    if (!profile?.is_admin) return json({ error: "Administrator access required" }, 403);

    const body = await req.json();
    const postId = body?.post_id;
    if (typeof postId !== "string") return json({ error: "post_id is required" }, 400);

    const { data: post, error: postError } = await adminClient
      .from("arsenal_public_posts")
      .select("id,title,body,created_at")
      .eq("id", postId)
      .maybeSingle();
    if (postError) return json({ error: "Could not load published news" }, 500);
    if (!post) return json({ error: "News not found" }, 404);

    // Unique post_id prevents the same global news item from being announced twice.
    const { error: claimError } = await adminClient
      .from("arsenal_discord_news_notifications")
      .insert({ post_id: post.id, status: "sending" });
    if (claimError) {
      if (claimError.code === "23505") return json({ ok: true, already_sent: true });
      return json({ error: "Could not reserve notification" }, 500);
    }

    const title = String(post.title || "Новая мировая новость").slice(0, 256);
    const rawBody = String(post.body || "");
    const description = rawBody.length > 4000 ? rawBody.slice(0, 3997) + "..." : rawBody;
    const link = siteUrl ? siteUrl.replace(/\/$/, "") : null;
    const embed: Record<string, unknown> = {
      title: `🌍 ${title}`,
      description: description || "На сайте опубликована новая мировая новость.",
      color: 0x5865F2,
      footer: { text: "АРСЕНАЛ • Мировые новости" },
      timestamp: post.created_at || new Date().toISOString(),
    };
    if (link) embed.url = link;

    const discordResponse = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    });

    if (!discordResponse.ok) {
      const details = await discordResponse.text();
      await adminClient.from("arsenal_discord_news_notifications").delete().eq("post_id", post.id);
      return json({ error: `Discord webhook returned ${discordResponse.status}: ${details.slice(0, 300)}` }, 502);
    }

    await adminClient
      .from("arsenal_discord_news_notifications")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("post_id", post.id);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
