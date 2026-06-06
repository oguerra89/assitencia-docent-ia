// api/gemini.js — Vercel Serverless Function
// Verifica el token de Google i fa la crida a Gemini
// Les credencials MAI surten del servidor

export const config = { runtime: "edge" };

const GEMINI_MODEL = "gemini-1.5-flash";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;

// ── Verificació del token de Google (sense llibreries externes) ──────────────
async function verifyGoogleToken(idToken) {
  // Descodifiquem el JWT sense verificar la signatura (ho fa Google)
  // i després verifiquem amb l'endpoint oficial de Google
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
  );
  if (!res.ok) throw new Error("Token de Google no vàlid");
  const payload = await res.json();

  // Verifiquem que el token és per a la nostra app
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw new Error("Token no correspon a aquesta aplicació");
  }
  // Verifiquem que no ha caducat
  if (Date.now() / 1000 > payload.exp) {
    throw new Error("Token caducat");
  }
  return payload; // { email, name, picture, sub, ... }
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req) {
  // CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Mètode no permès" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Llegir el cos de la petició
    const body = await req.json();
    const { idToken, prompt, systemPrompt, maxTokens = 2400 } = body;

    // 2. Verificar que hi ha token
    if (!idToken) {
      return new Response(JSON.stringify({ error: "CAL_LOGIN" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Verificar el token de Google
    await verifyGoogleToken(idToken);

    // 4. Construir el prompt complet
    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\n${prompt}`
      : prompt;

    // 5. Crida a Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7,
          },
        }),
      }
    );

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
    const isAuthError = err.message.includes("Token") || err.message.includes("token");
    return new Response(
      JSON.stringify({ error: isAuthError ? "TOKEN_INVALID" : err.message }),
      {
        status: isAuthError ? 401 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
