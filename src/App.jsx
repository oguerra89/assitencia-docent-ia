import { useState, useCallback, useRef, useEffect } from "react";
import {
  Users, BookOpen, FileText, Copy, Download, Plus, Trash2,
  Sparkles, ClipboardList, Accessibility, CheckCircle2,
  Wand2, Blocks, ListChecks, GraduationCap,
  Repeat2, School, AlertTriangle, X, ClipboardCheck, Key
} from "lucide-react";

// ─── PERSISTÈNCIA localStorage ───────────────────────────────────────────────
function usePersistedState(key, initial) {
  const fullKey = "docent_" + key;
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(fullKey);
      if (stored !== null) return JSON.parse(stored);
    } catch (e) { /* ignore */ }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch (e) { /* localStorage ple o no disponible */ }
  }, [fullKey, value]);
  return [value, setValue];
}

function clearAllPersisted() {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith("docent_")) localStorage.removeItem(k);
  });
}

function getApiKey() {
  return localStorage.getItem("gemini_api_key") || "";
}
function saveApiKey(key) {
  localStorage.setItem("gemini_api_key", key);
}

// ─── API GROQ
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function gemini(systemPrompt, userPrompt, maxTokens = 2400) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("CAL_CLAU");

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90000);

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.9,
      }),
    });
    clearTimeout(timeout);
    const d = await r.json();
    if (d.error) {
      if (d.error.code === 401) throw new Error("CLAU_INVALIDA");
      throw new Error(d.error.message);
    }
    const text = d.choices?.[0]?.message?.content || "";
    if (!text) throw new Error("Resposta buida de la IA. Torna-ho a intentar.");
    return text;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("Temps esgotat. Torna-ho a intentar.");
    throw e;
  }
}

async function geminiJSON(systemPrompt, userPrompt, maxTokens = 2400) {
  const raw = await gemini(
    systemPrompt + "\nRespon ÚNICAMENT amb JSON vàlid i ben format. Sense text introductori, sense backticks, sense cap caràcter fora del JSON.",
    userPrompt,
    maxTokens
  );
  // Eliminar possibles backticks de markdown que Gemini de vegades afegeix
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("{");
  const end   = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("La IA no ha retornat un document vàlid. Torna-ho a intentar.");
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    throw new Error("No s'ha pogut processar la resposta. Torna-ho a intentar.");
  }
}

// Funció unificada per a cridarIA_SDC (Creador SdA)
async function geminiSDC(prompt, maxTokens = 1500) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90000);
  try {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("CAL_CLAU");

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.9,
      }),
    });
    clearTimeout(timeout);
    const d = await r.json();
    if (d.error) {
      if (d.error.code === 401) throw new Error("CLAU_INVALIDA");
      throw new Error(d.error.message);
    }
    const text = d.choices?.[0]?.message?.content || "";
    if (!text) throw new Error("Resposta buida de la IA");
    return text;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("Temps esgotat (90s). Torna-ho a intentar amb menys àrees o sessions.");
    throw e;
  }
}

// Funció per Informes
async function geminiInf(prompt) {
  const r = await gemini("", prompt, 1000);
  return r.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
}

// ─── GESTIÓ D'ERRORS API ─────────────────────────────────────────────────────
function isApiKeyError(err) {
  return err?.message === "CAL_CLAU" || err?.message === "CLAU_INVALIDA";
}

// ─── CONSTANTS COMPARTIDES ───────────────────────────────────────────────────
const TIPUS_REUNIO = [
  { id: "cicle",         label: "Acta de Cicle",                      icon: Repeat2,       color: "emerald" },
  { id: "claustre",      label: "Acta de Claustre",                   icon: School,        color: "violet"  },
  { id: "families",      label: "Reunions amb Famílies",              icon: Users,         color: "sky"     },
  { id: "professionals", label: "Reunions amb Professionals Externs", icon: GraduationCap, color: "amber"   },
];

const NECESSITATS = [
  "TDAH", "Altes Capacitats", "Lectura Fàcil", "TEA (Autisme)",
  "Dislèxia", "Llengua estrangera", "Discapacitat motriu"
];


const COL = {
  emerald: { bg:"#ecfdf5", border:"#6ee7b7", text:"#065f46", pill:"#d1fae5", btn:"#059669" },
  violet:  { bg:"#f5f3ff", border:"#c4b5fd", text:"#4c1d95", pill:"#ede9fe", btn:"#7c3aed" },
  sky:     { bg:"#f0f9ff", border:"#7dd3fc", text:"#0c4a6e", pill:"#e0f2fe", btn:"#0284c7" },
  amber:   { bg:"#fffbeb", border:"#fcd34d", text:"#78350f", pill:"#fef3c7", btn:"#d97706" },
};

// ─── CONSTANTS INFORMES ───────────────────────────────────────────────────────
const TRIMESTRES_INF = [
  { id: 1, label: "1r Trimestre", months: "Set – Des" },
  { id: 2, label: "2n Trimestre", months: "Gen – Mar" },
  { id: 3, label: "3r Trimestre", months: "Abr – Jun" },
];

const CURSOS = ["1r","2n","3r","4t","5è","6è"];

const AREES_INF = [
  { id: "general",       label: "Comentari General",    icon: "💬", esGeneral: true },
  { id: "llengua_cat",   label: "Llengua Catalana",     icon: "📖" },
  { id: "llengua_cast",  label: "Llengua Castellana",   icon: "📝" },
  { id: "angles",        label: "Anglès",               icon: "🌍" },
  { id: "matematiques",  label: "Matemàtiques",         icon: "🔢" },
  { id: "coneix_medi",   label: "Coneixement del Medi", icon: "🌿" },
  { id: "ed_artistica",  label: "Ed. Artística",        icon: "🎨" },
  { id: "ed_fisica",     label: "Ed. Física",           icon: "⚽" },
  { id: "musica",        label: "Música",               icon: "🎵" },
  { id: "religio",       label: "Religió / Valors",     icon: "⭐" },
];

const VALORACIONS = ["NA", "AS", "AN", "AE"];
const VAL_META = {
  NA: { label: "No Assolit",            bg: "#fdecea", color: "#c0392b", border: "#e57373" },
  AS: { label: "Assolit Suficient",     bg: "#fff8e1", color: "#b35c00", border: "#ffcc02" },
  AN: { label: "Assoliment Notable",    bg: "#e3f2fd", color: "#1565c0", border: "#64b5f6" },
  AE: { label: "Assoliment Excel·lent", bg: "#e8f5e9", color: "#2e7d32", border: "#81c784" },
};

const CRITERIS_GENERAL_INF_DEFAULT = [
  "Millora al llarg del període",
  "Comportament",
  "Treball i esforç individual",
  "Treball i esforç en grup",
];

const CRITERIS_BASE = {
  llengua_cat: {
    inicial:  ["Comprensió lectora","Expressió oral","Expressió escrita","Consciència fonològica","Vocabulari"],
    mitja:    ["Comprensió lectora","Expressió oral","Expressió escrita","Ortografia","Gramàtica bàsica","Vocabulari"],
    superior: ["Comprensió lectora crítica","Expressió oral argumentativa","Expressió escrita","Ortografia i gramàtica","Recursos literaris","Vocabulari i semàntica"],
  },
  llengua_cast: {
    inicial:  ["Comprensión lectora","Expresión oral","Expresión escrita","Conciencia fonológica","Vocabulario"],
    mitja:    ["Comprensión lectora","Expresión oral","Expresión escrita","Ortografía","Gramática básica","Vocabulario"],
    superior: ["Comprensión lectora crítica","Expresión oral argumentativa","Expresión escrita","Ortografía y gramática","Recursos literarios","Vocabulario y semántica"],
  },
  angles: {
    inicial:  ["Listening","Speaking","Reading","Writing","Vocabulari bàsic"],
    mitja:    ["Listening","Speaking","Reading","Writing","Gramàtica","Vocabulari"],
    superior: ["Listening comprehension","Speaking fluency","Reading comprehension","Writing","Grammar","Vocabulary range"],
  },
  matematiques: {
    inicial:  ["Numeració i càlcul","Mesura","Geometria","Resolució de problemes","Raonament lògic"],
    mitja:    ["Numeració i càlcul","Fraccions i decimals","Mesura","Geometria","Estadística bàsica","Resolució de problemes"],
    superior: ["Càlcul i operacions","Fraccions, decimals i percentatges","Mesura i conversió","Geometria","Estadística i probabilitat","Resolució de problemes complexos","Raonament algebraic"],
  },
  coneix_medi: {
    inicial:  ["Medi natural","Medi social","Salut i cos humà","Experimentació"],
    mitja:    ["Ciències naturals","Ciències socials","Salut i medi ambient","Experimentació i observació"],
    superior: ["Ciències naturals","Ciències socials i geografia","Història","Salut i medi ambient","Indagació científica"],
  },
  ed_artistica: {
    inicial:  ["Expressió plàstica","Creativitat","Percepció visual","Ús de materials"],
    mitja:    ["Tècniques plàstiques","Creativitat i originalitat","Percepció i anàlisi visual","Organització del treball"],
    superior: ["Tècniques i procediments artístics","Creativitat i originalitat","Anàlisi d'obres d'art","Organització i autonomia"],
  },
  ed_fisica: {
    inicial:  ["Habilitats motrius bàsiques","Coordinació","Actitud cooperativa","Hàbits saludables"],
    mitja:    ["Habilitats motrius","Condició física","Joc en equip","Actitud i esforç","Hàbits saludables"],
    superior: ["Habilitats motrius i esportives","Condició física","Treball en equip","Actitud i esforç","Hàbits de vida saludable"],
  },
  musica: {
    inicial:  ["Escolta activa","Ritme","Cançons i veu","Moviment"],
    mitja:    ["Escolta i percepció musical","Ritme i pulsació","Expressió vocal","Expressió instrumental","Moviment i dansa"],
    superior: ["Percepció i anàlisi musical","Ritme i lectura musical","Expressió vocal i coral","Expressió instrumental","Història de la música"],
  },
  religio: {
    inicial:  ["Continguts específics","Actitud i participació","Valors i convivència"],
    mitja:    ["Continguts específics","Actitud i participació","Valors i convivència","Reflexió personal"],
    superior: ["Continguts específics","Actitud crítica i reflexiva","Valors i convivència","Expressió i comunicació"],
  },
};

function getCicle(curs) {
  if (curs.startsWith("1r") || curs.startsWith("2n")) return "inicial";
  if (curs.startsWith("3r") || curs.startsWith("4t")) return "mitja";
  return "superior";
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
const emptyTasca = () => ({ que:"", qui:"", quan:"" });

function downloadTxt(text, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type:"text/plain;charset=utf-8" }));
  a.download = (name || "document") + ".txt";
  a.click();
}

