import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AI_GATEWAY_URL = Deno.env.get("AI_GATEWAY_URL")!;
const AI_API_KEY = Deno.env.get("AI_API_KEY")!;

const SYSTEM_PROMPT = `You are MedExplain, an AI medical assistant. Read the OCR-extracted medical report text and produce a patient-friendly summary in clear, simple English. Avoid jargon; when a medical term must be used, explain it. Never fabricate values that aren't in the report. Always include a disclaimer that this is informational and not medical advice.`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    simplified_summary: { type: "string", description: "Plain-English overview, 2-4 sentences." },
    key_findings: { type: "array", items: { type: "string" } },
    abnormal_values: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          reference_range: { type: "string" },
          severity: { type: "string", enum: ["low", "high", "critical", "borderline"] },
          explanation: { type: "string" },
        },
        required: ["name", "value", "severity", "explanation"],
      },
    },
    term_explanations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { term: { type: "string" }, meaning: { type: "string" } },
        required: ["term", "meaning"],
      },
    },
    suggested_followup: { type: "array", items: { type: "string" } },
    emergency_alert: {
      type: "object",
      additionalProperties: false,
      properties: {
        present: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["present"],
    },
    disclaimer: { type: "string" },
  },
  required: [
    "simplified_summary",
    "key_findings",
    "abnormal_values",
    "term_explanations",
    "suggested_followup",
    "emergency_alert",
    "disclaimer",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return new Response(JSON.stringify({ error: "Text too short to summarize." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = text.length > 30000 ? text.slice(0, 30000) : text;

    const res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Analyze this medical report:\n\n${trimmed}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_medical_summary",
              description: "Return the structured patient-friendly summary.",
              parameters: schema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_medical_summary" } },
      }),
    });

    if (res.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached. Please try again in a moment." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (res.status === 402) {
      return new Response(
        JSON.stringify({
          error: "AI credits exhausted. Please add credits in workspace settings.",
        }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!res.ok) {
      const errText = await res.text();
      console.error("AI gateway error", res.status, errText);
      return new Response(JSON.stringify({ error: "AI service error." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No structured output returned." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const summary = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
