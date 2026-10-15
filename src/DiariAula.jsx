import { useState, useEffect, useMemo, useRef } from "react";
import {
  NotebookPen, Users, ListChecks, UserRound, Plus, Trash2,
  Download, Upload, X, AlertTriangle, Pencil, Save, Grid3x3,
  ClipboardList, ChevronDown, ChevronUp
} from "lucide-react";

/*
  DIARI D'AULA — Tasques avaluables (v3)
  ──────────────────────────────────────
  Model: Banc de criteris pràctics (per àrea, editable, NO ve del currículum) →
  Tasques avaluables (nom + àrea + un subconjunt de criteris del banc, reutilitzables
  en qualsevol trimestre) → Graella (tries una tasca + trimestre; files = alumnes,
  columnes = els criteris d'aquella tasca; cel·la = anotacions datades).

  Integració a App.jsx:
    1. Aquest fitxer a la mateixa carpeta que App.jsx.
    2. import DiariAula from "./DiariAula";
    3. TABS: { id:"diari", label:"Diari d'Aula", icon:NotebookPen }
    4. <main>: {tab==="diari" && <DiariAula onToast={onToast} curriculum={CURRICULUM_PRIMARIA} />}
       (el prop curriculum és opcional — només s'usa per a la referència consultable
       del currículum oficial dins de "Banc de criteris"; si no es passa, aquest
       bloc de referència simplement no es mostra.)

  Persistència: prefix "diari_" al localStorage — independent de "docent_".
*/