function cleanActa(raw) {
  return raw
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/^[-_*]{2,}\s*$/gm, "")
    .replace(/^[_\-─―]{3,}.*$/gm, "")
    .replace(/^.*[Cc]odi\s+de\s+document[:\s].*/gm, "")
    .replace(/^.*[Mm]odalitat[:\s].*/gm, "")
    .replace(/^.*[Ss]ecretar[ia].*(cicle|claustre).*/gim, "")
    .replace(/^.*[Dd]ocument\s+generat\s+el.*/gm, "")
    .replace(/&nbsp;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── ANONIMITZADOR ───────────────────────────────────────────────────────────
function buildAnonymizer() {
  const counters = {};
  const map = {};

  function nextToken(prefix) {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `[${prefix}_${counters[prefix]}]`;
  }

  const PATTERNS = [
    { re: /\b[0-9]{8}[A-HJ-NP-TV-Z]\b|\b[XYZ][0-9]{7}[A-HJ-NP-TV-Z]\b/gi, prefix: "DNI" },
    { re: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b|\b\d{14}\b/g, prefix: "TSI" },
    { re: /(?:\+34\s?)?(?:6|7|9)\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/g, prefix: "TEL" },
    { re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, prefix: "EMAIL" },
    { re: /\b(0?[1-9]|[12]\d|3[01])[/\-.](0?[1-9]|1[0-2])[/\-.](19|20)\d{2}\b/g, prefix: "NAIX" },
    {
      re: /(?:(?:Sr\.?|Sra\.?|Dr\.?|Dra\.?)\s+)?(?:[A-ZÁÉÍÓÚÀÈÌÒÙÜÏÑ][a-záéíóúàèìòùüïñ]{1,20}(?:\s+[A-ZÁÉÍÓÚÀÈÌÒÙÜÏÑ][a-záéíóúàèìòùüïñ]{1,20}){1,3})/g,
      prefix: "NOM",
      exclude: /^(?:Gener|Febrer|Març|Abril|Maig|Juny|Juliol|Agost|Setembre|Octubre|Novembre|Desembre|Dilluns|Dimarts|Dimecres|Dijous|Divendres|Dissabte|Diumenge|Català|Castellà|Anglès|Matemàtiques|Artística|Catalunya|Educació|Física|Natural|Social|Cultural|Valors|Cívics|Medi|Cicle|Claustre|Primària|Primaria|Secundària)$/i
    },
  ];

  function anonymize(text) {
    if (!text) return { anon: text, map: {} };
    let result = text;
    const localMap = {};
    for (const { re, prefix, exclude } of PATTERNS) {
      result = result.replace(re, (match) => {
        if (exclude) {
          const parts = match.trim().split(/\s+/);
          if (parts.every(p => exclude.test(p))) return match;
        }
        const existing = Object.entries(map).find(([,v]) => v === match);
        if (existing) return existing[0];
        const token = nextToken(prefix);
        map[token] = match;
        localMap[token] = match;
        return token;
      });
    }
    return { anon: result, map: localMap };
  }

  function restore(text) {
    let result = text;
    for (const [token, original] of Object.entries(map)) {
      result = result.split(token).join(original);
    }
    return result;
  }

  return { anonymize, restore, getMap: () => ({ ...map }) };
}

let _anonSession = buildAnonymizer();
function resetAnon() { _anonSession = buildAnonymizer(); }
const anonymize   = (text) => _anonSession.anonymize(text);
const restoreAnon = (text) => _anonSession.restore(text);

// ─── MODAL CLAU API ──────────────────────────────────────────────────────────
function ApiKeyModal({ onSave, errorMsg }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSave = () => {
    const k = key.trim();
    if (!k) { setLocalError("Introdueix la clau API."); return; }
     
    saveApiKey(k);
    onSave(k);
  };

  const err = localError || errorMsg;

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(15,23,42,0.7)", zIndex:20000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem"
    }}>
      <div style={{
        background:"white", borderRadius:20, width:"100%", maxWidth:480,
        boxShadow:"0 32px 80px rgba(0,0,0,0.3)", overflow:"hidden"
      }}>
        {/* Capçalera */}
        <div style={{
          background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
          padding:"28px 28px 24px", textAlign:"center"
        }}>
          <div style={{
            width:56, height:56, background:"rgba(255,255,255,0.2)", borderRadius:16,
            display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px"
          }}>
            <Key size={26} color="white" />
          </div>
          <h2 style={{ color:"white", fontSize:20, fontWeight:800, margin:"0 0 6px" }}>
            Configura la clau API
          </h2>
          <p style={{ color:"rgba(255,255,255,0.85)", fontSize:13, margin:0, lineHeight:1.5 }}>
            Necessites una clau gratuïta de Groq per usar l'app
          </p>
        </div>

        {/* Cos */}
        <div style={{ padding:"24px 28px 28px" }}>
          {/* Instruccions */}
          <div style={{
            background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10,
            padding:"14px 16px", marginBottom:20, fontSize:13, color:"#0c4a6e", lineHeight:1.7
          }}>
            <strong>Com obtenir la clau gratuïta:</strong>
            <ol style={{ margin:"8px 0 0 16px", padding:0 }}>
              <li>Ves a <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" style={{ color:"#0284c7", fontWeight:700 }}>aistudio.google.com</a></li>
              <li>Inicia sessió amb el teu compte de Google</li>
              <li>Clica <strong>"Get API key"</strong> → <strong>"Create API key"</strong></li>
              <li>Copia la clau i enganxa-la aquí sota</li>
            </ol>
            <div style={{ marginTop:10, padding:"6px 10px", background:"#dcfce7", borderRadius:7, fontSize:12, color:"#166534" }}>
              ✅ Pla gratuït: ~1.500 peticions/dia. Més que suficient per a ús docent.
            </div>
          </div>

          {/* Input */}
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:6 }}>
            Clau API de Gemini
          </label>
          <div style={{ position:"relative", marginBottom:err ? 10 : 20 }}>
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={e => { setKey(e.target.value); setLocalError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="AIzaSy..."
              style={{
                width:"100%", padding:"11px 44px 11px 14px",
                borderRadius:10, border: err ? "2px solid #ef4444" : "2px solid #e2e8f0",
                fontSize:14, outline:"none", fontFamily:"'Courier New', monospace",
                boxSizing:"border-box", background:"#f8fafc", color:"#1e293b"
              }}
            />
            <button onClick={() => setShow(s => !s)} style={{
              position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
              background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:16
            }}>
              {show ? "🙈" : "👁️"}
            </button>
          </div>

          {err && (
            <div style={{
              display:"flex", gap:8, background:"#fef2f2", border:"1px solid #fca5a5",
              borderRadius:8, padding:"9px 12px", marginBottom:16, fontSize:12, color:"#b91c1c"
            }}>
              <AlertTriangle size={14} style={{ flexShrink:0, marginTop:1 }} />
              {err === "CLAU_INVALIDA" ? "Clau API no vàlida o caducada. Comprova-la a aistudio.google.com." : err}
            </div>
          )}

          <button onClick={handleSave} style={{
            width:"100%", padding:"13px", borderRadius:10, border:"none",
            background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"white",
            fontSize:15, fontWeight:800, cursor:"pointer", fontFamily:"inherit",
            boxShadow:"0 4px 14px rgba(99,102,241,0.4)"
          }}>
            Guardar clau i entrar →
          </button>

          <p style={{ textAlign:"center", fontSize:11, color:"#94a3b8", marginTop:12, lineHeight:1.5 }}>
            La clau es guarda només al teu navegador (localStorage).<br/>
            No s'envia a cap servidor nostre.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── COPY MODAL ──────────────────────────────────────────────────────────────
function CopyModal({ text, onClose }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);

  const tryNativeCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(onClose, 1200);
    } catch {
      if (ref.current) { ref.current.select(); }
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:10000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
      <div style={{ background:"white", borderRadius:16, width:"100%", maxWidth:600,
        boxShadow:"0 24px 60px rgba(0,0,0,0.25)", overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"16px 20px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Copy size={16} color="#6366f1" />
            <span style={{ fontSize:14, fontWeight:700, color:"#1e293b" }}>Copiar el document</span>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", padding:4 }}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>
        <div style={{ padding:"16px 20px" }}>
          {!copied && (
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"#fffbeb",
              border:"1px solid #fde68a", borderRadius:8, padding:"10px 12px", marginBottom:12, fontSize:12, color:"#713f12" }}>
              <AlertTriangle size={13} color="#d97706" />
              Prem <strong>Ctrl+C</strong> (Windows) o <strong>⌘+C</strong> (Mac) per copiar manualment.
            </div>
          )}
          {copied && (
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f0fdf4",
              border:"1px solid #86efac", borderRadius:8, padding:"10px 12px", marginBottom:12, fontSize:12, color:"#166534" }}>
              <CheckCircle2 size={13} color="#16a34a" /> Text copiat correctament.
            </div>
          )}
          <textarea ref={ref} readOnly value={text} onFocus={e => e.target.select()}
            style={{ width:"100%", height:260, padding:"10px 12px", borderRadius:8, border:"1.5px solid #e2e8f0",
              background:"#f8fafc", fontSize:12, fontFamily:"'Courier New', monospace", lineHeight:1.6,
              resize:"none", color:"#374151", outline:"none" }} />
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button onClick={tryNativeCopy}
              style={{ flex:1, padding:"9px 0", background:"#6366f1", color:"white", border:"none", borderRadius:8,
                fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {copied ? "✓ Copiat!" : "Copiar automàticament"}
            </button>
            <button onClick={onClose}
              style={{ padding:"9px 16px", background:"white", color:"#64748b", border:"1.5px solid #e2e8f0",
                borderRadius:8, fontFamily:"inherit", fontSize:13, cursor:"pointer" }}>
              Tancar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ÀTOMS COMPARTITS ────────────────────────────────────────────────────────
function Toast({ msg, onClose }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, background:"#1e293b", color:"#f8fafc",
      padding:"10px 18px", borderRadius:10, fontSize:13, fontWeight:500,
      display:"flex", alignItems:"center", gap:8, boxShadow:"0 8px 24px rgba(0,0,0,0.18)" }}>
      <CheckCircle2 size={15} color="#4ade80" /> {msg}
    </div>
  );
}

function Spinner() {
  return <span style={{ display:"inline-block", width:15, height:15, flexShrink:0,
    border:"2px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.65s linear infinite" }} />;
}

function PrivacyBanner() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, background:"#fefce8", border:"1px solid #fde68a",
      borderRadius:10, padding:"10px 14px", marginBottom:20, fontSize:12, color:"#713f12" }}>
      <AlertTriangle size={14} color="#d97706" style={{ flexShrink:0 }} />
      <span><strong>Privacitat:</strong> les dades personals que introduïu (noms, contactes, DNI) s'anonimitzen automàticament abans d'enviar-se a la IA. Tot i així, es recomana no introduir dades personals reals dels alumnes sempre que sigui possible.</span>
    </div>
  );
}

function AnonBadge({ active }) {
  if (!active) return null;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f0fdf4",
      border:"1px solid #86efac", borderRadius:8, padding:"7px 12px",
      marginBottom:12, fontSize:11, color:"#166534" }}>
      <CheckCircle2 size={12} color="#16a34a" style={{ flexShrink:0 }} />
      <span><strong>Anonimització activa:</strong> Les dades personals s'han substituït per codis neutres abans d'enviar-se a la IA.</span>
    </div>
  );
}

function SecLabel({ icon: Icon, label, color="#6366f1" }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
      <Icon size={14} color={color} />
      <span style={{ fontSize:11, fontWeight:700, color, textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</span>
    </div>
  );
}

const inpBase = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0",
  background:"#f8fafc", fontSize:13, color:"#1e293b", fontFamily:"inherit", outline:"none", lineHeight:1.5 };

function Inp({ value, onChange, placeholder, type="text" }) {
  const [f, setF] = useState(false);
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ ...inpBase, borderColor:f?"#818cf8":"#e2e8f0", boxShadow:f?"0 0 0 3px rgba(129,140,248,0.15)":"none", transition:"all 0.15s" }}
    onFocus={() => setF(true)} onBlur={() => setF(false)} />;
}

function Txa({ value, onChange, placeholder, rows=4 }) {
  const [f, setF] = useState(false);
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ ...inpBase, resize:"vertical", borderColor:f?"#818cf8":"#e2e8f0", boxShadow:f?"0 0 0 3px rgba(129,140,248,0.15)":"none", transition:"all 0.15s" }}
    onFocus={() => setF(true)} onBlur={() => setF(false)} />;
}

function Btn({ children, onClick, disabled, variant="ghost", full=false, size="md" }) {
  const [h, setH] = useState(false);
  const styles = {
    primary: { background:h?"#4f46e5":"#6366f1", color:"white", border:"none" },
    ghost:   { background:h?"#f1f5f9":"white",   color:"#374151", border:"1.5px solid #e2e8f0" },
  };
  const s = styles[variant] || styles.ghost;
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display:"inline-flex", alignItems:"center", gap:6,
        padding: size==="sm" ? "6px 11px":"9px 15px", borderRadius:8,
        cursor:disabled?"not-allowed":"pointer", fontFamily:"inherit",
        fontSize:size==="sm"?12:13, fontWeight:600, opacity:disabled?0.45:1,
        transition:"all 0.13s", width:full?"100%":"auto",
        justifyContent:full?"center":"flex-start", ...s }}>
      {children}
    </button>
  );
}

function Loading({ text }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", background:"#f8fafc",
      border:"1.5px solid #e2e8f0", borderRadius:10, marginTop:12, fontSize:13, color:"#64748b" }}>
      <Spinner /> {text}
    </div>
  );
}

// ─── DOC ACTION BAR ──────────────────────────────────────────────────────────
function DocActionBar({ onCopy, onDownload }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"10px 16px", background:"#f8fafc", border:"1.5px solid #e2e8f0",
      borderRadius:"10px 10px 0 0", borderBottom:"none" }}>
      <span style={{ fontSize:12, fontWeight:700, color:"#6366f1", display:"flex", alignItems:"center", gap:6 }}>
        <CheckCircle2 size={13} /> Document generat
      </span>
      <div style={{ display:"flex", gap:6 }}>
        <Btn size="sm" onClick={onCopy}><Copy size={12} /> Copiar per a Google Docs</Btn>
        <Btn size="sm" onClick={onDownload}><Download size={12} /> Descarregar .txt</Btn>
      </div>
    </div>
  );
}

// ─── ACTA VIEW ────────────────────────────────────────────────────────────────
function ActaDocView({ text, onCopyModal, onDownload }) {
  if (!text) return null;
  return (
    <div style={{ marginTop:16 }}>
      <DocActionBar onCopy={onCopyModal} onDownload={onDownload} />
      <div style={{ background:"#e2e8f0", padding:"20px 16px", borderRadius:"0 0 10px 10px", border:"1.5px solid #e2e8f0", borderTop:"none" }}>
        <div style={{ background:"white", margin:"0 auto", maxWidth:720, padding:"48px 56px",
          boxShadow:"0 4px 24px rgba(0,0,0,0.10)", borderRadius:4, fontFamily:"'Georgia','Times New Roman',serif", minHeight:400 }}>
          <div style={{ fontSize:13.5, lineHeight:1.9, whiteSpace:"pre-wrap", color:"#1e293b" }}>{text}</div>
        </div>
      </div>
    </div>
  );
}

