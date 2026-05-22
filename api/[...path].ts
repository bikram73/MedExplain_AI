/// <reference types="node" />

// Use the server bundle produced by `npm run build`.
// The Edge runtime rejected several TanStack modules; run this as a Node serverless function instead.
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
// @ts-ignore Build output module is generated during `vite build`.
import server from "../dist/server/server.js";

export const config = {
  runtime: "nodejs",
};

type EmailNotificationRow = {
  id: string;
  user_id: string;
  email: string;
  type: "welcome" | "first_login";
  subject: string;
  body: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
};

let supabaseAdminClient: any;

function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdminClient;
}

function getRequestUrl(req: any): URL {
  const incomingUrl = req.url || "/";
  const host = req.headers && (req.headers.host || req.headers[":authority"])
    ? (req.headers.host || req.headers[":authority"])
    : "localhost";
  const absoluteUrl = incomingUrl.startsWith("http") ? incomingUrl : `https://${host}${incomingUrl}`;
  return new URL(absoluteUrl);
}

function getMailer() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const from = process.env.EMAIL_FROM || user;

  if (!user || !pass || !from) {
    throw new Error("Missing EMAIL_USER, EMAIL_PASS, or EMAIL_FROM");
  }

  return {
    from,
    transporter: nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: (process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      auth: { user, pass },
    }),
  };
}

function toHtml(body: string) {
  return body
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br />")}</p>`)
    .join("");
}

async function handleCronRequest(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const url = getRequestUrl(req);
  const expectedSecret = process.env.MAIL_CRON_SECRET;
  const providedSecret = url.searchParams.get("secret") || undefined;

  if (expectedSecret && providedSecret !== expectedSecret) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const { from, transporter } = getMailer();
  const supabaseAdmin = getSupabaseAdminClient();
  const { data: notifications, error: selectError } = await supabaseAdmin
    .from("email_notifications")
    .select("id,user_id,email,type,subject,body,sent_at,error_message,created_at")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(25);

  if (selectError) {
    console.error("Failed to read queued emails", selectError);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Failed to read queued emails" }));
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const notification of (notifications || []) as EmailNotificationRow[]) {
    try {
      await transporter.sendMail({
        from,
        to: notification.email,
        subject: notification.subject,
        text: notification.body,
        html: toHtml(notification.body),
      });

      const { error: updateError } = await supabaseAdmin
        .from("email_notifications")
        .update({ sent_at: new Date().toISOString(), error_message: null })
        .eq("id", notification.id);

      if (updateError) {
        throw updateError;
      }

      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown mail error";
      failed += 1;
      await supabaseAdmin
        .from("email_notifications")
        .update({ error_message: message })
        .eq("id", notification.id);
      console.error("Failed to send queued email", { id: notification.id, error: message });
    }
  }

  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true, sent, failed, processed: (notifications || []).length }));
}

export default async function handler(req: any, res: any) {
  try {
    const url = getRequestUrl(req);

    if (url.pathname === "/api/cron/send-mails") {
      await handleCronRequest(req, res);
      return;
    }

    const method = req.method || "GET";
    const fullUrl = url.toString();

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers || {})) {
      if (v === undefined || v === null) continue;
      headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }

    let body: Uint8Array | undefined;
    if (method !== "GET" && method !== "HEAD") {
      body = await new Promise<Uint8Array>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      });
    }

    const requestBody = body?.length ? Uint8Array.from(body).buffer : undefined;
    const request = new Request(fullUrl, { method, headers, body: requestBody });

    const response: Response = await server.fetch(request, {}, {});

    // Forward status and headers
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    // Forward body
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("Server forward error:", err);
    res.statusCode = 500;
    res.end("Internal server error");
  }
}