// ─── PERSISTÈNCIA ────────────────────────────────────────────────────────────
function useDiariState(key, initial) {
  const fullKey = "diari_" + key;
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(fullKey);
      if (stored !== null) return JSON.parse(stored);
    } catch (e) {}
    return initial;
  });
  useEffect(() => {
    try { localStorage.setItem(fullKey, JSON.stringify(value)); } catch (e) {}
  }, [fullKey, value]);
  return [value, setValue];
}
function clearDiariPersisted() {
  Object.keys(localStorage).forEach(k => { if (k.startsWith("diari_")) localStorage.removeItem(k); });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function avui() { return new Date().toISOString().slice(0, 10); }
function formatData(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── DADES BASE ───────────────────────────────────────────────────────────────
const AREES_DIARI = [
  { id: "llengua_cat",  label: "Llengua Catalana",     icon: "📖" },
  { id: "llengua_cast", label: "Llengua Castellana",   icon: "📝" },
  { id: "angles",       label: "Anglès",               icon: "🌍" },
  { id: "matematiques", label: "Matemàtiques",         icon: "🔢" },
  { id: "coneix_medi",  label: "Coneixement del Medi", icon: "🌿" },
  { id: "ed_artistica", label: "Ed. Artística",        icon: "🎨" },
  { id: "ed_fisica",    label: "Ed. Física",           icon: "⚽" },
  { id: "valors",       label: "Valors / Religió",     icon: "⭐" },
  { id: "general",      label: "General / Tutoria",    icon: "💬" },
];

const CURSOS_DIARI = [
  { id:"1r", label:"1r", cicle:"inicial" }, { id:"2n", label:"2n", cicle:"inicial" },
  { id:"3r", label:"3r", cicle:"mitja" },   { id:"4t", label:"4t", cicle:"mitja" },
  { id:"5è", label:"5è", cicle:"superior" },{ id:"6è", label:"6è", cicle:"superior" },
];

const TRIMESTRES = [
  { id: 1, label: "1r Trimestre" },
  { id: 2, label: "2n Trimestre" },
  { id: 3, label: "3r Trimestre" },
];

const VALORACIONS_DIARI = ["NA", "AS", "AN", "AE"];
const VAL_META_DIARI = {
  NA: { label: "No Assolit",            color: "#c0392b", bg: "#fdecea", border: "#e57373" },
  AS: { label: "Assolit Suficient",     color: "#b35c00", bg: "#fff8e1", border: "#ffcc02" },
  AN: { label: "Assoliment Notable",    color: "#1565c0", bg: "#e3f2fd", border: "#64b5f6" },
  AE: { label: "Assoliment Excel·lent", color: "#2e7d32", bg: "#e8f5e9", border: "#81c784" },
};

// Mapa d'àrees d'aquí cap als ids del teu CURRICULUM_PRIMARIA, només per a la
// referència consultable (no afecta la graella ni les tasques).
const AREA_CURRI_MAP = {
  llengua_cat: "llengua_cat_cast", llengua_cast: "llengua_cat_cast",
  angles: "llengua_estr", matematiques: "matematiques", coneix_medi: "medi",
  ed_artistica: "artistica", ed_fisica: "fisica", valors: "valors", general: null,
};
function criterisOficialsRef(curriculum, areaId, cicle) {
  if (!curriculum) return [];
  const curriKey = AREA_CURRI_MAP[areaId];
  if (!curriKey) return [];
  const area = curriculum[curriKey];
  if (!area || !area.criteris) return [];
  return area.criteris.map(c => ({ id: c.ca, text: c[cicle] || c.mitja || c.superior || c.inicial || "" })).filter(c => c.text);
}

// Banc de criteris pràctics per defecte — punt de partida, totalment editable.
const BANC_DEFAULT = {
  llengua_cat:  ["Comprensió lectora", "Expressió oral", "Coherència", "Cohesió", "Vocabulari", "Ortografia", "Presentació / cal·ligrafia"],
  llengua_cast: ["Comprensión lectora", "Expresión oral", "Coherencia", "Cohesión", "Vocabulario", "Ortografía", "Presentación / caligrafía"],
  angles:       ["Listening", "Speaking", "Reading", "Writing", "Vocabulari"],
  matematiques: ["Càlcul", "Resolució de problemes", "Raonament lògic", "Geometria", "Mesura"],
  coneix_medi:  ["Comprensió de continguts", "Expressió escrita", "Treball d'indagació", "Participació"],
  ed_artistica: ["Tècnica", "Creativitat", "Organització del treball"],
  ed_fisica:    ["Habilitats motrius", "Actitud i esforç", "Treball en equip"],
  valors:       ["Participació", "Actitud", "Reflexió"],
  general:      ["Comportament", "Participació", "Esforç", "Autonomia"],
};
function bancInicial() {
  const out = {};
  Object.entries(BANC_DEFAULT).forEach(([area, items]) => {
    out[area] = items.map(text => ({ id: uid(), text }));
  });
  return out;
}

// ─── ÀTOMS LOCALS ─────────────────────────────────────────────────────────────
const inpBase = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0",
  background:"#f8fafc", fontSize:13, color:"#1e293b", fontFamily:"inherit", outline:"none", lineHeight:1.5, boxSizing:"border-box" };

function DInp({ value, onChange, placeholder, type="text" }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inpBase} />;
}
function DTxa({ value, onChange, placeholder, rows=3 }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...inpBase, resize:"vertical" }} />;
}
function DBtn({ children, onClick, disabled, variant="ghost", full=false, size="md" }) {
  const styles = {
    primary: { background:"#6366f1", color:"white", border:"none" },
    ghost:   { background:"white",   color:"#374151", border:"1.5px solid #e2e8f0" },
    danger:  { background:"white",   color:"#dc2626", border:"1.5px solid #fca5a5" },
  };
  const s = styles[variant] || styles.ghost;
  return (
    <button onClick={onClick} disabled={disabled} style={{ display:"inline-flex", alignItems:"center", gap:6,
      padding: size==="sm" ? "6px 11px":"9px 15px", borderRadius:8, cursor:disabled?"not-allowed":"pointer",
      fontFamily:"inherit", fontSize:size==="sm"?12:13, fontWeight:600, opacity:disabled?0.45:1,
      width:full?"100%":"auto", justifyContent:full?"center":"flex-start", flexShrink:0, ...s }}>
      {children}
    </button>
  );
}
function DSecLabel({ icon: Icon, label, color="#6366f1" }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
      <Icon size={14} color={color} />
      <span style={{ fontSize:11, fontWeight:700, color, textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</span>
    </div>
  );
}
function DCard({ children, style }) {
  return <div style={{ background:"white", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"1.25rem", marginBottom:16, ...style }}>{children}</div>;
}

function cellKey(tascaId, tri, alumne, criteriId) { return `${tascaId}|${tri}|${alumne}|${criteriId}`; }

// ─── MODAL: EDITOR DE CEL·LA ─────────────────────────────────────────────────
function CellModal({ info, notesCella, onAfegir, onEliminar, onClose }) {
  const [text, setText] = useState("");
  const [val, setVal] = useState("");
  const [data, setData] = useState(avui());

  const potDesar = !!text.trim() || !!val;
  const desar = () => {
    if (!potDesar) return;
    onAfegir({ id: uid(), data, text: text.trim(), valoracio: val || null });
    setText(""); setVal("");
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:10000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}
      onClick={onClose}>
      <div style={{ background:"white", borderRadius:16, width:"100%", maxWidth:520, maxHeight:"85vh",
        display:"flex", flexDirection:"column", boxShadow:"0 24px 60px rgba(0,0,0,0.25)", overflow:"hidden" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:"#1e293b" }}>{info.alumne}</div>
              <div style={{ fontSize:11, color:"#6366f1", marginTop:2 }}>{info.tascaNom} · {info.criteriText}</div>
              <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{info.trimestreLabel}</div>
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", padding:2 }}><X size={18} color="#94a3b8" /></button>
          </div>
        </div>

        <div style={{ padding:"14px 20px", overflowY:"auto", flex:1 }}>
          {notesCella.length === 0 ? (
            <p style={{ fontSize:12, color:"#94a3b8", textAlign:"center", padding:"1rem 0" }}>Encara no hi ha anotacions en aquesta cel·la.</p>
          ) : (
            notesCella.slice().sort((a,b) => b.data.localeCompare(a.data)).map(n => (
              <div key={n.id} style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:9, padding:"9px 11px", marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontSize:11, color:"#94a3b8" }}>{formatData(n.data)}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {n.valoracio && (
                      <span style={{ fontSize:10, fontWeight:800, color:VAL_META_DIARI[n.valoracio].color,
                        background:VAL_META_DIARI[n.valoracio].bg, border:`1px solid ${VAL_META_DIARI[n.valoracio].border}`, borderRadius:6, padding:"1px 6px" }}>
                        {n.valoracio}
                      </span>
                    )}
                    <button onClick={() => onEliminar(n.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#e57373" }}><Trash2 size={12} /></button>
                  </div>
                </div>
                {n.text && <p style={{ fontSize:12.5, color:"#374151", margin:0, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{n.text}</p>}
              </div>
            ))
          )}
        </div>

        <div style={{ padding:"14px 20px", borderTop:"1px solid #f1f5f9", background:"#f8fafc" }}>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <DInp type="date" value={data} onChange={setData} />
            </div>
            <select value={val} onChange={e => setVal(e.target.value)} style={{ ...inpBase, width:"auto", cursor:"pointer" }}>
              <option value="">Sense valoració</option>
              {VALORACIONS_DIARI.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <DTxa value={text} onChange={setText} rows={3} placeholder="Escriu l'anotació (opcional si ja poses valoració)..." />
          <div style={{ marginTop:8 }}>
            <DBtn variant="primary" full onClick={desar} disabled={!potDesar}><Save size={13} /> Afegir anotació</DBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ALUMNES ─────────────────────────────────────────────────────────────────
function AlumnesSeccio({ alumnes, setAlumnes }) {
  const [nom, setNom] = useState("");
  const [bloc, setBloc] = useState("");
  const [showImport, setShowImport] = useState(false);

  const afegir = () => { const n = nom.trim(); if (!n || alumnes.includes(n)) return; setAlumnes(a => [...a, n]); setNom(""); };
  const importar = () => {
    const noms = bloc.split("\n").map(n => n.trim()).filter(Boolean);
    setAlumnes(a => { const ex = new Set(a); return [...a, ...noms.filter(n => !ex.has(n))]; });
    setBloc(""); setShowImport(false);
  };
  const eliminar = i => setAlumnes(a => a.filter((_, j) => j !== i));

  return (
    <DCard>
      <DSecLabel icon={Users} label="Alumnes del grup" />
      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
        <DInp value={nom} onChange={setNom} placeholder="Nom i cognoms..." />
        <DBtn variant="primary" onClick={afegir}><Plus size={14} /> Afegir</DBtn>
      </div>
      <button onClick={() => setShowImport(s => !s)} style={{ background:"none", border:"none", color:"#6366f1", fontSize:12, cursor:"pointer", textDecoration:"underline", padding:0, marginBottom:10 }}>
        {showImport ? "▲ Amaga import massiu" : "▼ Importar llista (un nom per línia)"}
      </button>
      {showImport && (
        <div style={{ marginBottom:12 }}>
          <DTxa value={bloc} onChange={setBloc} rows={5} placeholder={"Maria Garcia\nJoan Puig\n..."} />
          <div style={{ marginTop:6 }}><DBtn onClick={importar}>Importar</DBtn></div>
        </div>
      )}
      {alumnes.length === 0 ? (
        <p style={{ fontSize:12, color:"#94a3b8" }}>Encara no hi ha alumnes.</p>
      ) : (
        <div>
          {alumnes.map((a, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 4px", borderBottom:"1px solid #f1f5f9", fontSize:13 }}>
              <span>{a}</span>
              <button onClick={() => eliminar(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#e57373" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </DCard>
  );
}

// ─── BANC DE CRITERIS (pràctics, per àrea, editables) ───────────────────────
function BancCriterisSeccio({ curs, setCurs, curriculum, bancCriteris, setBancCriteris }) {
  const [areaSel, setAreaSel] = useState("llengua_cat");
  const [nouText, setNouText] = useState("");
  const [editant, setEditant] = useState(null);
  const [mostrarRef, setMostrarRef] = useState(false);

  const items = bancCriteris[areaSel] || [];
  const cicle = (CURSOS_DIARI.find(c => c.id === curs) || CURSOS_DIARI[2]).cicle;
  const referencia = useMemo(() => criterisOficialsRef(curriculum, areaSel, cicle), [curriculum, areaSel, cicle]);

  const afegir = () => {
    const t = nouText.trim(); if (!t) return;
    setBancCriteris(prev => ({ ...prev, [areaSel]: [...(prev[areaSel] || []), { id: uid(), text: t }] }));
    setNouText("");
  };
  const eliminar = id => setBancCriteris(prev => ({ ...prev, [areaSel]: (prev[areaSel] || []).filter(x => x.id !== id) }));
  const desarEdicio = () => {
    if (!editant) return;
    setBancCriteris(prev => ({ ...prev, [areaSel]: (prev[areaSel] || []).map(x => x.id === editant.id ? { ...x, text: editant.text } : x) }));
    setEditant(null);
  };

  return (
    <DCard>
      <DSecLabel icon={ListChecks} label="Banc de criteris pràctics" />
      <p style={{ fontSize:12, color:"#64748b", marginBottom:14, lineHeight:1.6 }}>
        Aquests són els ítems que faràs servir per construir les teves tasques avaluables (p. ex. "Coherència", "Ortografia"...). No venen del currículum — els defineixes tu i els pots canviar quan vulguis.
      </p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
        {AREES_DIARI.map(a => {
          const sel = areaSel === a.id;
          return (
            <button key={a.id} onClick={() => setAreaSel(a.id)} style={{
              padding:"6px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit",
              border: sel ? "1.5px solid #6366f1" : "1.5px solid #e2e8f0",
              background: sel ? "#eef2ff" : "white", color: sel ? "#4338ca" : "#64748b",
            }}>{a.icon} {a.label}</button>
          );
        })}
      </div>

      {items.length === 0 && <p style={{ fontSize:12, color:"#94a3b8", marginBottom:12 }}>Encara no hi ha cap ítem per a aquesta àrea.</p>}

      {items.map(c => (
        <div key={c.id} style={{ display:"flex", gap:8, alignItems:"center", padding:"7px 4px", borderBottom:"1px solid #f1f5f9" }}>
          {editant?.id === c.id ? (
            <>
              <DInp value={editant.text} onChange={t => setEditant({ id:c.id, text:t })} />
              <DBtn size="sm" variant="primary" onClick={desarEdicio}><Save size={12} /></DBtn>
              <DBtn size="sm" onClick={() => setEditant(null)}>✕</DBtn>
            </>
          ) : (
            <>
              <span style={{ flex:1, fontSize:13, color:"#374151" }}>{c.text}</span>
              <button onClick={() => setEditant({ id:c.id, text:c.text })} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8" }}><Pencil size={13} /></button>
              <button onClick={() => eliminar(c.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#e57373" }}><Trash2 size={13} /></button>
            </>
          )}
        </div>
      ))}

      <div style={{ display:"flex", gap:8, marginTop:14, marginBottom:20 }}>
        <DInp value={nouText} onChange={setNouText} placeholder="Afegir un ítem nou (p. ex. Cohesió)..." />
        <DBtn variant="primary" onClick={afegir}><Plus size={14} /> Afegir</DBtn>
      </div>

      {curriculum && (
        <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:14 }}>
          <button onClick={() => setMostrarRef(s => !s)} style={{
            display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer",
            color:"#6366f1", fontSize:12, fontWeight:600, padding:0 }}>
            {mostrarRef ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Consultar els criteris oficials del currículum (només referència)
          </button>
          {mostrarRef && (
            <div style={{ marginTop:10 }}>
              <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                {CURSOS_DIARI.map(c => (
                  <button key={c.id} onClick={() => setCurs(c.id)} style={{
                    padding:"4px 10px", borderRadius:7, cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                    border: curs === c.id ? "1.5px solid #1e3a8a" : "1.5px solid #e2e8f0",
                    background: curs === c.id ? "#dbeafe" : "white", color: curs === c.id ? "#1e3a8a" : "#64748b",
                  }}>{c.label}</button>
                ))}
              </div>
              {referencia.length === 0 ? (
                <p style={{ fontSize:12, color:"#94a3b8" }}>No hi ha criteris oficials disponibles per a aquesta àrea.</p>
              ) : (
                referencia.map(c => (
                  <div key={c.id} style={{ fontSize:12, color:"#64748b", padding:"5px 0", borderBottom:"1px solid #f8fafc" }}>
                    <strong style={{ color:"#4338ca" }}>{c.id}</strong> — {c.text}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </DCard>
  );
}

// ─── TASQUES AVALUABLES ──────────────────────────────────────────────────────
function TasquesSeccio({ tasques, setTasques, bancCriteris, setBancCriteris }) {
  const [creant, setCreant] = useState(false);
  const [editantId, setEditantId] = useState(null);
  const [nom, setNom] = useState("");
  const [area, setArea] = useState("llengua_cat");
  const [seleccionats, setSeleccionats] = useState([]);
  const [nouItemInline, setNouItemInline] = useState("");
  const [bancLocal, setBancLocal] = useState(null); // còpia temporal si s'afegeix un ítem nou des d'aquí
  const [cerca, setCerca] = useState("");

  const tasquesFiltrades = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return tasques;
    return tasques.filter(t => t.nom.toLowerCase().includes(q));
  }, [tasques, cerca]);
  const gruposBuits = cerca.trim() && tasquesFiltrades.length === 0;

  const items = (bancLocal || bancCriteris)[area] || [];

  const obrirNova = () => {
    setCreant(true); setEditantId(null); setNom(""); setArea("llengua_cat"); setSeleccionats([]); setBancLocal(null);
  };
  const obrirEdicio = t => {
    setCreant(true); setEditantId(t.id); setNom(t.nom); setArea(t.area); setSeleccionats(t.criterisIds); setBancLocal(null);
  };
  const toggleCriteri = id => setSeleccionats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const afegirItemInline = () => {
    const t = nouItemInline.trim(); if (!t) return;
    const nouId = uid();
    setBancLocal(prev => {
      const base = prev || bancCriteris;
      return { ...base, [area]: [...(base[area] || []), { id: nouId, text: t }] };
    });
    setSeleccionats(prev => [...prev, nouId]);
    setNouItemInline("");
  };

  const desar = () => {
    if (!nom.trim() || seleccionats.length === 0) return;
    // Si s'han afegit ítems nous des d'aquí, cal persistir-los al banc real abans de res
    if (bancLocal && bancLocal[area]) {
      setBancCriteris(prev => ({ ...prev, [area]: bancLocal[area] }));
    }
    const tasca = { id: editantId || uid(), nom: nom.trim(), area, criterisIds: seleccionats };
    setTasques(prev => editantId ? prev.map(t => t.id === editantId ? tasca : t) : [...prev, tasca]);
    setCreant(false);
  };

  const eliminar = id => {
    if (!confirm("Eliminar aquesta tasca? Les anotacions ja fetes amb aquesta tasca no es veuran, però no s'esborren.")) return;
    setTasques(prev => prev.filter(t => t.id !== id));
  };

  const criteriText = (a, id) => {
    const banc = (bancLocal && bancLocal[a]) || bancCriteris[a] || [];
    return banc.find(c => c.id === id)?.text || "?";
  };

  return (
    <DCard>
      <DSecLabel icon={ClipboardList} label="Tasques avaluables" />
      <p style={{ fontSize:12, color:"#64748b", marginBottom:14, lineHeight:1.6 }}>
        Una tasca és el que avalues (una redacció, un exercici de gramàtica...). Tria només els ítems del banc que hi apliquen. Es poden reutilitzar en qualsevol trimestre.
      </p>

      {!creant && (
        <>
          {tasques.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <DInp value={cerca} onChange={setCerca} placeholder="Cercar una tasca pel nom..." />
            </div>
          )}
          {tasques.length === 0 ? (
            <p style={{ fontSize:12, color:"#94a3b8", marginBottom:14 }}>Encara no has creat cap tasca.</p>
          ) : gruposBuits ? (
            <p style={{ fontSize:12, color:"#94a3b8", marginBottom:14 }}>Cap tasca coincideix amb "{cerca}".</p>
          ) : (
            AREES_DIARI.map(areaInfo => {
              const delArea = tasquesFiltrades.filter(t => t.area === areaInfo.id);
              if (delArea.length === 0) return null;
              return (
                <div key={areaInfo.id} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>
                    {areaInfo.icon} {areaInfo.label} <span style={{ fontWeight:400, color:"#cbd5e1" }}>({delArea.length})</span>
                  </div>
                  {delArea.map(t => (
                    <div key={t.id} style={{ border:"1.5px solid #e2e8f0", borderRadius:10, padding:"10px 13px", marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div style={{ fontSize:13.5, fontWeight:700, color:"#1e293b" }}>{t.nom}</div>
                        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                          <button onClick={() => obrirEdicio(t)} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8" }}><Pencil size={14} /></button>
                          <button onClick={() => eliminar(t.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#e57373" }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:8 }}>
                        {t.criterisIds.map(cid => (
                          <span key={cid} style={{ fontSize:11, background:"#eef2ff", color:"#4338ca", borderRadius:20, padding:"2px 9px" }}>
                            {criteriText(t.area, cid)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
          <div style={{ marginTop:10 }}>
            <DBtn variant="primary" onClick={obrirNova}><Plus size={14} /> Nova tasca</DBtn>
          </div>
        </>
      )}

      {creant && (
        <div style={{ border:"1.5px solid #c7d2fe", background:"#f5f7ff", borderRadius:12, padding:"1rem" }}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:600, color:"#64748b", display:"block", marginBottom:4 }}>Nom de la tasca</label>
            <DInp value={nom} onChange={setNom} placeholder="Ex: Redacció — la notícia" />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:600, color:"#64748b", display:"block", marginBottom:6 }}>Àrea</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {AREES_DIARI.map(a => {
                const sel = area === a.id;
                return (
                  <button key={a.id} onClick={() => { setArea(a.id); setSeleccionats([]); setBancLocal(null); }} style={{
                    padding:"5px 11px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit",
                    border: sel ? "1.5px solid #6366f1" : "1.5px solid #e2e8f0",
                    background: sel ? "#eef2ff" : "white", color: sel ? "#4338ca" : "#64748b",
                  }}>{a.icon} {a.label}</button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:600, color:"#64748b", display:"block", marginBottom:6 }}>Criteris a avaluar</label>
            {items.length === 0 ? (
              <p style={{ fontSize:12, color:"#94a3b8" }}>El banc d'aquesta àrea és buit. Afegeix-ne un a sota.</p>
            ) : (
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {items.map(it => {
                  const sel = seleccionats.includes(it.id);
                  return (
                    <button key={it.id} onClick={() => toggleCriteri(it.id)} style={{
                      padding:"5px 11px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit",
                      border: sel ? "1.5px solid #059669" : "1.5px solid #e2e8f0",
                      background: sel ? "#ecfdf5" : "white", color: sel ? "#047857" : "#64748b",
                    }}>{sel ? "✓ " : ""}{it.text}</button>
                  );
                })}
              </div>
            )}
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <DInp value={nouItemInline} onChange={setNouItemInline} placeholder="O afegeix un ítem nou al banc..." />
              <DBtn size="sm" onClick={afegirItemInline}><Plus size={13} /></DBtn>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <DBtn variant="primary" onClick={desar} disabled={!nom.trim() || seleccionats.length === 0}><Save size={13} /> Desar tasca</DBtn>
            <DBtn onClick={() => setCreant(false)}>Cancel·lar</DBtn>
          </div>
        </div>
      )}
    </DCard>
  );
}

// ─── GRAELLA ─────────────────────────────────────────────────────────────────
function GraellaSeccio({ alumnes, tasques, bancCriteris, cellules, setCellules, onToast }) {
  const [tascaId, setTascaId] = useDiariState("graella_tasca", null);
  const [tri, setTri] = useDiariState("graella_tri", 1);
  const [obert, setObert] = useState(null);

  const tasca = tasques.find(t => t.id === tascaId) || tasques[0];
  const criteris = tasca ? tasca.criterisIds.map(cid => {
    const item = (bancCriteris[tasca.area] || []).find(c => c.id === cid);
    return { id: cid, text: item?.text || "?" };
  }) : [];

  const notesDe = (alumne, criteriId) => tasca ? (cellules[cellKey(tasca.id, tri, alumne, criteriId)] || []) : [];

  const afegirAnotacio = (alumne, criteriId, nota) => {
    const key = cellKey(tasca.id, tri, alumne, criteriId);
    setCellules(prev => ({ ...prev, [key]: [...(prev[key] || []), nota] }));
    onToast && onToast("Anotació desada");
  };
  const eliminarAnotacio = (alumne, criteriId, notaId) => {
    const key = cellKey(tasca.id, tri, alumne, criteriId);
    setCellules(prev => ({ ...prev, [key]: (prev[key] || []).filter(n => n.id !== notaId) }));
  };

  if (alumnes.length === 0) {
    return <DCard><p style={{ fontSize:12, color:"#94a3b8" }}>Afegeix alumnes a la secció "Alumnes" per començar.</p></DCard>;
  }
  if (tasques.length === 0) {
    return <DCard><p style={{ fontSize:12, color:"#94a3b8" }}>Encara no has creat cap tasca avaluable. Ves a la pestanya "Tasques" per crear-ne una.</p></DCard>;
  }

  return (
    <DCard style={{ padding:0, overflow:"hidden" }}>
      <div style={{ padding:"1.1rem 1.25rem 0.75rem" }}>
        <DSecLabel icon={Grid3x3} label="Graella de registre" />
        <div style={{ marginBottom:10 }}>
          <label style={{ fontSize:11, fontWeight:600, color:"#64748b", display:"block", marginBottom:4 }}>Tasca</label>
          <select value={tasca?.id || ""} onChange={e => setTascaId(e.target.value)} style={{ ...inpBase, cursor:"pointer" }}>
            {tasques.map(t => {
              const a = AREES_DIARI.find(x => x.id === t.area);
              return <option key={t.id} value={t.id}>{a?.icon} {t.nom}</option>;
            })}
          </select>
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:6 }}>
          {TRIMESTRES.map(t => {
            const sel = tri === t.id;
            return (
              <button key={t.id} onClick={() => setTri(t.id)} style={{
                padding:"5px 13px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit",
                border: sel ? "1.5px solid #059669" : "1.5px solid #e2e8f0",
                background: sel ? "#ecfdf5" : "white", color: sel ? "#047857" : "#64748b",
              }}>{t.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ overflowX:"auto", borderTop:"1.5px solid #e2e8f0" }}>
        <table style={{ borderCollapse:"collapse", width:"100%", fontSize:12 }}>
          <thead>
            <tr>
              <th style={{ position:"sticky", left:0, zIndex:2, background:"#f8fafc", borderBottom:"1.5px solid #e2e8f0",
                borderRight:"1.5px solid #e2e8f0", padding:"8px 12px", textAlign:"left", minWidth:150, fontSize:11,
                fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.04em" }}>
                Alumne
              </th>
              {criteris.map(c => (
                <th key={c.id} style={{ background:"#f8fafc", borderBottom:"1.5px solid #e2e8f0",
                  borderLeft:"1px solid #e2e8f0", padding:"8px 10px", minWidth:120, maxWidth:160, textAlign:"left",
                  fontSize:11.5, fontWeight:700, color:"#4338ca" }}>
                  {c.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alumnes.map((alumne, ai) => (
              <tr key={alumne} style={{ background: ai % 2 === 0 ? "white" : "#fafbfc" }}>
                <td style={{ position:"sticky", left:0, zIndex:1, background: ai % 2 === 0 ? "white" : "#fafbfc",
                  borderRight:"1.5px solid #e2e8f0", borderBottom:"1px solid #f1f5f9", padding:"7px 12px",
                  fontWeight:600, color:"#1e293b", whiteSpace:"nowrap" }}>
                  {alumne}
                </td>
                {criteris.map(c => {
                  const notes = notesDe(alumne, c.id);
                  const darrera = notes.slice().sort((a,b) => b.data.localeCompare(a.data))[0];
                  return (
                    <td key={c.id} onClick={() => setObert({ alumne, criteriId: c.id, criteriText: c.text })}
                      style={{ borderLeft:"1px solid #f1f5f9", borderBottom:"1px solid #f1f5f9", padding:"6px 8px",
                        cursor:"pointer", verticalAlign:"top" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#eef2ff"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      {notes.length === 0 ? (
                        <span style={{ color:"#cbd5e1", fontSize:14 }}>+</span>
                      ) : (
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                            {darrera.valoracio && (
                              <span style={{ fontSize:9.5, fontWeight:800, color:VAL_META_DIARI[darrera.valoracio].color,
                                background:VAL_META_DIARI[darrera.valoracio].bg, borderRadius:5, padding:"0 4px" }}>
                                {darrera.valoracio}
                              </span>
                            )}
                            <span style={{ fontSize:9.5, color:"#94a3b8" }}>{formatData(darrera.data)}</span>
                            {notes.length > 1 && <span style={{ fontSize:9.5, color:"#6366f1", fontWeight:700 }}>+{notes.length - 1}</span>}
                          </div>
                          {darrera.text && (
                            <div style={{ fontSize:11, color:"#374151", lineHeight:1.4,
                              display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                              {darrera.text}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {obert && (
        <CellModal
          info={{ alumne: obert.alumne, criteriText: obert.criteriText, tascaNom: tasca.nom,
            trimestreLabel: TRIMESTRES.find(t => t.id === tri)?.label }}
          notesCella={notesDe(obert.alumne, obert.criteriId)}
          onAfegir={nota => afegirAnotacio(obert.alumne, obert.criteriId, nota)}
          onEliminar={notaId => eliminarAnotacio(obert.alumne, obert.criteriId, notaId)}
          onClose={() => setObert(null)}
        />
      )}
    </DCard>
  );
}

// ─── FITXA ALUMNE ─────────────────────────────────────────────────────────────
function flattenCellules(cellules) {
  const out = [];
  Object.entries(cellules).forEach(([key, notes]) => {
    const [tascaId, tri, alumne, criteriId] = key.split("|");
    (notes || []).forEach(n => out.push({ ...n, tascaId, tri: Number(tri), alumne, criteriId }));
  });
  return out;
}

// Conversió NA/AS/AN/AE <-> número, per calcular una valoració "majoritària"
const VAL_NUM_DIARI = { NA: 4, AS: 5.5, AN: 7.5, AE: 9.5 };
function valoracioMajoritaria(notes) {
  const vals = notes.map(n => n.valoracio).filter(Boolean);
  if (vals.length === 0) return null;
  const mitjana = vals.reduce((s, v) => s + VAL_NUM_DIARI[v], 0) / vals.length;
  if (mitjana < 5) return "NA";
  if (mitjana < 7) return "AS";
  if (mitjana < 9) return "AN";
  return "AE";
}

function TascaResumCard({ tascaId, notesTasca, infoTasca, bancCriteris }) {
  const [obert, setObert] = useState(false);
  const t = infoTasca(tascaId);
  const areaInfo = AREES_DIARI.find(a => a.id === t?.area);
  const criteriText = cid => (bancCriteris[t?.area] || []).find(c => c.id === cid)?.text || cid;

  // Agrupa les notes d'aquesta tasca per criteri, per mostrar la darrera valoració de cada un
  const perCriteri = {};
  notesTasca.forEach(n => { (perCriteri[n.criteriId] = perCriteri[n.criteriId] || []).push(n); });
  const darreraData = notesTasca.slice().sort((a,b) => b.data.localeCompare(a.data))[0]?.data;

  return (
    <div style={{ border:"1.5px solid #e2e8f0", borderRadius:10, marginBottom:9, overflow:"hidden" }}>
      <button onClick={() => setObert(o => !o)} style={{
        width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"10px 13px", background:"white", border:"none", cursor:"pointer", textAlign:"left" }}>
        <div>
          <div style={{ fontSize:13.5, fontWeight:700, color:"#1e293b" }}>{t?.nom || "Tasca eliminada"}</div>
          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{areaInfo?.icon} {areaInfo?.label} · {formatData(darreraData)} · {notesTasca.length} anotació{notesTasca.length > 1 ? "ns" : ""}</div>
        </div>
        {obert ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
      </button>
      <div style={{ padding:"0 13px 10px", display:"flex", flexWrap:"wrap", gap:6 }}>
        {Object.entries(perCriteri).map(([cid, notes]) => {
          const darrera = notes.slice().sort((a,b) => b.data.localeCompare(a.data))[0];
          return (
            <span key={cid} style={{ fontSize:11, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:20, padding:"3px 10px", color:"#374151" }}>
              {criteriText(cid)}
              {darrera.valoracio && (
                <strong style={{ color:VAL_META_DIARI[darrera.valoracio].color, marginLeft:5 }}>{darrera.valoracio}</strong>
              )}
            </span>
          );
        })}
      </div>
      {obert && (
        <div style={{ borderTop:"1px solid #f1f5f9", padding:"10px 13px", background:"#fafbfc" }}>
          {notesTasca.slice().sort((a,b) => b.data.localeCompare(a.data)).map(n => (
            <div key={n.id} style={{ marginBottom:9 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:3 }}>
                <span style={{ fontSize:11, color:"#94a3b8" }}>{formatData(n.data)}</span>
                <span style={{ fontSize:11, color:"#6366f1", fontStyle:"italic" }}>{criteriText(n.criteriId)}</span>
                {n.valoracio && <span style={{ fontSize:10, fontWeight:800, color:VAL_META_DIARI[n.valoracio].color }}>{n.valoracio}</span>}
              </div>
              <p style={{ fontSize:12.5, color:"#374151", margin:0, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{n.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumInformesModal({ areaInfo, valoracio, notes, onClose }) {
  const [copiat, setCopiat] = useState(false);
  const text = useMemo(() => {
    const frases = notes.slice(0, 6).map(n => n.text.trim()).filter(Boolean);
    return frases.join(" ");
  }, [notes]);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(text); setCopiat(true); setTimeout(() => setCopiat(false), 1800); }
    catch (e) { alert("No s'ha pogut copiar automàticament. Selecciona el text i copia'l manualment."); }
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:10000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }} onClick={onClose}>
      <div style={{ background:"white", borderRadius:16, width:"100%", maxWidth:520, boxShadow:"0 24px 60px rgba(0,0,0,0.25)", overflow:"hidden" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:13.5, fontWeight:800, color:"#1e293b" }}>{areaInfo?.icon} Resum — {areaInfo?.label}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer" }}><X size={18} color="#94a3b8" /></button>
        </div>
        <div style={{ padding:"16px 20px" }}>
          {valoracio && (
            <div style={{ marginBottom:12, fontSize:12, color:"#64748b" }}>
              Valoració orientativa (segons les anotacions): <strong style={{ color:VAL_META_DIARI[valoracio].color }}>{valoracio} · {VAL_META_DIARI[valoracio].label}</strong>
            </div>
          )}
          <DTxa value={text} onChange={() => {}} rows={6} />
          <p style={{ fontSize:11, color:"#94a3b8", marginTop:6 }}>Text generat ajuntant les teves pròpies anotacions — revisa'l abans d'enganxar-lo a Informes Avaluació.</p>
          <div style={{ marginTop:10 }}>
            <DBtn variant="primary" full onClick={copiar}>{copiat ? "✓ Copiat!" : "Copiar"}</DBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function FitxaAlumneSeccio({ alumnes, cellules, tasques, bancCriteris }) {
  const [sel, setSel] = useState(alumnes[0] || "");
  const [fTri, setFTri] = useState("");
  const [fArea, setFArea] = useState("");
  const [resumObert, setResumObert] = useState(null); // { areaInfo, valoracio, notes }
  useEffect(() => { if (!sel && alumnes.length) setSel(alumnes[0]); }, [alumnes]);

  const infoTasca = tascaId => tasques.find(t => t.id === tascaId);

  const flat = useMemo(() => {
    let f = flattenCellules(cellules).filter(n => n.alumne === sel);
    if (fTri) f = f.filter(n => n.tri === Number(fTri));
    if (fArea) f = f.filter(n => infoTasca(n.tascaId)?.area === fArea);
    return f.sort((a,b) => b.data.localeCompare(a.data));
  }, [cellules, sel, fTri, fArea, tasques]);

  // Agrupa per tasca per a les targetes resum
  const perTasca = {};
  flat.forEach(n => { (perTasca[n.tascaId] = perTasca[n.tascaId] || []).push(n); });

  // Agrupa per àrea per al pont amb Informes
  const areesAmbDades = useMemo(() => {
    const ids = new Set(flat.map(n => infoTasca(n.tascaId)?.area).filter(Boolean));
    return AREES_DIARI.filter(a => ids.has(a.id));
  }, [flat, tasques]);

  const exportar = () => {
    let text = `FITXA — ${sel}\n${"═".repeat(40)}\n\n`;
    flat.forEach(n => {
      const t = infoTasca(n.tascaId);
      const areaInfo = AREES_DIARI.find(a => a.id === t?.area);
      const criteriText = (bancCriteris[t?.area] || []).find(c => c.id === n.criteriId)?.text || n.criteriId;
      text += `${formatData(n.data)} · ${t?.nom || "?"} (${areaInfo?.label || ""}) · Tri ${n.tri}\n`;
      text += `Criteri: ${criteriText}${n.valoracio ? " (" + n.valoracio + ")" : ""}\n`;
      text += `${n.text}\n\n`;
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type:"text/plain;charset=utf-8" }));
    a.download = `fitxa_${sel.replace(/\s+/g,"_")}.txt`;
    a.click();
  };

  if (alumnes.length === 0) return <DCard><p style={{ fontSize:12, color:"#94a3b8" }}>Afegeix alumnes primer.</p></DCard>;

  return (
    <DCard>
      <DSecLabel icon={UserRound} label="Fitxa d'alumne" />
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...inpBase, flex:"1 1 160px", cursor:"pointer" }}>
          {alumnes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={fTri} onChange={e => setFTri(e.target.value)} style={{ ...inpBase, width:"auto", cursor:"pointer" }}>
          <option value="">Tots els trimestres</option>
          {TRIMESTRES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select value={fArea} onChange={e => setFArea(e.target.value)} style={{ ...inpBase, width:"auto", cursor:"pointer" }}>
          <option value="">Totes les àrees</option>
          {AREES_DIARI.map(a => <option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
        </select>
        <DBtn onClick={exportar} disabled={flat.length === 0}><Download size={13} /> .txt</DBtn>
      </div>

      {areesAmbDades.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16, paddingBottom:14, borderBottom:"1px solid #f1f5f9" }}>
          <span style={{ fontSize:11, color:"#94a3b8", alignSelf:"center", marginRight:4 }}>Resum per a Informes:</span>
          {areesAmbDades.map(areaInfo => {
            const notesArea = flat.filter(n => infoTasca(n.tascaId)?.area === areaInfo.id);
            const val = valoracioMajoritaria(notesArea);
            return (
              <button key={areaInfo.id} onClick={() => setResumObert({ areaInfo, valoracio: val, notes: notesArea })} style={{
                fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:20, cursor:"pointer",
                border:"1px solid #c7d2fe", background:"#f5f7ff", color:"#4338ca" }}>
                {areaInfo.icon} {areaInfo.label}
              </button>
            );
          })}
        </div>
      )}

      {flat.length === 0 ? (
        <p style={{ fontSize:12, color:"#94a3b8", textAlign:"center", padding:"1.5rem 0" }}>Encara no hi ha anotacions per a {sel} amb aquests filtres.</p>
      ) : (
        <>
          {Object.entries(perTasca).map(([tascaId, notesTasca]) => (
            <TascaResumCard key={tascaId} tascaId={tascaId} notesTasca={notesTasca} infoTasca={infoTasca} bancCriteris={bancCriteris} />
          ))}
        </>
      )}

      {resumObert && (
        <ResumInformesModal areaInfo={resumObert.areaInfo} valoracio={resumObert.valoracio} notes={resumObert.notes} onClose={() => setResumObert(null)} />
      )}
    </DCard>
  );
}

// ─── BACKUP ───────────────────────────────────────────────────────────────────
function BackupBarra({ alumnes, cellules, tasques, bancCriteris, curs, setAlumnes, setCellules, setTasques, setBancCriteris, setCurs, onToast }) {
  const fileRef = useRef(null);
  const exportarTot = () => {
    const payload = { versio: 3, exportat: new Date().toISOString(), alumnes, cellules, tasques, bancCriteris, curs };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" }));
    a.download = `diari_aula_backup_${avui()}.json`;
    a.click();
  };
  const importarTot = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.alumnes) || typeof data.cellules !== "object") throw new Error("Format no vàlid");
        setAlumnes(data.alumnes || []);
        setCellules(data.cellules || {});
        setTasques(data.tasques || []);
        setBancCriteris(data.bancCriteris || bancInicial());
        setCurs(data.curs || "3r");
        onToast && onToast("Backup importat correctament");
      } catch (err) { alert("El fitxer no és un backup vàlid del Diari d'Aula."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  return (
    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginBottom:16, flexWrap:"wrap" }}>
      <DBtn size="sm" onClick={exportarTot}><Download size={12} /> Backup complet (.json)</DBtn>
      <DBtn size="sm" onClick={() => fileRef.current?.click()}><Upload size={12} /> Importar backup</DBtn>
      <input ref={fileRef} type="file" accept=".json" onChange={importarTot} style={{ display:"none" }} />
      <DBtn size="sm" variant="danger" onClick={() => {
        if (confirm("Vols esborrar TOTES les dades del Diari d'Aula? Fes un backup abans si no n'estàs segur.")) {
          clearDiariPersisted(); location.reload();
        }
      }}><Trash2 size={12} /> Esborrar tot</DBtn>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ─── COMPONENT PRINCIPAL ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
const SECCIONS = [
  { id:"alumnes",  label:"Alumnes",        icon:Users },
  { id:"tasques",  label:"Tasques",        icon:ClipboardList },
  { id:"graella",  label:"Graella",        icon:Grid3x3 },
  { id:"fitxa",    label:"Fitxa alumne",   icon:UserRound },
  { id:"banc",     label:"Banc de criteris", icon:ListChecks },
];

export default function DiariAula({ onToast, curriculum }) {
  const [seccio, setSeccio] = useDiariState("seccio3", "alumnes");
  const [alumnes, setAlumnes] = useDiariState("alumnes", []);
  const [cellules, setCellules] = useDiariState("cellules_v3", {});
  const [tasques, setTasques] = useDiariState("tasques", []);
  const [bancCriteris, setBancCriteris] = useDiariState("banc_criteris", bancInicial());
  const [curs, setCurs] = useDiariState("curs", "3r");

  return (
    <div>
      <div style={{ display:"flex", gap:6, marginBottom:16, background:"#f8fafc", borderRadius:12, padding:5, border:"1.5px solid #e2e8f0", overflowX:"auto" }}>
        {SECCIONS.map(s => {
          const sel = seccio === s.id; const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => setSeccio(s.id)} style={{
              flex:"1 1 auto", display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"9px 10px", borderRadius:9,
              cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, whiteSpace:"nowrap",
              border: sel ? "1.5px solid #6366f1" : "1.5px solid transparent",
              background: sel ? "white" : "transparent", color: sel ? "#6366f1" : "#94a3b8",
              boxShadow: sel ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </div>

      <BackupBarra alumnes={alumnes} cellules={cellules} tasques={tasques} bancCriteris={bancCriteris} curs={curs}
        setAlumnes={setAlumnes} setCellules={setCellules} setTasques={setTasques} setBancCriteris={setBancCriteris} setCurs={setCurs} onToast={onToast} />

      {seccio === "alumnes" && <AlumnesSeccio alumnes={alumnes} setAlumnes={setAlumnes} />}
      {seccio === "tasques" && <TasquesSeccio tasques={tasques} setTasques={setTasques} bancCriteris={bancCriteris} setBancCriteris={setBancCriteris} />}
      {seccio === "graella" && <GraellaSeccio alumnes={alumnes} tasques={tasques} bancCriteris={bancCriteris} cellules={cellules} setCellules={setCellules} onToast={onToast} />}
      {seccio === "fitxa" && <FitxaAlumneSeccio alumnes={alumnes} cellules={cellules} tasques={tasques} bancCriteris={bancCriteris} />}
      {seccio === "banc" && <BancCriterisSeccio curs={curs} setCurs={setCurs} curriculum={curriculum} bancCriteris={bancCriteris} setBancCriteris={setBancCriteris} />}

      <div style={{ display:"flex", alignItems:"flex-start", gap:8, background:"#f0f9ff", border:"1px solid #bae6fd",
        borderRadius:10, padding:"10px 14px", marginTop:20, fontSize:12, color:"#0c4a6e", lineHeight:1.6 }}>
        <AlertTriangle size={14} color="#0284c7" style={{ flexShrink:0, marginTop:2 }} />
        <span>Totes les dades es guarden només en aquest navegador. Fes un <strong>backup (.json)</strong> de tant en tant.</span>
      </div>
    </div>
  );
}