// ─── SdA STRUCTURED VIEW ──────────────────────────────────────────────────────
function SdADocView({ data, onCopyModal, onDownload }) {
  if (!data) return null;

  const THead = ({ cols, bg="#1e3a8a" }) => (
    <thead><tr>{cols.map((c, i) => (
      <th key={i} style={{ background:bg, color:"white", padding:"8px 10px", textAlign:"left",
        fontSize:11, fontWeight:700, letterSpacing:"0.04em", borderRight:"1px solid rgba(255,255,255,0.15)" }}>{c}</th>
    ))}</tr></thead>
  );

  const tblStyle = { width:"100%", borderCollapse:"collapse", fontSize:12, marginBottom:0,
    border:"1px solid #cbd5e1", borderRadius:6, overflow:"hidden" };
  const td = (extra={}) => ({ padding:"7px 10px", borderBottom:"1px solid #e2e8f0", verticalAlign:"top", lineHeight:1.5, ...extra });

  const Section = ({ title, color="#1e3a8a", children }) => (
    <div style={{ marginBottom:22 }}>
      <div style={{ background:color, color:"white", padding:"6px 14px", fontSize:12, fontWeight:700,
        letterSpacing:"0.05em", textTransform:"uppercase", borderRadius:"4px 4px 0 0" }}>{title}</div>
      <div style={{ border:"1px solid #cbd5e1", borderTop:"none", borderRadius:"0 0 4px 4px", padding:"12px 14px", background:"white" }}>{children}</div>
    </div>
  );

  return (
    <div style={{ marginTop:16 }}>
      <DocActionBar onCopy={onCopyModal} onDownload={onDownload} />
      <div style={{ background:"#e2e8f0", padding:"20px 16px", borderRadius:"0 0 10px 10px", border:"1.5px solid #e2e8f0", borderTop:"none" }}>
        <div style={{ background:"white", margin:"0 auto", maxWidth:800, padding:"40px 48px",
          boxShadow:"0 4px 24px rgba(0,0,0,0.10)", borderRadius:4, fontFamily:"'Georgia','Times New Roman',serif" }}>

          <Section title="1. Capçalera" color="#1e3a8a">
            <table style={tblStyle}><tbody>
              <tr>
                <td style={{ ...td({ fontWeight:700, width:"22%", background:"#f1f5f9", color:"#374151" }) }}>Nº SdA</td>
                <td style={td()}>{data.num_sda || "—"}</td>
                <td style={{ ...td({ fontWeight:700, background:"#f1f5f9", color:"#374151", width:"22%" }) }}>Àmbit</td>
                <td style={td()}>{data.ambit || "—"}</td>
              </tr>
              <tr>
                <td style={{ ...td({ fontWeight:700, background:"#f1f5f9", color:"#374151" }) }}>Trimestre</td>
                <td style={td()}>{data.trimestre || "—"}</td>
                <td style={{ ...td({ fontWeight:700, background:"#f1f5f9", color:"#374151" }) }}>Sessions</td>
                <td style={td()}>{data.sessions || "—"}</td>
              </tr>
              <tr>
                <td style={{ ...td({ fontWeight:700, background:"#f1f5f9", color:"#374151" }) }}>Títol</td>
                <td colSpan={3} style={{ ...td({ fontWeight:700, fontSize:14, color:"#1e3a8a" }) }}>{data.titol || "—"}</td>
              </tr>
            </tbody></table>
          </Section>

          <Section title="2. Justificació i Producte Final" color="#1e40af">
            <p style={{ fontSize:12, lineHeight:1.7, marginBottom:12, color:"#374151" }}>{data.justificacio}</p>
            <table style={tblStyle}>
              <THead cols={["Producte Final Col·lectiu", "Producte Final Individual"]} bg="#2563eb" />
              <tbody><tr><td style={td()}>{data.producte_collectiu}</td><td style={td()}>{data.producte_individual}</td></tr></tbody>
            </table>
          </Section>

          <Section title="3. Marc Curricular" color="#1e40af">
            <table style={tblStyle}>
              <THead cols={["Àrea", "Competència Específica (CE)", "Criteri d'Avaluació (CA)", "Sabers Vinculats"]} bg="#2563eb" />
              <tbody>{(data.marc_curricular || []).map((row, i) => (
                <tr key={i} style={{ background: i%2===0 ? "white":"#f8fafc" }}>
                  <td style={{ ...td({ fontWeight:700, color:"#1e3a8a", width:"15%" }) }}>{row.area}</td>
                  <td style={td()}>{row.ce}</td>
                  <td style={td()}>{row.ca}</td>
                  <td style={td()}>{row.sabers}</td>
                </tr>
              ))}</tbody>
            </table>
          </Section>

          <Section title="4. Objectius d'Aprenentatge" color="#1e40af">
            <p style={{ fontSize:11, color:"#64748b", fontStyle:"italic", marginBottom:8 }}>En finalitzar la SdA, l'alumne serà capaç de:</p>
            <ul style={{ listStyle:"none", padding:0, margin:0 }}>
              {(data.objectius || []).map((o, i) => (
                <li key={i} style={{ display:"flex", gap:8, marginBottom:6, fontSize:12, lineHeight:1.5, color:"#374151" }}>
                  <span style={{ flexShrink:0, width:18, height:18, background:"#dbeafe", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#1e40af", marginTop:1 }}>{i+1}</span>
                  {o}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="5. Rúbrica de Gradació" color="#1e40af">
            <table style={tblStyle}>
              <THead cols={["Criteri d'Avaluació", "Satisfactori", "Notable", "Excel·lent"]} bg="#2563eb" />
              <tbody>{(data.rubrica || []).map((r, i) => (
                <tr key={i} style={{ background: i%2===0 ? "white":"#f8fafc" }}>
                  <td style={{ ...td({ fontWeight:700, color:"#1e3a8a", width:"22%" }) }}>{r.criteri}</td>
                  <td style={{ ...td({ color:"#713f12" }) }}>{r.satisfactori}</td>
                  <td style={{ ...td({ color:"#1e3a8a" }) }}>{r.notable}</td>
                  <td style={{ ...td({ color:"#065f46" }) }}>{r.excellent}</td>
                </tr>
              ))}</tbody>
            </table>
          </Section>

          <Section title="6. Seqüència Didàctica" color="#1e40af">
            <table style={tblStyle}>
              <THead cols={["Sessió", "Desenvolupament de l'Activitat", "Agrupament", "Temps", "Materials", "Instrument Avaluació"]} bg="#2563eb" />
              <tbody>{(data.sequencia || []).map((s, i) => (
                <tr key={i} style={{ background: i%2===0 ? "white":"#f8fafc" }}>
                  <td style={{ ...td({ fontWeight:700, textAlign:"center", color:"#1e3a8a", width:"7%" }) }}>{s.sessio}</td>
                  <td style={td()}>{s.activitat}</td>
                  <td style={{ ...td({ width:"11%", textAlign:"center" }) }}>{s.agrupament}</td>
                  <td style={{ ...td({ width:"9%", textAlign:"center" }) }}>{s.temps}</td>
                  <td style={{ ...td({ width:"14%" }) }}>{s.materials}</td>
                  <td style={{ ...td({ width:"14%" }) }}>{s.instrument}</td>
                </tr>
              ))}</tbody>
            </table>
          </Section>

          <Section title="7. Connexions" color="#374151">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>ODS Vinculats</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {(data.ods || []).map((o, i) => (
                    <span key={i} style={{ padding:"3px 8px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:20, fontSize:11, color:"#475569" }}>{o}</span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>Relació amb altres Àrees</div>
                <div style={{ fontSize:12, color:"#374151", lineHeight:1.6 }}>{data.connexions_arees}</div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ─── SdA → TEXT ──────────────────────────────────────────────────────────────
function sdaToText(data) {
  if (!data) return "";
  let t = `SITUACIÓ D'APRENENTATGE\n${"═".repeat(60)}\n\n`;
  t += `1. CAPÇALERA\n${"-".repeat(40)}\n`;
  t += `Nº SdA: ${data.num_sda||"—"} | Àmbit: ${data.ambit||"—"} | Trimestre: ${data.trimestre||"—"} | Sessions: ${data.sessions||"—"}\n`;
  t += `Títol: ${data.titol}\n\n`;
  t += `2. JUSTIFICACIÓ I PRODUCTE FINAL\n${"-".repeat(40)}\n${data.justificacio}\n`;
  t += `Producte Col·lectiu: ${data.producte_collectiu}\nProducte Individual: ${data.producte_individual}\n\n`;
  t += `3. MARC CURRICULAR\n${"-".repeat(40)}\n`;
  (data.marc_curricular||[]).forEach(r => { t += `Àrea: ${r.area}\nCE: ${r.ce}\nCA: ${r.ca}\nSabers: ${r.sabers}\n\n`; });
  t += `4. OBJECTIUS D'APRENENTATGE\n${"-".repeat(40)}\nEn finalitzar la SdA, l'alumne serà capaç de:\n`;
  (data.objectius||[]).forEach((o,i) => { t += `  ${i+1}. ${o}\n`; });
  t += `\n5. RÚBRICA DE GRADACIÓ\n${"-".repeat(40)}\n`;
  (data.rubrica||[]).forEach(r => { t += `Criteri: ${r.criteri}\n  Satisfactori: ${r.satisfactori}\n  Notable: ${r.notable}\n  Excel·lent: ${r.excellent}\n\n`; });
  t += `6. SEQÜÈNCIA DIDÀCTICA\n${"-".repeat(40)}\n`;
  (data.sequencia||[]).forEach(s => { t += `Sessió ${s.sessio}: ${s.activitat}\n  Agrupament: ${s.agrupament} | Temps: ${s.temps} | Materials: ${s.materials} | Instrument: ${s.instrument}\n\n`; });
  t += `7. CONNEXIONS\n${"-".repeat(40)}\nODS: ${(data.ods||[]).join(", ")}\nRelació amb àrees: ${data.connexions_arees}\n`;
  return t;
}

// ─── SdA JSON PROMPT ─────────────────────────────────────────────────────────
const SDA_SCHEMA = `{
  "num_sda": "01",
  "ambit": "àmbit principal",
  "trimestre": "1r Trimestre",
  "sessions": 6,
  "titol": "títol de la SdA",
  "justificacio": "justificació de 2-3 frases",
  "producte_collectiu": "producte col·lectiu",
  "producte_individual": "producte individual",
  "marc_curricular": [{"area": "Català", "ce": "CE 1.1: ...", "ca": "CA 1.1.1: ...", "sabers": "sabers vinculats"}],
  "objectius": ["objectiu 1", "objectiu 2", "objectiu 3"],
  "rubrica": [{"criteri": "criteri 1", "satisfactori": "...", "notable": "...", "excellent": "..."}, {"criteri": "criteri 2", "satisfactori": "...", "notable": "...", "excellent": "..."}, {"criteri": "criteri 3", "satisfactori": "...", "notable": "...", "excellent": "..."}],
  "sequencia": [{"sessio": 1, "activitat": "descripció", "agrupament": "Gran grup", "temps": "50 min", "materials": "materials", "instrument": "observació"}],
  "ods": ["ODS 4: Educació de qualitat"],
  "connexions_arees": "connexions amb altres àrees"
}`;

// ═══════════════════════════════════════════════════════════════════
// ─── TAB 1: REUNIONS ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
function ReunionsTab({ onToast, onApiKeyError }) {
  const [tipus, setTipus] = usePersistedState("reun_tipus", null);
  const [form, setForm] = usePersistedState("reun_form", { data:"", objectiu:"", assistents:"", temes:"", acords:"", aspectes:"" });
  const [tasques, setTasques] = usePersistedState("reun_tasques", [emptyTasca()]);
  const [result, setResult] = usePersistedState("reun_result", "");
  const [loading, setLoading] = useState(false);
  const [copyModal, setCopyModal] = useState(false);

  const sf = (k, v) => setForm(f => ({ ...f, [k]:v }));
  const tipusInfo = TIPUS_REUNIO.find(t => t.id === tipus);
  const esFamilies = tipus === "families";
  const canGen = tipus && form.temes && (!esFamilies || form.aspectes);

  const addTasca = () => setTasques(t => [...t, emptyTasca()]);
  const delTasca = i => setTasques(t => t.filter((_, j) => j !== i));
  const setT = (i, k, v) => setTasques(t => t.map((r, j) => j===i ? {...r, [k]:v} : r));

  const generar = async () => {
    setLoading(true); setResult("");
    try {
      const tBon = tasques.filter(t => t.que);
      const PROHIBIT = `
PROHIBIT absolutament:
- Cap símbol markdown: ni #, ni **, ni *, ni _, ni ---, ni ___
- Cap "Codi de document" ni codis alfanumèrics
- Cap "Modalitat: Presencial" ni cap camp similar
- Cap línia de signatures ni guions per signar
- Cap peu de pàgina ni "Document generat el..."
- Cap fórmula de tancament ("I no havent-hi més assumptes...", etc.)
- Cap títol amb ## ni cap format de llista amb *
Escriu text pla, net, directament llegible.`;

      const toConfig = {
        families: {
          system: `Ets un tutor/a de primària que escriu notes de reunions amb famílies. To proper, clar i directe. Frases curtes. Vocabulari entenedor. Mai inventes dades.${PROHIBIT}`,
          instruccions: `Escriu una nota de reunió amb to proper i directe. Text pla.\nEstructura:\n- Data i qui hi era (una línia)\n- Aspectes positius de l'alumne/a (primer i destacats)\n- Temes tractats, explicats de manera natural\n- Acords, en punts curts i clars\n${tBon.length ? "- Tasques pendents: qui fa què i per quan" : ""}`,
        },
        cicle: {
          system: `Ets un coordinador/a de cicle que escriu actes de reunions internes. To professional i directe. Frases clares. Mai inventes dades.${PROHIBIT}`,
          instruccions: `Escriu l'acta de la reunió de cicle. Text pla.\nEstructura:\n- Data, assistents i objectiu (breu)\n- Punts tractats, de manera clara i concisa\n- Acords i decisions, numerats\n${tBon.length ? "- Tasques pendents amb responsable i termini" : ""}`,
        },
        claustre: {
          system: `Ets un/a secretari/a de centre que escriu actes de claustre. To professional i accessible. Frases directes. Mai inventes dades.${PROHIBIT}`,
          instruccions: `Escriu l'acta del claustre. Text pla.\nEstructura:\n- Data, assistents i ordre del dia (breu)\n- Cada punt de l'ordre del dia, explicat clarament\n- Acords adoptats, numerats\n${tBon.length ? "- Tasques i responsables" : ""}`,
        },
        professionals: {
          system: `Ets un/a mestre/a que escriu notes de reunions amb professionals externs. To professional i proper. Clar i concret. Mai inventes dades.${PROHIBIT}`,
          instruccions: `Escriu la nota de reunió amb professional extern. Text pla.\nEstructura:\n- Data, qui hi era i motiu (breu)\n- Informació i valoracions compartides, de manera clara\n- Acords i passos a seguir, en punts\n${tBon.length ? "- Tasques concretes amb responsable i termini" : ""}`,
        },
      };

      const cfg = toConfig[tipus] || toConfig.cicle;
      resetAnon();
      const anonAssistents = anonymize(form.assistents || "").anon;
      const anonTemes      = anonymize(form.temes || "").anon;
      const anonAcords     = anonymize(form.acords || "").anon;
      const anonAspectes   = anonymize(form.aspectes || "").anon;
      const anonTasques    = tBon.map(t => ({
        que: anonymize(t.que).anon,
        qui: anonymize(t.qui).anon,
        quan: t.quan
      }));

      const prompt = `${cfg.instruccions}

Dades de la reunió:
- Data: ${form.data || "No especificada"}
- Objectiu: ${form.objectiu || "No especificat"}
- Assistents: ${anonAssistents || "No especificats"}
- Temes tractats: ${anonTemes}
- Acords i decisions: ${anonAcords || "No especificats"}
${esFamilies && anonAspectes ? `- Aspectes positius de l'alumne/a: ${anonAspectes}` : ""}
${anonTasques.length ? `- Tasques pendents:\n${anonTasques.map((t,i) => `  ${i+1}. ${t.que} | Responsable: ${t.qui || "Per determinar"} | Termini: ${t.quan || "Per determinar"}`).join("\n")}` : ""}`;

      const raw = await gemini(cfg.system, prompt, 1400);
      setResult(cleanActa(restoreAnon(raw)));
    } catch(e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); return; }
      setResult("Error de connexió. Torna-ho a intentar.");
    }
    setLoading(false);
  };

  return (
    <div>
      <PrivacyBanner />
      <div style={{ marginBottom:20 }}>
        <SecLabel icon={ClipboardList} label="Tipus de reunió" color="#6366f1" />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
          {TIPUS_REUNIO.map(t => {
            const c = COL[t.color]; const sel = tipus===t.id; const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => { setTipus(t.id); setResult(""); }}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 14px", borderRadius:11,
                  cursor:"pointer", fontFamily:"inherit", textAlign:"left", transition:"all 0.15s",
                  border:sel ? `2px solid ${c.btn}` : "1.5px solid #e2e8f0",
                  background:sel ? c.bg : "white", boxShadow:sel ? `0 0 0 3px ${c.pill}` : "none" }}>
                <div style={{ width:34, height:34, borderRadius:8, background:sel?c.pill:"#f1f5f9",
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Icon size={16} color={sel?c.btn:"#94a3b8"} />
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:sel?c.text:"#374151" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tipus && (() => {
        const c = COL[tipusInfo.color];
        return (
          <div style={{ background:"white", border:`1.5px solid ${c.border}`, borderRadius:14,
            padding:"1.25rem", marginBottom:16, borderTop:`4px solid ${c.btn}` }}>
            <SecLabel icon={FileText} label="Dades de la reunió" color={c.btn} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:12, marginBottom:14 }}>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Data</label>
                <Inp type="date" value={form.data} onChange={v => sf("data", v)} />
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Objectiu de la reunió</label>
                <Inp value={form.objectiu} onChange={v => sf("objectiu", v)} placeholder="Per exemple: fer seguiment acadèmic i emocional" />
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Assistents</label>
              <Inp value={form.assistents} onChange={v => sf("assistents", v)}
                placeholder={esFamilies ? "Ex: Tutora Sra. P., mare Sra. G., pare Sr. L." : "Ex: Directora, mestres de cicle, orientadora"} />
            </div>
            {esFamilies && (
              <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:11, padding:"13px 14px", marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#15803d", marginBottom:5 }}>
                  ⭐ Aspectes positius de l'alumne/a <span style={{ color:"#e11d48" }}>*</span>
                </label>
                <p style={{ fontSize:11, color:"#16a34a", marginBottom:8 }}>Camp obligatori. Inicieu sempre destacant els punts forts de l'alumne/a.</p>
                <Txa value={form.aspectes} onChange={v => sf("aspectes", v)} rows={3}
                  placeholder="Ex: Molt participatiu/va, gran esforç en matemàtiques, actitud excel·lent..." />
              </div>
            )}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:3 }}>Temes tractats</label>
              <p style={{ fontSize:11, color:"#94a3b8", marginBottom:5 }}>Escriu lliurement les notes — la IA les redactarà en prosa formal.</p>
              <Txa value={form.temes} onChange={v => sf("temes", v)} rows={5}
                placeholder="Ex: rendiment àrees, comportament, relació iguals, aspectes a millorar..." />
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Acords i decisions</label>
              <Txa value={form.acords} onChange={v => sf("acords", v)} rows={3}
                placeholder="Ex: Es pactarà 15 min de lectura diària. Es revisarà en la propera reunió trimestral." />
            </div>
            <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:11, padding:"14px", marginBottom:18 }}>
              <SecLabel icon={ListChecks} label="Seguiment: Tasques Pendents" color="#64748b" />
              <div style={{ display:"grid", gridTemplateColumns:"2.2fr 1.1fr 1.1fr 32px", gap:7, marginBottom:7 }}>
                {["Què s'ha de fer","Qui ho fa","Per quan",""].map((h,i) => (
                  <span key={i} style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</span>
                ))}
              </div>
              {tasques.map((t,i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"2.2fr 1.1fr 1.1fr 32px", gap:7, marginBottom:7, alignItems:"center" }}>
                  <Inp value={t.que} onChange={v => setT(i,"que",v)} placeholder="Ex: Consultar especialista" />
                  <Inp value={t.qui} onChange={v => setT(i,"qui",v)} placeholder="Ex: Tutora" />
                  <Inp type="date" value={t.quan} onChange={v => setT(i,"quan",v)} />
                  <button onClick={() => delTasca(i)} disabled={tasques.length===1}
                    style={{ width:32, height:36, borderRadius:7, border:"1.5px solid #fca5a5", background:"white",
                      cursor:tasques.length===1?"not-allowed":"pointer", opacity:tasques.length===1?0.3:1,
                      display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Trash2 size={13} color="#dc2626" />
                  </button>
                </div>
              ))}
              <Btn size="sm" onClick={addTasca}><Plus size={12} /> Afegir tasca</Btn>
            </div>
            <Btn variant="primary" full onClick={generar} disabled={loading || !canGen}>
              {loading ? <><Spinner /> Redactant l'acta...</> : <><Wand2 size={14} /> Generar Acta Formal</>}
            </Btn>
            {!canGen && !loading && (
              <p style={{ fontSize:12, color:"#94a3b8", textAlign:"center", marginTop:8 }}>
                {!form.temes ? "Omple els temes tractats per continuar." : "El camp 'Aspectes positius' és obligatori per a reunions amb famílies."}
              </p>
            )}
          </div>
        );
      })()}

      {loading && <Loading text="Redactant l'acta formal en català acadèmic..." />}
      <AnonBadge active={!!result} />
      <ActaDocView text={result} onCopyModal={() => setCopyModal(true)}
        onDownload={() => downloadTxt(result, `acta_${tipus}_${form.data||"data"}`)} />
      {copyModal && <CopyModal text={result} onClose={() => setCopyModal(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ─── TAB 2: SdA ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

const AREES_SDC = [
  "Medi Natural, Social i Cultural", "Català", "Castellà", "Anglès",
  "Matemàtiques", "Artística", "Educació Física", "Valors Cívics i Ètics"
];
const TRIMESTRES_SDC = ["1r Trimestre", "2n Trimestre", "3r Trimestre"];
const CURSOS_SDC = [
  { id: "1r", label: "1r de Primària", cicle: "inicial",  edat: "6-7 anys" },
  { id: "2n", label: "2n de Primària", cicle: "inicial",  edat: "7-8 anys" },
  { id: "3r", label: "3r de Primària", cicle: "mitjà",    edat: "8-9 anys" },
  { id: "4t", label: "4t de Primària", cicle: "mitjà",    edat: "9-10 anys" },
  { id: "5è", label: "5è de Primària", cicle: "superior", edat: "10-11 anys" },
  { id: "6è", label: "6è de Primària", cicle: "superior", edat: "11-12 anys" },
];

// Helpers per parsejar les respostes del Creador SdA
function tag_SDC(text, nom) {
  const re = new RegExp(`<${nom}>([\\s\\S]*?)<\\/${nom}>`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

function netejarMd_SDC(text) {
  if (!text) return "";
  return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/__(.*?)__/g, "$1").trim();
}

function SdACreador({ onToast, onApiKeyError }) {
  const [titol, setTitol]         = usePersistedState("sda_titol", "");
  const [fil, setFil]             = usePersistedState("sda_fil", "");
  const [trimestre, setTrimestre] = usePersistedState("sda_trimestre", "1r Trimestre");
  const [curs, setCurs]           = usePersistedState("sda_curs", "3r");
  const [sessions, setSessions]   = usePersistedState("sda_sessions", "6");
  const [arees, setArees]         = usePersistedState("sda_arees", []);
  const [data, setData]           = usePersistedState("sda_data", null);
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState("");
  const [error, setError]         = useState("");

  const toggleArea = a => setArees(prev =>
    prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
  );
  const numSessions = Math.min(parseInt(sessions) || 6, 12);

  async function generar() {
    if (!titol || !fil || arees.length === 0) return;
    setLoading(true); setError(""); setData(null);

    try {
      const cursObj = CURSOS_SDC.find(c => c.id === curs) || CURSOS_SDC[2];
      const base = `SdA: "${titol}" | Fil conductor: "${fil}" | Curs: ${cursObj.label} (cicle ${cursObj.cicle}, ${cursObj.edat}) | ${trimestre} | ${numSessions} sessions | Àrees: ${arees.join(", ")}

IMPORTANT: Adapta TOT el contingut (vocabulari, complexitat, productes, activitats, criteris d'avaluació) al nivell de ${cursObj.label} (${cursObj.edat}). Les activitats han de ser apropiades per al cicle ${cursObj.cicle}.`;

      const sessDesenv = numSessions - 2;

      // Grup 1: Capçalera + Marc competencial (en paral·lel)
      setProgress("Generant capçalera i marc competencial... (1/3)");
      const [raw1, raw1b] = await Promise.all([
        geminiSDC(`Ets expert LOMLOE primària Catalunya. ${base}

Genera EXACTAMENT aquest format d'etiquetes XML, amb contingut real:

<ambit>àmbit principal (ex: Científic i Tecnològic, Comunicatiu i Artístic, etc.)</ambit>
<justificacio>2-3 frases que justifiquen pedagògicament la SdA, contextualitzen el repte i expliquen la rellevància de l'aprenentatge</justificacio>
<producte_final>descripció detallada del producte final que crearan els alumnes (ex: maqueta, vídeo explicatiu, exposició, llibre digital...)</producte_final>
<metodologia>descripció de la metodologia (aprenentatge cooperatiu, indagació científica, ABP, etc.) amb detalls sobre l'organització</metodologia>
`, 800),

        geminiSDC(`Ets expert LOMLOE primària Catalunya. Per la SdA "${titol}" (fil: "${fil}") amb àrees: ${arees.join(", ")}, genera el MARC COMPETENCIAL OFICIAL LOMLOE.

IMPORTANT: usa les competències específiques i criteris d'avaluació REALS del currículum LOMLOE català per a les àrees indicades. Genera ENTRE 3 I 5 ENTRADES, una per cada combinació rellevant àrea-competència.

FORMAT EXACTE (respecta els prefixos CE:, CA: i SABERS: a cada línia):

<marc>
CE: CE 2.2 (Medi): Plantejar-se preguntes sobre el món aplicant el pensament científic per interpretar fets del medi natural i social
CA: CA 2.2.3: Dissenyar i realitzar experiments senzills, emprant instruments i dispositius adequats, per respondre les preguntes plantejades
SABERS: Selecció de tècniques d'indagació adequades a l'objecte d'estudi. Utilització d'instruments senzills de mesura. Vocabulari científic bàsic. Treball cooperatiu en l'experimentació.
---
CE: CE 1.2 (Català): Comprendre i interpretar textos orals i multimodals identificant el sentit general i la informació rellevant
CA: CA 1.2.1: Comprendre textos orals senzills procedents de diversos àmbits i suports
SABERS: Estratègies de comprensió oral. Vocabulari específic del tema treballat. Identificació de les idees principals.
</marc>

Ara genera el MARC competencial REAL per la SdA "${titol}" amb les àrees ${arees.join(", ")}. Respecta exactament el format: cada entrada amb CE:, CA: i SABERS:, separades per "---". MÍNIM 3 ENTRADES.`, 1800),
      ]);

      // Grup 2: Objectius + Activitats inicials i síntesi (en paral·lel)
      setProgress("Generant objectius i activitats inicials... (2/3)");
      const [raw2, raw3] = await Promise.all([
        geminiSDC(`Ets expert LOMLOE primària Catalunya. ${base}

Genera 3 objectius d'aprenentatge amb CRITERI D'AVALUACIÓ i GRADACIÓ completa.
IMPORTANT: omple TOTS els camps N1, N2, N3 amb text real i concret, no deixis cap camp buit.

Format EXACTE:
<objectius>
OBJ: Identificar les propietats dels estats de la matèria a través de l'experimentació
CA: 2.3
CRITERI: Dissenyar i realitzar experiments senzills per respondre preguntes sobre la matèria
N1: Sap identificar alguns estats de la matèria però li costa relacionar-los amb les seves propietats i necessita suport constant de l'adult
N2: Identifica els estats de la matèria i les seves propietats principals però no sempre utilitza el vocabulari científic adequat
N3: Identifica amb precisió tots els estats de la matèria, les seves propietats i utilitza el vocabulari científic adequat en tot moment
---
OBJ: Presentar els resultats de les investigacions de forma clara i ordenada
CA: 2.5
CRITERI: Presentar els resultats utilitzant formats diversos i llenguatge científic acurat
N1: Presenta alguns resultats però l'organització és poc clara i utilitza poc el vocabulari específic
N2: Presenta els resultats de manera organitzada però no sempre utilitza el llenguatge científic adequat
N3: Presenta els resultats de manera clara, organitzada i amb el vocabulari científic adequat en tot moment
</objectius>

Ara genera 3 objectius propis per la SdA "${titol}" seguint exactament aquest format.`, 1400),

        geminiSDC(`Ets expert LOMLOE primària Catalunya. ${base}

Genera les activitats INICIALS (1a sessió) i de SÍNTESI (última sessió) per la SdA "${titol}".

FORMAT EXACTE:
<inicials>
ACT: Activitat 1 - Sessió 1
DESC: Introducció de la SdA a través d'una pregunta provocadora o experiment sorpresa per activar coneixements previs.
AGRUPAMENT: Gran grup - Aula
TEMPS: 30 min
MATERIALS: Pissarra digital, materials per a l'experiment introductori
AVALUACIO: Registre oral de coneixements previs a la pissarra
---
ACT: Activitat 2 - Sessió 1
DESC: Presentació de la SdA: objectius, producte final, organització de grups i presentació de la rúbrica d'avaluació.
AGRUPAMENT: Gran grup - Aula
TEMPS: 30 min
MATERIALS: Dossier de l'alumne, rúbrica d'avaluació
AVALUACIO: Autoavaluació inicial
</inicials>
<sintesi>
ACT: Activitat final - Sessió ${numSessions}
DESC: Presentació del producte final per part de cada grup, debat conjunt sobre els aprenentatges i avaluació.
AGRUPAMENT: Individual i gran grup - Aula
TEMPS: 60 min
MATERIALS: Rúbrica d'autoavaluació, producte final de cada grup
AVALUACIO: Rúbrica d'avaluació i autoavaluació
</sintesi>

Ara genera les activitats INICIALS i de SÍNTESI REALS per "${titol}" amb el mateix format.`, 1400),
      ]);

      // Grup 3: Desenvolupament
      setProgress("Generant sessions de desenvolupament... (3/3)");
      const raw4 = await geminiSDC(`Ets expert LOMLOE primària Catalunya. ${base}

Genera activitats de DESENVOLUPAMENT per cobrir les sessions 2 a ${numSessions - 1} (total: ${sessDesenv} sessions) per la SdA "${titol}".

FORMAT EXACTE:
<desenvolupament>
ACT: Activitat 3 - Sessions 2 i 3
DESC: Els alumnes formen grups de 4 i cada grup tria una pregunta d'investigació. Recullen hipòtesis i dissenyen un experiment senzill per validar-les.
AGRUPAMENT: Petit grup (4 alumnes) - Aula i laboratori
TEMPS: 120 min (2 sessions)
MATERIALS: Material de laboratori, diari científic, tauleta per cercar informació
AVALUACIO: Observació directa, diari científic, rúbrica de treball cooperatiu
---
ACT: Activitat 4 - Sessions 4 i 5
DESC: Cada grup analitza els resultats obtinguts, els compara amb les hipòtesis inicials i extreu conclusions.
AGRUPAMENT: Petit grup - Aula
TEMPS: 120 min (2 sessions)
MATERIALS: Tauletes, plantilles de presentació, diari científic
AVALUACIO: Rúbrica d'avaluació, autoavaluació
</desenvolupament>

Ara genera les activitats REALS per "${titol}" distribuint les ${sessDesenv} sessions. Màxim 3-4 activitats en total.`, 1500);

      // Parseig marc competencial
      const marcBloc = tag_SDC(raw1b, "marc");
      const marc = marcBloc ? marcBloc.split("---").map(bloc => {
        const lines = bloc.trim().split("\n").filter(l => l.trim());
        const get = (...prefixes) => {
          for (const p of prefixes) {
            const l = lines.find(l => l.trim().toUpperCase().startsWith(p.toUpperCase()));
            if (l) return l.replace(new RegExp("^" + p, "i"), "").replace(/^[:\s]+/, "").trim();
          }
          return "";
        };
        return {
          ce: get("CE:", "COMPETÈNCIA:", "COMPETENCIA:"),
          ca: get("CA:", "CRITERI:", "CRITERI D'AVALUACIÓ:"),
          sabers: get("SABERS:", "SABERES:", "SABERS VINCULATS:")
        };
      }).filter(r => r.ce || r.ca) : [];

      // Parseig objectius
      const objBloc = tag_SDC(raw2, "objectius");
      const objectius = objBloc ? objBloc.split("---").map(bloc => {
        const lines = bloc.trim().split("\n").filter(l => l.trim());
        const get = (...prefixes) => {
          for (const p of prefixes) {
            const l = lines.find(l => l.trim().toUpperCase().startsWith(p.toUpperCase()));
            if (l) return l.replace(new RegExp("^" + p, "i"), "").replace(/^[:\s]+/, "").trim();
          }
          return "";
        };
        return {
          obj: get("OBJ:", "OBJECTIU:"),
          ca: get("CA:"),
          criteri: get("CRITERI:", "CRITERI D'AVALUACIÓ:"),
          n1: get("N1:", "N1 SATISFACTORI:", "SATISFACTORI:"),
          n2: get("N2:", "N2 NOTABLE:", "NOTABLE:"),
          n3: get("N3:", "N3 EXCEL·LENT:", "EXCEL·LENT:", "EXCELLENT:")
        };
      }).filter(r => r.obj) : [];

      // Parseig activitats
      function parseActs(raw, tagNom) {
        const bloc = tag_SDC(raw, tagNom);
        if (!bloc) return [];
        return bloc.split("---").map(b => {
          const lines = b.trim().split("\n").filter(l => l.trim());
          const get = (...prefixes) => {
            for (const p of prefixes) {
              const l = lines.find(l => l.trim().toUpperCase().startsWith(p.toUpperCase()));
              if (l) return l.replace(new RegExp("^" + p, "i"), "").replace(/^[:\s]+/, "").trim();
            }
            return "";
          };
          const act = get("ACT:", "ACTIVITAT:", "NOM:");
          const desc = get("DESC:", "DESCRIPCIÓ:", "DESCRIPCION:", "ACTIVITAT:", "DESENVOLUPAMENT:");
          return {
            act: act || lines[0] || "",
            desc: desc || lines[1] || "",
            agrupament: get("AGRUPAMENT:", "AGRUPAMIENTO:", "GRUP:"),
            temps: get("TEMPS:", "TIEMPO:", "DURADA:", "DURACIÓN:"),
            materials: get("MATERIALS:", "MATERIAL:", "RECURSOS:"),
            avaluacio: get("AVALUACIO:", "AVALUACIÓ:", "AVALUACION:", "INSTRUMENT:")
          };
        }).filter(a => a.act || a.desc);
      }

      setData({
        titol, ambit: tag_SDC(raw1, "ambit"), trimestre, sessions: numSessions,
        curs: cursObj.label,
        justificacio: tag_SDC(raw1, "justificacio"),
        producte_final: tag_SDC(raw1, "producte_final"),
        metodologia: tag_SDC(raw1, "metodologia"),
        marc,
        objectius,
        acts_inicials: parseActs(raw3, "inicials"),
        acts_desenv: parseActs(raw4, "desenvolupament"),
        acts_sintesi: parseActs(raw3, "sintesi"),
      });

    } catch (e) {
      console.error("SdA error:", e);
      if (isApiKeyError(e)) { onApiKeyError(e.message); setLoading(false); setProgress(""); return; }
      setError(`${progress || "Error"}: ${e.message || "Error desconegut"}`);
    }
    setProgress(""); setLoading(false);
  }

  const canGen = titol && fil && curs && arees.length > 0 && !loading;

  const thStyle = { background:"#1e3a8a", color:"white", padding:"8px 10px", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #1e40af" };
  const tdStyle = { padding:"8px 10px", fontSize:12, border:"1px solid #e2e8f0", verticalAlign:"top", lineHeight:1.6 };
  const tdGrey  = { ...tdStyle, background:"#f8fafc", fontWeight:700, color:"#374151", width:"18%" };

  return (
    <div>
      <PrivacyBanner />
      <div style={{ background:"white", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"1.25rem", marginBottom:16, fontFamily:"system-ui" }}>
        <div style={{ marginBottom:12 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:5 }}>Títol de la SdA</label>
          <input value={titol} onChange={e => setTitol(e.target.value)} placeholder="Ex: Els estats de la matèria"
            style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, outline:"none" }} />
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:5 }}>Fil conductor / Repte</label>
          <textarea value={fil} onChange={e => setFil(e.target.value)} rows={2}
            placeholder="Ex: Com podem descobrir les propietats de la matèria experimentant?"
            style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, outline:"none", resize:"vertical" }} />
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:8 }}>Curs</label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:6 }}>
            {CURSOS_SDC.map(c => {
              const sel = curs === c.id;
              return (
                <button key={c.id} onClick={() => setCurs(c.id)} style={{
                  padding:"8px 4px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"system-ui",
                  border: sel ? "1.5px solid #1e3a8a" : "1.5px solid #e2e8f0",
                  background: sel ? "#dbeafe" : "white",
                  color: sel ? "#1e3a8a" : "#64748b",
                }}>{c.id}</button>
              );
            })}
          </div>
          {curs && (
            <p style={{ fontSize:11, color:"#64748b", marginTop:6 }}>
              {CURSOS_SDC.find(c => c.id === curs)?.label} · Cicle {CURSOS_SDC.find(c => c.id === curs)?.cicle} · {CURSOS_SDC.find(c => c.id === curs)?.edat}
            </p>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:5 }}>Trimestre</label>
            <select value={trimestre} onChange={e => setTrimestre(e.target.value)}
              style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13 }}>
              {TRIMESTRES_SDC.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:5 }}>Nº Sessions</label>
            <input type="number" min="3" max="12" value={sessions} onChange={e => setSessions(e.target.value)}
              style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, outline:"none" }} />
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:8 }}>Àrees curriculars</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {AREES_SDC.map(a => {
              const sel = arees.includes(a);
              return <button key={a} onClick={() => toggleArea(a)} style={{
                padding:"6px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600,
                border:sel?"1.5px solid #1e3a8a":"1.5px solid #e2e8f0",
                background:sel?"#dbeafe":"white", color:sel?"#1e3a8a":"#64748b",
              }}>{a}</button>;
            })}
          </div>
        </div>
        <button onClick={generar} disabled={!canGen} style={{
          width:"100%", padding:"12px", borderRadius:10, border:"none",
          background:canGen?"#1e3a8a":"#e2e8f0", color:canGen?"white":"#94a3b8",
          fontSize:14, fontWeight:700, cursor:canGen?"pointer":"not-allowed", fontFamily:"system-ui",
        }}>
          {loading ? `⏳ ${progress}` : "✨ Generar SdA Completa (Format LOMLOE)"}
        </button>
      </div>

      {error && (
        <div style={{ background:"#fff5f5", border:"1.5px solid #fca5a5", borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#b91c1c", fontFamily:"system-ui" }}>
          ⚠️ <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <div id="sda-doc" style={{ background:"white" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:12 }}>
            <tbody>
              <tr>
                <td style={tdGrey}>Nº SdA</td>
                <td style={tdStyle}>01</td>
                <td style={tdGrey}>Àmbit</td>
                <td style={tdStyle}>{data.ambit}</td>
                <td style={tdGrey}>Àrea</td>
                <td style={tdStyle}>{arees.join(", ")}</td>
              </tr>
              <tr>
                <td style={tdGrey}>Curs</td>
                <td style={tdStyle}>{data.curs}</td>
                <td style={tdGrey}>Trimestre</td>
                <td style={tdStyle}>{data.trimestre}</td>
                <td style={tdGrey}>Nº Sessions</td>
                <td style={tdStyle}>{data.sessions}</td>
              </tr>
              <tr>
                <td style={tdGrey}>Títol</td>
                <td colSpan={5} style={{ ...tdStyle, fontWeight:700, fontSize:14, color:"#1e3a8a" }}>{data.titol}</td>
              </tr>
              <tr>
                <td style={tdGrey}>Justificació</td>
                <td colSpan={5} style={tdStyle}>{data.justificacio}</td>
              </tr>
              <tr>
                <td style={tdGrey}>Producte Final</td>
                <td colSpan={5} style={tdStyle}>{data.producte_final}</td>
              </tr>
              <tr>
                <td style={tdGrey}>Metodologia</td>
                <td colSpan={5} style={tdStyle}>{data.metodologia}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Competència Específica (CE)</th>
                <th style={thStyle}>Criteri d'Avaluació (CA)</th>
                <th style={thStyle}>Sabers Vinculats</th>
              </tr>
            </thead>
            <tbody>
              {data.marc.map((r, i) => (
                <tr key={i} style={{ background: i%2===0?"white":"#f8fafc" }}>
                  <td style={tdStyle}>{r.ce}</td>
                  <td style={tdStyle}>{r.ca}</td>
                  <td style={tdStyle}>{r.sabers}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:12 }}>
            <thead>
              <tr>
                <th style={thStyle}>CA</th>
                <th style={thStyle}>Objectiu d'Aprenentatge</th>
                <th style={thStyle}>Criteri d'Avaluació UD</th>
                <th style={{ ...thStyle, background:"#b45309" }}>N1 Satisfactori</th>
                <th style={{ ...thStyle, background:"#1565c0" }}>N2 Notable</th>
                <th style={{ ...thStyle, background:"#2e7d32" }}>N3 Excel·lent</th>
              </tr>
            </thead>
            <tbody>
              {data.objectius.map((o, i) => (
                <tr key={i} style={{ background: i%2===0?"white":"#f8fafc" }}>
                  <td style={{ ...tdStyle, fontWeight:700, color:"#1e3a8a", width:"5%" }}>{o.ca}</td>
                  <td style={{ ...tdStyle, width:"18%" }}>{o.obj}</td>
                  <td style={{ ...tdStyle, width:"20%", fontStyle:"italic", color:"#475569" }}>{o.criteri}</td>
                  <td style={{ ...tdStyle, background:"#fffbeb" }}>{o.n1}</td>
                  <td style={{ ...tdStyle, background:"#eff6ff" }}>{o.n2}</td>
                  <td style={{ ...tdStyle, background:"#f0fdf4" }}>{o.n3}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:12 }}>
            <thead>
              <tr>
                <th colSpan={6} style={{ ...thStyle, textAlign:"center", fontSize:13 }}>SEQÜÈNCIA D'ACTIVITATS</th>
              </tr>
              <tr>
                <th style={{ ...thStyle, background:"#1e40af", width:"5%" }}>Fase</th>
                <th style={{ ...thStyle, background:"#1e40af", width:"18%" }}>Activitat / Sessió</th>
                <th style={{ ...thStyle, background:"#1e40af" }}>Desenvolupament</th>
                <th style={{ ...thStyle, background:"#1e40af", width:"12%" }}>Agrupament</th>
                <th style={{ ...thStyle, background:"#1e40af", width:"8%" }}>Temps</th>
                <th style={{ ...thStyle, background:"#1e40af", width:"15%" }}>Avaluació</th>
              </tr>
            </thead>
            <tbody>
              {data.acts_inicials.map((a, i) => (
                <tr key={`ini_${i}`} style={{ background:"#fefce8" }}>
                  {i === 0 && <td rowSpan={data.acts_inicials.length} style={{ ...tdStyle, fontWeight:700, color:"#92400e", textAlign:"center", background:"#fef3c7", width:"5%" }}>Inicials</td>}
                  <td style={{ ...tdStyle, fontWeight:700 }}>{a.act}</td>
                  <td style={tdStyle}>{a.desc}</td>
                  <td style={tdStyle}>{a.agrupament}</td>
                  <td style={tdStyle}>{a.temps}</td>
                  <td style={tdStyle}>{a.avaluacio}</td>
                </tr>
              ))}
              {data.acts_desenv.map((a, i) => (
                <tr key={`dev_${i}`} style={{ background:"white" }}>
                  {i === 0 && <td rowSpan={data.acts_desenv.length} style={{ ...tdStyle, fontWeight:700, color:"#1e3a8a", textAlign:"center", background:"#eff6ff", width:"5%" }}>Desenvol.</td>}
                  <td style={{ ...tdStyle, fontWeight:700 }}>{a.act}</td>
                  <td style={tdStyle}>{a.desc}</td>
                  <td style={tdStyle}>{a.agrupament}</td>
                  <td style={tdStyle}>{a.temps}</td>
                  <td style={tdStyle}>{a.avaluacio}</td>
                </tr>
              ))}
              {data.acts_sintesi.map((a, i) => (
                <tr key={`sin_${i}`} style={{ background:"#f0fdf4" }}>
                  {i === 0 && <td rowSpan={data.acts_sintesi.length} style={{ ...tdStyle, fontWeight:700, color:"#166534", textAlign:"center", background:"#dcfce7", width:"5%" }}>Síntesi</td>}
                  <td style={{ ...tdStyle, fontWeight:700 }}>{a.act}</td>
                  <td style={tdStyle}>{a.desc}</td>
                  <td style={tdStyle}>{a.agrupament}</td>
                  <td style={tdStyle}>{a.temps}</td>
                  <td style={tdStyle}>{a.avaluacio}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ padding:"10px 14px", background:"#f0fdf4", borderRadius:8, fontSize:12, color:"#166534", fontFamily:"system-ui", marginTop:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>✅ SdA generada · {data.sessions} sessions · {data.marc.length} competències · {data.objectius.length} objectius</span>
            <button onClick={() => {
              const doc = document.getElementById("sda-doc");
              if (!doc) return;
              const win = window.open("", "_blank");
              if (!win) { alert("El navegador ha bloquejat l'obertura. Permet finestres emergents i torna-ho a provar."); return; }
              const styles = "<style>" +
                "@page { size: A4 landscape; margin: 1cm; }" +
                "body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; margin: 0; padding: 10px; color: #1e293b; }" +
                "h1 { font-size: 16pt; color: #1e3a8a; margin-bottom: 10px; border-bottom: 2px solid #1e3a8a; padding-bottom: 5px; }" +
                "table { width: 100% !important; border-collapse: collapse; margin-bottom: 12px; page-break-inside: avoid; }" +
                "th { background-color: #1e3a8a !important; color: #ffffff !important; padding: 5px 7px; border: 1px solid #1e40af; font-weight: bold; text-align: left; font-size: 9pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
                "td { padding: 5px 7px; border: 1px solid #cbd5e1; vertical-align: top; font-size: 9pt; }" +
                "* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }" +
                "@media print { .no-print { display: none; } }" +
                ".no-print { position: fixed; top: 10px; right: 10px; background: #1e3a8a; color: white; padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }" +
                "</style>";
              win.document.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>SdA - " + data.titol + "</title>" + styles + "</head><body>" +
                "<button class='no-print' onclick='window.print()'>🖨️ Imprimir / Guardar PDF</button>" +
                "<h1>" + data.titol + "</h1>" + doc.innerHTML + "</body></html>");
              win.document.close();
            }} style={{ padding:"8px 16px", background:"#1e3a8a", color:"white", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"system-ui" }}>
              🖨️ Imprimir / PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SdAArquitec({ onToast, onApiKeyError }) {
  const [text, setText] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copyModal, setCopyModal] = useState(false);

  const generar = async () => {
    setLoading(true); setData(null);
    try {
      const sys = `Ets un expert en currículum LOMLOE i disseny de Situacions d'Aprenentatge per a l'educació primària de Catalunya. Analitzes materials educatius existents i els estructures en el format oficial de SdA LOMLOE, en català acadèmic impecable.`;
      const prompt = `Analitza el contingut educatiu següent i estructura'l com a Situació d'Aprenentatge oficial LOMLOE per a primària catalana:\n\nMATERIAL ORIGINAL:\n${text}\n\nOmple TOTS els camps del format oficial. Si una dada no es pot inferir del material, genera-la coherentment. Retorna ÚNICAMENT el JSON sense cap text addicional:\n${SDA_SCHEMA}`;
      setData(await geminiJSON(sys, prompt, 2800));
    } catch(e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); return; }
      alert("Error processant el material. Torna-ho a intentar.");
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ background:"white", border:"1.5px solid #7dd3fc", borderRadius:14, padding:"1.25rem", marginBottom:16, borderTop:"4px solid #0284c7" }}>
        <SecLabel icon={Blocks} label="Estructura els teus materials en format SdA oficial" color="#0284c7" />
        <p style={{ fontSize:13, color:"#64748b", marginBottom:14, lineHeight:1.6 }}>
          Enganxa qualsevol descripció d'activitat, unitat didàctica o notes de classe. La IA les estructurarà automàticament en el format oficial LOMLOE amb tots els apartats.
        </p>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Material existent</label>
          <Txa value={text} onChange={setText} rows={10}
            placeholder="Enganxa aquí la sessió, activitat o fragment que vols estructurar com a SdA..." />
        </div>
        <Btn variant="primary" full onClick={generar} disabled={loading || !text}>
          {loading ? <><Spinner /> Estructurant en format LOMLOE...</> : <><Wand2 size={14} /> Estructurar com a SdA Oficial LOMLOE</>}
        </Btn>
      </div>
      {loading && <Loading text="Analitzant el contingut i omplint la graella oficial LOMLOE..." />}
      <SdADocView data={data} onCopyModal={() => setCopyModal(true)}
        onDownload={() => downloadTxt(sdaToText(data), "sda_arquitecte")} />
      {copyModal && data && <CopyModal text={sdaToText(data)} onClose={() => setCopyModal(false)} />}
    </div>
  );
}

function SdADUA({ onToast, onApiKeyError }) {
  const [contingut, setContingut] = useState("");
  const [necessitat, setNecessitat] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copyModal, setCopyModal] = useState(false);

  const generar = async () => {
    setLoading(true); setResult("");
    try {
      const res = await gemini(
        `Ets especialista en Disseny Universal per a l'Aprenentatge (DUA) i educació inclusiva a Catalunya. Adaptes continguts educatius aplicant les tres xarxes del DUA: Reconeixement (Representació), Estratègica (Acció i Expressió) i Afectiva (Implicació). Escrius en català acadèmic professional i proporciones mesures concretes i directament aplicables a l'aula.`,
        `Adapta el contingut educatiu següent aplicant principis DUA per a alumnat amb: ${necessitat}\n\nCONTINGUT ORIGINAL:\n${contingut}\n\nGenera un document estructurat amb:\n\n## ANÀLISI DE BARRERES D'APRENENTATGE\nIdentifica les barreres principals per a alumnat amb ${necessitat}.\n\n## MESURES DE REPRESENTACIÓ (Xarxa de Reconeixement)\nAdapta com es presenta la informació.\n\n## MESURES D'ACCIÓ I EXPRESSIÓ (Xarxa Estratègica)\nAdapta com l'alumnat demostra l'aprenentatge.\n\n## MESURES D'IMPLICACIÓ (Xarxa Afectiva)\nAdapta la motivació i l'autoregulació.\n\n## ACTIVITATS ADAPTADES\nReformula les activitats principals amb les adaptacions concretes.\n\n## MATERIALS I RECURSOS ESPECÍFICS\nLlista materials i recursos recomanats per a ${necessitat}.\n\n## INDICADORS D'ASSOLIMENT ADAPTATS\nCriteris d'avaluació ajustats a les capacitats de l'alumnat.`,
        2000
      );
      setResult(res);
    } catch(e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); return; }
      setResult("Error de connexió.");
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ background:"white", border:"1.5px solid #fda4af", borderRadius:14, padding:"1.25rem", marginBottom:16, borderTop:"4px solid #e11d48" }}>
        <SecLabel icon={Accessibility} label="Adaptació DUA per a la Inclusió" color="#e11d48" />
        <p style={{ fontSize:13, color:"#64748b", marginBottom:14, lineHeight:1.6 }}>
          Enganxa una part de la SdA o una activitat concreta i selecciona la necessitat de l'alumnat. La IA reescriurà el contingut aplicant les tres xarxes del DUA.
        </p>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:6 }}>Necessitat específica</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
            {NECESSITATS.map(n => {
              const sel = necessitat===n;
              return (
                <button key={n} onClick={() => setNecessitat(n)}
                  style={{ padding:"5px 11px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit",
                    border:sel ? "1.5px solid #e11d48" : "1.5px solid #e2e8f0",
                    background:sel ? "#ffe4e6" : "white", color:sel ? "#9f1239" : "#64748b", transition:"all 0.13s" }}>
                  {n}
                </button>
              );
            })}
          </div>
          <Inp value={necessitat} onChange={setNecessitat} placeholder="O descriu la necessitat específica de l'alumnat..." />
        </div>
        <div style={{ marginBottom:18 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:3 }}>Contingut a adaptar</label>
          <Txa value={contingut} onChange={setContingut} rows={8}
            placeholder="Enganxa aquí la sessió, activitat o fragment de la SdA que vols adaptar..." />
        </div>
        <Btn variant="primary" full onClick={generar} disabled={loading || !contingut || !necessitat}>
          {loading ? <><Spinner /> Aplicant mesures DUA...</> : <><Accessibility size={14} /> Generar Adaptació DUA</>}
        </Btn>
      </div>
      {loading && <Loading text="Aplicant les tres xarxes DUA i generant adaptació inclusiva..." />}
      {result && (
        <div style={{ marginTop:16 }}>
          <DocActionBar onCopy={() => setCopyModal(true)} onDownload={() => downloadTxt(result, `dua_${necessitat}`)} />
          <div style={{ background:"#e2e8f0", padding:"20px 16px", borderRadius:"0 0 10px 10px", border:"1.5px solid #e2e8f0", borderTop:"none" }}>
            <div style={{ background:"white", margin:"0 auto", maxWidth:720, padding:"40px 48px",
              boxShadow:"0 4px 24px rgba(0,0,0,0.10)", borderRadius:4, fontFamily:"'Georgia','Times New Roman',serif" }}>
              <div style={{ borderBottom:"3px solid #e11d48", paddingBottom:12, marginBottom:20 }}>
                <div style={{ fontSize:9, fontWeight:700, color:"#94a3b8", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:2 }}>
                  Disseny Universal per a l'Aprenentatge (DUA) · Adaptació Inclusiva
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:"#881337" }}>Adaptació per a: {necessitat}</div>
              </div>
              <div style={{ fontSize:13, lineHeight:1.9, whiteSpace:"pre-wrap", color:"#1e293b" }}>{result}</div>
            </div>
          </div>
          {copyModal && <CopyModal text={result} onClose={() => setCopyModal(false)} />}
        </div>
      )}
    </div>
  );
}

