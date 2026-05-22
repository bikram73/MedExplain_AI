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

function readEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

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

function getSupabaseUserClient(token: string) {
  const supabaseUrl = readEnv("SUPABASE_URL");
  const publishableKey = readEnv("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  }

  return createClient(supabaseUrl, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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
  const user = readEnv("EMAIL_USER");
  const pass = readEnv("EMAIL_PASS");
  const from = readEnv("EMAIL_FROM") || user;

  if (!user || !pass || !from) {
    throw new Error("Missing EMAIL_USER, EMAIL_PASS, or EMAIL_FROM");
  }

  return {
    from,
    transporter: nodemailer.createTransport({
      host: readEnv("SMTP_HOST") || "smtp.gmail.com",
      port: Number(readEnv("SMTP_PORT") || 587),
      secure: (readEnv("SMTP_SECURE") || "false").toLowerCase() === "true",
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

async function handleDeleteAccountRequest(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const authHeader = req.headers?.authorization;
  if (!authHeader || !String(authHeader).startsWith("Bearer ")) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const token = String(authHeader).replace("Bearer ", "");
  const supabaseUser = getSupabaseUserClient(token);
  const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);

  if (userError || !userData?.user?.id) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const userId = userData.user.id;
  const { data: reports } = await supabaseUser
    .from("reports")
    .select("file_path")
    .eq("user_id", userId);
  const filePaths = (reports || [])
    .map((report: { file_path: string | null }) => report.file_path)
    .filter((path: string | null): path is string => Boolean(path));

  if (filePaths.length > 0) {
    await supabaseUser.storage.from("medical-reports").remove(filePaths);
  }

  await Promise.all([
    supabaseUser.from("reports").delete().eq("user_id", userId),
    supabaseUser.from("profiles").delete().eq("id", userId),
  ]);

  if (!readEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, mode: "data-only" }));
    return;
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const deleteResult = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteResult.error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: deleteResult.error.message || "Failed to delete account" }));
    return;
  }

  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true }));
}

async function handleCronRequest(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const url = getRequestUrl(req);
  const expectedSecret = readEnv("MAIL_CRON_SECRET");
  const providedSecret = url.searchParams.get("secret") || undefined;

  if (expectedSecret && providedSecret !== expectedSecret) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  try {
    const missing: string[] = [];
    if (!readEnv("SUPABASE_URL")) missing.push("SUPABASE_URL");
    if (!readEnv("SUPABASE_SERVICE_ROLE_KEY")) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!readEnv("EMAIL_USER")) missing.push("EMAIL_USER");
    if (!readEnv("EMAIL_PASS")) missing.push("EMAIL_PASS");

    if (missing.length > 0) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: "Missing required server environment variables",
        missing,
      }));
      return;
    }

    const { from, transporter } = getMailer();
    const verifyResult = await transporter.verify().then(() => ({ ok: true as const })).catch((error) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : "SMTP verify failed",
    }));

    if (!verifyResult.ok) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "SMTP connection failed", detail: verifyResult.message }));
      return;
    }

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
      res.end(JSON.stringify({ error: "Failed to read queued emails", detail: selectError.message }));
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron error";
    console.error("Cron handler failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Cron handler failed", detail: message }));
  }
}

export default async function handler(req: any, res: any) {
  try {
    const url = getRequestUrl(req);

    if (url.pathname === "/api/account/delete") {
      await handleDeleteAccountRequest(req, res);
      return;
    }

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