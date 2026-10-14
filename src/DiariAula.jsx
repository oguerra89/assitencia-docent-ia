import { useState, useEffect, useMemo, useRef } from "react";
import {
  NotebookPen, Users, ListChecks, History, UserRound, Plus, Trash2,
  Search, Download, Upload, X, CheckCircle2, AlertTriangle,
  Pencil, Save, Grid3x3
} from "lucide-react";

/*
  DIARI D'AULA — Graella de registre (v2)
  ──────────────────────────────────────
  Files = alumnes · Columnes = criteris d'avaluació (per àrea i trimestre) · Cel·la = anotacions.

  Com integrar-lo al teu App.jsx:
    1. Enganxa aquest fitxer sencer.
    2. Substitueix DEMO_CURRICULUM per una crida real a partir del teu CURRICULUM_PRIMARIA
       existent (mateixa estructura: area.criteris[].ca / .inicial / .mitja / .superior).
    3. Afegeix a TABS:  { id:"diari", label:"Diari d'Aula", icon:NotebookPen }
    4. Afegeix a <main>:  {tab==="diari" && <DiariAula onToast={onToast} />}
    5. Pots reutilitzar els teus àtoms (Inp, Txa, Btn, SecLabel...) en lloc de les còpies locals.

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

/*
  CURRÍCULUM REAL — el component rep `curriculum` com a prop (el teu CURRICULUM_PRIMARIA,
  tal qual, sense duplicar-lo). Com que a "Diari d'Aula" Català i Castellà van per separat
  però al teu currículum estan units en "llengua_cat_cast", i Anglès és "llengua_estr",
  aquest mapa tradueix els ids d'aquí als ids reals del teu currículum.
*/
const AREA_CURRI_MAP = {
  llengua_cat:   "llengua_cat_cast",
  llengua_cast:  "llengua_cat_cast",
  angles:        "llengua_estr",
  matematiques:  "matematiques",
  coneix_medi:   "medi",
  ed_artistica:  "artistica",
  ed_fisica:     "fisica",
  valors:        "valors",
  general:       null, // sense criteris oficials — només criteris propis
};

/*
  DEMO_CURRICULUM — NOMÉS s'usa quan no es passa `curriculum` (previsualització aquí al xat).
  Quan l'integris a App.jsx, passa <DiariAula curriculum={CURRICULUM_PRIMARIA} ... /> i
  aquest bloc queda sense efecte.
*/
const DEMO_CURRICULUM = {
  matematiques: { criteris: [
    { ca: "CA 1.1", inicial: "Interpretar la informació d'un problema i respondre a les preguntes plantejades.", mitja: "Interpretar la informació d'un problema responent a les preguntes plantejades.", superior: "Interpretar i reformular problemes i situacions de la vida quotidiana." },
    { ca: "CA 2.1", inicial: "Emprar estratègies i formes pròpies de raonar per resoldre un problema.", mitja: "Emprar estratègies i formes de raonament diverses per resoldre un problema i explicar-ne el procés.", superior: "Seleccionar entre diferents estratègies per resoldre un problema i justificar-la." },
    { ca: "CA 6.1", inicial: "Seleccionar el llenguatge matemàtic bàsic present en la vida quotidiana donant-li significat.", mitja: "Reconèixer i usar llenguatge matemàtic present en el seu entorn donant-li significat.", superior: "Interpretar i usar llenguatge matemàtic adequat donant-li significat." },
  ]},
  llengua_cat_cast: { criteris: [
    { ca: "CA 4.1", inicial: "Llegir textos propers de forma silenciosa i en veu alta amb fluïdesa suficient.", mitja: "Llegir textos progressivament complexos amb fluïdesa.", superior: "Llegir tot tipus de textos amb bona fluïdesa." },
    { ca: "CA 3.2", inicial: "Participar en interaccions orals espontànies respectant les normes d'interacció oral.", mitja: "Participar en interaccions orals espontànies i reglades, aportant idees i respectant les dels altres.", superior: "Participar en interaccions orals integrant les opinions dels altres i usant el registre adequat." },
    { ca: "CA 5.1", inicial: "Redactar textos escrits propers i viscuts amb adequació, coherència i cohesió adaptades al moment evolutiu.", mitja: "Redactar textos escrits, propers i escolars, amb adequació, coherència i cohesió.", superior: "Redactar textos escrits de tipus divers amb adequació, coherència, cohesió i correcció." },
  ]},
};

