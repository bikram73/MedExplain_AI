/// <reference types="node" />

// Use the server bundle produced by `npm run build`.
// The Edge runtime rejected several TanStack modules; run this as a Node serverless function instead.
import { createClient } from "@supabase/supabase-js";
// @ts-ignore Build output module is generated during `vite build`.
import server from "../dist/server/server.js";

export const config = {
  runtime: "nodejs",
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
    const { error: storageError } = await supabaseUser.storage.from("medical-reports").remove(filePaths);
    if (storageError) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: storageError.message || "Failed to delete uploaded files" }));
      return;
    }
  }

  const [reportsDelete, profilesDelete] = await Promise.all([
    supabaseUser.from("reports").delete().eq("user_id", userId),
    supabaseUser.from("profiles").delete().eq("id", userId),
  ]);

  const cleanupErrors = [reportsDelete.error, profilesDelete.error].filter(Boolean);
  if (cleanupErrors.length > 0) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      error: cleanupErrors[0]?.message || "Failed to delete account data",
    }));
    return;
  }

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

  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      disabled: true,
      message: "Cron-based signup/signin mail sending has been removed from this project.",
    }),
  );
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