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
                              <span style={{ fontSize:9.5, color:"#94a3b8" }}>{formatData(darrera.data)}</span>
                              {notes.length > 1 && <span style={{ fontSize:9.5, color:"#6366f1", fontWeight:700 }}>+{notes.length - 1}</span>}
                            </div>
                            <div style={{ fontSize:11, color:"#374151", lineHeight:1.4,
                              display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                              {darrera.text}
                            </div>
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
      )}

      {obert && (
        <CellModal
          info={{ alumne: obert.alumne, criteriId: obert.criteriId, criteriText: obert.criteriText,
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

// ─── CRITERIS (oficials + personalitzats, editables) ────────────────────────
function CriterisSeccio({ curs, setCurs, cicle, curriculum, criterisCustom, setCriterisCustom }) {
  const [areaSel, setAreaSel] = useState("matematiques");
  const [nouText, setNouText] = useState("");
  const [editant, setEditant] = useState(null);

  const oficials = useMemo(() => criterisOficials(curriculum, areaSel, cicle), [curriculum, areaSel, cicle]);
  const custom = (criterisCustom[areaSel] || []).filter(c => c.cicle === cicle);
  const eliminats = new Set(criterisCustom[`${areaSel}__eliminats`] || []);
  const llista = [...oficials.filter(c => !eliminats.has(c.id)), ...custom];

  const afegirPropi = () => {
    const t = nouText.trim(); if (!t) return;
    setCriterisCustom(prev => ({ ...prev, [areaSel]: [...(prev[areaSel] || []), { id: uid(), text: t, origen: "personalitzat", cicle }] }));
    setNouText("");
  };
  const eliminarCriteri = c => {
    if (c.origen === "oficial") {
      setCriterisCustom(prev => ({ ...prev, [`${areaSel}__eliminats`]: [...(prev[`${areaSel}__eliminats`] || []), c.id] }));
    } else {
      setCriterisCustom(prev => ({ ...prev, [areaSel]: (prev[areaSel] || []).filter(x => x.id !== c.id) }));
    }
  };
  const desarEdicio = () => {
    if (!editant) return;
    const c = llista.find(x => x.id === editant.id);
    if (c.origen === "oficial") {
      setCriterisCustom(prev => ({
        ...prev,
        [`${areaSel}__eliminats`]: [...(prev[`${areaSel}__eliminats`] || []), c.id],
        [areaSel]: [...(prev[areaSel] || []), { id: uid(), text: editant.text, origen: "personalitzat", cicle, basatEn: c.id }],
      }));
    } else {
      setCriterisCustom(prev => ({ ...prev, [areaSel]: (prev[areaSel] || []).map(x => x.id === editant.id ? { ...x, text: editant.text } : x) }));
    }
    setEditant(null);
  };

  return (
    <DCard>
      <DSecLabel icon={ListChecks} label="Criteris d'avaluació" />
      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:11, fontWeight:600, color:"#64748b", display:"block", marginBottom:4 }}>Curs del grup</label>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {CURSOS_DIARI.map(c => {
            const sel = curs === c.id;
            return (
              <button key={c.id} onClick={() => setCurs(c.id)} style={{
                padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"inherit",
                border: sel ? "1.5px solid #1e3a8a" : "1.5px solid #e2e8f0",
                background: sel ? "#dbeafe" : "white", color: sel ? "#1e3a8a" : "#64748b",
              }}>{c.label}</button>
            );
          })}
        </div>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
        {AREES_DIARI.filter(a => a.id !== "general").map(a => {
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

      {llista.length === 0 && (
        <p style={{ fontSize:12, color:"#94a3b8", marginBottom:12 }}>
          No hi ha criteris oficials carregats per a aquesta àrea en aquesta demo (afegeix-n'hi de propis, o integra el teu currículum complet).
        </p>
      )}

      {llista.map(c => (
        <div key={c.id} style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"8px 4px", borderBottom:"1px solid #f1f5f9" }}>
          <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:6, flexShrink:0, marginTop:2,
            background: c.origen === "oficial" ? "#eef2ff" : "#fef3c7", color: c.origen === "oficial" ? "#4338ca" : "#92400e" }}>
            {c.origen === "oficial" ? "Oficial" : "Propi"}
          </span>
          {editant?.id === c.id ? (
            <div style={{ flex:1 }}>
              <DTxa value={editant.text} onChange={t => setEditant({ id:c.id, text:t })} rows={2} />
              <div style={{ display:"flex", gap:6, marginTop:6 }}>
                <DBtn size="sm" variant="primary" onClick={desarEdicio}><Save size={12} /> Desar</DBtn>
                <DBtn size="sm" onClick={() => setEditant(null)}>Cancel·lar</DBtn>
              </div>
            </div>
          ) : (
            <>
              <span style={{ flex:1, fontSize:12.5, lineHeight:1.6, color:"#374151" }}>{c.text}</span>
              <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                <button onClick={() => setEditant({ id:c.id, text:c.text })} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8" }}><Pencil size={13} /></button>
                <button onClick={() => eliminarCriteri(c)} style={{ background:"none", border:"none", cursor:"pointer", color:"#e57373" }}><Trash2 size={13} /></button>
              </div>
            </>
          )}
        </div>
      ))}

      <div style={{ display:"flex", gap:8, marginTop:14 }}>
        <DInp value={nouText} onChange={setNouText} placeholder="Afegir un criteri propi per a aquesta àrea..." />
        <DBtn variant="primary" onClick={afegirPropi}><Plus size={14} /> Afegir</DBtn>
      </div>
    </DCard>
  );
}

// ─── FITXA ALUMNE (vista derivada de totes les cel·les) ─────────────────────
function flattenCellules(cellules) {
  const out = [];
  Object.entries(cellules).forEach(([key, notes]) => {
    const [area, tri, alumne, criteriId] = key.split("|");
    (notes || []).forEach(n => out.push({ ...n, area, tri: Number(tri), alumne, criteriId }));
  });
  return out;
}

function FitxaAlumneSeccio({ alumnes, cellules, curriculum, criterisCustom, cicle }) {
  const [sel, setSel] = useState(alumnes[0] || "");
  useEffect(() => { if (!sel && alumnes.length) setSel(alumnes[0]); }, [alumnes]);

  const criteriText = (area, criteriId) => {
    const oficials = criterisOficials(curriculum, area, cicle);
    const of = oficials.find(c => c.id === criteriId);
    if (of) return of.text;
    const cu = (criterisCustom[area] || []).find(c => c.id === criteriId);
    return cu ? cu.text : criteriId;
  };

  const flat = useMemo(() => flattenCellules(cellules).filter(n => n.alumne === sel).sort((a,b) => b.data.localeCompare(a.data)), [cellules, sel]);

  const exportar = () => {
    let text = `FITXA — ${sel}\n${"═".repeat(40)}\n\n`;
    flat.forEach(n => {
      const areaInfo = AREES_DIARI.find(a => a.id === n.area);
      text += `${formatData(n.data)} · ${areaInfo?.label || n.area} · Tri ${n.tri}\n`;
      text += `Criteri: ${criteriText(n.area, n.criteriId)}${n.valoracio ? " (" + n.valoracio + ")" : ""}\n`;
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
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:16 }}>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...inpBase, flex:1, cursor:"pointer" }}>
          {alumnes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <DBtn onClick={exportar} disabled={flat.length === 0}><Download size={13} /> Exportar .txt</DBtn>
      </div>
      {flat.length === 0 ? (
        <p style={{ fontSize:12, color:"#94a3b8", textAlign:"center", padding:"1.5rem 0" }}>Encara no hi ha anotacions per a {sel}.</p>
      ) : (
        flat.map(n => {
          const areaInfo = AREES_DIARI.find(a => a.id === n.area);
          return (
            <div key={n.id} style={{ background:"white", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"10px 13px", marginBottom:9 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:5 }}>
                <span style={{ fontSize:11, color:"#94a3b8" }}>{formatData(n.data)}</span>
                <span style={{ fontSize:11, color:"#64748b" }}>{areaInfo?.icon} {areaInfo?.label}</span>
                <span style={{ fontSize:10, background:"#f1f5f9", borderRadius:6, padding:"1px 6px", color:"#64748b" }}>Tri {n.tri}</span>
                {n.valoracio && (
                  <span style={{ fontSize:10, fontWeight:800, color:VAL_META_DIARI[n.valoracio].color, background:VAL_META_DIARI[n.valoracio].bg, borderRadius:6, padding:"1px 6px" }}>{n.valoracio}</span>
                )}
              </div>
              <div style={{ fontSize:11, color:"#6366f1", fontStyle:"italic", marginBottom:4 }}>{criteriText(n.area, n.criteriId)}</div>
              <p style={{ fontSize:12.5, color:"#374151", margin:0, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{n.text}</p>
            </div>
          );
        })
      )}
    </DCard>
  );
}

// ─── BACKUP ───────────────────────────────────────────────────────────────────
function BackupBarra({ alumnes, cellules, criterisCustom, curs, setAlumnes, setCellules, setCriterisCustom, setCurs, onToast }) {
  const fileRef = useRef(null);
  const exportarTot = () => {
    const payload = { versio: 2, exportat: new Date().toISOString(), alumnes, cellules, criterisCustom, curs };
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
        setCriterisCustom(data.criterisCustom || {});
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
  { id:"graella",  label:"Graella",        icon:Grid3x3 },
  { id:"fitxa",    label:"Fitxa alumne",   icon:UserRound },
  { id:"criteris", label:"Criteris",       icon:ListChecks },
];

function getCicleDiari(cursId) { return (CURSOS_DIARI.find(c => c.id === cursId) || CURSOS_DIARI[2]).cicle; }

export default function DiariAula({ onToast, curriculum }) {
  const [seccio, setSeccio] = useDiariState("seccio2", "alumnes");
  const [alumnes, setAlumnes] = useDiariState("alumnes", []);
  const [cellules, setCellules] = useDiariState("cellules", {});
  const [criterisCustom, setCriterisCustom] = useDiariState("criteris_custom", {});
  const [curs, setCurs] = useDiariState("curs", "3r");
  const cicle = getCicleDiari(curs);

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

      <BackupBarra alumnes={alumnes} cellules={cellules} criterisCustom={criterisCustom} curs={curs}
        setAlumnes={setAlumnes} setCellules={setCellules} setCriterisCustom={setCriterisCustom} setCurs={setCurs} onToast={onToast} />

      {seccio === "graella" && <GraellaSeccio alumnes={alumnes} cicle={cicle} curriculum={curriculum} criterisCustom={criterisCustom} cellules={cellules} setCellules={setCellules} onToast={onToast} />}
      {seccio === "fitxa" && <FitxaAlumneSeccio alumnes={alumnes} cellules={cellules} curriculum={curriculum} criterisCustom={criterisCustom} cicle={cicle} />}
      {seccio === "criteris" && <CriterisSeccio curs={curs} setCurs={setCurs} cicle={cicle} curriculum={curriculum} criterisCustom={criterisCustom} setCriterisCustom={setCriterisCustom} />}
      {seccio === "alumnes" && <AlumnesSeccio alumnes={alumnes} setAlumnes={setAlumnes} />}

      <div style={{ display:"flex", alignItems:"flex-start", gap:8, background:"#f0f9ff", border:"1px solid #bae6fd",
        borderRadius:10, padding:"10px 14px", marginTop:20, fontSize:12, color:"#0c4a6e", lineHeight:1.6 }}>
        <AlertTriangle size={14} color="#0284c7" style={{ flexShrink:0, marginTop:2 }} />
        <span>Totes les dades es guarden només en aquest navegador. Fes un <strong>backup (.json)</strong> de tant en tant.</span>
      </div>
    </div>
  );
}