function criterisOficials(curriculum, areaId, cicle) {
  const font = curriculum || DEMO_CURRICULUM;
  const curriKey = curriculum ? AREA_CURRI_MAP[areaId] : areaId; // amb DEMO no cal mapar
  if (!curriKey) return [];
  const area = font[curriKey];
  if (!area || !area.criteris) return [];
  return area.criteris.map(c => ({ id: c.ca, text: c[cicle] || c.mitja || c.superior || c.inicial || "", origen: "oficial" }))
    .filter(c => c.text);
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

// ─── CLAU D'UNA CEL·LA DE LA GRAELLA ────────────────────────────────────────
function cellKey(area, tri, alumne, criteriId) { return `${area}|${tri}|${alumne}|${criteriId}`; }

// ─── MODAL: EDITOR DE CEL·LA ─────────────────────────────────────────────────
function CellModal({ info, notesCella, onAfegir, onEliminar, onClose }) {
  const [text, setText] = useState("");
  const [val, setVal] = useState("");
  const [data, setData] = useState(avui());

  const desar = () => {
    if (!text.trim()) return;
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
              <div style={{ fontSize:11, color:"#6366f1", marginTop:2 }}>{info.criteriText}</div>
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
                <p style={{ fontSize:12.5, color:"#374151", margin:0, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{n.text}</p>
              </div>
            ))
          )}
        </div>

        <div style={{ padding:"14px 20px", borderTop:"1px solid #f1f5f9", background:"#f8fafc" }}>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <DInp type="date" value={data} onChange={setData} />
            </div>
            {info.criteriId && (
              <select value={val} onChange={e => setVal(e.target.value)} style={{ ...inpBase, width:"auto", cursor:"pointer" }}>
                <option value="">Sense valoració</option>
                {VALORACIONS_DIARI.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </div>
          <DTxa value={text} onChange={setText} rows={3} placeholder="Escriu l'anotació..." />
          <div style={{ marginTop:8 }}>
            <DBtn variant="primary" full onClick={desar} disabled={!text.trim()}><Save size={13} /> Afegir anotació</DBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── GRAELLA ─────────────────────────────────────────────────────────────────
function GraellaSeccio({ alumnes, cicle, curriculum, criterisCustom, cellules, setCellules, onToast }) {
  const [area, setArea] = useDiariState("graella_area", "matematiques");
  const [tri, setTri] = useDiariState("graella_tri", 1);
  const [obert, setObert] = useState(null);

  const oficials = useMemo(() => criterisOficials(curriculum, area, cicle).filter(c => !(criterisCustom[`${area}__eliminats`] || []).includes(c.id)), [curriculum, area, cicle, criterisCustom]);
  const custom = (criterisCustom[area] || []).filter(c => c.cicle === cicle);
  const criteris = [...oficials, ...custom];

  const notesDe = (alumne, criteriId) => cellules[cellKey(area, tri, alumne, criteriId)] || [];

  const afegirAnotacio = (alumne, criteriId, nota) => {
    const key = cellKey(area, tri, alumne, criteriId);
    setCellules(prev => ({ ...prev, [key]: [...(prev[key] || []), nota] }));
    onToast && onToast("Anotació desada");
  };
  const eliminarAnotacio = (alumne, criteriId, notaId) => {
    const key = cellKey(area, tri, alumne, criteriId);
    setCellules(prev => ({ ...prev, [key]: (prev[key] || []).filter(n => n.id !== notaId) }));
  };

  if (alumnes.length === 0) {
    return <DCard><p style={{ fontSize:12, color:"#94a3b8" }}>Afegeix alumnes a la secció "Alumnes" per començar la graella.</p></DCard>;
  }

  return (
    <DCard style={{ padding:0, overflow:"hidden" }}>
      <div style={{ padding:"1.1rem 1.25rem 0.75rem" }}>
        <DSecLabel icon={Grid3x3} label="Graella de registre" />
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
          {AREES_DIARI.map(a => {
            const sel = area === a.id;
            return (
              <button key={a.id} onClick={() => setArea(a.id)} style={{
                padding:"6px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit",
                border: sel ? "1.5px solid #6366f1" : "1.5px solid #e2e8f0",
                background: sel ? "#eef2ff" : "white", color: sel ? "#4338ca" : "#64748b",
              }}>{a.icon} {a.label}</button>
            );
          })}
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

      {criteris.length === 0 ? (
        <div style={{ padding:"1.25rem" }}>
          <p style={{ fontSize:12, color:"#94a3b8" }}>
            Aquesta àrea encara no té criteris per al cicle seleccionat. Ves a la pestanya <strong>Criteris</strong> per afegir-ne (o comprova que el currículum inclou aquesta àrea).
          </p>
        </div>
      ) : (
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
                  <th key={c.id} title={c.text} style={{ background:"#f8fafc", borderBottom:"1.5px solid #e2e8f0",
                    borderLeft:"1px solid #e2e8f0", padding:"8px 10px", minWidth:130, maxWidth:170, textAlign:"left",
                    verticalAlign:"top" }}>
                    <div style={{ fontSize:10.5, fontWeight:800, color: c.origen === "oficial" ? "#4338ca" : "#92400e" }}>
                      {c.origen === "oficial" ? c.id : "Propi"}
                    </div>
                    <div style={{ fontSize:10.5, color:"#64748b", fontWeight:400, lineHeight:1.4, marginTop:2,
                      display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                      {c.text}
                    </div>
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
                          cursor:"pointer", verticalAlign:"top", transition:"background 0.1s" }}
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
                               