function SdATab({ onToast, onApiKeyError }) {
  const [mode, setMode] = useState("creador");
  const MODES = [
    { id:"creador",    label:"Creador",       sub:"Des de zero",         icon:Sparkles,      color:"#7c3aed" },
    { id:"arquitecte", label:"Arquitecte",    sub:"Dels meus materials", icon:Blocks,        color:"#0284c7" },
    { id:"dua",        label:"Adaptació DUA", sub:"Per a la inclusió",   icon:Accessibility, color:"#e11d48" },
  ];
  return (
    <div>
      <PrivacyBanner />
      <div style={{ display:"flex", gap:6, marginBottom:20, background:"#f8fafc", borderRadius:12, padding:5, border:"1.5px solid #e2e8f0" }}>
        {MODES.map(m => {
          const sel = mode===m.id; const Icon = m.icon;
          return (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"11px 8px", borderRadius:9,
                cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
                border:sel ? `1.5px solid ${m.color}` : "1.5px solid transparent",
                background:sel ? "white" : "transparent",
                boxShadow:sel ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
              <Icon size={16} color={sel ? m.color : "#94a3b8"} />
              <span style={{ fontSize:12, fontWeight:700, color:sel ? m.color : "#94a3b8" }}>{m.label}</span>
              <span style={{ fontSize:10, color:sel ? "#64748b" : "#cbd5e1" }}>{m.sub}</span>
            </button>
          );
        })}
      </div>
      {mode==="creador"    && <SdACreador   onToast={onToast} onApiKeyError={onApiKeyError} />}
      {mode==="arquitecte" && <SdAArquitec  onToast={onToast} onApiKeyError={onApiKeyError} />}
      {mode==="dua"        && <SdADUA       onToast={onToast} onApiKeyError={onApiKeyError} />}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// ─── TAB 3: INFORMES D'AVALUACIÓ ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

function MobCard({ title, children }) {
  return (
    <div style={{ background:"white", borderRadius:12, padding:"1rem", boxShadow:"0 1px 6px rgba(0,0,0,0.07)", marginBottom:"0.75rem" }}>
      <div style={{ fontWeight:700, color:"#1a3a5c", fontSize:"0.78rem", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"0.75rem" }}>{title}</div>
      {children}
    </div>
  );
}

function MobSelBtn({ active, color, onClick, children, left }) {
  return (
    <button onClick={onClick} style={{
      width:"100%", padding:"0.7rem 1rem", borderRadius:8, textAlign: left ? "left" : "center",
      border:`2px solid ${active ? color : "#e0e0e0"}`,
      background: active ? color + "18" : "white",
      color: active ? color : "#444",
      fontWeight: active ? 700 : 400,
      fontSize:"0.88rem", cursor:"pointer",
    }}>{children}</button>
  );
}

function InfLabel({ children }) {
  return <div style={{ fontWeight:700, color:"#1a3a5c", fontSize:"0.75rem", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:"0.4rem" }}>{children}</div>;
}

function CriteriRow({ label, value, onChange, onDelete }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0.45rem 0", borderBottom:"1px solid #f0f0f0" }}>
      <span style={{ fontSize:"0.83rem", flex:1, paddingRight:"0.5rem", color:"#333" }}>{label}</span>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <select value={value || ""} onChange={e => onChange(e.target.value || null)} style={{
          border: value ? `2px solid ${VAL_META[value].border}` : "1.5px solid #ddd",
          borderRadius:6, padding:"0.3rem 0.4rem", fontSize:"0.82rem", fontWeight:700,
          background: value ? VAL_META[value].bg : "white",
          color: value ? VAL_META[value].color : "#999",
          cursor:"pointer", minWidth:62,
        }}>
          <option value="">—</option>
          {VALORACIONS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {onDelete && (
          <button onClick={onDelete} title="Eliminar criteri"
            style={{ background:"none", border:"none", color:"#e57373", fontSize:"1rem", cursor:"pointer", padding:"0 2px", lineHeight:1 }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

const iStyleInf = { border:"1.5px solid #ddd", borderRadius:8, padding:"0.55rem 0.7rem", fontSize:"0.88rem", outline:"none", width:"100%", boxSizing:"border-box" };
const pBtnInf   = { background:"#1a6fb5", color:"white", border:"none", borderRadius:8, padding:"0.6rem 1.2rem", fontWeight:700, fontSize:"0.88rem", cursor:"pointer" };
const aBtnInf   = { background:"#1a6fb5", color:"white", border:"none", borderRadius:8, width:38, height:38, fontSize:"1.2rem", cursor:"pointer", flexShrink:0 };
const lBtnInf   = { background:"none", border:"none", color:"#1a6fb5", fontSize:"0.8rem", cursor:"pointer", padding:0, marginBottom:"0.4rem", textDecoration:"underline" };

const TABS_INF = [
  { id:"config",   label:"Configuració", icon:"⚙️" },
  { id:"graella",  label:"Graella",      icon:"📊" },
  { id:"informes", label:"Informes",     icon:"📄" },
];

function InformesTab({ onToast, onApiKeyError }) {
  const [tab, setTab]             = usePersistedState("inf_tab", "config");
  const [trimestre, setTrimestre] = usePersistedState("inf_trimestre", null);
  const [curs, setCurs]           = usePersistedState("inf_curs", "");
  const [arees, setArees]         = usePersistedState("inf_arees", []);
  const [areaActiva, setAreaActiva] = usePersistedState("inf_areaActiva", null);
  const [centre, setCentre]       = usePersistedState("inf_centre", "");
  const [tutor, setTutor]         = usePersistedState("inf_tutor", "");
  const [alumnes, setAlumnes]     = usePersistedState("inf_alumnes", []);
  const [criterisPerArea, setCriterisPerArea] = usePersistedState("inf_criteris", {});
  // ▼ NOVA: criteris del Comentari General editables
  const [criterisGeneral, setCriterisGeneral] = usePersistedState("inf_criterisGeneral", CRITERIS_GENERAL_INF_DEFAULT);
  const [valoracions, setValorations]           = usePersistedState("inf_valoracions", {});
  const [comentaris, setComentaris]             = usePersistedState("inf_comentaris", {});
  const [comentarisGeneral, setComentarisGeneral] = usePersistedState("inf_comentGen", {});
  const [alumneActiu, setAlumneActiu]           = usePersistedState("inf_alumneActiu", 0);

  const [nomInput, setNomInput]   = useState("");
  const [nomsBloc, setNomsBloc]   = useState("");
  const [showImport, setShowImport] = useState(false);
  const [nouCriteri, setNouCriteri] = useState("");
  const [nouCriteriGeneral, setNouCriteriGeneral] = useState("");
  const [generant, setGenerant]   = useState({});
  const [copyModal, setCopyModal] = useState(false);
  const [textExport, setTextExport] = useState("");

  const trimestreObj = TRIMESTRES_INF.find(t => t.id === trimestre);
  const configOk     = trimestre && curs && arees.length > 0;
  const graellaOk    = configOk && alumnes.length > 0;

  const areesSelObj = AREES_INF.filter(a => arees.includes(a.id));
  const areaActivaObj = AREES_INF.find(a => a.id === areaActiva);
  const esGeneral = areaActiva === "general";

  function toggleArea(id) {
    setArees(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  }

  // ▼ MILLORA 5: Eliminar àrea seleccionada
  function eliminarArea(id) {
    setArees(prev => prev.filter(x => x !== id));
    if (areaActiva === id) setAreaActiva(null);
  }

  function aplicarConfig() {
    const cicle = getCicle(curs);
    const nousCriteris = {};
    arees.forEach(id => {
      if (id === "general") return;
      nousCriteris[id] = (CRITERIS_BASE[id]?.[cicle] ?? []).slice();
    });
    setCriterisPerArea(nousCriteris);
    setAreaActiva(arees[0]);
    setTab("graella");
  }

  function afegirAlumne() {
    const nom = nomInput.trim();
    if (!nom) return;
    setAlumnes(a => [...a, nom]);
    setNomInput("");
  }

  function importarAlumnes() {
    const noms = nomsBloc.split("\n").map(n => n.trim()).filter(Boolean);
    setAlumnes(a => { const ex = new Set(a); return [...a, ...noms.filter(n => !ex.has(n))]; });
    setNomsBloc(""); setShowImport(false);
  }

  function eliminarAlumne(i) {
    setAlumnes(al => al.filter((_, idx) => idx !== i));
    const reindex = obj => {
      const nou = {};
      Object.keys(obj).forEach(k => {
        const ki = parseInt(k);
        if (ki < i) nou[ki] = obj[k];
        else if (ki > i) nou[ki-1] = obj[k];
      });
      return nou;
    };
    setValorations(v => {
      const nou = {};
      Object.keys(v).forEach(aId => { nou[aId] = reindex(v[aId] || {}); });
      return nou;
    });
    setComentaris(c => {
      const nou = {};
      Object.keys(c).forEach(aId => { nou[aId] = reindex(c[aId] || {}); });
      return nou;
    });
    setComentarisGeneral(reindex);
    if (alumneActiu >= i && alumneActiu > 0) setAlumneActiu(a => a - 1);
  }

  function afegirCriteri() {
    const c = nouCriteri.trim();
    if (!c || !areaActiva || esGeneral) return;
    if ((criterisPerArea[areaActiva] || []).includes(c)) return;
    setCriterisPerArea(prev => ({ ...prev, [areaActiva]: [...(prev[areaActiva] || []), c] }));
    setNouCriteri("");
  }

  function eliminarCriteri(i) {
    setCriterisPerArea(prev => ({ ...prev, [areaActiva]: (prev[areaActiva] || []).filter((_, idx) => idx !== i) }));
  }

  // ▼ MILLORA 4: Criteris Comentari General editables
  function afegirCriteriGeneral() {
    const c = nouCriteriGeneral.trim();
    if (!c || criterisGeneral.includes(c)) return;
    setCriterisGeneral(prev => [...prev, c]);
    setNouCriteriGeneral("");
  }

  function eliminarCriteriGeneral(i) {
    setCriterisGeneral(prev => prev.filter((_, idx) => idx !== i));
  }

  function setVal(aId, ai, ci, val) {
    setValorations(v => ({
      ...v,
      [aId]: { ...(v[aId] || {}), [ai]: { ...((v[aId] || {})[ai] || {}), [ci]: val } }
    }));
  }

  function setValG(ai, ci, val) {
    setComentarisGeneral(c => ({ ...c, [`g_${ai}_${ci}`]: val }));
  }

  function getValG(ai, ci) {
    return comentarisGeneral[`g_${ai}_${ci}`] || null;
  }

  function llegenda() {
    return `DEFINICIONS EXACTES:
- NA = No ha assolit els objectius. Dificultats clares.
- AS = Assoliment suficient. Necessita ajuda. NO és un bon resultat.
- AN = Assoliment notable. Va bé però sense excel·lir.
- AE = Assoliment excel·lent. Domini total.
IMPORTANT: AE > AN > AS > NA.`;
  }

  function buildPromptArea(aId, ai) {
    const aObj   = AREES_INF.find(a => a.id === aId);
    const crit   = criterisPerArea[aId] || [];
    const vals   = (valoracions[aId] || {})[ai] || {};
    const detall = crit.map((c, ci) => `- ${c}: ${vals[ci] || "sense valorar"}`).join("\n");
    return `Ets un mestre de primària que redacta informes d'avaluació en català.
Escriu un comentari breu (3-4 frases) per a l'alumne/a sobre l'àrea de ${aObj?.label}, curs ${curs}, ${trimestreObj?.label}.
${llegenda()}
VALORACIONS:
${detall}
FORMAT: Segona persona singular. Comença amb "Aquest trimestre" o similar. Paràgraf continu. Sense sigles NA/AS/AN/AE.`;
  }

  function buildPromptGeneral(ai) {
    const detall = criterisGeneral.map((c, ci) => `- ${c}: ${getValG(ai, ci) || "sense valorar"}`).join("\n");
    return `Ets un mestre de primària que redacta informes d'avaluació en català.
Escriu un comentari general breu (3-4 frases) sobre l'actitud i el comportament de l'alumne/a, curs ${curs}, ${trimestreObj?.label}.
${llegenda()}
VALORACIONS:
${detall}
FORMAT: Segona persona singular. Comença amb "Aquest trimestre" o similar. Paràgraf continu. Sense sigles.`;
  }

  function afegirNom(nomReal, text) {
    if (!text) return "";
    return `${nomReal}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  async function generarComentari(aId, ai) {
    const nomReal = alumnes[ai];
    const key = `${aId}_${ai}`;
    setGenerant(g => ({ ...g, [key]: true }));
    try {
      const prompt = aId === "general" ? buildPromptGeneral(ai) : buildPromptArea(aId, ai);
      const raw = await geminiInf(prompt);
      if (aId === "general") {
        setComentarisGeneral(c => ({ ...c, [ai]: afegirNom(nomReal, raw) }));
      } else {
        setComentaris(c => ({ ...c, [aId]: { ...(c[aId] || {}), [ai]: afegirNom(nomReal, raw) } }));
      }
    } catch(e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); setGenerant(g => ({ ...g, [key]: false })); return; }
      if (aId === "general") setComentarisGeneral(c => ({ ...c, [ai]: "Error. Torna-ho a intentar." }));
      else setComentaris(c => ({ ...c, [aId]: { ...(c[aId] || {}), [ai]: "Error. Torna-ho a intentar." } }));
    }
    setGenerant(g => ({ ...g, [key]: false }));
  }

  // ▼ BUG FIX "Generar tots": usem un enfocament seqüencial amb referències estables
  async function generarTots() {
    const totalOps = alumnes.length * arees.length;
    let done = 0;
    for (let ai = 0; ai < alumnes.length; ai++) {
      for (const aId of arees) {
        await generarComentari(aId, ai);
        done++;
      }
    }
    onToast && onToast(`${done} comentaris generats!`);
  }

  function getComentari(aId, ai) {
    if (aId === "general") return comentarisGeneral[ai] || "";
    return (comentaris[aId] || {})[ai] || "";
  }

  function setComentari(aId, ai, val) {
    if (aId === "general") setComentarisGeneral(c => ({ ...c, [ai]: val }));
    else setComentaris(c => ({ ...c, [aId]: { ...(c[aId] || {}), [ai]: val } }));
  }

  function progresArea(aId) {
    return alumnes.filter((_, ai) => !!getComentari(aId, ai)).length;
  }

  function exportarTots() {
    const text = alumnes.map((alumne, ai) => {
      const seccions = arees.map(aId => {
        const aObj = AREES_INF.find(a => a.id === aId);
        if (aId === "general") {
          const resumGen = criterisGeneral.map((c, ci) => {
            const v = getValG(ai, ci); return v ? `  ${c}: ${v}` : null;
          }).filter(Boolean).join("\n");
          return `── COMENTARI GENERAL ──\n${resumGen || "  (sense valorar)"}\n${comentarisGeneral[ai] || "(sense comentari)"}`;
        }
        const crit = criterisPerArea[aId] || [];
        const vals = (valoracions[aId] || {})[ai] || {};
        const resumArea = crit.map((c, ci) => {
          const v = vals[ci]; return v ? `  ${c}: ${v}` : null;
        }).filter(Boolean).join("\n");
        return `── ${aObj?.icon} ${aObj?.label} ──\n${resumArea || "  (sense valorar)"}\n${(comentaris[aId] || {})[ai] || "(sense comentari)"}`;
      }).join("\n\n");
      return `═══════════════════════════════════\nALUMNE/A: ${alumne}\n${trimestreObj?.label} · ${curs}\n═══════════════════════════════════\n\n${seccions}\n`;
    }).join("\n");
    setTextExport(text);
    setCopyModal(true);
  }

  return (
    <div style={{ maxWidth:600, margin:"0 auto" }}>
      {/* Sub-tabs */}
      <div style={{ display:"flex", background:"white", borderRadius:12, overflow:"hidden", border:"1.5px solid #e2e8f0", marginBottom:"1rem" }}>
        {TABS_INF.map(t => {
          const actiu    = tab === t.id;
          const disabled = (t.id === "graella" || t.id === "informes") && !configOk;
          return (
            <button key={t.id} onClick={() => !disabled && setTab(t.id)} style={{
              flex:1, padding:"0.7rem 0.3rem 0.5rem",
              background: actiu ? "#e8f0fe" : "none", border:"none",
              borderBottom: actiu ? "3px solid #1a6fb5" : "3px solid transparent",
              color: actiu ? "#1a6fb5" : disabled ? "#bbb" : "#555",
              fontWeight: actiu ? 700 : 400,
              fontSize:"0.72rem", cursor:disabled ? "default" : "pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:"0.15rem",
            }}>
              <span style={{ fontSize:"1.1rem" }}>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      {/* ── CONFIGURACIÓ ── */}
      {tab === "config" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          <MobCard title="Dades del centre (opcional)">
            <input value={centre} onChange={e => setCentre(e.target.value)} placeholder="Nom del centre..." style={iStyleInf} />
            <input value={tutor} onChange={e => setTutor(e.target.value)} placeholder="Nom del tutor/a..." style={{ ...iStyleInf, marginTop:"0.5rem" }} />
          </MobCard>

          <MobCard title="Trimestre">
            <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>
              {TRIMESTRES_INF.map(t => (
                <MobSelBtn key={t.id} active={trimestre === t.id} color="#1a6fb5" onClick={() => setTrimestre(t.id)}>
                  <strong>{t.label}</strong> <span style={{ opacity:0.7, fontSize:"0.8rem" }}>({t.months})</span>
                </MobSelBtn>
              ))}
            </div>
          </MobCard>

          <MobCard title="Curs">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"0.5rem" }}>
              {CURSOS.map(c => (
                <MobSelBtn key={c} active={curs === `${c} de Primària`} color="#2e7d32" onClick={() => setCurs(`${c} de Primària`)}>
                  {c}
                </MobSelBtn>
              ))}
            </div>
          </MobCard>

          <MobCard title="Àrees a avaluar (selecciona totes les que necessites)">
            <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>
              {AREES_INF.map(a => (
                <div key={a.id} style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
                  <button onClick={() => toggleArea(a.id)} style={{
                    flex:1, padding:"0.7rem 1rem", borderRadius:8, textAlign:"left",
                    border:`2px solid ${arees.includes(a.id) ? "#7b1fa2" : "#e0e0e0"}`,
                    background: arees.includes(a.id) ? "#f3e5f5" : "white",
                    color: arees.includes(a.id) ? "#7b1fa2" : "#444",
                    fontWeight: arees.includes(a.id) ? 700 : 400,
                    fontSize:"0.88rem", cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                  }}>
                    <span>{a.icon} {a.label}</span>
                    {arees.includes(a.id) && <span style={{ fontSize:"1rem" }}>✓</span>}
                  </button>
                  {/* ▼ MILLORA 5: botó eliminar àrea seleccionada */}
                  {arees.includes(a.id) && (
                    <button onClick={() => eliminarArea(a.id)} title="Eliminar àrea"
                      style={{ background:"none", border:"1.5px solid #fca5a5", borderRadius:8,
                        color:"#e57373", fontSize:"1rem", cursor:"pointer", padding:"0.4rem 0.6rem", flexShrink:0 }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {arees.length > 0 && (
              <div style={{ marginTop:"0.75rem", padding:"0.5rem 0.75rem", background:"#f3e5f5", borderRadius:8, fontSize:"0.8rem", color:"#7b1fa2", fontWeight:600 }}>
                {arees.length} àrea{arees.length > 1 ? "es" : ""} seleccionada{arees.length > 1 ? "es" : ""}
              </div>
            )}
          </MobCard>

          {configOk && (
            <button onClick={aplicarConfig} style={{ ...pBtnInf, width:"100%", padding:"1rem", fontSize:"1rem" }}>
              Crear graella →
            </button>
          )}
        </div>
      )}

      {/* ── GRAELLA ── */}
      {tab === "graella" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          <MobCard title="Alumnes">
            <div style={{ display:"flex", gap:"0.5rem", marginBottom:"0.5rem" }}>
              <input value={nomInput} onChange={e => setNomInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && afegirAlumne()}
                placeholder="Nom i cognoms..." style={{ ...iStyleInf, flex:1 }} />
              <button onClick={afegirAlumne} style={aBtnInf}>+</button>
            </div>
            <button onClick={() => setShowImport(s => !s)} style={lBtnInf}>
              {showImport ? "▲ Amaga import" : "▼ Importar llista"}
            </button>
            {showImport && (
              <>
                <textarea value={nomsBloc} onChange={e => setNomsBloc(e.target.value)}
                  placeholder={"Un nom per línia:\nMaria García\nJoan Puig"} rows={4}
                  style={{ ...iStyleInf, marginTop:"0.4rem", resize:"vertical" }} />
                <button onClick={importarAlumnes} style={{ ...pBtnInf, width:"100%", marginTop:"0.4rem" }}>Importar</button>
              </>
            )}
            {alumnes.length > 0 && (
              <div style={{ marginTop:"0.6rem" }}>
                {alumnes.map((a, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0.4rem 0.3rem", borderBottom:"1px solid #f0f0f0", fontSize:"0.88rem" }}>
                    <span>{a}</span>
                    <button onClick={() => eliminarAlumne(i)} style={{ background:"none", border:"none", color:"#e57373", fontSize:"1rem", cursor:"pointer" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </MobCard>

          {alumnes.length > 0 && (
            <>
              <div style={{ fontWeight:700, color:"#1a3a5c", fontSize:"0.85rem", marginBottom:"0.25rem" }}>
                Selecciona l'àrea a valorar:
              </div>
              <div style={{ overflowX:"auto", display:"flex", gap:"0.5rem", paddingBottom:"0.3rem", marginBottom:"0.25rem" }}>
                {areesSelObj.map(a => {
                  const prog = progresArea(a.id);
                  const activa = areaActiva === a.id;
                  return (
                    <button key={a.id} onClick={() => setAreaActiva(a.id)} style={{
                      flexShrink:0, padding:"0.45rem 0.9rem", borderRadius:20,
                      border:`2px solid ${activa ? "#7b1fa2" : "#ddd"}`,
                      background: activa ? "#f3e5f5" : "white",
                      color: activa ? "#7b1fa2" : "#555",
                      fontWeight: activa ? 700 : 400,
                      fontSize:"0.82rem", cursor:"pointer", whiteSpace:"nowrap", position:"relative",
                    }}>
                      {a.icon} {a.label}
                      {prog > 0 && (
                        <span style={{ marginLeft:5, background:"#4caf50", color:"white", borderRadius:10, fontSize:"0.7rem", padding:"1px 5px", fontWeight:700 }}>
                          {prog}/{alumnes.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Criteris de l'àrea activa */}
              {areaActiva && !esGeneral && (
                <MobCard title={`Criteris · ${areaActivaObj?.label}`}>
                  <div style={{ display:"flex", gap:"0.5rem", marginBottom:"0.5rem" }}>
                    <input value={nouCriteri} onChange={e => setNouCriteri(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && afegirCriteri()}
                      placeholder="Afegir criteri..." style={{ ...iStyleInf, flex:1 }} />
                    <button onClick={afegirCriteri} style={aBtnInf}>+</button>
                  </div>
                  {(criterisPerArea[areaActiva] || []).map((c, i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0.4rem 0.3rem", borderBottom:"1px solid #f0f0f0", fontSize:"0.85rem" }}>
                      <span style={{ flex:1 }}>{c}</span>
                      <button onClick={() => eliminarCriteri(i)} style={{ background:"none", border:"none", color:"#e57373", fontSize:"1rem", cursor:"pointer" }}>✕</button>
                    </div>
                  ))}
                </MobCard>
              )}

              {/* ▼ MILLORA 4: Criteris del Comentari General editables */}
              {areaActiva && esGeneral && (
                <MobCard title="Criteris · Comentari General">
                  <div style={{ display:"flex", gap:"0.5rem", marginBottom:"0.5rem" }}>
                    <input value={nouCriteriGeneral} onChange={e => setNouCriteriGeneral(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && afegirCriteriGeneral()}
                      placeholder="Afegir criteri..." style={{ ...iStyleInf, flex:1 }} />
                    <button onClick={afegirCriteriGeneral} style={aBtnInf}>+</button>
                  </div>
                  {criterisGeneral.map((c, i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0.4rem 0.3rem", borderBottom:"1px solid #f0f0f0", fontSize:"0.85rem" }}>
                      <span style={{ flex:1 }}>{c}</span>
                      <button onClick={() => eliminarCriteriGeneral(i)} style={{ background:"none", border:"none", color:"#e57373", fontSize:"1rem", cursor:"pointer" }}>✕</button>
                    </div>
                  ))}
                </MobCard>
              )}

              <MobCard title="Llegenda">
                <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap" }}>
                  {VALORACIONS.map(v => (
                    <div key={v} style={{ display:"flex", alignItems:"center", gap:"0.4rem", background:VAL_META[v].bg, border:`1px solid ${VAL_META[v].border}`, borderRadius:8, padding:"0.3rem 0.6rem" }}>
                      <span style={{ fontWeight:700, color:VAL_META[v].color, fontSize:"0.8rem" }}>{v}</span>
                      <span style={{ fontSize:"0.75rem", color:"#555" }}>{VAL_META[v].label}</span>
                    </div>
                  ))}
                </div>
              </MobCard>

              {areaActiva && (
                <>
                  <div style={{ fontWeight:700, color:"#1a3a5c", fontSize:"0.85rem" }}>
                    Valoracions · {areaActivaObj?.icon} {areaActivaObj?.label}
                  </div>
                  {alumnes.map((alumne, ai) => (
                    <MobCard key={ai} title={alumne}>
                      {esGeneral
                        ? criterisGeneral.map((criteri, ci) => (
                            <CriteriRow key={ci} label={criteri} value={getValG(ai, ci)} onChange={v => setValG(ai, ci, v)} />
                          ))
                        : (criterisPerArea[areaActiva] || []).map((criteri, ci) => (
                            <CriteriRow key={ci} label={criteri}
                              value={(valoracions[areaActiva] || {})[ai]?.[ci]}
                              onChange={v => setVal(areaActiva, ai, ci, v)} />
                          ))
                      }
                    </MobCard>
                  ))}
                </>
              )}
            </>
          )}

          {graellaOk && (
            <button onClick={() => { setAlumneActiu(0); setTab("informes"); }} style={{ ...pBtnInf, width:"100%", padding:"1rem", fontSize:"1rem" }}>
              Generar informes →
            </button>
          )}
        </div>
      )}

      {/* ── INFORMES ── */}
      {tab === "informes" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          {!graellaOk ? (
            <div style={{ textAlign:"center", color:"#aaa", padding:"2rem", fontSize:"0.9rem" }}>
              Completa la configuració i la graella primer.
            </div>
          ) : (
            <>
              <div style={{ overflowX:"auto", display:"flex", gap:"0.5rem", paddingBottom:"0.3rem" }}>
                {alumnes.map((a, i) => {
                  const total = arees.length;
                  const amb = arees.filter(aId => !!getComentari(aId, i)).length;
                  return (
                    <button key={i} onClick={() => setAlumneActiu(i)} style={{
                      flexShrink:0, padding:"0.4rem 0.9rem", borderRadius:20,
                      border:`2px solid ${alumneActiu === i ? "#1a6fb5" : "#ddd"}`,
                      background: alumneActiu === i ? "#e3f0ff" : "white",
                      color: alumneActiu === i ? "#1a6fb5" : "#555",
                      fontWeight: alumneActiu === i ? 700 : 400,
                      fontSize:"0.82rem", cursor:"pointer", whiteSpace:"nowrap", position:"relative",
                    }}>
                      {amb === total && total > 0 && <span style={{ position:"absolute", top:-3, right:-3, width:9, height:9, borderRadius:"50%", background:"#4caf50", border:"1.5px solid white" }} />}
                      {a.split(" ")[0]}
                      {amb > 0 && <span style={{ marginLeft:4, fontSize:"0.7rem", color:"#888" }}>{amb}/{total}</span>}
                    </button>
                  );
                })}
              </div>

              <div style={{ display:"flex", gap:"0.5rem" }}>
                <button onClick={generarTots} style={{ ...pBtnInf, flex:1, background:"#6a1b9a", fontSize:"0.82rem" }}>
                  ⚡ Generar tots
                </button>
                <button onClick={exportarTots} style={{ ...pBtnInf, flex:1, background:"#2e7d32", fontSize:"0.82rem" }}>
                  📋 Copiar tots
                </button>
              </div>

              <MobCard title={alumnes[alumneActiu]}>
                {areesSelObj.map(aObj => (
                  <div key={aObj.id} style={{ marginBottom:"1.2rem", borderBottom:"1px solid #f0f0f0", paddingBottom:"1rem" }}>
                    <InfLabel>{aObj.icon} {aObj.label}</InfLabel>
                    <div style={{ display:"flex", flexDirection:"column", gap:"0.2rem", marginBottom:"0.75rem" }}>
                      {aObj.id === "general"
                        ? criterisGeneral.map((c, ci) => {
                            const v = getValG(alumneActiu, ci);
                            return (
                              <div key={ci} style={{ display:"flex", justifyContent:"space-between", fontSize:"0.8rem", padding:"0.25rem 0.4rem", borderRadius:5, background: v ? VAL_META[v].bg : "#f5f5f5" }}>
                                <span style={{ color:"#444" }}>{c}</span>
                                {v ? <span style={{ fontWeight:700, color:VAL_META[v].color }}>{v}</span> : <span style={{ color:"#bbb" }}>—</span>}
                              </div>
                            );
                          })
                        : (criterisPerArea[aObj.id] || []).map((c, ci) => {
                            const v = (valoracions[aObj.id] || {})[alumneActiu]?.[ci];
                            return (
                              <div key={ci} style={{ display:"flex", justifyContent:"space-between", fontSize:"0.8rem", padding:"0.25rem 0.4rem", borderRadius:5, background: v ? VAL_META[v].bg : "#f5f5f5" }}>
                                <span style={{ color:"#444" }}>{c}</span>
                                {v ? <span style={{ fontWeight:700, color:VAL_META[v].color }}>{v}</span> : <span style={{ color:"#bbb" }}>—</span>}
                              </div>
                            );
                          })
                      }
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.35rem" }}>
                      <span style={{ fontSize:"0.75rem", fontWeight:700, color:"#1a3a5c", textTransform:"uppercase", letterSpacing:"0.05em" }}>Comentari</span>
                      <button onClick={() => generarComentari(aObj.id, alumneActiu)}
                        disabled={generant[`${aObj.id}_${alumneActiu}`]}
                        style={{ ...pBtnInf, fontSize:"0.72rem", padding:"0.25rem 0.7rem", background: aObj.id === "general" ? "#6a1b9a" : "#1a6fb5" }}>
                        {generant[`${aObj.id}_${alumneActiu}`] ? <><Spinner /> ...</> : "✨ Generar"}
                      </button>
                    </div>
                    <textarea
                      value={getComentari(aObj.id, alumneActiu)}
                      onChange={e => setComentari(aObj.id, alumneActiu, e.target.value)}
                      placeholder="Prem Generar o escriu manualment..."
                      rows={4} style={{ ...iStyleInf, resize:"vertical", lineHeight:1.6, fontSize:"0.86rem" }} />
                  </div>
                ))}
              </MobCard>

              <div style={{ display:"flex", gap:"0.5rem" }}>
                <button onClick={() => setAlumneActiu(i => Math.max(0, i-1))} disabled={alumneActiu === 0}
                  style={{ ...pBtnInf, flex:1, background:"#455a64", opacity:alumneActiu===0?0.4:1, fontSize:"0.85rem" }}>
                  ← Anterior
                </button>
                <span style={{ alignSelf:"center", color:"#888", fontSize:"0.82rem", whiteSpace:"nowrap" }}>
                  {alumneActiu+1}/{alumnes.length}
                </span>
                <button onClick={() => setAlumneActiu(i => Math.min(alumnes.length-1, i+1))} disabled={alumneActiu === alumnes.length-1}
                  style={{ ...pBtnInf, flex:1, opacity:alumneActiu===alumnes.length-1?0.4:1, fontSize:"0.85rem" }}>
                  Següent →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {copyModal && <CopyModal text={textExport} onClose={() => setCopyModal(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ─── APP PRINCIPAL ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]     = useState("reunions");
  const [toast, setToast] = useState("");
  // Clau API: null = no comprovada, "" = no hi ha, "xxx" = hi ha clau
  const [apiKey, setApiKey]     = useState(() => getApiKey());
  const [showApiModal, setShowApiModal] = useState(() => !getApiKey());
  const [apiModalError, setApiModalError] = useState("");

  const onToast = useCallback(msg => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  // Quan una pestanya detecta error de clau, mostrem el modal
  const onApiKeyError = useCallback((errorType) => {
    setApiModalError(errorType === "CLAU_INVALIDA" ? "CLAU_INVALIDA" : "");
    setShowApiModal(true);
  }, []);

  const handleSaveKey = useCallback((newKey) => {
    setApiKey(newKey);
    setShowApiModal(false);
    setApiModalError("");
  }, []);

  const TABS = [
    { id:"reunions",  label:"Reunions",          icon:ClipboardList  },
    { id:"sda",       label:"Sit. Aprenentatge", icon:BookOpen       },
    { id:"informes",  label:"Informes Avaluació",icon:ClipboardCheck },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", fontFamily:"'Nunito','Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing:border-box; margin:0; padding:0; }
        select { appearance:auto; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      {/* Modal clau API */}
      {showApiModal && (
        <ApiKeyModal
          onSave={handleSaveKey}
          errorMsg={apiModalError}
        />
      )}

      <header style={{ background:"white", borderBottom:"1px solid #e2e8f0", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ maxWidth:960, margin:"0 auto", padding:"0 1rem" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <School size={20} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize:18, fontWeight:800, color:"#1e293b", letterSpacing:"-0.01em" }}>Assistència Docent IA</h1>
                <p style={{ fontSize:11, color:"#94a3b8", fontWeight:500 }}>Eina de suport per a mestres de primària · Catalunya · LOMLOE</p>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {/* Botó canviar clau */}
              <button onClick={() => { setApiModalError(""); setShowApiModal(true); }}
                title="Canviar clau API de Gemini"
                style={{ fontSize:11, color: apiKey ? "#059669" : "#dc2626", background:"none",
                  border:`1px solid ${apiKey ? "#86efac" : "#fca5a5"}`,
                  borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit",
                  display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
                <Key size={11} /> {apiKey ? "Clau activa" : "Sense clau"}
              </button>
              <button onClick={() => {
                if (confirm("Vols esborrar totes les dades guardades (reunions, SdA, informes)? No es pot desfer.")) {
                  clearAllPersisted();
                  location.reload();
                }
              }} title="Esborra totes les dades guardades i comença de nou"
              style={{ fontSize:11, color:"#94a3b8", background:"none", border:"1px solid #e2e8f0", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                🗑️ Començar de nou
              </button>
            </div>
          </div>
          <div style={{ display:"flex", gap:0, marginTop:12 }}>
            {TABS.map(t => {
              const sel = tab===t.id; const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", border:"none", background:"transparent",
                    cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:sel?700:500,
                    color:sel?"#6366f1":"#64748b", borderBottom:sel?"2.5px solid #6366f1":"2.5px solid transparent",
                    transition:"all 0.15s", marginBottom:-1, whiteSpace:"nowrap" }}>
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main style={{ maxWidth:960, margin:"0 auto", padding:"1.5rem 1rem 3rem" }}>
        {tab==="reunions" && <ReunionsTab  onToast={onToast} onApiKeyError={onApiKeyError} />}
        {tab==="sda"      && <SdATab       onToast={onToast} onApiKeyError={onApiKeyError} />}
        {tab==="informes" && <InformesTab  onToast={onToast} onApiKeyError={onApiKeyError} />}
      </main>

      <Toast msg={toast} onClose={() => setToast("")} />
    </div>
  );
}
