// Use the server bundle produced by `npm run build`.
// The Edge runtime rejected several TanStack modules; run this as a Node serverless function instead.
import server from "../dist/server/server.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: any, res: any) {
  try {
    const method = req.method || "GET";
    const incomingUrl = req.url || "/";
    const host = req.headers && (req.headers.host || req.headers[":authority"]) ? (req.headers.host || req.headers[":authority"]) : "localhost";
    const fullUrl = incomingUrl.startsWith("http") ? incomingUrl : `https://${host}${incomingUrl}`;

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

    const request = new Request(fullUrl, { method, headers, body: body?.length ? body : undefined });

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