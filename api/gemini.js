// api/gemini.js — Vercel Serverless Function
export const config = { runtime: "edge" };

const GEMINI_MODEL = "gemini-1.5-flash";
// MILLORA 1: Ens assegurem de netejar possibles espais o salts de línia
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Mètode no permès" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // MILLORA 2: Validar que la clau d'entorn existeix a Vercel abans de continuar
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "La clau d'API no està configurada a Vercel" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { prompt, systemPrompt, maxTokens = 2400 } = body;

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    // MILLORA 3: Ús de l'endpoint v1 (estable) per a producció
    const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
    });

    // MILLORA 4: Capturar l'error HTTP real si l'API falla
    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error(`Error de xarxa a Gemini: Status ${geminiRes.status} - ${errorText}`);
      return new Response(JSON.stringify({ error: `Error intern de connexió amb la IA: Codi ${geminiRes.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiRes.json();

    if (geminiData.error) {
      return new Response(JSON.stringify({ error: geminiData.error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Error intern del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
