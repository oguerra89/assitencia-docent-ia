import { useState, useCallback, useRef, useEffect } from "react";
import {
  Users, BookOpen, FileText, Copy, Download, Plus, Trash2,
  Sparkles, ClipboardList, Accessibility, CheckCircle2,
  Wand2, Blocks, ListChecks, GraduationCap,
  Repeat2, School, AlertTriangle, X, ClipboardCheck, Key, ChevronLeft, Edit3,
  Library, Send, Trash2 as Trash2Icon, FileUp, MessageCircle
} from "lucide-react";

// ─── PERSISTÈNCIA localStorage ───────────────────────────────────────────────
function usePersistedState(key, initial) {
  const fullKey = "docent_" + key;
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

function clearAllPersisted() {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith("docent_")) localStorage.removeItem(k);
  });
}

function clearPersisted(prefix) {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith("docent_" + prefix)) localStorage.removeItem(k);
  });
}

function getApiKey() { return localStorage.getItem("gemini_api_key") || ""; }
function saveApiKey(key) { localStorage.setItem("gemini_api_key", key); }
function getDisclaimerAccepted() { return localStorage.getItem("docent_disclaimer_accepted") === "true"; }
function setDisclaimerAccepted() { localStorage.setItem("docent_disclaimer_accepted", "true"); }

// ─── API GROQ ─────────────────────────────────────────────────────────────────
const GROQ_MODEL = "openai/gpt-oss-120b";

async function gemini(systemPrompt, userPrompt, maxTokens = 2400) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("CAL_CLAU");
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: userPrompt }
        ],
        max_tokens: maxTokens, temperature: 0.6,
      }),
    });
    clearTimeout(timeout);
    const d = await r.json();
    if (d.error) {
      if (d.error.code === 401) throw new Error("CLAU_INVALIDA");
      if (d.error.code === 429 || (d.error.message || "").toLowerCase().includes("rate limit") || (d.error.message || "").toLowerCase().includes("too many")) throw new Error("LIMIT_PETICIONS");
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
    userPrompt, maxTokens
  );
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("{");
  const end   = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start)
    throw new Error("La IA no ha retornat un document vàlid. Torna-ho a intentar.");
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch (e) { throw new Error("No s'ha pogut processar la resposta. Torna-ho a intentar."); }
}

async function geminiSDC(prompt, maxTokens = 1500) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 90000);
  try {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("CAL_CLAU");
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens, temperature: 0.6,
        reasoning_effort: "low",
      }),
    });
    clearTimeout(timeout);
    const d = await r.json();
    if (d.error) {
      if (d.error.code === 401) throw new Error("CLAU_INVALIDA");
      if (d.error.code === 429 || (d.error.message || "").toLowerCase().includes("rate limit") || (d.error.message || "").toLowerCase().includes("too many")) throw new Error("LIMIT_PETICIONS");
      throw new Error(d.error.message);
    }
    const rawText = d.choices?.[0]?.message?.content || "";
    // Eliminar blocs de raonament <think>...</think> que alguns models generen
    const text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!text) throw new Error("Resposta buida de la IA");
    return text;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("Temps esgotat (90s). Torna-ho a intentar amb menys àrees o sessions.");
    throw e;
  }
}

async function geminiInf(prompt) {
  const r = await gemini("", prompt, 1000);
  return r.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
}

function isApiKeyError(err) {
  return err?.message === "CAL_CLAU" || err?.message === "CLAU_INVALIDA";
}

function isLimitError(err) {
  return err?.message === "LIMIT_PETICIONS";
}

const LIMIT_MSG = "Has arribat al límit de peticions gratuïtes de Groq. Espera una estona i torna-ho a intentar més tard.";

// ─── CURRÍCULUM LOMLOE PRIMÀRIA (Decret 175/2022) ─────────────────────────────
const CURRICULUM_PRIMARIA = {"medi":{"nom":"Coneixement del Medi Natural, Social i Cultural","competencies":[{"num":1,"descripcio":"Seleccionar i utilitzar dispositius i recursos digitals de forma responsable i eficient per tal de buscar informació, comunicar-se i treballar col·laborativament i en xarxa i per crear continguts segons les necessitats digitals del context."},{"num":2,"descripcio":"Plantejar-se preguntes sobre el món, aplicant les diferents formes de raonament i mètodes del pensament científic, per interpretar, respondre i predir els fets i fenòmens del medi natural, social i cultural i per prendre decisions creatives i decidir actuacions ètiques i socialment sostenibles."},{"num":3,"descripcio":"Resoldre problemes i reptes generant cooperativament un producte creatiu i innovador a partir de projectes interdisciplinaris, utilitzant diferents formes de raonament, com el pensament de disseny i el pensament computacional, per respondre a necessitats concretes."},{"num":4,"descripcio":"Conèixer i prendre consciència del propi cos, de les emocions i sentiments propis i aliens, a partir de l’adquisició d’hàbits fonamentats en coneixements científics, per aconseguir el benestar físic i emocional i afavorir la convivència."},{"num":5,"descripcio":"Analitzar les característiques de diferents elements o sistemes del medi natural, social i cultural, identificant la seva organització i propietats, establint relacions entre aquests, per tal de reconèixer el valor del patrimoni cultural i natural i emprendre accions per a un ús responsable, la seva conservació i la millora."},{"num":6,"descripcio":"Analitzar críticament les causes i conseqüències de la intervenció humana en l’entorn integrant els vessants social, econòmic, cultural, tecnològic i ambiental definits en els objectius de desenvolupament sostenible, per tal de promoure la capacitat d’afrontar els problemes, aportar solucions i actuar de manera individual i col·laborativa en la seva resolució, posant en pràctica hàbits de vida i de consum responsable i sostenible."},{"num":7,"descripcio":"Observar, detectar, comprendre i interpretar canvis i continuïtats del medi natural, social i cultural, analitzant relacions de causalitat, simultaneïtat i successió, per explicar i valorar les relacions entre diferents elements i esdeveniments que permeten entendre el present i imaginar futurs possibles."},{"num":8,"descripcio":"Reconèixer, valorar i defensar la diversitat i la igualtat de gènere reflexionant sobre qüestions ètiques i mostrant empatia i respecte, per tal de construir una societat diversa i equitativa i contribuir al benestar individual i col·lectiu i a la consecució dels valors dels drets humans."},{"num":9,"descripcio":"Participar en la vida social de manera eficaç i constructiva respectant i aprofundint en el desenvolupament dels drets humans i dels infants i de les minories, per tal d’aconseguir una ciutadania activa, responsable i implicada."},{"num":10,"descripcio":"Valorar el funcionament de les administracions públiques, a partir dels principis i els valors que es desprenen de l’ordenament jurídic que regula la nostra convivència, per protegir els drets civils i polítics i generar interaccions respectuoses i equitatives promovent la resolució pacífica i dialogada dels conflictes."}],"criteris":[{"ce_num":1,"ca":"CA 1.1","inicial":"Fer ús, de forma responsable i guiada, de diferents fonts digitals per a la cerca d’informació, tant en grup com individualment.","mitja":"Fer ús, de forma responsable, de diferents fonts digitals per a la cerca d’informació, tant en grup com individualment.","superior":"Fer ús de diferents fonts digitals, tant en grup com individualment, per identificar i seleccionar la informació adient, verificant la fiabilitat de la font en funció de l’autoria i de la data d’actualització."},{"ce_num":1,"ca":"CA 1.2","inicial":"Utilitzar dispositius i recursos digitals per comunicar-se amb els altres i com a suport per donar a conèixer els propis aprenentatges.","mitja":"Utilitzar dispositius i recursos digitals per comunicar-se amb els altres i per donar a conèixer els propis aprenentatges.","superior":"Utilitzar dispositius i recursos digitals de forma responsable i eficient, per contrastar, organitzar i comunicar la informació i per donar a conèixer els propis aprenentatges."},{"ce_num":1,"ca":"CA 1.3","inicial":"Crear, de manera guiada, continguts digitals senzills per construir el coneixement segons la necessitat del context.","mitja":"Crear continguts digitals senzills per construir el coneixement segons la necessitat del context.","superior":"Crear continguts digitals per construir el coneixement seleccionant i utilitzant dispositius i recursos digitals, segons la necessitat del context."},{"ce_num":1,"ca":"CA 1.4","inicial":"","mitja":"","superior":"Participar en la realització de tasques col·laboratives fent ús de recursos digitals en entorns de treball col·laboratiu dins i fora del centre."},{"ce_num":2,"ca":"CA 2.1","inicial":"Demostrar curiositat, formulant-se preguntes i realitzant prediccions possibles per conèixer objectes, fets i fenòmens","mitja":"Demostrar curiositat, formulant-se preguntes investigables i fer prediccions raonades per conèixer objectes, fets i fenòmens.","superior":"Demostrar i mantenir la curiositat, formulant-se preguntes investigables i fer prediccions raonades sobre temes d’actualitat relacionats amb el medi."},{"ce_num":2,"ca":"CA 2.2","inicial":"Buscar informació de fonts digitals i analògiques, segures i fiables, seleccionades de manera pautada per utilitzar-la en investigacions relacionades amb el coneixement del medi.","mitja":"Buscar i seleccionar de forma autònoma informació de diferents fonts digitals i analògiques segures i fiables per emprar-la en les investigacions relacionades amb el coneixement del medi.","superior":"Buscar, seleccionar i contrastar informació, de fonts digitals i analògiques segures i fiables per usar-la en investigacions relacionades amb el coneixement del medi."},{"ce_num":2,"ca":"CA 2.3","inicial":"Planificar experiments amb ajuda, usant tècniques d’indagació, i fer servir instruments simples de forma segura per registrar les observacions i les dades per respondre la pregunta plantejada.","mitja":"Dissenyar i realitzar experiments senzills, utilitzant diferents tècniques d’indagació, emprant de forma segura instruments i dispositius analògics i digitals, per realitzar observacions, fent mesuraments precisos i registres per respondre la pregunta plantejada","superior":"Dissenyar i realitzar experiments fent ús de la indagació, seleccionant els instruments i dispositius analògics i digitals necessaris per fer observacions, prendre mesures precises i decidint el tipus de registre a utilitzar per respondre la pregunta plantejada."},{"ce_num":2,"ca":"CA 2.4","inicial":"Comparar i relacionar les informacions i els resultats obtinguts amb les prediccions realitzades per formular possibles respostes a les qüestions plantejades.","mitja":"Comparar i interpretar la informació, les dades obtingudes en la investigació i les prediccions realitzades per proposar respostes possibles a les qüestions plantejades.","superior":"Analitzar i interpretar la informació, les dades obtingudes en la investigació i les prediccions realitzades per valorar la coherència de possibles solucions a les qüestions plantejades."},{"ce_num":2,"ca":"CA 2.5","inicial":"Comunicar el resultat de les investigacions realitzades de manera oral, corporal i gràfica explicant el procés seguit amb ajuda d’un guió.","mitja":"Presentar els resultats de les investigacions, utilitzar diferents tipus de formats, fent ús, també, de dispositius i recursos digitals i amb un llenguatge acurat per explicar els resultats i el procés de les investigacions realitzades","superior":"Adaptar el missatge i el format a l’audiència a què va dirigit, fent ús, també, de dispositius i recursos digitals fent servir un llenguatge acurat i precís per justificar els resultats aconseguits i el procés de les investigacions realitzades."},{"ce_num":3,"ca":"CA 3.1","inicial":"Reconèixer necessitats o identificar reptes concrets de l’entorn proper i participar en projectes interdisciplinaris cooperatius, de manera guiada, per a la creació de prototips que els resolguin.","mitja":"Identificar i analitzar necessitats o reptes de l’entorn proper i establir objectius senzills per a la creació de prototips o solucions digitals que els resolguin.","superior":"Avaluar les necessitats de l’entorn i establir objectius concrets per a la creació de prototips o solucions digitals que les resolguin."},{"ce_num":3,"ca":"CA 3.2","inicial":"Aportar idees que puguin donar resposta a un problema o necessitat d’acord amb diferents formes de raonament, com el pensament de disseny o el pensament computacional, compartint- les a través de descripcions orals, representacions i models i establir cooperativament criteris per avaluar el projecte i la gestió del treball conjunt.","mitja":"Proposar possibles solucions que puguin donar resposta a un problema o necessitat d’acord amb diferents formes de raonament, com el pensament de disseny o el pensament computacional, compartint-les a través de descripcions orals, representacions i models i establir cooperativament criteris per avaluar el projecte i la gestió del treball conjunt.","superior":"Dissenyar possibles solucions a problemes plantejats d’acord amb diferents formes de raonament, com el pensament de disseny o el pensament computacional, mitjançant estratègies bàsiques de gestió de projectes cooperatius, tenint en compte els recursos necessaris, les fases d’execució i establint criteris concrets per avaluar la seva viabilitat."},{"ce_num":3,"ca":"CA 3.3","inicial":"Construir un producte final senzill que solucioni un repte o necessitat d’acord amb diferents formes de raonament, com el pensament de disseny o el pensament computacional i provant, en equip, els diferents prototips fent ús de forma segura de les eines i els materials adequats","mitja":"Elaborar un producte final senzill que solucioni un repte o necessitat d’acord amb diferents formes de raonament, com el pensament de disseny o el pensament computacional, i provant, en equip, els diferents prototips o solucions digitals fent ús de forma segura dels dispositius, les eines i els materials adequats.","superior":"Elaborar i desenvolupar un producte final que solucioni un repte o necessitat d’acord amb diferents formes de raonament, com el pensament de disseny o el pensament computacional, i provant, en equip, els diferents prototips o solucions digitals fent ús de forma segura i responsable dels dispositius, eines, tècniques i materials adequats."},{"ce_num":3,"ca":"CA 3.4","inicial":"Mostrar, de forma oral o gràfica, el producte final explicant el procés seguit, amb ajuda d’un guió.","mitja":"Presentar els resultats obtinguts explicant el procés seguit i justificant per què el prototip o solució digital compleix amb els requisits del projecte.","superior":"Comunicar els resultats obtinguts i el procés seguit adaptant el missatge i el format a l’audiència, justificant per què el prototip o solució digital compleix amb els requisits del projecte i suggerir possibles reptes per futurs projectes."},{"ce_num":4,"ca":"CA 4.1","inicial":"Reconèixer i adoptar hàbits de vida saludable seguint pautes donades sobre higiene, alimentació variada i equilibrada, exercici físic i descans.","mitja":"Adoptar de forma autònoma hàbits de vida saludable valorant la importància de la higiene, l’alimentació variada i equilibrada, l’exercici físic i el descans.","superior":"Analitzar i fer propostes de millora justificades dels hàbits personals i col·lectius de vida saludables valorant la importància d’una alimentació variada i equilibrada, l’exercici físic, el descans i la higiene."},{"ce_num":4,"ca":"CA 4.2","inicial":"Prendre decisions personals sobre alimentació, higiene i salut a partir de coneixements i criteris científics bàsics, per a la prevenció i guariment de malalties pròpies i usuals","mitja":"Prendre decisions personals i col·lectives sobre alimentació, higiene i salut a partir de coneixements i criteris científics, per a la prevenció i guariment de malalties en el context proper.","superior":"Prendre decisions personals i col·lectives sobre alimentació, higiene i salut relacionant diferents coneixements i criteris científics, per a la prevenció i guariment de malalties en l’àmbit global."},{"ce_num":4,"ca":"CA 4.3","inicial":"Diferenciar accions que afavoreixin el benestar i equilibri emocional i social, reconeixent les emocions pròpies i alienes per generar relacions de respecte.","mitja":"Mostrar actituds que fomenten el benestar i equilibri emocional i social, identificar les emocions pròpies i alienes, mostrant empatia i establint relacions afectives i saludables.","superior":"Promoure actituds que fomenten el benestar i equilibri emocional i social, validant les emocions que activen relacions afectives saludables i resoldre amb criteri situacions diverses també relacionades amb l’ús de la tecnologia i la gestió del temps lliure."},{"ce_num":5,"ca":"CA 5.1","inicial":"Reconèixer les característiques, propietats i l’organització dels elements del medi natural, social i cultural a través de metodologies d’indagació i utilitzant les eines i processos adequats de manera pautada.","mitja":"Identificar les característiques, propietats i l’organització dels elements del medi natural, social i cultural a través de metodologies d’indagació i utilitzant les eines i processos adequats.","superior":"Identificar i analitzar les característiques, propietats i l’organització dels elements del medi natural, social i cultural a través de metodologies d’indagació i utilitzant les eines i processos adequats."},{"ce_num":5,"ca":"CA 5.2","inicial":"Reconèixer connexions directes entre diferents elements del medi natural, social i cultural.","mitja":"Reconèixer connexions entre diferents elements del medi natural social i cultural, comprenent les relacions que s'estableixen i fent prediccions dels possibles efectes","superior":"Establir connexions entre diferents elements del medi natural social i cultural, analitzant les relacions que s’hi estableixen i fer prediccions dels possibles efectes."},{"ce_num":5,"ca":"CA 5.3","inicial":"Mostrar actituds de respecte cap al patrimoni natural i cultural reconeixent-lo com un bé comú.","mitja":"Valorar i protegir el patrimoni natural i cultural considerant-lo com un bé comú, adoptant conductes respectuoses per al seu gaudiment i proposant accions per a la seva conservació i millora.","superior":"Valorar i proposar accions de conservació, protecció i millora del patrimoni natural i cultural, a través de compromisos i conductes a favor de la sostenibilitat."},{"ce_num":6,"ca":"CA 6.1","inicial":"Identificar la relació de l’ésser humà amb el món que l’envolta en l’ús i aprofitament dels elements i recursos de l’entorn.","mitja":"Identificar i analitzar la intervenció humana en el món, en problemes ecosocials, proposant solucions possibles a escala local.","superior":"Analitzar la intervenció humana en el món i aportar opinions fonamentades per fer front a problemes ecosocials i involucrar-se en la seva resolució."},{"ce_num":6,"ca":"CA 6.2","inicial":"Participar en activitats que permeten avançar cap als objectius de desenvolupament sostenible de manera conscient i contextualitzada.","mitja":"Escollir i realitzar accions cooperatives que facilitin afrontar els reptes i desafiaments proposats en els objectius de desenvolupament sostenible de manera crítica i contextualitzada.","superior":"Dissenyar propostes o activitats, cooperativament, per avançar cap a la consecució dels objectius de desenvolupament sostenible de manera crítica i contextualitzada."},{"ce_num":6,"ca":"CA 6.3","inicial":"Mostrar comportaments i actituds de vida sostenible, conseqüents amb el respecte, la cura i la protecció del planeta.","mitja":"Adquirir hàbits de vida sostenible i conseqüents amb el respecte, la cura i la protecció de les persones i del planeta.","superior":"Participar en la construcció de models de convivència sostenibles en el temps basats en la cooperació, la cura i protecció de l’entorn i el respecte a les persones i al planeta."},{"ce_num":7,"ca":"CA 7.1","inicial":"Detectar i contextualitzar temporalment esdeveniments propis i propers emprant nocions de mesura i successió bàsiques.","mitja":"Identificar i contextualitzar temporalment, esdeveniments de l’entorn proper per poder interpretar el present com a producte del passat i comprendre la incidència de les decisions actuals en el futur.","superior":"Relacionar i contextualitzar temporalment, esdeveniments rellevants per poder interpretar els canvis en el present com a producte del passat i comprendre la incidència de les decisions actuals en el futur."},{"ce_num":7,"ca":"CA 7.2","inicial":"Observar i detectar canvis i continuïtats del medi en l’entorn proper en el pas del temps.","mitja":"Interpretar canvis i continuïtats del medi establint relacions de causalitat en diferents moments històrics.","superior":"Analitzar els canvis i les continuïtats a partir de les relacions de causalitat, simultaneïtat i successió de diferents moments històrics, culturals, socials i en el medi natural on les societats es desenvolupen."},{"ce_num":7,"ca":"CA 7.3","inicial":"Mostrar curiositat per la vida quotidiana de les persones al llarg del temps.","mitja":"Conèixer els trets de les diferents societats al llarg del temps i el paper que les persones han desenvolupat en la història.","superior":"Relacionar les diferents èpoques de la història i identificar les accions i fets humans més destacats valorant els canvis que han provocat."},{"ce_num":8,"ca":"CA 8.1","inicial":"Mostrar actituds que fomenten l’equitat, la igualtat de gènere i les conductes no sexistes reconeixent models positius en l’entorn pròxim.","mitja":"Promoure actituds d’equitat, igualtat de gènere i conductes no sexistes, analitzant i contrastant diferents models en la nostra societat.","superior":"Posicionar-se críticament a favor actituds d’equitat, igualtat de gènere i conductes no sexistes, analitzant i contrastant diferents models en la nostra societat."},{"ce_num":8,"ca":"CA 8.2","inicial":"Promoure actituds d’equitat, igualtat de gènere i conductes no sexistes, detectant i contrastant diferents models en l’entorn pròxim.","mitja":"Contribuir al benestar individual i col·lectiu de la societat, amb accions que fomenten l’equitat, la igualtat de gènere i les conductes no sexistes, reconeixent models positius al llarg de la història.","superior":"Actuar per la igualtat efectiva de les persones i desmuntar estereotips i rols en tots els àmbits."},{"ce_num":8,"ca":"CA 8.3","inicial":"Reconèixer les manifestacions i la diversitat cultural des d’una perspectiva de gènere.","mitja":"Valorar les manifestacions i la diversitat cultural i relacionar-les amb qui les ha creat des d’una perspectiva de gènere.","superior":"Valorar les manifestacions culturals i relacionar-les amb qui les ha creat i la seva època, per interpretar les diverses cosmovisions i la seva finalitat."},{"ce_num":9,"ca":"CA 9.1","inicial":"Participar en l’entorn social i en la comunitat escolar, de manera assertiva i constructiva, amb responsabilitat i utilitzant un llenguatge inclusiu i no violent.","mitja":"Participar en la comunitat escolar i la vida social realitzant activitats, assumint responsabilitats i establint acords de forma dialogada i democràtica, emprant un llenguatge inclusiu i no violent.","superior":"Participar activament en la comunitat escolar, la vida social i l’entorn assumint responsabilitats, establint acords i presentant propostes de millora de la vida al centre, des de l’exercici dels principis democràtics, que emanen dels drets humans i dels infants i de les minories."},{"ce_num":9,"ca":"CA 9.2","inicial":"Respectar les persones, valorant la seva diversitat i riquesa, i apreciant-la com a font d’aprenentatge.","mitja":"Contribuir al benestar individual i col·lectiu de la societat, analitzant la importància demogràfica, cultural i econòmica de les migracions en l'actualitat, valorant la diversitat i mostrant empatia i respecte per les cultures.","superior":"Contribuir al benestar individual i col·lectiu i a l’assoliment dels valors de la integració europea a través del coneixement dels processos geogràfics, històrics i culturals que han conformat la societat actual, valorant la diversitat cultural i mostrant empatia i respecte per les minories."},{"ce_num":9,"ca":"CA 9.3","inicial":"Conèixer i interioritzar normes bàsiques de circulació, com a vianants i usuaris dels mitjans de locomoció implicats en el desenvolupament sostenible de la mobilitat de les persones.","mitja":"Prendre decisions responsables com a vianants i usuaris dels mitjans de locomoció, de la importància de la mobilitat sostenible de les persones, coneixent les normes i els senyals de trànsit fent-ne un bon ús.","superior":"Contribuir activament a la mobilitat segura pròpia i de les altres persones durant els desplaçaments i valorant-ne els riscos."},{"ce_num":10,"ca":"CA 10.1","inicial":"Identificar institucions properes, assenyalant i valorant les funcions desenvolupades que promouen una bona convivència.","mitja":"Conèixer els òrgans de govern de diferents institucions municipals i valorar els seus mecanismes de funcionament per a la participació ciutadana i democràtica.","superior":"Identificar i analitzar el funcionament dels òrgans de govern de les comunitats autònomes, de l’Estat espanyol i de la Unió Europea, valorant les seves accions en la gestió dels serveis públics per a la ciutadania."},{"ce_num":10,"ca":"CA 10.2","inicial":"Conèixer els propis drets i deures per promoure la cohesió social i els valors de la cultura de la pau.","mitja":"Actuar en defensa dels drets i deures propis i dels altres per promoure la cohesió social i els valors de la cultura de la pau.","superior":"Actuar per protegir els drets i deures propis i dels altres, reconèixer conductes no favorables i reaccionar en conseqüència per promoure la cohesió social i els valors de cultura de la pau."}],"sabers":[{"bloc":"Cultura científica","subbloc":"Inciciació a l'activitat científica","descripcio":"Selecció de tècniques d’indagació adequades (observació, formulació de preguntes i prediccions, planificació i realització d’experiments, cerca d’informació, mesura, cerca de patrons, comunicació…) a les necessitats de la investigació"},{"bloc":"Cultura científica","subbloc":"Inciciació a l'activitat científica","descripcio":"Utilització d’instruments i dispositius apropiats per a l’observació i la mesura d’acord amb les necessitats de les diferents preguntes, problemes i investigacions plantejades."},{"bloc":"Cultura científica","subbloc":"Inciciació a l'activitat científica","descripcio":"Construcció i ús del vocabulari científic relacionat amb les diferents investigacions i temàtiques plantejades."},{"bloc":"Cultura científica","subbloc":"Inciciació a l'activitat científica","descripcio":"Reconeixement de la ciència i la tecnologia com a activitats humanes, similituds i diferències en les professions relacionades amb la ciència i la tecnologia des d’una perspectiva de gènere."},{"bloc":"Cultura científica","subbloc":"Inciciació a l'activitat científica","descripcio":"Valoració dels coneixements científics com a mitjà per entendre els fets i fenòmens de l’entorn natural i de la vida quotidiana"},{"bloc":"Cultura científica","subbloc":"La vida al nostre planeta","descripcio":"Comprensió dels aspectes bàsics de les funcions vitals dels éssers vius des d’una perspectiva integrada: obtenció d’energia, relació amb l’entorn i perpetuació de l’espècie, per distingir-los dels objectes inerts."},{"bloc":"Cultura científica","subbloc":"La vida al nostre planeta","descripcio":"Producció i identificació dels nutrients, l’aigua i l’aire com les substàncies imprescindibles per a la vida"},{"bloc":"Cultura científica","subbloc":"La vida al nostre planeta","descripcio":"Anàlisi de les adaptacions dels éssers vius a l’hàbitat per tal de classificar-los segons les característiques observables."},{"bloc":"Cultura científica","subbloc":"La vida al nostre planeta","descripcio":"Valoració de les relacions entre els éssers humans, els animals i les plantes per aplicar normes de cura i respecte als éssers vius i a l’entorn en què viuen."},{"bloc":"Cultura científica","subbloc":"La vida al nostre planeta","descripcio":"Identificació i ús d’hàbits saludables relacionats amb el benestar físic de l’ésser humà: higiene, alimentació variada i equilibrada, consum de productes de proximitat, exercici físic, descans i cura del propi cos per prevenir possibles malalties."},{"bloc":"Cultura científica","subbloc":"La vida al nostre planeta","descripcio":"Identificació i ús d’hàbits saludables relacionats amb el benestar emocional i social: estratègies d’identificació de les pròpies emocions per respectar i acceptar la diversitat present a l’aula i a l’entorn proper."},{"bloc":"Cultura científica","subbloc":"Matèria, forces i energia","descripcio":"Reconeixement de la llum i el so com a formes d’energia que es poden percebre i de les seves propietats descobrint i experimentant el seu funcionament i ús en situacions de la vida quotidiana."},{"bloc":"Cultura científica","subbloc":"Matèria, forces i energia","descripcio":"Distinció dels materials, les seves característiques, propietats i procedència en objectes de la vida quotidiana per justificar-ne l’ús."},{"bloc":"Cultura científica","subbloc":"Matèria, forces i energia","descripcio":"Interpretació dels canvis d’estat de la matèria en interaccionar amb la calor per explicar fenòmens naturals."},{"bloc":"Cultura científica","subbloc":"Matèria, forces i energia","descripcio":"Comprensió de l’efecte de les forces de càrrega sobre estructures construïdes amb materials d’ús comú amb diferents seccions i geometria, per construir estructures resistents, estables i útils"},{"bloc":"Tecnologia i digitalització","subbloc":"Digitalització de l'entorn personal de l'aprenentatge","descripcio":"Ús de les funcionalitats dels dispositius i recursos digitals d’aprenentatge d’acord amb les necessitats del context educatiu (cerca d’informació, representació del coneixement, creació de continguts digitals…)."},{"bloc":"Tecnologia i digitalització","subbloc":"Digitalització de l'entorn personal de l'aprenentatge","descripcio":"Utilització de recursos digitals de forma segura per compartir contextos d’aprenentatge a través de la comunicació amb persones o entitats."},{"bloc":"Tecnologia i digitalització","subbloc":"Projectes de disseny i pensament computacional","descripcio":"Identificació de les fases del pensament computacional en reptes simples: aplicació d’ordres i seqüències bàsiques per a la resolució d’un problema senzill."},{"bloc":"Tecnologia i digitalització","subbloc":"Projectes de disseny i pensament computacional","descripcio":"Aplicació de manera guiada i col·laborativa de les fases del projecte de disseny: empatitza, defineix, idea, prototipa i avalua."},{"bloc":"Tecnologia i digitalització","subbloc":"Projectes de disseny i pensament computacional","descripcio":"Aplicació d’estratègies bàsiques pel treball en equip."},{"bloc":"Tecnologia i digitalització","subbloc":"Projectes de disseny i pensament computacional","descripcio":"Utilització de materials, objectes, eines i recursos analògics i digitals (plataformes digitals d’iniciació a la programació, robòtica educativa…) adequats per a la consecució del projecte."},{"bloc":"Societats i territoris","subbloc":"Reptes del món actual","descripcio":"Percepció dels elements, moviments i dinàmiques de la Terra a l’univers, recollint dades per interpretar les seqüències temporals i els canvis estacionals en la vida diària i en l’entorn"},{"bloc":"Societats i territoris","subbloc":"Reptes del món actual","descripcio":"Apreciació de les diferències i semblances en els elements geològics que constitueixen l’entorn proper per entendre les dinàmiques que es produeixen i els seus efectes en la vida quotidiana."},{"bloc":"Societats i territoris","subbloc":"Reptes del món actual","descripcio":"Creació guiada d’itineraris, trajectes, desplaçaments i viatges utilitzant el pensament espacial i temporal i les interaccions amb el medi."},{"bloc":"Societats i territoris","subbloc":"Reptes del món actual","descripcio":"Observació dels fenòmens atmosfèrics fent un registre de dades per determinar alguna regularitat i valorar la repercussió en els cicles biològics i en la vida diària."},{"bloc":"Societats i territoris","subbloc":"Reptes del món actual","descripcio":"Introducció als objectius de desenvolupament sostenible a partir de l’anàlisi de problemes i de les accions quotidianes."},{"bloc":"Societats i territoris","subbloc":"Reptes del món actual","descripcio":"Identificació i anàlisi dels rols de gènere en l’entorn proper per fomentar conductes no sexistes."},{"bloc":"Societats i territoris","subbloc":"Lliçons del passat","descripcio":"Reflexió sobre el pas del temps i la mesura del temps en el cicle vital i les relacions intergeneracionals des del present cap al passat per entendre els canvis en els fets i esdeveniments quotidians."},{"bloc":"Societats i territoris","subbloc":"Lliçons del passat","descripcio":"Ús de recursos i mitjans analògics i digitals, de les fonts orals i de la memòria col·lectiva per conèixer la història local i la biografia familiar."},{"bloc":"Societats i territoris","subbloc":"Lliçons del passat","descripcio":"Iniciació a la investigació i als mètodes de treball per a la realització projectes que analitzin fets, esdeveniments i temes de rellevància personal per explicar la seva història."},{"bloc":"Societats i territoris","subbloc":"Lliçons del passat","descripcio":"Coneixement del patrimoni material i immaterial de la seva localitat per valorar-lo i preservar-lo."},{"bloc":"Societats i territoris","subbloc":"Alfabetització cívica","descripcio":"Valoració de la diversitat familiar com a element on aprofundir en els drets de les persones i els valors dels drets humans."},{"bloc":"Societats i territoris","subbloc":"Alfabetització cívica","descripcio":"Identificació de les principals activitats professionals i laborals d’homes i dones del seu entorn, valorant l’ocupació i el treball per entendre els agents econòmics i els drets laborals des d’una perspectiva de gènere."},{"bloc":"Societats i territoris","subbloc":"Alfabetització cívica","descripcio":"Adquisició de compromisos de participació i acceptació de normes en l’entorn familiar, veïnal i escolar, per a la prevenció, gestió i resolució dialogada de conflictes."},{"bloc":"Societats i territoris","subbloc":"Alfabetització cívica","descripcio":"Reconeixement d’identitat i diversitat cultural: l’existència de realitats diferents i aproximació a les diferents ètnies i cultures presents en l’entorn, per afavorir la integració, rebutjar les actituds discriminatòries tot afavorint la cultura de la pau i noviolència."},{"bloc":"Societats i territoris","subbloc":"Alfabetització cívica","descripcio":"Identificació de les normes bàsiques en els desplaçaments com a vianants i usuaris dels mitjans de transport, per afavorir una mobilitat sostenible i segura."},{"bloc":"Societats i territoris","subbloc":"Consciència ecosocial","descripcio":"Coneixement de l’entorn, dels paisatges naturals, dels humanitzats i dels seus elements, i estudi de les accions per a la conservació, millora i sostenibilitat dels béns comuns."},{"bloc":"Societats i territoris","subbloc":"Consciència ecosocial","descripcio":"Comprensió de la relació del cicle natural i humà de l’aigua, per aconseguir un ús sostenible del recurs."},{"bloc":"Societats i territoris","subbloc":"Consciència ecosocial","descripcio":"Reconeixement d’actuacions responsables orientades a la reducció, reutilització i reciclatge de residus en l’entorn proper."}]},"artistica":{"nom":"Educació Artística","competencies":[{"num":1,"descripcio":"Descobrir propostes artístiques de diferents cultures, èpoques i estils, mitjançant la percepció i la vivència, per desenvolupar la curiositat, el respecte i el gaudi."},{"num":2,"descripcio":"Investigar i analitzar diferents manifestacions culturals i artístiques i els seus contextos, emprant diversos canals i mitjans d’accés a la informació, per desenvolupar el pensament propi, la identitat cultural i l'esperit crític."},{"num":3,"descripcio":"Experimentar i crear amb les possibilitats del so, la imatge, el cos i els mitjans digitals i multimodals, mitjançant activitats i experiències que incorporin l’aprenentatge autoregulat per expressar i comunicar coneixements, idees, sentiments i emocions."},{"num":4,"descripcio":"Dissenyar, elaborar i difondre creacions culturals i artístiques col·laboratives, assumint diferents rols, posant en valor el procés, per desenvolupar la creativitat, el sentit de pertinença i arribar a un resultat final."}],"criteris":[{"ce_num":1,"ca":"CA 1.1","inicial":"Descobrir obres de manifestacions culturals i artístiques de diferents gèneres i estils, èpoques i cultures amb visió de perspectiva de gènere, evidenciant interès, curiositat i gaudi cap a aquestes, a través de la percepció i la vivència.","mitja":"Reconèixer obres de manifestacions culturals i artístiques de diferents gèneres i estils, èpoques i cultures amb visió de perspectiva de gènere, evidenciant interès, curiositat i gaudi cap a aquestes, a través de la percepció i la vivència.","superior":"Distingir i valorar obres de manifestacions culturals i artístiques de diferents gèneres i estils, èpoques i cultures amb visió de perspectiva de gènere, evidenciant interès, curiositat i gaudi cap a aquestes, a través de la percepció i la vivència."},{"ce_num":1,"ca":"CA 1.2","inicial":"Descriure manifestacions culturals i artístiques en diferents contextos a partir de l’exploració de les característiques amb actitud oberta i interès.","mitja":"Descriure manifestacions culturals i artístiques en diferents contextos a partir de l’exploració de les característiques amb actitud oberta i interès, establint relacions entre elles.","superior":"Analitzar manifestacions culturals i artístiques en diferents contextos a partir de l’exploració de les seves característiques establint relacions entre elles i valorant la diversitat que les genera."},{"ce_num":2,"ca":"CA 2.1","inicial":"Utilitzar de forma col·laborativa les estratègies treballades per a la cerca de manifestacions culturals i artístiques, a través de canals i mitjans d’accés a la informació.","mitja":"Usar estratègies de forma personal i/o col·laborativa per a la cerca de manifestacions culturals i artístiques, a través de canals i mitjans d’accés a la informació.","superior":"Desenvolupar estratègies de forma personal i/o col·laborativa per a la cerca de manifestacions culturals i artístiques, a través de canals i mitjans d’accés a la informació."},{"ce_num":2,"ca":"CA 2.2","inicial":"Identificar múltiples lectures, tècniques i/o elements de diferents manifestacions culturals i artístiques que formen part del patrimoni de diversos entorns, i trobar diferències i similituds entre elles amb respecte i interès.","mitja":"Interpretar i compartir múltiples lectures de diferents manifestacions culturals i artístiques que formen part del patrimoni de diversos entorns, i analitzant-ne els elements i les tècniques que les caracteritzen, amb actitud d’interès, diàleg i respecte","superior":"Comparar i compartir múltiples lectures de diferents manifestacions culturals i artístiques que formen part del patrimoni de diversos entorns, analitzant els elements i les tècniques utilitzades que les caracteritzen i desenvolupant criteris de valoració propis, amb actitud oberta, de diàleg i de respecte."},{"ce_num":2,"ca":"CA 2.3","inicial":"Identificar i expressar les sensacions i emocions produïdes per diferents manifestacions culturals i artístiques de manera respectuosa i dialogant.","mitja":"Identificar i compartir les sensacions, emocions i evocacions produïdes per diferents manifestacions culturals i artístiques de manera respectuosa i dialogant.","superior":"Valorar i compartir les sensacions i emocions i evocacions produïdes per diferents manifestacions culturals i artístiques, atenent el seu context i relacionant-les de manera inclusiva amb la pròpia identitat cultural de manera respectuosa i dialogant."},{"ce_num":3,"ca":"CA 3.1","inicial":"Experimentar algunes possibilitats expressives i comunicatives del cos i de diferents eines d’expressió dels llenguatges artístics, a través de l’aplicació pràctica, mostrant confiança en les pròpies capacitats.","mitja":"Experimentar algunes possibilitats expressives i comunicatives del cos i de diferents eines d’expressió dels llenguatges artístics, a través de l’aplicació pràctica, amb curiositat, interès i afany de superació.","superior":"Experimentar algunes possibilitats expressives i comunicatives del cos i de diferents eines d’expressió dels llenguatges artístics, a través de l’aplicació pràctica, amb curiositat, interès i afany de superació."},{"ce_num":3,"ca":"CA 3.2","inicial":"Expressar idees, coneixements, sentiments i emocions amb creacions pròpies fent servir aprenentatges dels referents artístics treballats.","mitja":"Expressar idees, coneixements, sentiments i emocions amb creacions pròpies fent servir aprenentatges dels referents artístics treballats.","superior":"Produir creacions personals adaptades a una finalitat específica mitjançant l’expressió d’idees, sentiments i emocions utilitzant aprenentatges dels referents artístics treballats."},{"ce_num":3,"ca":"CA 3.3","inicial":"Compartir creacions personals, evidenciant empatia i respecte envers les dels altres i acceptant-ne les diferents lectures i interpretacions.","mitja":"Documentar i compartir creacions personals, evidenciant empatia i respecte per les dels altres i acceptant-ne les diferents lectures i interpretacions.","superior":"Documentar i compartir creacions personals, evidenciant empatia i respecte per les dels altres i acceptant-ne les diferents lectures i interpretacions."},{"ce_num":4,"ca":"CA 4.1","inicial":"Participar en el procés de disseny de produccions culturals i creacions artístiques col·laboratives treballant en la consecució d’un resultat final que compleixi uns objectius acordats mitjançant un enfocament coeducatiu, basat en la igualtat i la perspectiva de gènere, i en el respecte a la diversitat cultural.","mitja":"Col·laborar en el procés de disseny de produccions culturals i creacions artístiques col·laboratives treballant en la consecució d’un resultat final que compleixi uns objectius acordats mitjançant un enfocament coeducatiu basat en la igualtat i la perspectiva de gènere i en el respecte a la diversitat cultural.","superior":"Planificar els processos de disseny de produccions culturals i creacions artístiques col·laboratives treballant en la consecució d’un resultat final que compleixi uns objectius acordats mitjançant un enfocament coeducatiu basat en la igualtat i la perspectiva de gènere i en el respecte a la diversitat cultural."},{"ce_num":4,"ca":"CA 4.2","inicial":"Participar activament, experimentant diferents rols en el procés de creació, utilitzant elements de diferents llenguatges artístics, mostrant interès i respecte.","mitja":"Participar activament, coneixent i experimentant diferents rols en el procés de creació, usant elements de diferents llenguatges artístics i mostrant interès i respecte.","superior":"Implicar-se i participar activament assumint i experimentant diferents rols en el procés de creació, fent servir elements de diferents llenguatges artístics i exercint responsabilitat i mostrant respecte."},{"ce_num":4,"ca":"CA 4.3","inicial":"Compartir les experiències creatives, gaudint del resultat final obtingut, identificant les parts del procés creatiu realitzat i valorant les opinions i sensacions dels altres.","mitja":"Documentar i compartir les experiències creatives, gaudint del resultat final obtingut, descrivint les parts del procés creatiu i els rols establerts, valorant les opinions i sensacions dels altres, mitjançant un enfocament coeducatiu, basat en la igualtat, i el respecte a la diversitat cultural.","superior":"Documentar i compartir les experiències creatives, gaudint del resultat final obtingut, descrivint les parts del procés creatiu i els rols establerts, valorant les opinions i sensacions dels altres, mitjançant un enfocament coeducatiu, basat en la igualtat, i el respecte a la diversitat cultural."}],"sabers":[{"bloc":"Educació Musical","subbloc":"Percepció i anàlisi","descripcio":"Descobriment i descripció de propostes musicals vocals i instrumentals de diferents corrents estètics, procedències i èpoques produïdes per creadores i creadors locals, regionals, nacionals i d’altres llocs a través del gaudi en audicions actives de concerts registrats o en viu."},{"bloc":"Educació Musical","subbloc":"Percepció i anàlisi","descripcio":"Percepció i expressió de les sensacions i sentiments que ens evoquen les audicions i obres treballades."},{"bloc":"Educació Musical","subbloc":"Percepció i anàlisi","descripcio":"Reconeixement de professions vinculades a la creació i interpretació musical, amb perspectiva de gènere, en les audicions i obres treballades."},{"bloc":"Educació Musical","subbloc":"Percepció i anàlisi","descripcio":"Discriminació auditiva, classificació i representació del so i les seves qualitats a través de diferents grafies durant l’audició i la pràctica musical"},{"bloc":"Educació Musical","subbloc":"Percepció i anàlisi","descripcio":"Discriminació visual i auditiva dels diferents materials sonors, de la veu i dels instruments musicals de les principals famílies i agrupacions per les seves característiques visuals i sonores de la pràctica musical i les audicions treballades"},{"bloc":"Educació Musical","subbloc":"Percepció i anàlisi","descripcio":"Reconeixement i capacitat de relació del caràcter i el tempo en audicions en viu o gravades i en les interpretacions pròpies"},{"bloc":"Educació Musical","subbloc":"Percepció i anàlisi","descripcio":"Adquisició d’hàbits de comportament i actitud positiva en la percepció de propostes musicals. El silenci com a element i condició indispensable per mantenir l’atenció durant l’audició i la pràctica musical."},{"bloc":"Educació Musical","subbloc":"Creació  i  interpretació","descripcio":"Experimentació, exploració creativa de les possibilitats sonores i expressives a través de la interpretació i improvisació vocal i corporal en contextos informals i d’aula."},{"bloc":"Educació Musical","subbloc":"Creació  i  interpretació","descripcio":"Experimentació de les qualitats sonores construint diferents tipus d’instruments amb materials de l’entorn."},{"bloc":"Educació Musical","subbloc":"Creació  i  interpretació","descripcio":"Coneixement i aplicació dels diferents conceptes dels llenguatges musicals a la interpretació de propostes sonores, vocals i instrumentals, practicades a l’aula, les representacions i/o els concerts, reconeixent el silenci musical com a element fonamental."},{"bloc":"Educació Musical","subbloc":"Creació  i  interpretació","descripcio":"Ús d’aplicacions digitals d’enregistrament en creacions musicals tant personals com de grup per expressar idees o emocions."},{"bloc":"Educació Musical","subbloc":"Creació  i  interpretació","descripcio":"Realització i interpretació d’una creació col·laborativa d’una pràctica musical, respectant i valorant els diferents rols exercits, el procés i el producte final."},{"bloc":"Educació plàstica i visual","subbloc":"Percepció i anàlisi","descripcio":"Identificació i cerca d’imatges de l’entorn associant-les al valor comunicatiu compartint múltiples lectures i interpretacions en pràctiques observacionals."},{"bloc":"Educació plàstica i visual","subbloc":"Percepció i anàlisi","descripcio":"Reconeixement de professions vinculades a la creació, en els àmbits de creació plasticoartística, amb perspectiva de gènere de les obres treballades."},{"bloc":"Educació plàstica i visual","subbloc":"Percepció i anàlisi","descripcio":"Descobriment i descripció de propostes plàstiques i visuals contemporànies i de diferents èpoques, llocs i cultures, a través del gaudi, en observacions actives en visites o en imatges en diferents suports incorporant la perspectiva de gènere."},{"bloc":"Educació plàstica i visual","subbloc":"Percepció i anàlisi","descripcio":"Identificació i gaudi d’espais culturals i artístics participant amb respecte i valoració d’aquests espais en activitats i visites culturals"},{"bloc":"Educació plàstica i visual","subbloc":"Percepció i anàlisi","descripcio":"Identificació dels elements configuratius del llenguatge plàstic (punt, línia, color, textura, pla) a partir de l’observació activa de les manifestacions artístiques treballades."},{"bloc":"Educació plàstica i visual","subbloc":"Percepció i anàlisi","descripcio":"Descobriment de materials, instruments, suports i tècniques utilitzats en l’expressió plàstica i visual a partir de l’observació activa de les manifestacions artístiques treballades."},{"bloc":"Educació plàstica i visual","subbloc":"Percepció i anàlisi","descripcio":"Adquisició d’hàbits de comportament i actitud positiva en la percepció de propostes artístiques en diferents contextos i espais culturals i artístics"},{"bloc":"Educació plàstica i visual","subbloc":"Creació i interpretació","descripcio":"Experimentació amb diferents mitjans, suports i materials d’expressió plàstica, utilitzant tècniques bidimensionals i tridimensionals i digitals en imatges, dibuixos, pintures, modelats i construccions pròpies en les produccions artístiques treballades en diversitat de contextos."},{"bloc":"Educació plàstica i visual","subbloc":"Creació i interpretació","descripcio":"Planificació i experimentació de processos creatius, personals o col·laboratius en les produccions artístiques treballades a l’aula, per expressar idees, sentiments o emocions identificant i valorant-ne les fases i els resultats finals."},{"bloc":"Educació plàstica i visual","subbloc":"Creació i interpretació","descripcio":"Utilització d’aplicacions digitals per a la captura, creació, manipulació i creació de produccions plàstiques i visuals de grup en els processos creatius per expressar idees o emocions."},{"bloc":"Educació audiovisual","subbloc":"Percepció i anàlisi","descripcio":"Identificació de propostes audiovisuals de l’entorn descobrint-ne el valor comunicatiu accedint a espais culturals i artístics de l’àmbit audiovisual."},{"bloc":"Educació audiovisual","subbloc":"Percepció i anàlisi","descripcio":"Reconeixement de professions vinculades a diferents tipus de produccions audiovisuals, amb perspectiva de gènere, de projectes i obres treballades."},{"bloc":"Educació audiovisual","subbloc":"Percepció i anàlisi","descripcio":"Reconeixement d’elements propis del llenguatge audiovisual mitjançant el visionament de propostes icòniques, cinematogràfiques i audiovisuals."},{"bloc":"Educació audiovisual","subbloc":"Percepció i anàlisi","descripcio":"Adquisició d’hàbits de comportament i actitud positiva en la percepció de propostes audiovisuals en diferents contextos i espais culturals i artístics."},{"bloc":"Educació audiovisual","subbloc":"Creació i interpretació","descripcio":"Creació d’històries senzilles amb intenció comunicativa per ser recreades, narrades i enregistrades de forma col·laborativa en format radiofònic o audiovisual en el context escolar i/o a l’entorn més proper."},{"bloc":"Educació audiovisual","subbloc":"Creació i interpretació","descripcio":"Experimentació i maneig d’eines adequades per al registre d’imatge i so d’ús a l’entorn escolar, per narrar, documentar i expressar idees, sentiments o emocions."},{"bloc":"Educació audiovisual","subbloc":"Creació i interpretació","descripcio":"Ús d’estratègies elementals de cerca i filtratge en els processos de cerca d’informació."},{"bloc":"Educació audiovisual","subbloc":"Creació i interpretació","descripcio":"Planificació i experimentació de processos creatius audiovisuals col·laboratius, per narrar, documentar i expressar idees, sentiments o emocions identificant i valorant-ne les fases i els resultats finals."},{"bloc":"Educació audiovisual","subbloc":"Creació i interpretació","descripcio":"Iniciació a la creació de produccions audiovisuals multimodals en grup a partir de presentacions, seqüenciant so i imatges estàtiques o en moviment per narrar o documentar processos viscuts o petites històries creades."},{"bloc":"Educació audiovisual","subbloc":"Creació i interpretació","descripcio":"Experimentació en la creació i difusió de missatges a través de produccions audiovisuals usant diferents processos i recursos tècnics per comunicar actes o campanyes vinculades a projectes del grup que es proposen a l’entorn escolar."},{"bloc":"Educació en arts escèniques i performatives","subbloc":"Percepció i anàlisi","descripcio":"Descobriment i descripció de manifestacions vinculades a l’expressió corporal i a les arts escèniques i performatives de diferents llocs, èpoques i estils, incloses les contemporànies, des d’una perspectiva de gènere, a partir d’espectacles enregistrats o en viu."},{"bloc":"Educació en arts escèniques i performatives","subbloc":"Percepció i anàlisi","descripcio":"Percepció i expressió de les sensacions i sentiments que ens evoquen els espectacles i les obres treballades, compartint-les amb respecte."},{"bloc":"Educació en arts escèniques i performatives","subbloc":"Percepció i anàlisi","descripcio":"Reconeixement, amb perspectiva de gènere, de professions vinculades a les arts escèniques, a partir de les obres i espais treballats."},{"bloc":"Educació en arts escèniques i performatives","subbloc":"Percepció i anàlisi","descripcio":"Adquisició d’hàbits de comportament i actitud positiva en la percepció de propostes escèniques en diferents espais culturals i artístics."},{"bloc":"Educació en arts escèniques i performatives","subbloc":"Creació i interpretació","descripcio":"Interès en l’experimentació i exploració del cos i les seves possibilitats motrius com a mitjà de comunicació, diversió i expressió de sentiments a través d’accions individuals i de grup vinculades amb els diversos gèneres escènics."},{"bloc":"Educació en arts escèniques i performatives","subbloc":"Creació i interpretació","descripcio":"Iniciació en el coneixement de les nocions essencials del llenguatge expressiu i experimentació de les tècniques de les arts escèniques i performatives a través de l’expressió i la improvisació."},{"bloc":"Educació en arts escèniques i performatives","subbloc":"Creació i interpretació","descripcio":"Planificació i experimentació de processos creatius escènics i performatius, personals o col·laboratius, per expressar idees, sentiments o emocions identificant i valorant-ne les fases i els resultats finals."},{"bloc":"Educació en arts escèniques i performatives","subbloc":"Creació i interpretació","descripcio":"Manifestació de les capacitats expressives i creatives, i del plaer de l’expressió corporal i dramàtica a través de les arts escèniques i performatives."}]},"fisica":{"nom":"Educació Física","competencies":[{"num":1,"descripcio":"Resoldre situacions motrius diverses de forma eficaç i creativa, articulant capacitats i habilitats motrius per a donar resposta a projectes i pràctiques d’activitats físiques de la vida quotidiana."},{"num":2,"descripcio":"Desenvolupar un estil de vida actiu i saludable, incorporant la pràctica habitual d’activitats físiques i altres comportaments beneficiosos per a la salut durant la vida quotidiana per a adquirir d’hàbits que contribueixin al benestar físic, mental i social."},{"num":3,"descripcio":"Prendre part en activitats motrius individuals i col·lectives, de joc i d’expressió i comunicació corporal per a integrar-les en el repertori motriu i afavorir les relacions interpersonals."},{"num":4,"descripcio":"Valorar l’entorn com a espai de pràctica d’activitats físiques i d’ocupació del temps de lleure, utilitzant-lo de manera respectuosa i responsable per a participar de la seva conservació i millora."},{"num":5,"descripcio":"Mostrar comportaments i actituds empàtiques i inclusives en la pràctica d’activitats físiques, emprant habilitats socials i processos d’autoregulació per a fomentar la convivència."}],"criteris":[{"ce_num":1,"ca":"CA 1.1","inicial":"Experimentar diferents maneres de donar resposta a projectes i pràctiques d’activitats físiques variades individuals i col·lectives, valorant-ne la consecució.","mitja":"Desenvolupar projectes i pràctiques d’activitats físiques variades individuals i col·lectives, establint reptes possibles d’aconseguir, planificant les accions i valorant-ne la consecució tot identificant en què es pot millorar.","superior":"Desenvolupar projectes i pràctiques d’activitats físiques variades individuals i col·lectives, establint reptes possibles d’aconseguir, planificant les accions tot introduint canvis durant el procés per assolir-los, si cal."},{"ce_num":1,"ca":"CA 1.2","inicial":"Adoptar decisions eficaces en la pràctica d’activitats físiques individuals i de col·laboració amb l’ús d’estratègies conegudes","mitja":"Adoptar decisions eficaces en la pràctica d’activitats físiques individuals, de cooperació, de col·laboració, d’oposició i de col·laboració-oposició amb l’ús d’estratègies conegudes i modificades.","superior":"Prendre decisions eficaces en la pràctica d’activitats físiques individuals, de cooperació, de col·laboració, d’oposició i de col·laboració-oposició amb l’ús d’estratègies conegudes, modificades i inèdites."},{"ce_num":1,"ca":"CA 1.3","inicial":"Emprar capacitats i habilitats motrius pròpies per resoldre situacions motrius millorant progressivament el control corporal.","mitja":"Emprar capacitats i habilitats motrius pròpies i apreses de manera eficaç per resoldre situacions motrius millorant progressivament el control i el domini corporal.","superior":"Emprar capacitats i habilitats motrius pròpies i apreses de manera eficaç i creativa per resoldre situacions motrius millorant progressivament el control i la coordinació corporal."},{"ce_num":2,"ca":"CA 2.1","inicial":"Identificar la pràctica habitual d’activitats físiques en la vida quotidiana, la higiene personal, l’educació postural, l’alimentació saludable, la hidratació i el descans com a comportaments beneficiosos per a la salut.","mitja":"Incorporar la pràctica habitual d’activitats físiques en la vida quotidiana, la higiene personal, l’educació postural, l’alimentació saludable, la hidratació i el descans com a comportaments beneficiosos per a la salut valorant-ne la contribució al benestar físic, mental i social.","superior":"Integrar la pràctica habitual d’activitats físiques en la vida quotidiana, la higiene personal, l’educació postural, l’alimentació saludable, la hidratació i el descans com a comportaments beneficiosos per a la salut, justificant-ne la contribució al benestar físic, mental i social i els perjudicis de no fer-ho."},{"ce_num":2,"ca":"CA 2.2","inicial":"Evitar conductes de risc, reconeixent els possibles riscos que poden existir en la pràctica d’activitats físiques a l’escola i a la vida quotidiana.","mitja":"Evitar conductes de risc, anticipant els possibles riscos que poden existir en la pràctica d’activitats físiques a l’escola i a la vida quotidiana, aplicant protocols d’actuació bàsics en cas d’accidents o lesions.","superior":"Adoptar mesures de seguretat i de prevenció d’accidents com a resultat de la presa de consciència dels possibles riscos que poden existir en la pràctica d’activitats físiques a l’escola i a la vida quotidiana, aplicant protocols d’actuació i tècniques bàsiques de primers auxilis en cas d’accidents o lesions."},{"ce_num":3,"ca":"CA 3.1","inicial":"Participar activament en els jocs i en activitats col·lectives senzilles d’expressió i comunicació corporal pròpies de l’entorn proper gaudint de la seva pràctica, tot afavorint la seva pervivència.","mitja":"Participar activament en els jocs i en activitats col·lectives elaborades d’expressió i comunicació corporal pròpies de l’entorn proper i d’altres llocs del món gaudint de la seva pràctica tot afavorint les relacions interpersonals.","superior":"Participar activament en els jocs i en activitats col·lectives elaborades d’expressió i comunicació corporal pròpies de l’entorn proper i d’altres llocs del món gaudint de la seva pràctica, tot afavorint la seva difusió."},{"ce_num":3,"ca":"CA 3.2","inicial":"Practicar jocs i activitats individuals i col·lectives d’expressió i comunicació corporal tot defugint d’assignar-les a un tipus determinat de persones segons el seu gènere.","mitja":"Practicar jocs i activitats individuals i col·lectives d’expressió i comunicació corporal tot defugint d’assignar-les a un tipus determinat de persones segons el seu gènere identificant i rebutjant comportaments discriminatoris.","superior":"Practicar jocs i activitats individuals i col·lectives d’expressió i comunicació corporal tot defugint d’assignar-les a un tipus determinat de persones segons el seu gènere identificant i rebutjant comportaments discriminatoris i estereotips de gènere, sensibilitzant per evitar-ne la reproducció."},{"ce_num":3,"ca":"CA 3.3","inicial":"Comunicar vivències, emocions i idees a través de manifestacions expressives senzilles utilitzant els recursos expressius del propi cos.","mitja":"Comunicar vivències, emocions i idees a través de manifestacions expressives elaborades utilitzant els recursos expressius del propi cos.","superior":"Comunicar vivències, emocions i idees a través de manifestacions expressives elaborades de manera creativa utilitzant els recursos expressius del propi cos."},{"ce_num":4,"ca":"CA 4.1","inicial":"Practicar algun tipus d’activitat física vinculada al barri, al poble o a la ciutat o al medi natural com una forma d’enriquir les tipologies d’activitats físiques que es donen en contextos de pràctica motriu a l’escola i d’ocupar el temps de lleure.","mitja":"Practicar activitats físiques variades vinculades al barri, al poble o a la ciutat o al medi natural com una forma d’enriquir les tipologies d’activitats físiques que es donen en contextos de pràctica motriu a l’escola i d’ocupar el temps de lleure.","superior":"Practicar activitats físiques variades vinculades al barri, al poble o a la ciutat o al medi natural com una forma d’enriquir les tipologies d’activitats físiques que es donen en contextos de pràctica motriu a l’escola i d’ocupar el temps de lleure identificant les possibilitats que ofereixen els diferents entorns."},{"ce_num":4,"ca":"CA 4.2","inicial":"Valorar l’entorn com a espai de pràctica d’activitats físiques saludables i satisfactòries en el temps de lleure fent-ne un ús respectuós.","mitja":"Valorar l’entorn com a espai de pràctica d’activitats físiques saludables i satisfactòries en el temps de lleure, contribuint a la seva conservació utilitzant els espais, els materials i les instal·lacions de manera respectuosa i responsable","superior":"Valorar l’entorn com a espai de pràctica d’activitats físiques saludables i satisfactòries en el temps de lleure, contribuint a la seva conservació utilitzant els espais, els materials i les instal·lacions de manera respectuosa i responsable i de les mesures que cal prendre per minimitzar-ne les afectacions."},{"ce_num":5,"ca":"CA 5.1","inicial":"Participar en activitats físiques percebent les emocions i els sentiments propis i de les altres persones, controlant les emocions pròpies negatives que hi puguin aparèixer fomentant la convivència.","mitja":"Participar en activitats físiques reconeixent les emocions i els sentiments propis i de les altres persones, autoregulant el propi comportament i les emocions negatives que hi puguin aparèixer fomentant la convivència.","superior":"Comprendre les conductes, les emocions i els sentiments propis i de les altres persones, autoregulant el propi comportament i les emocions negatives que hi puguin aparèixer, expressant-les de forma assertiva fomentant la convivència."},{"ce_num":5,"ca":"CA 5.2","inicial":"Respectar les normes de funcionament de la classe, les regles de les activitats practicades, els espais i els materials emprats en els contextos de pràctica motriu a l’escola.","mitja":"Respectar les normes consensuades de funcionament de la classe, les regles de les activitats practicades, els espais i els materials emprats en els contextos de pràctica motriu a l’escola","superior":"Respectar les normes consensuades de funcionament de la classe, les regles de les activitats practicades, contribuint a la seva creació, modificació i millora, els espais i els materials emprats en els contextos de pràctica motriu a l’escola."},{"ce_num":5,"ca":"CA 5.3","inicial":"Reconèixer que en la pràctica d’activitats físiques tothom és diferent.","mitja":"Valorar les diferències individuals de tothom en la pràctica d’activitats físiques com un enriquiment personal i col·lectiu.","superior":"Valorar les diferències individuals de tothom en la pràctica d’activitats físiques com un enriquiment personal i col·lectiu mostrant una actitud crítica amb els estereotips dels models corporals en els mitjans de comunicació i la publicitat."},{"ce_num":5,"ca":"CA 5.4","inicial":"Desenvolupar habilitats socials a través de la participació en contextos de pràctica motriu a l’escola, iniciant-se en la resolució de conflictes.","mitja":"Desenvolupar habilitats socials a través de la participació en contextos de pràctica motriu a l’escola, utilitzant estratègies de resolució de conflictes.","superior":"Mostrar habilitats socials en la resolució de conflictes de manera assertiva i respecte per la diversitat de tot tipus en contextos de pràctica motriu a l’escola i en la societat."},{"ce_num":5,"ca":"CA 5.5","inicial":"Mostrar una actitud de rebuig vers actuacions contràries a la convivència en la pràctica d’activitats físiques.","mitja":"Rebutjar qualsevol tipus d’actuacions contràries a la convivència en la pràctica d’activitats físiques.","superior":"Rebutjar críticament qualsevol tipus d’actuacions contràries a la convivència en la pràctica d’activitats físiques i a la societat."}],"sabers":[{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Vivència de pràctiques d’activitats físiques múltiples i variades a l’escola."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Identificació dels límits i de les possibilitats del propi cos en la realització d’activitats físiques."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Planificació de projectes d’activitats físiques senzilles."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Identificació dels encerts i de les errades comesos en l’execució d’activitats motrius."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Identificació dels condicionants fisiològics i biològics propis (asma, cardiopaties, lesions…), si n’hi ha, en la pràctica d’activitats físiques."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Identificació del ritme cardíac i respiratori com a indicador de la intensitat de l’esforç en l’execució d’activitats físiques."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Adequació de les accions pròpies a les capacitats i limitacions personals i a les condicions de realització de les situacions motrius plantejades."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Coordinació d’accions amb les altres persones en situacions de pràctica d’activitats físiques col·laboratives."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Resolució de reptes i projectes motrius","descripcio":"Aplicació d’estratègies de resolució de situacions motrius conegudes plantejades o practicades anteriorment."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Esquema corporal","descripcio":"Coneixement de les principals parts del cos de manera vivenciada."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Esquema corporal","descripcio":"Consciència del to muscular, la relaxació i la respiració del propi cos en situacions de repòs i en moviment millorant progressivament el control i domini corporal."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Esquema corporal","descripcio":"Experimentació de postures i moviments corporals diferents en situacions motrius variades."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Esquema corporal","descripcio":"Afirmació de la lateralitat predominant en un mateix a través de tasques centrades fonamentalment en els segments corporals dominants."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Esquema corporal","descripcio":"Experimentació de situacions motrius d’equilibri i desequilibri estàtic i dinàmic en diferents situacions motrius senzilles."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Esquema corporal","descripcio":"Interacció del propi cos amb l’espai i el temps a partir de vivències sensorials i motrius."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Habilitats motrius","descripcio":"Execució de desplaçaments, salts, girs, maneig i control d’objectes en situacions motrius diverses millorant progressivament el control corporal."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Habilitats motrius","descripcio":"Utilització de les capacitats físiques de forma genèrica i jugada a través d’activitats d’intensitat entre moderada i elevada."},{"bloc":"Resolució de problemes en situacions motrius","subbloc":"Habilitats motrius","descripcio":"Realització d’activitats d’activació corporal i de relaxació de forma jugada en el cas d’activitats físiques d’intensitat entre moderada i elevada."},{"bloc":"Vida activa i saludable","subbloc":"Hàbits saludables","descripcio":"Reconeixement dels efectes físics beneficiosos que la pràctica habitual d’activitats físiques i un estil de vida actiu tenen per a la salut en la vida quotidiana."},{"bloc":"Vida activa i saludable","subbloc":"Hàbits saludables","descripcio":"Valoració de la importància de mantenir uns hàbits higiènics en la pràctica d’activitats físiques i en la vida quotidiana."},{"bloc":"Vida activa i saludable","subbloc":"Hàbits saludables","descripcio":"Valoració de la necessitat de fer servir un equipament que permeti dur a terme pràctiques d’activitats físiques d’una manera adequada."},{"bloc":"Vida activa i saludable","subbloc":"Hàbits saludables","descripcio":"Utilització de postures adequades a les necessitats motrius en situacions quotidianes."},{"bloc":"Vida activa i saludable","subbloc":"Hàbits saludables","descripcio":"Identificació dels aliments que són saludables i dels que no ho són en la dieta alimentària diària."},{"bloc":"Vida activa i saludable","subbloc":"Hàbits saludables","descripcio":"Correcta hidratació en la pràctica d’activitats físiques i en la vida quotidiana."},{"bloc":"Vida activa i saludable","subbloc":"Hàbits saludables","descripcio":"Coneixement de les hores necessàries de descans diari per compensar i recuperar-se de l’esforç físic i mental d’acord amb les necessitats pròpies de l’edat."},{"bloc":"Vida activa i saludable","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Respecte vers les mesures bàsiques de seguretat d’un mateix en la pràctica d’activitats físiques."},{"bloc":"Vida activa i saludable","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Utilització amb cura dels espais i materials usats en la pràctica d’activitats físiques."},{"bloc":"Vida activa i saludable","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Reconeixement de les possibles situacions de risc, accidents o lesions que es poden produir en la pràctica d’activitats físiques a l’escola i a la vida quotidiana."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Reconeixement del joc com a mitjà de relació amb les altres persones i de divertiment a través de la pràctica de jocs senzills."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Participació en els jocs practicats a l’escola ajustant la pròpia actuació, pel que fa a aspectes motrius"},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Participació en el desenvolupament de jocs col·laboratius, mostrant respecte i responsabilitat."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Participació en jocs tradicionals i populars com a element de la realitat social i cultural."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Respecte vers les normes i les persones que participen en els jocs que es practiquen a l’escola."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Coneixement del fet que les pràctiques de les diferents activitats físiques i jocs no estan associades a un gènere determinat a través de la participació en activitats motrius."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Coneixement de dones esportistes referents en la societat actual."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Mesures de seguretat i primers auxilis","descripcio":"Participació en tota mena de jocs i activitats d’expressió i comunicació corporal indistintament del gènere de les persones participants."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Expressió i comunicació corporal","descripcio":"Exploració de les possibilitats expressives del cos i el moviment en situacions motrius variades."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Expressió i comunicació corporal","descripcio":"Exploració de les possibilitats expressives amb objectes i materials en situacions motrius variades."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Expressió i comunicació corporal","descripcio":"Comunicació d’emocions, idees, personatges o situacions a través del cos, el gest i el moviment de manera espontània en situacions motrius variades."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Expressió i comunicació corporal","descripcio":"Adequació del moviment i l’expressió a pulsacions i estructures rítmiques i musicals senzilles o estímuls visuals, plàstics, verbals o d’altre tipus en situacions motrius variades."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Expressió i comunicació corporal","descripcio":"Participació en activitats col·lectives d’expressió i comunicació corporal que es proposen a l’escola."},{"bloc":"Activitats motrius lúdiques, culturals i expressives","subbloc":"Expressió i comunicació corporal","descripcio":"Reproducció de balls, danses i coreografies senzilles de l’entorn proper"},{"bloc":"Interació amb l'entorn en temps de lleure","subbloc":"Temps de lleure saludable","descripcio":"Valoració de les pràctiques d’activitats físiques programades que es realitzen fora de l’escola."},{"bloc":"Interació amb l'entorn en temps de lleure","subbloc":"Temps de lleure saludable","descripcio":"Enumeració de les activitats físiques que l’alumnat faci durant el temps de lleure amb la intenció que tothom en conegui de noves."},{"bloc":"Interació amb l'entorn en temps de lleure","subbloc":"Temps de lleure saludable","descripcio":"Identificació d’alguna entitat de l’entorn més proper que fa pràctiques d’activitats físiques saludables."},{"bloc":"Interació amb l'entorn en temps de lleure","subbloc":"Temps de lleure saludable","descripcio":"Descripció de les característiques que defineixen el temps de lleure saludable, satisfactori i respectuós amb l’entorn."},{"bloc":"Interació amb l'entorn en temps de lleure","subbloc":"Temps de lleure saludable","descripcio":"Coneixement d’algunes pràctiques d’activitats físiques que es poden dur a terme al barri, al poble o a la ciutat o al medi natural."},{"bloc":"Interació amb l'entorn en temps de lleure","subbloc":"Temps de lleure saludable","descripcio":"Construcció de materials senzills i segurs que puguin ser utilitzats en la pràctica d’activitats físiques."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Gestió emocional","descripcio":"Identificació de la pràctica d’activitats físiques com una manera saludable de conèixer-se a un mateix."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Gestió emocional","descripcio":"Percepció de conductes, sentiments i emocions pròpies i de les altres persones com a resultat de la participació en activitats físiques controlant les pròpies emocions."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Gestió emocional","descripcio":"Verbalització d’emocions derivades de la interacció social en situacions motrius col·lectives."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Habilitats socials","descripcio":"Participació en l’elaboració de les normes de funcionament del grup en la pràctica d’activitats físiques i compromís d’aplicar-les."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Habilitats socials","descripcio":"Respecte per les normes dels jocs col·lectius en què es participa."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Habilitats socials","descripcio":"Acceptació de la pròpia imatge corporal, valorant i apreciant el propi cos."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Habilitats socials","descripcio":"Col·laboració amb tothom en la pràctica d’activitats físiques diverses, mostrant respecte per tothom amb independència de les seves característiques personals."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Habilitats socials","descripcio":"Desenvolupament inicial d’habilitats socials d’acollida, inclusió, ajuda, cooperació i estratègies de resolució de conflictes a través de la participació en activitats físiques."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Habilitats socials","descripcio":"Acceptació de les idees, les opinions i els sentiments de les altres persones que puguin sorgir en la pràctica d’activitats físiques."},{"bloc":"Autoregulació emocional i interacció social en situacions motrius","subbloc":"Habilitats socials","descripcio":"Identificació d’actuacions discriminatòries i de violència en la pràctica d’activitats físiques a l’escola."}]},"llengua_cat_cast":{"nom":"Llengua Catalana i Literatura / Llengua Castellana i Literatura","competencies":[{"num":1,"descripcio":"Prendre consciència de la diversitat lingüística i cultural a partir del reconeixement de les llengües de l'alumnat i la realitat plurilingüe i pluricultural per afavorir la transferència lingüística, identificar i rebutjar estereotips i prejudicis lingüístics i culturals i valorar aquesta diversitat com a font de riquesa cultural."},{"num":2,"descripcio":"Comprendre i interpretar textos orals i multimodals, i identificar el sentit general i la informació més rellevant, valorant, de manera progressivament autònoma, aspectes formals i de contingut bàsics per construir coneixement, formar-se opinió i eixamplar les possibilitats de gaudi i lleure."},{"num":3,"descripcio":"Produir textos orals i multimodals amb coherència, claredat i registre adequats, atenent les convencions pròpies dels diferents gèneres discursius, i participar en interaccions orals variades, amb autonomia, per expressar idees, sentiments, emocions i conceptes, construir coneixement i establir vincles personals."},{"num":4,"descripcio":"Comprendre i interpretar textos escrits i multimodals, reconeixent el sentit global, les idees principals i la informació implícita i explícita, i realitzant, de manera progressivament autònoma, reflexions elementals sobre aspectes formals i de contingut, per construir coneixement, i respondre a necessitats i interessos comunicatius diversos."},{"num":5,"descripcio":"Produir textos escrits i multimodals, amb adequació, coherència i cohesió, i aplicant estratègies elementals de planificació, redacció, revisió, correcció i edició, amb regulació dels iguals i autoregulació progressivament autònoma i atenent les convencions pròpies del gènere discursiu triat, per construir coneixement i donar resposta de manera informada, eficaç i creativa a demandes comunicatives concretes."},{"num":6,"descripcio":"Cercar, seleccionar i contrastar informació procedent de diverses fonts, de forma planificada i de manera progressivament autònoma, avaluant la seva fiabilitat, reconeixent alguns riscos de manipulació i desinformació, i adoptant un punt de vista personal i respectuós amb la propietat intel·lectual, per transformar aquesta informació en coneixement i comunicar-la de manera creativa."},{"num":7,"descripcio":"Cercar, seleccionar i contrastar informació procedent de diverses fonts, de forma planificada i de manera progressivament autònoma, avaluant la seva fiabilitat, reconeixent alguns riscos de manipulació i desinformació, i adoptant un punt de vista personal i respectuós amb la propietat intel·lectual, per transformar aquesta informació en coneixement i comunicar-la de manera creativa."},{"num":8,"descripcio":"Llegir, interpretar i analitzar, de manera progressivament autònoma, obres o fragments literaris adequats, establint relacions entre ells i identificant el gènere literari i les seves convencions fonamentals, per reconèixer la literatura com a manifestació artística i font de plaer, coneixement i inspiració per a la creació de textos d’intenció literària."},{"num":9,"descripcio":"Reflexionar de forma guiada sobre el llenguatge i reconèixer i usar els repertoris lingüístics personals, a partir de processos de comprensió i producció de textos orals, escrits, utilitzant la terminologia elemental adequada, per iniciar-se en el desenvolupament de la consciència lingüística i millorar les destreses en la posada en pràctica d'aquests processos."},{"num":10,"descripcio":"Utilitzar un llenguatge no discriminatori i desterrar els abusos de poder a través de la paraula, per afavorir un ús eficaç, ètic i democràtic del llenguatge, i posar al servei de la convivència democràtica, la resolució dialogada dels conflictes i la igualtat de drets de totes les persones, les pròpies pràctiques comunicatives."}],"criteris":[{"ce_num":1,"ca":"CA 1.1","inicial":"Identificar les diferents llengües de l’entorn, inclosa la llengua de signes, i les seves variants dialectals, a través de la descripció d’algunes expressions d’ús quotidià.","mitja":"Identificar les diferents llengües de l’entorn, inclosa la llengua de signes, i les seves variants dialectals, a través de la descripció i interpretació d’algunes expressions d’ús quotidià.","superior":"Identificar les diferents llengües de l’entorn, inclosa la llengua de signes, i les seves variants dialectals, a través de la descripció i interpretació de les característiques fonamentals de les del seu entorn geogràfic, així com alguns trets dels dialectes i llengües familiars de l’alumnat."},{"ce_num":1,"ca":"CA 1.2","inicial":"Detectar i rebutjar, de manera acompanyada i en contextos senzills i propers, alguns prejudicis i estereotips lingüístics, de gènere i culturals molt freqüents.","mitja":"Detectar i rebutjar, amb autonomia creixent i en contextos senzills i propers, prejudicis i estereotips lingüístics, de gènere i culturals freqüents.","superior":"Detectar i rebutjar, amb autonomia creixent i en contextos diversos, prejudicis i estereotips lingüístics, de gènere i culturals freqüents."},{"ce_num":1,"ca":"CA 1.3","inicial":"Descriure i valorar la pluralitat lingüística de l’entorn com a font de riquesa cultural, a partir de l’observació i la identificació de la realitat pròxima.","mitja":"Descriure i valorar la pluralitat lingüística del món com a font de riquesa cultural, a partir de l’observació i comprensió de la realitat de l’entorn.","superior":"Descriure, analitzar i valorar la pluralitat lingüística del món com a font de riquesa cultural, a partir de l’observació i comprensió de la realitat global."},{"ce_num":2,"ca":"CA 2.1","inicial":"Extreure informació rellevant de produccions orals i multimodals relacionats amb situacions d’aprenentatge i la vida quotidiana de l’aula.","mitja":"Comprendre i extreure informació rellevant de produccions orals i multimodals relacionades amb situacions d’aprenentatge i la vida quotidiana de l’aula.","superior":"Extreure i interpretar informació rellevant de produccions orals i multimodals formals provinents de diferents mitjans i situacions."},{"ce_num":2,"ca":"CA 2.2","inicial":"Reconèixer, de forma acompanyada, el tema, idees principals i missatges explícits de textos orals i multimodals. Iniciar-se, també de forma acompanyada, en la valoració del contingut i de la forma (elements no verbals).","mitja":"Reconèixer en produccions orals i multimodals idees principals i secundàries, els missatges explícits i els implícits més senzills. Progressar, de manera acompanyada, en la valoració crítica del contingut i de la forma (elements no verbals).","superior":"Reconèixer en produccions orals i multimodals formals les idees principals i les secundàries, els missatges explícits i implícits, valorar-ne el contingut i la forma (elements no verbals)."},{"ce_num":3,"ca":"CA 3.1","inicial":"Produir textos orals i multimodals coherents a partir d’una situació comunicativa propera (vivències, fets i aprenentatges), amb planificació acompanyada, adaptant el to de veu i el gest a la situació, i utilitzant recursos no verbals elementals i elements de suport.","mitja":"Produir textos orals i multimodals coherents a partir d’una situació comunicativa coneguda, amb planificació acompanyada, ajustant el discurs i adaptant el to de veu i el gest a la situació, i usant recursos no verbals i elements de suport.","superior":"Produir textos orals i multimodals de manera autònoma, coherent i fluida, amb preparació prèvia, en contextos formals senzills amb adequació de l’entonació, el to de veu i el gest a la situació i un ús correcte de recursos verbals i no verbals amb suports audiovisuals."},{"ce_num":3,"ca":"CA 3.2","inicial":"Participar en interaccions orals espontànies i en les situacions comunicatives habituals del context escolar respectant les normes d’interacció oral, mostrant interès i respecte quan parlen els altres i iniciant-se en l’ús d’estratègies d’escolta activa.","mitja":"Participar en interaccions orals espontànies i reglades, aportant idees i respectant les dels altres, així com les normes bàsiques de la cortesia lingüística i aplicant estratègies d’escolta activa.","superior":"Participar en interaccions orals espontànies i reglades, i respectar les normes de la cortesia lingüística, integrant en el propi discurs les opinions i punts de vista dels altres participants, i utilitzant el registre adequat i aplicant estratègies d’escolta activa i de gestió conversacional."},{"ce_num":4,"ca":"CA 4.1","inicial":"Llegir textos propers, de la vida quotidiana, dels mitjans de comunicació i textos escolars, de forma silenciosa i en veu alta, amb fluïdesa suficient (velocitat, precisió en el reconeixement de les paraules, ritme, fraseig i entonació).","mitja":"Llegir textos progressivament complexos relacionats amb la vida quotidiana, els mitjans de comunicació i textos escolars, de fets i esdeveniments d’interès general, de manera silenciosa i en veu alta, amb fluïdesa (velocitat, precisió en el reconeixement de les paraules, ritme, fraseig i entonació).","superior":"Llegir tot tipus de textos de manera silenciosa i en veu alta amb bona fluïdesa (velocitat, precisió en el reconeixement de les paraules, ritme, fraseig i entonació)."},{"ce_num":4,"ca":"CA 4.2","inicial":"Comprendre textos escrits i multimodals propers, adequats al desenvolupament cognitiu, amb l’ajuda d’elements gràfics i paratextuals bàsics, a través de la identificació del sentit global i informació rellevant i emprant, de forma guiada, estratègies bàsiques de comprensió","mitja":"Comprendre textos escrits i multimodals progressivament complexos, a través de la identificació del sentit global i la informació rellevant, amb l’ajuda d’elements gràfics, textuals i paratextuals, i distingir idees principals i secundàries i també estratègies bàsiques de comprensió de forma progressivament autònoma.","superior":"Comprendre textos escrits i multimodals progressivament complexos, a través de la identificació del sentit global i la informació rellevant, amb l’ajuda d’elements gràfics, textuals i paratextuals, utilitzant l’estructura i el format de cada gènere textual, i també estratègies bàsiques de comprensió, més enllà de la interpretació literal."},{"ce_num":4,"ca":"CA 4.3","inicial":"Valorar, de manera acompanyada, el contingut i aspectes formals i paratextuals en textos escrits i multimodals senzills.","mitja":"Valorar, de manera acompanyada, el contingut i aspectes formals i paratextuals en textos escrits i multimodals, iniciant-se en l’avaluació de la seva fiabilitat.","superior":"Valorar, de manera acompanyada, el contingut i aspectes formals i paratextuals en textos escrits i multimodals, avaluant la seva qualitat, la fiabilitat i la seva idoneïtat en funció del propòsit de lectura."},{"ce_num":5,"ca":"CA 5.1","inicial":"Redactar textos escrits i multimodals propers i viscuts, des de les diferents etapes del procés evolutiu de l’escriptura, de manera acompanyada, per a un destinatari i amb una intenció concreta, amb adequació, coherència, cohesió i correcció adaptades al moment evolutiu (ortografia natural o de base).","mitja":"Redactar textos escrits i multimodals, propers, viscuts i escolars, de manera progressivament autònoma, a través de la selecció del model discursiu que millor respongui a la situació comunicativa, amb adequació, coherència i cohesió, iniciant-se en l’ús de les normes gramaticals i ortogràfiques més senzilles.","superior":"Redactar textos escrits i multimodals, de tipus divers, amb suports puntuals, a través de la selecció del model discursiu que millor respongui a cada situació comunicativa, progressant en l’ús de les normes gramaticals i ortogràfiques bàsiques, amb adequació, coherència, cohesió i correcció lingüística."},{"ce_num":5,"ca":"CA 5.2","inicial":"Aplicar estratègies de planificació, redacció, revisió i edició de textos amb acompanyament, de manera individual o grupal","mitja":"Aplicar estratègies de planificació, redacció, revisió i edició de textos de manera progressivament autònoma, amb ús de bastides, si escau, de manera individual o grupal.","superior":"Aplicar estratègies de planificació, redacció, revisió i edició de textos, de forma autònoma, amb ús de bastides, si escau, de manera individual o grupal."},{"ce_num":6,"ca":"CA 6.1","inicial":"Aplicar estratègies de cerca d’informació (localització, selecció i contrast) en diferents fonts, incloses les digitals, sobre temes propers i d’interès personal, de forma guiada, a la xarxa i a les biblioteques","mitja":"Aplicar estratègies de cerca d’informació (localització, selecció i contrast) en diferents fonts, incloses les digitals, sobre temes d’interès personal, ecològic i social, de forma progressivament autònoma, a la xarxa i a les biblioteques.","superior":"Aplicar estratègies de cerca d’informació (localització, selecció i contrast) en diferents fonts, incloses les digitals, sobre temes d’interès personal, ecològic i social, de forma progressivament autònoma, a la xarxa i a les biblioteques, valorant-ne críticament el resultat."},{"ce_num":6,"ca":"CA 6.2","inicial":"Comunicar els resultats d’un procés d’investigació, individual o grupal, realitzat de forma acompanyada, sobre temes propers i d’interès personal","mitja":"Comunicar de forma creativa i respectant els drets de la propietat intel·lectual, els resultats d’un procés d’investigació, individual o grupal, realitzat de forma acompanyada, sobre temes d’interès personal, ecològic i social, que incloguin els objectius de desenvolupament sostenible.","superior":"Comunicar de forma creativa i respectant els drets de la propietat intel·lectual, els resultats d’un procés d’investigació senzill, individual o grupal, sobre temes d’interès personal, ecològic i social que incloguin els objectius de desenvolupament sostenible."},{"ce_num":6,"ca":"CA 6.3","inicial":"Adoptar hàbits d’ús segur i saludable de les tecnologies digitals de forma guiada en relació amb l’accés a la informació i a la comunicació en l’entorn immediat.","mitja":"Adoptar hàbits d’ús segur, sostenible i saludable de les tecnologies digitals, amb acompanyament, en relació amb l’accés, la fiabilitat i verificació de les fonts d’informació i la comunicació al seu entorn immediat i a la xarxa.","superior":"Adoptar hàbits d’ús crític, segur, sostenible i saludable de les tecnologies digitals, de forma progressivament autònoma, en relació amb la fiabilitat i la verificació de les fonts, la credibilitat de la informació i la comunicació a l’entorn immediat i a la xarxa."},{"ce_num":7,"ca":"CA 7.1","inicial":"Llegir de manera autònoma textos de diferents autors i autores que s’adeqüin als seus gustos i interessos, seleccionats de manera acompanyada, des de les diferents etapes del procés evolutiu de la lectura.","mitja":"Llegir de manera autònoma o acompanyada textos de diversos autors i autores que s’adeqüin als seus gustos i interessos i seleccionats amb autonomia creixent, avançant en la construcció de la seva identitat lectora.","superior":"Llegir de manera autònoma textos de diversos autors i autores que s’adeqüin als seus gustos i interessos, seleccionats amb criteri propi, progressant en la construcció de la seva identitat lectora."},{"ce_num":7,"ca":"CA 7.2","inicial":"Compartir lectures, per mitjà de recomanacions, presentacions i a partir d’interaccions orals, mitjançant la biblioteca d’aula i de centre, per expressar gustos i interessos i iniciar-se en una comunitat lectora.","mitja":"Compartir lectures per mitjà de recomanacions, presentacions i a partir d’interaccions orals, mitjançant la biblioteca d’aula i de centre, per expressar gustos i interessos, valorar les obres de forma argumentada i sentir-se membre d’una comunitat lectora.","superior":"Compartir lectures per mitjà de recomanacions, presentacions i a partir d’interaccions orals, per mitjans analògics i digitals, mitjançant la biblioteca d’aula i de centre, per expressar gustos i interessos, valorar les obres de forma crítica i sentir-se membre d’una comunitat lectora."},{"ce_num":8,"ca":"CA 8.1","inicial":"Escoltar i llegir textos orals i escrits de la literatura infantil, d’autors i autores reconeguts, descobrint de manera acompanyada els elements essencials de l’obra i establint relacions elementals entre els textos i amb altres manifestacions artístiques i culturals.","mitja":"Escoltar i llegir textos orals i escrits de la literatura infantil, d’autors i autores reconeguts, relacionant-los en funció de temes i aspectes elementals del gènere literari, i interpretant-los i relacionant-los amb altres manifestacions artístiques i culturals de manera acompanyada.","superior":"Escoltar i llegir de manera acompanyada textos literaris adequats a la seva edat, d’autors i autores reconeguts, relacionant-los en funció dels temes i aspectes elementals del gènere literari, i interpretant-los, valorant-los i relacionant-los amb altres manifestacions artístiques i culturals de manera progressivament autònoma."},{"ce_num":8,"ca":"CA 8.2","inicial":"Produir textos individuals o col·lectius amb intenció literària, segons les diferents etapes del procés evolutiu de l’escriptura, de manera acompanyada, en diferents suports, i complementant-los amb altres llenguatges artístics.","mitja":"Produir textos individuals o col·lectius amb intenció literària, de manera acompanyada, emprant algun recurs literari i recreant de manera personal els models donats, en diferents suports, i complementant-los amb altres llenguatges artístics.","superior":"Produir, de manera progressivament autònoma, textos individuals o col·lectius amb intenció literària, emprant diversitat de recursos literaris de manera original, en diferents suports, i complementant-los amb altres llenguatges artístics."},{"ce_num":9,"ca":"CA 9.1","inicial":"Formular conclusions elementals sobre la construcció de paraules, frases i textos utilitzant l’ordre adequat i la concordança dels mots en una frase a partir de l’experimentació amb les paraules.","mitja":"Formular conclusions elementals sobre el funcionament de la llengua fent especial atenció a la concordança, a partir de l’experimentació amb les paraules, els enunciats i els textos, en un procés acompanyat de producció i comprensió de textos en contextos significatius.","superior":"Formular generalitzacions sobre aspectes bàsics del funcionament de la llengua de manera acompanyada, formulant hipòtesis i buscant exemples similars i contraris, a partir de l’experimentació amb les paraules, els enunciats i els textos, en un procés acompanyat de producció o comprensió de textos en contextos significatius."},{"ce_num":9,"ca":"CA 9.2","inicial":"Revisar i millorar les diferents produccions, escrites, orals i multimodals, de manera acompanyada i usant la terminologia lingüística bàsica adequada.","mitja":"Revisar i millorar els textos propis i aliens i esmenar alguns problemes de comprensió i producció, de manera acompanyada, a partir de la reflexió metalingüística i usant la terminologia bàsica adequada","superior":"Revisar i millorar els textos propis i aliens i esmenar alguns problemes de comprensió i producció, de manera progressivament autònoma, a partir de la reflexió metalingüística i usant la terminologia bàsica adequada."},{"ce_num":10,"ca":"CA 10.1","inicial":"Rebutjar els usos lingüístics discriminatoris identificats a partir de la reflexió grupal acompanyada sobre els aspectes elementals, verbals i no verbals, que regeixen la comunicació, tenint en compte la perspectiva de gènere.","mitja":"Rebutjar els usos lingüístics discriminatoris i identificar els abusos de poder a través de la paraula mitjançant la reflexió grupal acompanyada sobre els aspectes bàsics, verbals i no verbals, que regeixen la comunicació, tenint en compte la perspectiva de gènere.","superior":"Rebutjar els usos lingüístics discriminatoris i els abusos de poder a través de la paraula identificats mitjançant la reflexió grupal acompanyada sobre diferents aspectes, verbals i no verbals, que regeixen la comunicació, tenint en compte la perspectiva de gènere."},{"ce_num":10,"ca":"CA 10.2","inicial":"Utilitzar, amb l’acompanyament i planificació necessaris, estratègies elementals per a l’escolta activa i el consens, iniciant-se en la gestió dialogada de conflictes.","mitja":"Utilitzar, amb l’acompanyament i planificació necessaris, estratègies bàsiques per a la comunicació assertiva i el consens, progressant en la gestió dialogada de conflictes.","superior":"Utilitzar, amb l’acompanyament i planificació necessaris, estratègies bàsiques per a la deliberació argumentada i la gestió dialogada de conflictes, proposant solucions creatives."}],"sabers":[{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Presa de consciència de la diversitat lingüística per mitjà de la biografia lingüística personal i el mapa lingüístic de l’aula, treballats amb acompanyament."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Presa de consciència de la biografia lingüística personal i del mapa lingüístic de l’aula i de l’escola, de forma autònoma."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Explicació de la diversitat lingüística i cultural de l’entorn, com a valor i eina d’aprenentatge."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Identificació, amb acompanyament, de prejudicis i estereotips lingüístics i cerca de solucions"},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Identificació de prejudicis i estereotips lingüístics i cerca de solucions en l’àmbit personal i escolar"},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Ús d’un llenguatge no discriminatori i respectuós amb les diferències en la vida quotidiana."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Interès per expressar-se oralment amb pronunciació i entonació adequades en les situacions d’aula."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Interès per expressar-se oralment amb pronunciació i entonació adequades en les situacions d’aprenentatge i en la vida quotidiana del centre."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Comprensió de textos orals de tipologia diversa en diferents formats i mitjans."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Comprensió de textos orals en diferents contextos: activitats d’aula, situacions d’aprenentatge en qualsevol àrea i en la vida quotidiana i en mitjans de comunicació."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Identificació de la incidència dels components (situació, participants o intenció) en l’acte comunicatiu en diferents situacions comunicatives pròpies de l’aula i d’altres entorns informals."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Descripció de la incidència dels components (situació, participants, propòsit comunicatiu, canal) en l’acte comunicatiu en diferents situacions comunicatives de l’aula i de l’entorn."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies lingüístiques elementals amb acompanyament i en contextos propers, per dotar textos breus i senzills d’adequació, coherència, cohesió i correcció."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies lingüístiques elementals amb acompanyament, en contextos d’aprenentatge per dotar textos senzills d’adequació, coherència, cohesió i correcció"},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Identificació d’elements bàsics de contingut (tema, fórmules fixes, lèxic) i forma (estructura, format, imatges) en les produccions orals."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Descripció d’elements bàsics de contingut (tema, fórmules fixes, lèxic) i forma (estructura, format, títol, imatges) en les produccions orals"},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Reproducció de textos orals memoritzats (cançons, poemes, dramatitzacions) en el marc de les propostes didàctiques d’aula."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Ús de models textuals elementals (narració, descripció, diàleg) en les produccions orals, en el marc de les propostes didàctiques d’aula."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Ús de models textuals elementals (narració, descripció, diàleg i exposició) en les produccions orals, de forma progressivament autònoma."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Interacció oral adequada en situacions d’aula. Reconeixement i utilització d’estratègies bàsiques de cortesia lingüística."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Interacció oral adequada en situacions d’aula i en contextos formals elementals, amb respecte a les normes bàsiques de cortesia lingüística."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies d’escolta activa en la resolució dialogada dels conflictes, tenint en compte la perspectiva de gènere."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies d’escolta activa i assertivitat en la resolució dialogada dels conflictes, tenint en compte la perspectiva de gènere."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Detecció de possibles usos discriminatoris del llenguatge verbal i no verbal en diferents contextos comunicatius."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies d’identificació i interpretació del sentit global del text i d’integració de la informació explícita de textos socials orals i multimodals senzills."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies d’interpretació d’elements bàsics de la comunicació no verbal en les situacions comunicatives."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Ús d’eines analògiques i digitals bàsiques d’ús comú per a la producció i coproducció oral i multimodal; ús de plataformes virtuals d’interacció i col·laboració educativa en el marc de les situacions d’aprenentatge, de forma guiada."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Lectura individual i silenciosa, amb fluïdesa adequada al nivell cognitiu, de textos de l’aula i del seu entorn."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Lectura en veu alta amb entonació i ritme progressivament adequats al nivell cognitiu, amb preparació prèvia."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Lectura en veu alta, amb entonació i ritme adequats al nivell cognitiu, amb preparació prèvia."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Ús d’elements gràfics i paratextuals bàsics que afavoreixen la comprensió abans, durant i després de l’experiència lectora, en textos propers de la vida quotidiana, de mitjans de comunicació i escolars."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Ús d’elements gràfics, textuals i paratextuals progressivament complexos que afavoreixen la comprensió abans, durant i després de l’experiència lectora, en textos de la vida quotidiana, mitjans de comunicació, escolars, de fets i esdeveniments d’interès general."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Aplicació d’estratègies de comprensió lectora abans, durant i després de la lectura (planificació, anticipació, inferències…), en textos diversos i amb acompanyament."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Aplicació d’estratègies de comprensió lectora abans, durant i després de la lectura (planificació, anticipació, inferències…), en textos diversos de forma progressivament autònoma."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Detecció d’usos clarament discriminatoris del llenguatge verbal i icònic, de forma guiada, en contextos quotidians i mitjans de comunicació."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Aplicació d’estratègies per detectar usos discriminatoris del llenguatge verbal i icònic, de forma progressivament autònoma, en tots els contextos."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Comprensió i ús de convencions del codi escrit en el marc de les propostes de comprensió o producció de textos d’ús escolar i social."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Producció de textos propers o viscuts, de tipologia diversa, dirigits a diferents destinataris, amb acompanyament i una intenció concreta"},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Producció de textos escolars i socials, de tipologia diversa, dirigits a diferents destinataris, de forma progressivament autònoma i amb una intenció concreta."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Aplicació d’estratègies elementals, individuals o grupals, de planificació, redacció, revisió i edició de textos escrits i multimodals propers a la seva experiència personal, en diferents suports, amb diferents propòsits i de forma acompanyada."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Aplicació d’estratègies elementals, individuals o grupals, de planificació, redacció, revisió i edició de textos escrits i multimodals d’ús escolar i social, en diferents suports, amb diferents propòsits comunicatius i de forma progressivament autònoma."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Utilització d’elements gràfics i paratextuals adequats al suport, de forma acompanyada, que facilitin l’organització i la comprensió del text produït a l’aula."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Utilització d’elements gràfics i paratextuals adequats al suport, de forma progressivament autònoma, que facilitin l’organització i la comprensió del text produït a l’aula."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Ús de bastides i altres suports, amb acompanyament, tant en paper com digitals, per millorar la producció de textos propis."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Cura en la presentació de les produccions escrites en qualsevol suport"},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Presentació acurada i aplicació de les normes ortogràfiques bàsiques de les produccions escrites en qualsevol suport."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Aplicació d’estratègies bàsiques per a la recerca guiada d’informació senzilla en fonts documentals variades i amb diferents suports i formats, reconeixent l’autoria."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Aplicació d’estratègies bàsiques per a la recerca guiada d’informació en fonts documentals variades i amb diferents suports i formats, reconeixent l’autoria i aplicant criteris de fiabilitat."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Distinció entre fets i opinions en informacions de l’entorn proper i dels mitjans de comunicació."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Aplicació d’estratègies bàsiques per comparar informació de diferents fonts, reelaborar-la i comunicar-la en situacions properes i amb acompanyament."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Aplicació d’estratègies per comparar i classificar la informació, reelaborar-la i comunicar-la en contextos escolars i amb progressiva autonomia."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Comunicació creativa del coneixement, de forma acompanyada, amb respecte a la propietat intel·lectual."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Comunicació creativa del coneixement, amb respecte a la propietat intel·lectual, de forma progressivament autònoma."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Utilització de la biblioteca i dels recursos digitals de l’aula i del centre, amb guiatge, per dur a terme treballs d’investigació."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Utilització de la biblioteca i els recursos digitals de l’aula i del centre, de forma progressivament autònoma, per dur a terme treballs d’investigació."},{"bloc":"Educació literària","subbloc":"","descripcio":"Lectura d’obres o fragments variats i diversos de la literatura infantil adequats als seus interessos i organitzats en itineraris lectors"},{"bloc":"Educació literària","subbloc":"","descripcio":"Lectura d’obres o fragments variats i diversos de la literatura infantil, adequats als propis interessos i organitzats en itineraris lectors."},{"bloc":"Educació literària","subbloc":"","descripcio":"Comprensió dels elements constitutius essencials de l’obra literària (tema, personatges, trama, escenari) i dels diferents gèneres literaris, a partir de la lectura compartida i guiada d’obres de qualitat."},{"bloc":"Educació literària","subbloc":"","descripcio":"Anàlisi dels elements constitutius essencials de l’obra literària (tema, protagonista, personatges secundaris, trama, escenari, llenguatge) i dels diferents gèneres literaris, a partir de la lectura compartida i guiada d’obres de qualitat."},{"bloc":"Educació literària","subbloc":"","descripcio":"Establiment de vincles de la literatura amb altres manifestacions artístiques i culturals amb acompanyament."},{"bloc":"Educació literària","subbloc":"","descripcio":"Establiment de vincles de la literatura amb altres manifestacions artístiques i culturals, de forma guiada."},{"bloc":"Educació literària","subbloc":"","descripcio":"Inici de la construcció de la identitat lectora, afavorint l’expressió de gustos i interessos, per mitjà de la lectura autònoma i la lectura compartida i guiada."},{"bloc":"Educació literària","subbloc":"","descripcio":"Construcció de la identitat lectora, afavorint l’expressió de gustos i interessos i la valoració argumentada de les obres, mitjançant la lectura autònoma i la lectura compartida i guiada."},{"bloc":"Educació literària","subbloc":"","descripcio":"Ús de la biblioteca de l’aula, del centre i de l’entorn proper com a espai de trobada d’activitats literàries compartides i com a element impulsor de comunitats lectores."},{"bloc":"Educació literària","subbloc":"","descripcio":"Reconeixement de les dades bàsiques d’un llibre (persones autores, il·lustradores, editorial, col·lecció) en el context de les lectures d’aula i de la biblioteca, amb acompanyament."},{"bloc":"Educació literària","subbloc":"","descripcio":"Reconeixement de les dades bàsiques d’un llibre (persones autores, traductores, adaptadores, il·lustradores, editorial, col·lecció) en el context de les lectures d’aula i de la biblioteca, de forma progressivament autònoma."},{"bloc":"Educació literària","subbloc":"","descripcio":"Escriptura de textos literaris senzills (rodolins, endevinalles, contes…) a partir de models coneguts i analitzats, amb acompanyament."},{"bloc":"Educació literària","subbloc":"","descripcio":"Escriptura de textos narratius i poètics a partir de models coneguts i analitzats, utilitzant recursos literaris, amb progressiva autonomia."},{"bloc":"Educació literària","subbloc":"","descripcio":"Exploració de les il·lustracions i de la relació que s’estableix amb el text en els àlbums il·lustrats, amb acompanyament."},{"bloc":"Educació literària","subbloc":"","descripcio":"Exploració i interpretació de les il·lustracions i de la relació que s’estableix amb el text en els àlbums il·lustrats, amb acompanyament."}]},"llengua_estr":{"nom":"Llengua Estrangera","competencies":[{"num":1,"descripcio":"Comprendre la diversitat lingüística i cultural a partir del reconeixement de les llengües de l'alumnat i la realitat plurilingüe, pluricultural i intercultural per afavorir la transferència lingüística, identificar i rebutjar estereotips i prejudicis lingüístics, i valorar aquesta diversitat com a font de riquesa cultural."},{"num":2,"descripcio":"Comprendre i interpretar textos orals i multimodals breus i senzills, en la llengua estàndard, i identificar el sentit general i la informació més rellevant, valorant, de manera progressivament autònoma, aspectes formals i de contingut bàsics, per construir coneixement, formar-se opinió i eixamplar les possibilitats de gaudi i lleure."},{"num":3,"descripcio":"Produir textos orals i multimodals amb coherència, claredat i registre adequats, atenent les convencions pròpies dels diferents gèneres discursius, i participar en interaccions orals variades, amb autonomia, per expressar idees, sentiments i conceptes, construir coneixement i establir vincles personals."},{"num":4,"descripcio":"Comprendre i interpretar textos escrits i multimodals, reconeixent el sentit global, les idees principals i la informació implícita i explícita, i realitzant, de manera progressivament autònoma, reflexions elementals sobre aspectes formals i de contingut, per adquirir i construir coneixement, i respondre a necessitats i interessos comunicatius diversos."},{"num":5,"descripcio":"Produir textos escrits i multimodals amb adequació, coherència i cohesió, aplicant estratègies elementals de planificació, redacció, revisió, correcció i edició, amb regulació dels iguals i autoregulació progressivament autònoma, i atenent les convencions pròpies del gènere discursiu triat, per construir coneixement i donar resposta de manera informada, eficaç i creativa a demandes comunicatives concretes."},{"num":6,"descripcio":"Cercar, seleccionar i contrastar informació procedent de diverses fonts, de forma planificada i de manera progressivament autònoma, avaluant la seva fiabilitat, reconeixent alguns riscos de manipulació i desinformació i adoptant un punt de vista personal i respectuós amb la propietat intel·lectual, per transformar-la en coneixement i comunicar-la de manera creativa."},{"num":7,"descripcio":"Seleccionar i llegir de manera autònoma obres diverses atenent els propis gustos i interessos, compartint les experiències de lectura, per iniciar la construcció de la identitat lectora, fomentar el gust per la lectura com a font de plaer i gaudir de la seva dimensió social."},{"num":8,"descripcio":"Mediar entre diferents llengües en situacions predictibles, utilitzant estratègies i coneixements per processar i transmetre informació bàsica i senzilla, per tal de facilitar la comunicació."},{"num":9,"descripcio":"Reflexionar de forma guiada sobre el llenguatge i reconèixer i usar els repertoris lingüístics personals i a partir de processos de comprensió i producció de textos orals, escrits i multimodals, utilitzant la terminologia elemental adequada, per iniciar-se en el desenvolupament de la consciència lingüística i millorar les destreses en la posada en pràctica d'aquests processos."},{"num":10,"descripcio":"Posar al servei de la convivència democràtica, la resolució dialogada dels conflictes i la igualtat de drets de totes les persones les pròpies pràctiques comunicatives, utilitzant un llenguatge no discriminatori i desterrant els abusos de poder a través de la paraula, per afavorir un ús eficaç, ètic i democràtic del llenguatge."}],"criteris":[{"ce_num":1,"ca":"CA 1.1","inicial":"Participar amb respecte en la comunicació intercultural, identificant i analitzant, de forma guiada, les discriminacions, els prejudicis i els estereotips més comuns, en situacions quotidianes i habituals.","mitja":"Participar amb respecte en situacions interculturals, identificant i comparant semblances i diferències elementals entre llengües i cultures, i mostrant rebuig davant discriminacions, prejudicis i estereotips de qualsevol tipus en contextos comunicatius quotidians i habituals.","superior":"Participar amb estima i respecte en situacions interculturals, construint vincles entre les diferents llengües i cultures, i mostrant rebuig davant discriminacions, prejudicis i estereotips de qualsevol tipus en contextos comunicatius quotidians i habituals."},{"ce_num":1,"ca":"CA 1.2","inicial":"Reconèixer i valorar la diversitat lingüística i cultural relacionada amb la llengua estrangera, identificant els seus elements culturals i lingüístics elementals.","mitja":"Reconèixer, comprendre i valorar la diversitat lingüística i cultural pròpia de països on es parla la llengua estrangera com a font d’enriquiment personal, identificant elements culturals i lingüístics elementals que fomentin la cultura de la pau.","superior":"Reconèixer, comprendre i valorar la diversitat lingüística i cultural pròpia de països on es parla la llengua estrangera com a font d’enriquiment personal, identificant elements culturals i lingüístics bàsics que fomentin la sostenibilitat i la cultura de la pau."},{"ce_num":1,"ca":"CA 1.3","inicial":"","mitja":"Seleccionar i aplicar, de forma guiada, estratègies bàsiques per a la comprensió dels aspectes més rellevants de la diversitat lingüística i cultural.","superior":"Seleccionar i aplicar, de forma guiada, estratègies bàsiques per a la comprensió de la diversitat lingüística i cultural."},{"ce_num":2,"ca":"CA 2.1","inicial":"Reconèixer i comprendre paraules i expressions habituals en textos orals i multimodals breus i senzills sobre temes freqüents i quotidians de rellevància personal i pròxims a la pròpia experiència, expressats de forma entenedora, clara, senzilla i directa, en llengua estàndard i en diferents suports.","mitja":"Reconèixer i comprendre paraules, frases i el sentit global de textos orals i multimodals breus i senzills sobre temes freqüents i quotidians de rellevància personal i pròxims a la pròpia experiència, així com de textos de ficció adequats al nivell de desenvolupament de l’alumnat, expressats de forma entenedora, clara i en llengua estàndard a través de diferents suports.","superior":"Reconèixer i interpretar el sentit global, així com paraules i frases específiques de textos orals i multimodals breus i senzills sobre temes freqüents i quotidians de rellevància personal i àmbits pròxims a la pròpia experiència, així com de textos literaris adequats al nivell de desenvolupament de l’alumnat, expressats de forma entenedora, clara i en llengua estàndard a través de diferents suports."},{"ce_num":2,"ca":"CA 2.2","inicial":"Seleccionar i aplicar de forma guiada estratègies elementals per captar la idea global i identificar elements específics amb ajuda d’elements lingüístics i no lingüístics del context, en situacions comunicatives quotidianes i de rellevància per a l’alumnat.","mitja":"Seleccionar i aplicar de forma guiada estratègies adequades en situacions comunicatives quotidianes i de rellevància per a l’alumnat per captar el sentit global i processar informacions explícites en textos breus i senzills sobre temes familiars.","superior":"Seleccionar i aplicar de forma guiada estratègies i coneixements adequats en situacions comunicatives quotidianes i de rellevància per a l’alumnat per captar el sentit global i processar informacions explícites en textos diversos."},{"ce_num":3,"ca":"CA 3.1","inicial":"Expressar oralment frases curtes amb informació bàsica sobre assumptes quotidians i de rellevància per a l’alumnat, utilitzant de forma guiada recursos verbals i no verbals, a partir de models i estructures prèviament presentats i parant atenció al ritme, l’accentuació i l’entonació.","mitja":"Expressar oralment frases curtes amb informació bàsica sobre assumptes quotidians i de rellevància per a l’alumnat, utilitzant de forma guiada recursos verbals i no verbals, parant atenció al ritme, l’accentuació i l’entonació.","superior":"Expressar oralment textos breus i senzills, prèviament preparats, sobre assumptes quotidians i de rellevància per a l’alumnat, utilitzant de forma guiada recursos verbals i no verbals, i usant formes i estructures bàsiques i d’ús freqüent."},{"ce_num":3,"ca":"CA 3.2","inicial":"Seleccionar i aplicar de forma guiada estratègies bàsiques per produir missatges breus i senzills adequats a les intencions comunicatives utilitzant, amb ajuda, recursos i suports físics o digitals en funció de les necessitats de cada moment.","mitja":"Seleccionar i aplicar de forma guiada estratègies per produir missatges breus i senzills adequats a les intencions comunicatives utilitzant, amb ajuda, recursos i suports físics o digitals en funció de les necessitats de cada moment.","superior":"Seleccionar i aplicar de forma guiada coneixements i estratègies per preparar i produir textos adequats a les intencions comunicatives, les característiques contextuals i la tipologia textual, usant, amb ajuda, recursos físics o digitals en funció de la tasca i les necessitats de cada moment."},{"ce_num":3,"ca":"CA 3.3","inicial":"Participar, de forma guiada, en situacions interactives elementals sobre temes quotidians, preparats prèviament, a través de diversos suports, com ara la repetició, el ritme pausat o el llenguatge no verbal, i mostrant empatia.","mitja":"Participar en situacions interactives d’intercanvis d’informació breus i senzills sobre temes quotidians, de rellevància personal i pròxims a la seva experiència, preparats prèviament, a través de diversos suports, com ara la repetició, el ritme pausat o el llenguatge no verbal, i mostrant empatia i respecte per la cortesia lingüística i l’etiqueta digital.","superior":"Participar en situacions interactives d’intercanvis d’informació breus i senzills sobre temes quotidians, de rellevància personal i pròxims a la pròpia experiència, a través de diversos suports, com ara la repetició, el ritme pausat o el llenguatge no verbal, i mostrant empatia i respecte per la cortesia lingüística i l’etiqueta digital, així com per les diferents necessitats, idees i motivacions dels interlocutors."},{"ce_num":3,"ca":"CA 3.4","inicial":"Seleccionar i utilitzar, de forma guiada i en entorns propers, estratègies elementals per saludar, acomiadar-se i presentar-se, expressar missatges senzills i breus, i formular i contestar preguntes bàsiques per a la comunicació.","mitja":"Seleccionar i utilitzar, de forma guiada i en situacions quotidianes, estratègies elementals per saludar, acomiadar-se i presentar-se, expressar missatges breus i formular i contestar preguntes senzilles.","superior":"Seleccionar i utilitzar, de forma guiada i en situacions quotidianes, estratègies elementals per saludar, acomiadar-se i presentar-se, formular i contestar preguntes senzilles, expressar missatges, i iniciar i acabar la comunicació."},{"ce_num":4,"ca":"CA 4.1","inicial":"Reconèixer i comprendre paraules i expressions habituals en textos escrits i multimodals breus i senzills sobre temes freqüents i quotidians de rellevància personal i pròxims a la pròpia experiència, expressats de forma entenedora, clara, senzilla i directa, i en llengua estàndard.","mitja":"Reconèixer i comprendre el sentit global, així com paraules i frases prèviament indicades en textos escrits i multimodals breus i senzills sobre temes freqüents i quotidians de rellevància personal i pròxims a la seva experiència, així com de textos de ficció adequats al nivell de desenvolupament de l’alumnat, expressats de forma entenedora, clara i en llengua estàndard a través de diferents suports.","superior":"Reconèixer i comprendre el sentit global, així com paraules i frases específiques de textos escrits i multimodals breus i senzills sobre temes freqüents i quotidians de rellevància personal i àmbits pròxims a la seva experiència, així com de textos literaris adequats al nivell de desenvolupament de l’alumnat, expressats de forma entenedora, clara i en llengua estàndard a través de diferents suports."},{"ce_num":4,"ca":"CA 4.2","inicial":"Seleccionar i aplicar, de forma guiada, estratègies elementals en situacions comunicatives quotidianes i de rellevància per a l’alumnat que permetin captar la idea global i identificar elements específics amb ajuda d’elements lingüístics i no lingüístics.","mitja":"Seleccionar i aplicar, de forma guiada, estratègies adequades en situacions comunicatives quotidianes i de rellevància per a l’alumnat que permetin captar el sentit global i processar informacions explícites en textos breus i senzills sobre temes familiars.","superior":"Seleccionar i aplicar, de forma guiada, estratègies i coneixements adequats en situacions comunicatives quotidianes i de rellevància per a l’alumnat que permetin captar el sentit global i processar informacions explícites en textos diversos."},{"ce_num":5,"ca":"CA 5.1","inicial":"Escriure paraules, expressions conegudes i frases, sobre assumptes quotidians i de rellevància personal per a l’alumnat, a partir de models, i amb una finalitat específica, a través d’eines analògiques i digitals, utilitzant estructures i lèxic elemental.","mitja":"Redactar textos breus i senzills, sobre assumptes quotidians i de rellevància personal per a l’alumnat, amb adequació a la situació comunicativa proposada, a partir de models, i a través d’eines analògiques i digitals, utilitzant estructures i lèxic elemental.","superior":"Organitzar i redactar textos breus i senzills, sobre assumptes quotidians i freqüents, de rellevància personal per a l’alumnat i pròxims a la seva experiència, prèviament preparats, amb adequació a la situació comunicativa proposada, a través d’eines analògiques i digitals, i usant estructures i lèxic bàsic d’ús comú."},{"ce_num":5,"ca":"CA 5.2","inicial":"Seleccionar i aplicar de forma guiada estratègies bàsiques per produir missatges breus i senzills adequats a les intencions comunicatives utilitzant, amb ajuda, recursos i suports físics o digitals en funció de les necessitats de cada moment.","mitja":"Seleccionar i aplicar de forma guiada estratègies per produir missatges breus i senzills adequats a les intencions comunicatives utilitzant, amb ajuda, recursos i suports físics o digitals en funció de les necessitats de cada moment.","superior":"Seleccionar i aplicar de forma guiada coneixements i estratègies per preparar i produir textos adequats a les intencions comunicatives, les característiques contextuals i la tipologia textual, usant amb ajuda recursos físics o digitals en funció de la tasca i les necessitats de cada moment."},{"ce_num":6,"ca":"CA 6.1","inicial":"Aplicar estratègies de cerca d’informació (localització, selecció i contrast) en diferents fonts, incloses les digitals, sobre temes propers i d’interès personal, de forma guiada, a la xarxa i a les biblioteques.","mitja":"Aplicar estratègies de cerca d’informació (localització, selecció i contrast) en diferents fonts, incloses les digitals, sobre temes d’interès personal, ecològic i social, de forma progressivament autònoma, a la xarxa i a les biblioteques.","superior":"Aplicar estratègies de cerca d’informació (localització, selecció i contrast) en diferents fonts, incloses les digitals, sobre temes d’interès personal, ecològic i social, de forma progressivament autònoma, a la xarxa i a les biblioteques, valorant-ne críticament el resultat."},{"ce_num":6,"ca":"CA 6.2","inicial":"Comunicar els resultats d’un procés d’investigació, individual o grupal, realitzat de forma acompanyada, sobre temes propers i d’interès personal.","mitja":"Comunicar de forma creativa i respectant els drets de la propietat intel·lectual, els resultats d’un procés d’investigació, individual o grupal, realitzat de forma acompanyada, sobre temes d’interès personal, ecològic i social, que incloguin els objectius de desenvolupament sostenible.","superior":"Comunicar de forma creativa i respectant els drets de la propietat intel·lectual, els resultats d’un procés d’investigació senzill, individual o grupal, sobre temes d’interès personal, ecològic i social, que incloguin els objectius de desenvolupament sostenible."},{"ce_num":6,"ca":"CA 6.3","inicial":"Adoptar hàbits d’ús segur i saludable de les tecnologies digitals de forma guiada en relació amb l’accés a la informació i a la comunicació en l’entorn immediat.","mitja":"Adoptar hàbits d’ús segur, sostenible i saludable de les tecnologies digitals, amb acompanyament, en relació amb l’accés, la fiabilitat i verificació de les fonts d’informació i la comunicació al seu entorn immediat i a la xarxa.","superior":"Adoptar hàbits d’ús crític, segur, sostenible i saludable de les tecnologies digitals, de forma progressivament autònoma, en relació amb la fiabilitat i la verificació de les fonts, la credibilitat de la informació i la comunicació a l’entorn immediat i a la xarxa."},{"ce_num":7,"ca":"CA 7.1","inicial":"Llegir de manera autònoma textos de diferents autors i autores que s’adeqüin als propis gustos i interessos, seleccionats de manera acompanyada, des de les diferents etapes del procés evolutiu de la lectura.","mitja":"Llegir de manera autònoma o acompanyada textos de diversos autors i autores que s’adeqüin als propis gustos i interessos i seleccionats amb autonomia creixent, avançant en la construcció de la identitat lectora.","superior":"Llegir de manera autònoma textos de diversos autors i autores que s’adeqüin als propis gustos i interessos, seleccionats amb criteri propi, progressant en la construcció de la identitat lectora."},{"ce_num":7,"ca":"CA 7.2","inicial":"Compartir lectures, per mitjà de recomanacions, presentacions i a partir d’interaccions orals, en el marc de la biblioteca d’aula i de centre, per expressar gustos i interessos i iniciar- se en una comunitat lectora","mitja":"Compartir lectures per mitjà de recomanacions, presentacions i a partir d’interaccions orals, en el marc de la biblioteca d’aula i de centre, per expressar gustos i interessos, valorar les obres de forma argumentada i que permetin sentir-se membre d’una comunitat lectora.","superior":"Compartir lectures per mitjà de recomanacions, presentacions i a partir d’interaccions orals, per mitjans analògics i digitals, en el marc de la biblioteca d’aula i de centre, per expressar gustos i interessos, valorar les obres de forma crítica i que permetin sentir-se membre d’una comunitat lectora."},{"ce_num":8,"ca":"CA 8.1","inicial":"Interpretar i explicar informació bàsica de conceptes, comunicacions i textos breus i senzills, de manera guiada, en situacions de comunicació de diversitat lingüística, social i cultural, mostrant empatia i interès per entendre’s en un entorn immediat.","mitja":"Interpretar i explicar textos, conceptes i comunicacions breus i senzills, de manera guiada, en situacions de comunicació de diversitat lingüística, social i cultural, mostrant empatia i interès per entendre’s en el seu entorn més proper.","superior":"Inferir i comunicar textos, conceptes i comunicacions breus i senzills, de manera guiada, en situacions de comunicació amb diversitat lingüística i cultural, mostrant respecte i empatia per les persones interlocutores, per les llengües emprades i interès per participar en la solució de malentesos en l’entorn proper."},{"ce_num":8,"ca":"CA 8.2","inicial":"","mitja":"Seleccionar i aplicar, de forma guiada, estratègies elementals que ajudin a crear ponts i que facilitin la comprensió i producció d’informació, així com la comunicació fluida, fent servir, amb ajuda, recursos i suports físics o digitals en funció de les necessitats de cada moment.","superior":"Seleccionar i aplicar, de forma guiada, estratègies bàsiques que ajudin a crear ponts i facilitin la comprensió i producció d’informació i la comunicació fluida, adequats a les intencions comunicatives, les característiques contextuals i la tipologia textual, fent servir, amb ajuda, recursos i suports físics o digitals en funció de les necessitats de cada moment."},{"ce_num":9,"ca":"CA 9.1","inicial":"Comparar i contrastar similituds i diferències evidents entre llengües, reflexionant, de manera guiada, sobre aspectes elementals del seu funcionament.","mitja":"Comparar i contrastar les similituds i diferències entre llengües, reflexionant, de manera guiada, sobre aspectes bàsics del seu funcionament.","superior":"Comparar i contrastar les similituds i diferències entre llengües, reflexionant, de manera progressivament autònoma, sobre aspectes bàsics del seu funcionament."},{"ce_num":9,"ca":"CA 9.2","inicial":"Identificar i aplicar, de forma guiada, els coneixements i estratègies que formen el propi repertori lingüístic, per millorar la capacitat de comunicar i d’aprendre la llengua estrangera, amb suport d’altres participants i de suports analògics i digitals.","mitja":"Utilitzar i diferenciar, de forma guiada, els coneixements i estratègies que formen el propi repertori lingüístic, per millorar la capacitat de comunicar i d’aprendre la llengua estrangera, amb suport d’altres participants i de suports analògics i digitals.","superior":"Utilitzar i diferenciar de forma progressivament autònoma els coneixements i estratègies que formen el propi repertori lingüístic, per millorar la capacitat de comunicar i d’aprendre la llengua estrangera, amb suport d’altres participants i de suports analògics i digitals."},{"ce_num":9,"ca":"CA 9.3","inicial":"Identificar i explicar, de manera guiada, progressos i dificultats elementals d’aprenentatge de la llengua estrangera.","mitja":"Identificar i explicar, de manera guiada, progressos i dificultats elementals d’aprenentatge de la llengua estrangera, reconeixent els aspectes que ajuden a millorar i participant en activitats d’autoavaluació i coavaluació.","superior":"Identificar, registrar i utilitzar, de manera guiada, els progressos i dificultats d’aprenentatge de la llengua estrangera, reconeixent els aspectes que ajuden a millorar i realitzant activitats d’autoavaluació i coavaluació."},{"ce_num":10,"ca":"CA 10.1","inicial":"Rebutjar els usos lingüístics discriminatoris identificats a partir de la reflexió grupal acompanyada sobre els aspectes elementals, verbals i no verbals, que regeixen la comunicació, i tenint en compte la perspectiva de gènere.","mitja":"Rebutjar els usos lingüístics discriminatoris i identificar els abusos de poder a través de la paraula, mitjançant la reflexió grupal acompanyada sobre els aspectes bàsics, verbals i no verbals, que regeixen la comunicació, i tenint en compte la perspectiva de gènere.","superior":"Rebutjar els usos lingüístics discriminatoris i els abusos de poder a través de la paraula identificats mitjançant la reflexió grupal acompanyada sobre diferents aspectes, verbals i no verbals, que regeixen la comunicació, i tenint en compte la perspectiva de gènere."},{"ce_num":10,"ca":"CA 10.2","inicial":"Utilitzar, amb l’acompanyament i planificació necessaris, estratègies elementals per a l’escolta activa i el consens, iniciant-se en la gestió dialogada de conflictes.","mitja":"Utilitzar, amb l’acompanyament i planificació necessaris, estratègies bàsiques per a la comunicació assertiva i el consens, progressant en la gestió dialogada de conflictes.","superior":"Utilitzar, amb l’acompanyament i planificació necessaris, estratègies bàsiques per a la deliberació argumentada i la gestió dialogada de conflictes, proposant solucions creatives."}],"sabers":[{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Presa de consciència de la diversitat lingüística per mitjà de la biografia lingüística personal i el mapa lingüístic de l’aula, treballats amb acompanyament."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Presa de consciència de la biografia lingüística personal i del mapa lingüístic de l’aula i de l’escola, de forma autònoma."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Explicació de la diversitat lingüística i cultural de l’entorn, com a valor i eina d’aprenentatge."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Identificació i ús estratègic dels coneixements que es tenen de les diverses llengües que conformen el repertori lingüístic per superar mancances comunicatives amb acompanyament."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Identificació de prejudicis i estereotips lingüístics i cerca de solucions en l’àmbit personal i escolar"},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Ús d’un llenguatge no discriminatori i respectuós amb les diferències en la vida quotidiana."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Identificació i ús estratègic dels coneixements que es tenen de les diverses llengües que conformen el repertori lingüístic que permeten superar mancances comunicatives, amb acompanyament."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Reconeixement d’aspectes socioculturals i sociolingüístics elementals i més significatius relatius als costums, la vida quotidiana i les manifestacions culturals i artístiques en països on es parla la llengua estrangera."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Reconeixement d’aspectes socioculturals i sociolingüístics elementals relatius als costums, la vida quotidiana i les relacions interpersonals bàsiques en països on es parla la llengua estrangera."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Aplicació d’estratègies bàsiques d’ús comú per apreciar la diversitat lingüística, cultural i artística, atenint-nos a valors ecosocials i democràtics."},{"bloc":"Les llengües i els seus parlants","subbloc":"","descripcio":"Construcció i desenvolupament de coneixements, destreses i actituds elementals que permeten iniciar-se en activitats de mediació en situacions quotidianes bàsiques."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Ús de la llengua estrangera a l’aula amb autoconfiança progressiva."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Acceptació de l’error com a part integrant del procés d’aprenentatge."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Comprensió de textos orals de tipologia diversa en diferents formats i mitjans."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Comprensió de textos orals en diferents contextos: activitats d’aula, situacions d’aprenentatge en qualsevol àrea i en la vida quotidiana i en mitjans de comunicació."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Identificació de la incidència dels components (situació, participants o intenció) en l’acte comunicatiu en diferents situacions comunicatives de l’aula."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Descripció de la incidència dels components (situació, participants, propòsit comunicatiu, canal) en l’acte comunicatiu en diferents situacions comunicatives de l’aula i de l’entorn."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies lingüístiques elementals amb acompanyament, en contextos propers, per dotar textos breus i senzills d’adequació, coherència, cohesió i correcció."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies lingüístiques elementals amb acompanyament, en contextos d’aprenentatge per dotar textos senzills d’adequació, coherència, cohesió i correcció"},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Identificació d’elements bàsics de contingut (tema, fórmules fixes, lèxic) i forma (estructura, format, imatges) en les produccions orals."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Descripció d’elements bàsics de contingut (tema, fórmules fixes, lèxic) i forma (estructura, format, títol, imatges) en les produccions orals"},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Reproducció de textos orals memoritzats (cançons, poemes, dramatitzacions) en el marc de les propostes didàctiques d’aula."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Ús de models textuals elementals (narració, descripció, diàleg i exposició) en les produccions orals, de forma progressivament autònoma.."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Ús de models textuals elementals (narració, descripció, diàleg i exposició) en les produccions orals, de forma progressivament autònoma."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Interacció oral adequada en situacions d’aula. Reconeixement i utilització d’estratègies bàsiques de cortesia lingüística."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Interacció oral adequada en situacions d’aula i en contextos formals elementals, amb respecte a les normes bàsiques de cortesia lingüística."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies d’escolta activa en la resolució dialogada dels conflictes, tenint en compte la perspectiva de gènere."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies d’escolta activa i assertivitat en la resolució dialogada dels conflictes, tenint en compte la perspectiva de gènere."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Detecció de possibles usos discriminatoris del llenguatge verbal i no verbal en diferents contextos comunicatius."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies d’identificació i interpretació del sentit global del text i d’integració de la informació explícita de textos socials orals i multimodals senzills."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Aplicació d’estratègies d’interpretació d’elements bàsics de la comunicació no verbal en les situacions comunicatives."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Ús d’eines analògiques i digitals elementals per a la producció oral i multimodal, en el marc de les situacions d’aprenentatge i amb acompanyament."},{"bloc":"Comunicació oral","subbloc":"","descripcio":"Ús d’eines analògiques i digitals bàsiques d’ús comú per a la producció i coproducció oral i multimodal i participació en intercanvis comunicatius planificats amb estudiants de la llengua estrangera: ús de plataformes virtuals d’interacció i col·laboració educativa."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Lectura individual i silenciosa, amb fluïdesa adequada al nivell cognitiu, de textos de l’aula i del seu entorn."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Lectura en veu alta amb entonació i ritme progressivament adequats al nivell cognitiu, amb preparació prèvia."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Lectura en veu alta, amb entonació i ritme adequats al nivell cognitiu, amb preparació prèvia."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Ús d’elements gràfics i paratextuals bàsics que afavoreixen la comprensió abans, durant i després de l’experiència lectora, en textos propers de la vida quotidiana, de mitjans de comunicació i escolars."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Ús d’elements gràfics, textuals i paratextuals progressivament complexos que afavoreixen la comprensió abans, durant i després de l’experiència lectora, en textos de la vida quotidiana, mitjans de comunicació, escolars, de fets i esdeveniments d’interès general."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Aplicació d’estratègies de comprensió lectora abans, durant i després de la lectura (planificació, anticipació, inferències…), en textos diversos i amb acompanyament."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Aplicació d’estratègies de comprensió lectora abans, durant i després de la lectura (planificació, anticipació, inferències…), en textos diversos de forma progressivament autònoma."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Detecció d’usos clarament discriminatoris del llenguatge verbal i icònic, de forma guiada, en contextos quotidians i mitjans de comunicació."},{"bloc":"Comprensió lectora","subbloc":"","descripcio":"Aplicació d’estratègies per detectar usos discriminatoris del llenguatge verbal i icònic, de forma progressivament autònoma, en tots els contextos."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Comprensió i ús de convencions del codi escrit en el marc de les propostes de comprensió o producció de textos d’ús escolar i social."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Producció de textos propers o viscuts, de tipologia diversa, dirigits a diferents destinataris, amb acompanyament i una intenció concreta"},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Producció de textos escolars i socials, de tipologia diversa, dirigits a diferents destinataris, de forma progressivament autònoma i amb una intenció concreta."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Aplicació d’estratègies elementals, individuals o grupals, de planificació, redacció, revisió i edició de textos escrits i multimodals propers a la seva experiència personal, en diferents suports, amb diferents propòsits i de forma acompanyada."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Aplicació d’estratègies elementals, individuals o grupals, de planificació, redacció, revisió i edició de textos escrits i multimodals d’ús escolar i social, en diferents suports, amb diferents propòsits comunicatius i de forma progressivament autònoma."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Utilització d’elements gràfics i paratextuals adequats al suport, de forma acompanyada, que facilitin l’organització i la comprensió del text produït a l’aula."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Utilització d’elements gràfics i paratextuals adequats al suport, de forma progressivament autònoma, que facilitin l’organització i la comprensió del text produït a l’aula."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Ús de bastides i altres suports, amb acompanyament, tant en paper com digitals, per millorar la producció de textos propis."},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Cura en la presentació de les produccions escrites en qualsevol suport"},{"bloc":"Expressió escrita","subbloc":"","descripcio":"Presentació acurada i aplicació de les normes ortogràfiques bàsiques de les produccions escrites en qualsevol suport."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Aplicació d’estratègies bàsiques per a la recerca guiada d’informació senzilla en fonts documentals variades i amb diferents suports i formats, reconeixent l’autoria."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Aplicació d’estratègies bàsiques per a la recerca guiada d’informació en fonts documentals variades i amb diferents suports i formats, reconeixent l’autoria i aplicant criteris de fiabilitat."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Distinció entre fets i opinions en informacions de l’entorn proper i dels mitjans de comunicació."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Aplicació d’estratègies bàsiques per comparar informació de diferents fonts, reelaborar-la i comunicar-la en situacions properes i amb acompanyament."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Aplicació d’estratègies per comparar i classificar la informació, reelaborar-la i comunicar-la en contextos escolars i amb progressiva autonomia."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Comunicació creativa del coneixement, de forma acompanyada, amb respecte a la propietat intel·lectual."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Comunicació creativa del coneixement, amb respecte a la propietat intel·lectual, de forma progressivament autònoma."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Utilització de la biblioteca i dels recursos digitals de l’aula i del centre, amb guiatge, per dur a terme treballs d’investigació."},{"bloc":"Alfabetització informacional","subbloc":"","descripcio":"Utilització de la biblioteca i els recursos digitals de l’aula i del centre, de forma progressivament autònoma, per dur a terme treballs d’investigació."},{"bloc":"Educació literària","subbloc":"","descripcio":"Lectura d’obres o fragments variats i diversos de la literatura infantil adequats als seus interessos i organitzats en itineraris lectors"},{"bloc":"Educació literària","subbloc":"","descripcio":"Lectura d’obres o fragments variats i diversos de la literatura infantil, adequats als propis interessos i organitzats en itineraris lectors."},{"bloc":"Educació literària","subbloc":"","descripcio":"Comprensió dels elements constitutius essencials de l’obra literària (tema, personatges, trama, escenari) i dels diferents gèneres literaris, a partir de la lectura compartida i guiada d’obres de qualitat."},{"bloc":"Educació literària","subbloc":"","descripcio":"Anàlisi dels elements constitutius essencials de l’obra literària (tema, protagonista, personatges secundaris, trama, escenari, llenguatge) i dels diferents gèneres literaris, a partir de la lectura compartida i guiada d’obres de qualitat."},{"bloc":"Educació literària","subbloc":"","descripcio":"Establiment de vincles de la literatura amb altres manifestacions artístiques i culturals amb acompanyament."},{"bloc":"Educació literària","subbloc":"","descripcio":"Establiment de vincles de la literatura amb altres manifestacions artístiques i culturals, de forma guiada."},{"bloc":"Educació literària","subbloc":"","descripcio":"Inici de la construcció de la identitat lectora, afavorint l’expressió de gustos i interessos, per mitjà de la lectura autònoma i la lectura compartida i guiada."},{"bloc":"Educació literària","subbloc":"","descripcio":"Construcció de la identitat lectora, afavorint l’expressió de gustos i interessos i la valoració argumentada de les obres, mitjançant la lectura autònoma i la lectura compartida i guiada."},{"bloc":"Educació literària","subbloc":"","descripcio":"Ús de la biblioteca de l’aula, del centre i de l’entorn proper com a espai de trobada d’activitats literàries compartides i com a element impulsor de comunitats lectores."},{"bloc":"Educació literària","subbloc":"","descripcio":"Reconeixement de les dades bàsiques d’un llibre (persones autores, il·lustradores, editorial, col·lecció) en el context de les lectures d’aula i de la biblioteca, amb acompanyament."},{"bloc":"Educació literària","subbloc":"","descripcio":"Reconeixement de les dades bàsiques d’un llibre (persones autores, traductores, adaptadores, il·lustradores, editorial, col·lecció) en el context de les lectures d’aula i de la biblioteca, de forma progressivament autònoma."},{"bloc":"Educació literària","subbloc":"","descripcio":"Escriptura de textos literaris senzills (rodolins, endevinalles, contes…) a partir de models coneguts i analitzats, amb acompanyament."},{"bloc":"Educació literària","subbloc":"","descripcio":"Escriptura de textos narratius i poètics a partir de models coneguts i analitzats, utilitzant recursos literaris, amb progressiva autonomia."},{"bloc":"Educació literària","subbloc":"","descripcio":"Exploració de les il·lustracions i de la relació que s’estableix amb el text en els àlbums il·lustrats, amb acompanyament."},{"bloc":"Educació literària","subbloc":"","descripcio":"Exploració i interpretació de les il·lustracions i de la relació que s’estableix amb el text en els àlbums il·lustrats, amb acompanyament."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Utilització de metallenguatge específic bàsic en el marc de propostes de producció i comprensió de textos orals, escrits o multimodals."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Diferències elementals entre llengua oral i llengua escrita en l’ús quotidià."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Ús dels signes de puntuació com a mecanisme organitzador del text escrit i en relació amb el significat en les diferents produccions."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Discriminació fonètica de sons, síl·labes i accents i correspondència entre els sons i les grafies en la lectura i en les diferents produccions escrites, tenint en compte les diferents etapes del procés evolutiu."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Identificació de diferents relacions formals, semàntiques i sintàctiques entre les paraules en la lectura i en les diferents produccions escrites."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Anàlisi i ús de les modalitats oracionals en relació amb la intenció comunicativa."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Formulació i comprovació d’hipòtesis (substitució, canvi d’ordre, manipulació) i establiment de generalitzacions sobre aspectes lingüístics elementals, aplicació de l’ortografia de base i de les normes ortogràfiques més senzilles i d’ús més freqüent, prestant especial atenció a la concordança en l’escriptura de paraules d’ús habitual a la classe, en els aprenentatges i en els textos propis."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Formulació i comprovació d’hipòtesis (substitució, canvi d’ordre, manipulació) i establiment de generalitzacions sobre aspectes ortogràfics i gramaticals bàsics, amb especial atenció a la concordança entre els elements de l’oració en les diferents produccions."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Ús de signes bàsics de puntuació com a mecanisme organitzador del text escrit."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Comprensió i ús de les modalitats oracionals en relació amb la intenció comunicativa."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Anàlisi i ús de mecanismes de cohesió, amb especial atenció a les formes verbals, als connectors textuals explicatius i a les substitucions pronominals com a mecanisme gramatical elemental de referència interna, a partir de la reflexió compartida sobre les produccions escrites."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Comprensió i ús de mecanismes bàsics de cohesió textual, amb especial atenció als connectors temporals i explicatius a partir de la reflexió compartida sobre les produccions escrites."},{"bloc":"Reflexió sobre la llengua","subbloc":"","descripcio":"Ús del lèxic elemental i d’interès per a l’alumnat relatiu a relacions interpersonals properes, habitatge, llocs i entorns propers."}]},"matematiques":{"nom":"Matemàtiques","competencies":[{"num":1,"descripcio":"Traduir problemes i interpretar situacions quotidianes fent-ne una representació matemàtica personal a través de conceptes, eines i estratègies per analitzar-ne els elements més rellevants."},{"num":2,"descripcio":"Resoldre problemes, aplicant diferents tècniques, estratègies i formes de raonament, per explorar i compartir diferents maneres de procedir, obtenir solucions i assegurar la seva validesa des d’un punt de vista formal i en relació amb el context plantejat i generar noves preguntes i reptes."},{"num":3,"descripcio":"Explorar, formular i comprovar conjectures senzilles, reconeixent el valor del raonament espacial, raonament lògic i incorporar l’argumentació per integrar i generar nou coneixement matemàtic."},{"num":4,"descripcio":"Utilitzar el pensament computacional descomponent en parts més petites, reconeixement patrons i dissenyant algorismes per solucionar problemes i situacions de la vida quotidiana."},{"num":5,"descripcio":"Utilitzar connexions entre diferents idees matemàtiques, així com identificar les matemàtiques implicades en altres àrees o amb la vida quotidiana, interrelacionant conceptes i procediments per interpretar situacions i contextos diversos."},{"num":6,"descripcio":"Comunicar i representar, de forma individual i col·lectiva conceptes, procediments i resultats matemàtics utilitzant el llenguatge oral, escrit, gràfic, multimodal, en diferents formats i la terminologia matemàtica adequada, per donar significat i permanència a les idees matemàtiques."},{"num":7,"descripcio":"Desenvolupar destreses personals que ajudin a identificar i gestionar emocions, aprenent de l'error i afrontant les situacions d'incertesa com una oportunitat, per perseverar i gaudir del procés d’aprendre matemàtiques."},{"num":8,"descripcio":"Desenvolupar destreses socials, participant activament en els equips de treball i reconeixent la diversitat i el valor de les aportacions dels altres, per compartir i construir coneixement matemàtic de manera col·lectiva."}],"criteris":[{"ce_num":1,"ca":"CA 1.1","inicial":"Iniciar-se en la interpretació de la informació d’un problema i d’una situació de la vida quotidiana responent a les preguntes plantejades o fent noves preguntes.","mitja":"Interpretar la informació d’un problema i d’una situació de la vida quotidiana responent a les preguntes plantejades o fent noves preguntes.","superior":"Interpretar i reformular de forma verbal i gràfica, problemes i situacions de la vida quotidiana, responent a les preguntes plantejades o fent noves preguntes."},{"ce_num":1,"ca":"CA 1.2","inicial":"Proposar representacions matemàtiques, amb recursos manipulatius, gràfics i digitals, orientades a la resolució de problemes i de situacions de la vida quotidiana.","mitja":"Proposar representacions matemàtiques, amb recursos manipulatius, gràfics i digitals, que ajudin en la resolució de problemes i de situacions de la vida quotidiana.","superior":"Elaborar representacions matemàtiques eficaces, amb recursos manipulatius, gràfics i digitals, que portin a la resolució de problemes i de situacions de la vida quotidiana"},{"ce_num":2,"ca":"CA 2.1","inicial":"Emprar estratègies i formes pròpies de raonar per resoldre un problema i explicar-ne el procés","mitja":"Emprar estratègies i formes de raonament diverses per resoldre un problema i explicar-ne el procés.","superior":"Seleccionar entre diferents estratègies per resoldre un problema i compartint i justificant l’estratègia seleccionada"},{"ce_num":2,"ca":"CA 2.2","inicial":"Explorar, compartir i resoldre un mateix problema a partir de diferents propostes, parlant-ne sense biaix de gènere.","mitja":"Explorar, compartir i resoldre un mateix problema a partir de diferents propostes, parlant-ne sense biaix de gènere.","superior":"Compartir i obtenir possibles solucions d’un problema seleccionant d’entre diverses opcions compartides i justificant l’escollida sense biaix de gènere."},{"ce_num":2,"ca":"CA 2.3","inicial":"Comprovar que les solucions obtingudes es corresponen amb la pregunta formulada relacionant les solucions amb la pregunta.","mitja":"Demostrar la correcció matemàtica de les solucions d’un problema i la seva coherència en el context plantejat.","superior":"Argumentar la correcció matemàtica de les solucions d’un problema i la seva coherència en el context plantejat generant, si escau, noves preguntes i reptes."},{"ce_num":3,"ca":"CA 3.1","inicial":"Iniciar-se en la realització de conjectures matemàtiques investigant patrons i propietats, fent deduccions i comprovant- les","mitja":"Formular conjectures matemàtiques senzilles i investigant patrons, propietats i relacions, així com fent deduccions i comprovant-les.","superior":"Analitzar conjectures matemàtiques senzilles investigant patrons, propietats i relacions, així com fent deduccions i comprovant-les."},{"ce_num":3,"ca":"CA 3.2","inicial":"Proposar exemples de problemes i situacions i explicant com es poden resoldre matemàticament.","mitja":"Proposar exemples de problemes i situacions, explicant com es poden resoldre raonant i argumentant en les situacions en què calgui aplicar-ho.","superior":"Crear exemples de problemes i situacions justificant que es poden resoldre oferint els propis raonaments i arguments."},{"ce_num":3,"ca":"CA 3.3","inicial":"Incorporar la utilització de la visualització i del raonament geomètric com a forma de raonament per entendre i gestionar la informació referida a l’espai","mitja":"Incorporar la utilització de la visualització i del raonament geomètric com a forma de raonament per entendre i gestionar la informació referida a l’espai.","superior":"Incorporar la utilització de la visualització i del raonament geomètric com a forma de raonament per entendre i gestionar la informació referida a l’espai."},{"ce_num":4,"ca":"CA 4.1","inicial":"Descriure rutines i activitats senzilles que es realitzin pas a pas, en situacions de l’aula i de la vida quotidiana.","mitja":"Descriure rutines i activitats senzilles que es realitzin pas a pas, en situacions de l’aula i de la vida quotidiana.","superior":"Descompondre un problema o situació de la vida quotidiana en tasques, abordant-les d’una en una per poder trobar la solució global, entre d’altres, amb dispositius digitals."},{"ce_num":4,"ca":"CA 4.2","inicial":"Descompondre un problema o situació de la vida quotidiana en tasques concretes, abordant-les d’una en una per poder trobar la solució global.","mitja":"Descompondre un problema o situació de la vida quotidiana en tasques concretes, abordant-les d’una en una per poder trobar la solució global.","superior":"Reconèixer patrons, similituds i tendències en els problemes o situacions que es volen solucionar."},{"ce_num":4,"ca":"CA 4.3","inicial":"Reconèixer patrons, similituds i tendències en els problemes o situacions que es volen solucionar.","mitja":"Reconèixer patrons, similituds i tendències en els problemes o situacions que es volen solucionar.","superior":"Trobar els principis que generen els patrons d’un problema, descartant les dades irrellevants tot identificant les parts més importants."},{"ce_num":4,"ca":"CA 4.4","inicial":"Explicar instruccions pas a pas per resoldre un problema i d’altres de similars provant i duent a terme possibles solucions amb dispositius digitals i sense.","mitja":"Definir instruccions pas a pas per resoldre un problema i d’altres de similars provant i duent a terme possibles solucions amb dispositius digitals i sense.","superior":"Definir instruccions pas a pas per resoldre un problema i d’altres de similars provant i duent a terme possibles solucions amb dispositius digitals."},{"ce_num":5,"ca":"CA 5.1","inicial":"Reconèixer connexions entre els diferents elements matemàtics relacionant i ampliar coneixements en un context matemàtic.","mitja":"Realitzar connexions entre els diferents elements matemàtics valorant-ne la utilitat per raonar i fixar coneixements en un context matemàtic.","superior":"Connectar diferents elements de les matemàtiques valorant-ne la utilitat per relacionar i ampliar coneixements en un context matemàtic."},{"ce_num":5,"ca":"CA 5.2","inicial":"Reconèixer les matemàtiques presents en la vida quotidiana i en altres àrees en situacions en què se’n pugui fer ús.","mitja":"Interpretar situacions en contextos diversos reconeixent les connexions entre les matemàtiques i la vida quotidiana en situacions en què se’n pugui fer ús.","superior":"Utilitzar les connexions entre les matemàtiques i altres àrees i també entre les matemàtiques i situacions de contextos no matemàtics en què se’n pugui fer ús, desenvolupant la capacitat crítica, creativa i innovadora."},{"ce_num":6,"ca":"CA 6.1","inicial":"Seleccionar el llenguatge matemàtic bàsic present en la vida quotidiana donant-li significat.","mitja":"Reconèixer i usar llenguatge matemàtic present en el seu entorn donant-li significat.","superior":"Interpretar i usar llenguatge matemàtic adequat donant-li significat."},{"ce_num":6,"ca":"CA 6.2","inicial":"Explicar idees i processos matemàtics utilitzats en la resolució d’un problema o justificant la solució obtinguda de forma verbal, amb l’ajuda del gest o de la representació gràfica.","mitja":"Explicar idees i processos matemàtics utilitzats en la resolució d’un problema o justificant la solució obtinguda de forma verbal, amb l’ajuda del gest, la representació gràfica i també la representació digital.","superior":"Representar conceptes, procediments i resultats matemàtics utilitzant diferents eines i formes de representació, inclosa la digital, per visualitzar idees i estructurar processos matemàtics."},{"ce_num":6,"ca":"CA 6.3","inicial":"","mitja":"","superior":"Explicar idees i processos matemàtics utilitzats en la resolució d’un problema o argumentant la solució obtinguda de forma verbal, amb l’ajuda del gest, la representació gràfica i també la representació digital."},{"ce_num":7,"ca":"CA 7.1","inicial":"Reconèixer les pròpies emocions en abordar nous reptes matemàtics, sent proactiu en la cerca de possibles solucions, demanant ajuda només després d’un primer intent.","mitja":"Identificar les pròpies emocions en abordar nous reptes matemàtics, sent proactiu en la cerca de possibles solucions, demanant ajuda, si cal, formulant clarament la pregunta.","superior":"Regular les pròpies emocions i desenvolupar l’autoconfiança per abordar nous reptes matemàtics, identificant les pròpies fortaleses i superant les debilitats."},{"ce_num":7,"ca":"CA 7.2","inicial":"Expressar actituds positives davant de nous reptes matemàtics, com ara la predisposició i la receptivitat, entenent l’error com una oportunitat d’aprenentatge.","mitja":"Mostrar actituds positives davant de nous reptes matemàtics, com ara l’esforç i la flexibilitat, entenent l’error com una oportunitat d’aprenentatge.","superior":"Mantenir actituds positives davant de nous reptes matemàtics, com ara la perseverança i la flexibilitat, entenent l’error com una oportunitat d’aprenentatge."},{"ce_num":8,"ca":"CA 8.1","inicial":"Participar en el treball en equip, tant en entorn presencial com virtual, escoltant les altres persones reconeixent les seves aportacions, en situacions en què es comparteixi i construeixi coneixement matemàtic de manera conjunta.","mitja":"Col·laborar en el treball en equip, tant en entorn presencial com virtual, assumint-ne responsabilitats per construir coneixement matemàtic.","superior":"Col·laborar i aportar estratègies i raonaments matemàtics en el treball en equip, tant en entorn presencial com virtual, construint coneixement matemàtic de manera conjunta."},{"ce_num":8,"ca":"CA 8.2","inicial":"","mitja":"Implicar-se amb el grup, amb empatia i respecte, compartint les pròpies opinions, maneres de fer, estratègies i pensaments tot escoltant i reconeixent les aportacions de les altres persones per enriquir l’aprenentatge propi i col·lectiu.","superior":"Equilibrar les necessitats personals amb les del grup, des de l’empatia i el respecte, reconeixent la diversitat i el valor de les aportacions de les altres persones per generar nou aprenentatge matemàtic, tant individual com col·lectiu."}],"sabers":[{"bloc":"Sentit numèric","subbloc":"","descripcio":"Ús d’estratègies variades de comptatge i recompte sistemàtic en situacions de la vida quotidiana amb quantitats fins al 199 adquirint una base sòlida en la comprensió i maneig d’aquestes quantitats."},{"bloc":"Sentit numèric","subbloc":"","descripcio":"Realització d’estimacions raonades de quantitats en contextos de resolució de problemes."},{"bloc":"Sentit numèric","subbloc":"","descripcio":"Domini de la lectura, representació (inclosa la recta numèrica), composició, descomposició de nombres naturals fins al 199."},{"bloc":"Sentit numèric","subbloc":"","descripcio":"Exploració de la representació d’una mateixa quantitat de diferents maneres (manipulativa, gràfica o numèrica) i estratègies d’elecció de la representació adequada per a cada situació problematitzada fent especial esment al nombre 10."},{"bloc":"Sentit numèric","subbloc":"Sentit de les operacions","descripcio":"Familiarització d’estratègies de càlcul mental amb nombres naturals fins al 199, posant especial atenció al rang 1-20 en situacions en què es treballi la descomposició de dígits, especialment el 10, dobles i quasi dobles."},{"bloc":"Sentit numèric","subbloc":"Sentit de les operacions","descripcio":"Pràctica de la suma i la resta de nombres naturals amb flexibilitat i sentit en situacions contextualitzades, usant estratègies i eines de resolució i propietats."},{"bloc":"Sentit numèric","subbloc":"Sentit de les operacions","descripcio":"Aplicació de les relacions que es generen en les operacions fent ús del sistema de numeració de base deu fins al 199."},{"bloc":"Sentit numèric","subbloc":"Sentit de les operacions","descripcio":"Comparació i ordenació dels nombres naturals en contextos de la vida quotidiana."},{"bloc":"Sentit numèric","subbloc":"Sentit de les operacions","descripcio":"Identificació de les relacions entre la suma i la resta descobrint la seva aplicació en contextos quotidians."},{"bloc":"Sentit numèric","subbloc":"Sentit de les operacions","descripcio":"Raonament proporcional"},{"bloc":"Sentit numèric","subbloc":"Educació financera","descripcio":"Reconeixement del sistema monetari europeu: monedes i bitllets d’euro (1, 2, 5, 10, 20 i 50), valor i equivalència."},{"bloc":"Sentit de la mesura","subbloc":"Educació financera","descripcio":"Apreciació dels atributs mesurables dels objectes (longitud, massa, capacitat), distàncies i temps."},{"bloc":"Sentit de la mesura","subbloc":"Educació financera","descripcio":"Introducció de les unitats convencionals (metre, quilo i litre) i no convencionals en situacions en què es facin mesuraments en el context escolar o de la vida quotidiana."},{"bloc":"Sentit de la mesura","subbloc":"Educació financera","descripcio":"Reconeixement de les unitats de mesura del temps (any, mes, setmana, dia i hora) en situacions de la vida quotidiana."},{"bloc":"Sentit de la mesura","subbloc":"Educació financera","descripcio":"Aplicació de processos de mesura a través d’una repetició d’una unitat i a través de la utilització d’instruments no convencionals."},{"bloc":"Sentit de la mesura","subbloc":"Educació financera","descripcio":"Experimentació de processos de mesura amb instruments convencionals (regles, cintes mètriques, balances, calendaris...) en contextos quotidians."},{"bloc":"Sentit de la mesura","subbloc":"Estimació i relacions","descripcio":"Selecció d’estratègies de comparació directa i ordenació de mesures de la mateixa magnitud segons la demanda del problema."},{"bloc":"Sentit de la mesura","subbloc":"Estimació i relacions","descripcio":"Estimació de mesures (distàncies, mides, masses, capacitats...) cercant formes de comparar-les amb altres mesures."},{"bloc":"Sentit espacial","subbloc":"Formes geomètriques de 2D o 3D","descripcio":"Identificació i classificació de formes geomètriques de dues dimensions en objectes de la vida quotidiana tenint en compte els seus elements."},{"bloc":"Sentit espacial","subbloc":"Formes geomètriques de 2D o 3D","descripcio":"Introducció d’estratègies i tècniques de construcció de composició i descomposició de formes geomètriques senzilles d’una, dues o tres dimensions de forma manipulativa."},{"bloc":"Sentit espacial","subbloc":"Formes geomètriques de 2D o 3D","descripcio":"Introducció del vocabulari geomètric bàsic en la descripció verbal dels elements i les propietats de formes geomètriques senzilles."},{"bloc":"Sentit espacial","subbloc":"Formes geomètriques de 2D o 3D","descripcio":"Reconeixement de les propietats de formes geomètriques de dues i tres dimensions explorant amb materials manipulables (mecanos, tangram, jocs de figures…) i també amb eines digitals."},{"bloc":"Sentit espacial","subbloc":"Localització i sistemes de representació","descripcio":"Descripció de la posició relativa d’objectes en l’espai amb relació a un mateix amb el vocabulari adequat (a dalt, a baix, davant, darrere, entremig, a prop, lluny…) i també de dos objectes entre si (junts, separats, un sobre l’altre, etc.) en situacions d’interpretació de moviments."},{"bloc":"Sentit espacial","subbloc":"Localització i sistemes de representació","descripcio":"Representació i elaboració d’itineraris senzills amb referents de l’entorn proper."},{"bloc":"Sentit espacial","subbloc":"Moviments i transformacions","descripcio":"Construcció de figures a partir de moviments, girs, fent simetries, superposant figures per comprovar semblances, diferències, encaixos, fer noves agrupacions…"},{"bloc":"Sentit espacial","subbloc":"Raonament, modelització i visualització geomètrica","descripcio":"Utilització de models geomètrics en la resolució de problemes relacionats amb els altres sentits."},{"bloc":"Sentit espacial","subbloc":"Raonament, modelització i visualització geomètrica","descripcio":"Reconeixement de l’entorn a través de les relacions geomètriques."},{"bloc":"Sentit espacial","subbloc":"Raonament, modelització i visualització geomètrica","descripcio":"Reconeixement i representació d’una figura en tres dimensions a partir d’una fotografia o fent una predicció de la part oculta d’un cos."},{"bloc":"Sentit espacial","subbloc":"Raonament, modelització i visualització geomètrica","descripcio":"Representació d’un espai conegut de manera que es pugui identificar."},{"bloc":"Sentit espacial","subbloc":"Raonament, modelització i visualització geomètrica","descripcio":"Reconeixement d’objectes des de diverses perspectives."},{"bloc":"Sentit espacial","subbloc":"Raonament, modelització i visualització geomètrica","descripcio":"Composició i descomposició de figures manipulant-les."},{"bloc":"Sentit algebraic","subbloc":"Patrons","descripcio":"Agrupació d’elements a partir de semblances i diferències d’objectes, en aspectes diversos, i ordenació seguint criteris qualitatius i quantitatius."},{"bloc":"Sentit algebraic","subbloc":"Patrons","descripcio":"Exploració d’estratègies per identificar, descriure, completar i estendre seqüències a partir de regularitats en una col·lecció de nombres, figures o imatges."},{"bloc":"Sentit algebraic","subbloc":"Model matemàtic","descripcio":"Descoberta d’estratègies de modelització de situacions de la vida quotidiana mitjançant dibuixos, esquemes, diagrames, objectes manipulables, dramatitzacions…"},{"bloc":"Sentit algebraic","subbloc":"Relacions i funcions","descripcio":"Comprensió de l’expressió de relacions d’igualtat i desigualtat amb els signes = i ≠, < i\n> entre expressions que incloguin operacions."},{"bloc":"Sentit algebraic","subbloc":"Relacions i funcions","descripcio":"Comprensió i representació de la igualtat com a expressió d’una relació d’equivalència entre dos elements i obtenció de dades senzilles desconegudes (representades a través d’un símbol) en qualsevol dels dos elements."},{"bloc":"Sentit algebraic","subbloc":"Relacions i funcions","descripcio":"Identificació dels canvis que es produeixen com a resultat d’una acció."},{"bloc":"Sentit algebraic","subbloc":"Pensament computacional","descripcio":"Descoberta i comprensió d’estratègies quan s’interpreten, modifiquen o creen algorismes senzills que incorporen processos seqüencials i instruccions de bucle i condicionals."},{"bloc":"Sentit estocàstic","subbloc":"Inferència: recollir dades per resoldre preguntes","descripcio":"Reconeixement i formulació de preguntes en situacions properes que es resolen recollint dades."},{"bloc":"Sentit estocàstic","subbloc":"Inferència: recollir dades per resoldre preguntes","descripcio":"Organització i estratègies per a la recollida de dades."},{"bloc":"Sentit estocàstic","subbloc":"Distribució: criteris per organitzar dades","descripcio":"Representació gràfica i interpretació de les dades recollides (tenint en compte la classificació de les dades, la durada de la recollida i el context)"},{"bloc":"Sentit estocàstic","subbloc":"Distribució: criteris per organitzar dades","descripcio":"Introducció a la lectura i interpretació de la freqüència absoluta."},{"bloc":"Sentit estocàstic","subbloc":"Distribució: criteris per organitzar dades","descripcio":"Identificació dels elements que intervenen en els gràfics estadístics de fets o situacions de la vida quotidiana."},{"bloc":"Sentit estocàstic","subbloc":"Predictibilitat i incertesa: atzar i probabilitat","descripcio":"Reconeixement en situacions concretes de si un esdeveniment és impossible, possible o segur, i fins a quin punt és més o menys possible."},{"bloc":"Sentit socioemocional","subbloc":"Creences, actituds i emocions pròpies","descripcio":"Identificació i expressió de les pròpies emocions en situacions d’aprenentatge de les matemàtiques amb curiositat i iniciativa envers aquests aprenentatges."},{"bloc":"Sentit socioemocional","subbloc":"Creences, actituds i emocions pròpies","descripcio":"Adquisició d’autonomia i estratègies per a la presa de decisions en situacions de resolució de problemes, tant per donar resposta a la situació plantejada com per fer-se altres preguntes i continuar aprenent."},{"bloc":"Sentit socioemocional","subbloc":"Creences, actituds i emocions pròpies","descripcio":"Identificació de la contribució de les matemàtiques (numeració, geometria, estadística…) als diversos àmbits de coneixement humà des d’una perspectiva de gènere."},{"bloc":"Sentit socioemocional","subbloc":"Treball en equip, inclusió, respecte i diversitat","descripcio":"Participació activa en el treball en equip en matemàtiques valorant i incorporant les idees de tots i totes."},{"bloc":"Sentit socioemocional","subbloc":"Treball en equip, inclusió, respecte i diversitat","descripcio":"Identificació i rebuig d’actituds discriminatòries mostrant sensibilitat i respecte envers les diferències individuals, també les referents a la diversitat de gènere, presents a l’aula."}]},"valors":{"nom":"Educació en Valors Cívics i Ètics","competencies":[{"num":1,"descripcio":"Identificar aspectes vinculats a la pròpia identitat i a les qüestions ètiques relatives a un mateix, en el seu entorn proper, buscant la informació a l’abast i interpretant-la de forma reflexiva i crítica per promoure l’autoconeixement i el desenvolupament de l’autonomia moral."},{"num":2,"descripcio":"Actuar i interactuar atenent a normes i valors cívics i ètics, reflexionant sobre la seva importància per a la vida individual i col·lectiva, per aplicar-los de manera efectiva i argumentada en diferents contextos i amb la finalitat de promoure una convivència pacífica, respectuosa, democràtica i justa."},{"num":3,"descripcio":"Interpretar les relacions sistèmiques entre l’individu, la societat i la natura, així com la importància de l’acció local i les seves conseqüències en l’entorn proper, per desenvolupar un paper actiu i conseqüent amb el respecte, la cura i la protecció de les persones i del planeta."},{"num":4,"descripcio":"Desenvolupar l’autoestima i l’estima de l’entorn, a partir de la identificació, expressió i gestió de les emocions i sentiments propis i reconeixent i valorant els dels altres, amb la finalitat d’assolir una actitud empàtica i respectuosa envers un mateix, els altres i la natura."}],"criteris":[{"ce_num":1,"ca":"CA 1.1","inicial":"","mitja":"","superior":"Reconèixer les pròpies capacitats físiques, sensorials i cognitives tenint en compte els punts forts i febles de la pròpia identitat promovent l’autoconeixement."},{"ce_num":1,"ca":"CA 1.2","inicial":"","mitja":"","superior":"Identificar trets personals que facilitin el procés de construcció de la pròpia identitat amb responsabilitat i autonomia."},{"ce_num":1,"ca":"CA 1.3","inicial":"","mitja":"","superior":"Interpretar críticament la informació de l’entorn afavorint la construcció de la pròpia identitat."},{"ce_num":1,"ca":"CA 1.4","inicial":"","mitja":"","superior":"Mostrar conductes que evidenciïn autonomia moral en un context social amb gran diversitat d’interessos."},{"ce_num":1,"ca":"CA 1.5","inicial":"","mitja":"","superior":"Mostrar una actitud responsable, respectuosa i assertiva amb relació a problemàtiques diverses i riscos derivats de l’ús acrític i de l’abús de les xarxes socials, com a factors de prevenció de situacions de ciberassetjament entre iguals i en el context educatiu."},{"ce_num":2,"ca":"CA 2.1","inicial":"","mitja":"","superior":"Investigar sobre la naturalesa social i política de l’ésser humà en el marc d’una convivència democràtica."},{"ce_num":2,"ca":"CA 2.2","inicial":"","mitja":"","superior":"Interactuar amb els altres adoptant conductes cíviques i democràtiques en un marc de respecte, empatia i consideració adequada de les relacions afectives que s’estableixin."},{"ce_num":2,"ca":"CA 2.3","inicial":"","mitja":"","superior":"Manifestar actituds alineades amb valors com la justícia, la pau i el rebuig a la violència, la solidaritat i el respecte per les minories i les diferents identitats humanes i personals en el seu entorn."},{"ce_num":2,"ca":"CA 2.4","inicial":"","mitja":"","superior":"Analitzar el paper de les institucions públiques, dels organismes internacionals i les organitzacions no governamentals en la promoció de la pau, la solidaritat i la cooperació entre nacions a través del diàleg argumentatiu."},{"ce_num":2,"ca":"CA 2.5","inicial":"","mitja":"","superior":"Reflexionar sobre la defensa d’una efectiva igualtat de gènere i sobre el problema de la violència contra les dones i la conducta sexista, a través de l’anàlisi de les mesures de prevenció de la desigualtat, la violència i la discriminació per raó de gènere i orientació sexual."},{"ce_num":3,"ca":"CA 3.1","inicial":"","mitja":"","superior":"Identificar propostes per afavorir l’aturada del canvi climàtic a partir de l’anàlisi de les problemàtiques en el context local i argumentant el deure ètic de protegir i tenir cura de la natura."},{"ce_num":3,"ca":"CA 3.2","inicial":"","mitja":"","superior":"Realitzar accions que afavoreixen l’assoliment dels objectius de desenvolupament sostenible a través d’acords i actuacions individuals i col·lectives."},{"ce_num":3,"ca":"CA 3.3","inicial":"","mitja":"","superior":"Desenvolupar actituds i valors de compromís basats en el respecte, cura i protecció de les persones, dels animals i del planeta, a través d’accions individuals, en l’àmbit local, vinculades al consum responsable i de productes de proximitat, l’ús sostenible de l’aigua, de l’energia, de la mobilitat, la gestió dels residus i el respecte per la diversitat ètnica i cultural."},{"ce_num":4,"ca":"CA 4.1","inicial":"","mitja":"","superior":"Expressar de manera respectuosa les pròpies emocions manifestant una ajustada autoestima en activitats creatives individuals i de grup."},{"ce_num":4,"ca":"CA 4.2","inicial":"","mitja":"","superior":"Regular adequadament les pròpies emocions a partir de la identificació d’aquestes i les dels altres, en activitats de reflexió tant individuals com col·lectives."},{"ce_num":4,"ca":"CA 4.3","inicial":"","mitja":"","superior":"Manifestar una actitud empàtica i respectuosa envers un mateix, els altres i la natura, en activitats realitzades en l’entorn escolar."},{"ce_num":4,"ca":"CA 4.4","inicial":"","mitja":"","superior":"Identificar i prendre consciència de fets i accions dirigides a membres de la comunitat educativa que, si persisteixen en el temps, poden derivar en relacions abusives, situacions d’assetjament i maltractament entre iguals en el context educatiu i, en aquest cas, prendre-hi partit des d’un posicionament proactiu com a factor de prevenció."}],"sabers":[]}};

function buildCurriculumContext(pregunta) {
  const q = pregunta.toLowerCase();
  const areaMap = {
    medi: ["medi","natural","social","cultural","ciències","ciencia","geografia","història","historia"],
    artistica: ["artística","artistica","art","plàstica","plastica","visual","musical"],
    fisica: ["física","fisica","esport","motriu","salut","activitat física"],
    llengua_cat_cast: ["català","catala","castellà","castella","llengua","literatura","lectura","escriptura","oral","comunicació"],
    llengua_estr: ["anglès","angles","estrangera","english","foreign"],
    matematiques: ["matemàtiques","matematiques","nombres","calcul","càlcul","geometria","estadística","algebra","àlgebra"],
    valors: ["valors","cívics","civics","ètics","etics","ciutadania","democràcia"]
  };

  let arees = [];
  for (const [area, kws] of Object.entries(areaMap)) {
    if (kws.some(kw => q.includes(kw))) arees.push(area);
  }
  if (arees.length === 0) arees = Object.keys(CURRICULUM_PRIMARIA);

  let cicle = null;
  if (q.includes("inicial") || q.includes("1r") || q.includes("2n") || q.includes("primer") || q.includes("segon")) cicle = "inicial";
  else if (q.includes("mitjà") || q.includes("mitja") || q.includes("3r") || q.includes("4t") || q.includes("tercer") || q.includes("quart")) cicle = "mitja";
  else if (q.includes("superior") || q.includes("5è") || q.includes("6è") || q.includes("cinquè") || q.includes("sisè")) cicle = "superior";

  let ctx = "CURRÍCULUM LOMLOE PRIMÀRIA CATALUNYA (Decret 175/2022)\n\n";

  for (const aid of arees) {
    const area = CURRICULUM_PRIMARIA[aid];
    if (!area) continue;
    ctx += `=== ${area.nom.toUpperCase()} ===\n\n`;
    ctx += "COMPETÈNCIES ESPECÍFIQUES:\n";
    area.competencies.forEach(ce => { ctx += `CE ${ce.num}: ${ce.descripcio}\n`; });
    ctx += "\nCRITERIS D\'AVALUACIÓ:\n";
    area.criteris.forEach(ca => {
      if (!cicle) {
        if (ca.inicial) ctx += `${ca.ca} (1r-2n): ${ca.inicial}\n`;
        if (ca.mitja)   ctx += `${ca.ca} (3r-4t): ${ca.mitja}\n`;
        if (ca.superior) ctx += `${ca.ca} (5è-6è): ${ca.superior}\n`;
      } else {
        const text = ca[cicle];
        if (text) ctx += `${ca.ca} (${cicle === "inicial" ? "1r-2n" : cicle === "mitja" ? "3r-4t" : "5è-6è"}): ${text}\n`;
      }
    });
    if (area.sabers && area.sabers.length > 0) {
      ctx += "\nSABERS (selecció):\n";
      area.sabers.slice(0, 12).forEach(s => { ctx += `[${s.bloc}] ${s.descripcio}\n`; });
    }
    ctx += "\n";
  }
  return ctx;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
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

// ─── DISCLAIMER MODAL ────────────────────────────────────────────────────────
function DisclaimerModal({ onAccept }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(15,23,42,0.85)", zIndex:30000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem"
    }}>
      <div style={{
        background:"white", borderRadius:20, width:"100%", maxWidth:520,
        boxShadow:"0 32px 80px rgba(0,0,0,0.35)", overflow:"hidden"
      }}>
        <div style={{
          background:"linear-gradient(135deg,#1e3a8a,#2563eb)",
          padding:"28px 28px 24px", textAlign:"center"
        }}>
          <div style={{
            width:56, height:56, background:"rgba(255,255,255,0.2)", borderRadius:16,
            display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px"
          }}>
            <AlertTriangle size={26} color="white" />
          </div>
          <h2 style={{ color:"white", fontSize:20, fontWeight:800, margin:"0 0 6px" }}>
            Avís important sobre l'ús de la IA
          </h2>
          <p style={{ color:"rgba(255,255,255,0.85)", fontSize:13, margin:0, lineHeight:1.5 }}>
            Llegeix i accepta abans de continuar
          </p>
        </div>
        <div style={{ padding:"24px 28px 28px" }}>
          <div style={{
            background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:12,
            padding:"16px 18px", marginBottom:20, fontSize:13, color:"#0c4a6e", lineHeight:1.8
          }}>
            <p style={{ margin:"0 0 10px", fontWeight:700, color:"#1e3a8a" }}>
              Aquesta eina utilitza Intel·ligència Artificial (IA) per generar contingut educatiu.
            </p>
            <ul style={{ margin:0, paddingLeft:18 }}>
              <li>La IA pot <strong>cometre errors</strong>, especialment en competències específiques i criteris d'avaluació del currículum LOMLOE de Catalunya.</li>
              <li style={{ marginTop:6 }}>Tot el contingut generat és una <strong>proposta de treball</strong>, no un document definitiu.</li>
              <li style={{ marginTop:6 }}>És <strong>responsabilitat del docent</strong> revisar, validar i adaptar qualsevol contingut abans d'usar-lo a l'aula o en documents oficials.</li>
              <li style={{ marginTop:6 }}>Les dades personals introduïdes s'<strong>anonimitzen</strong> automàticament abans d'enviar-se a la IA.</li>
            </ul>
          </div>
          <button onClick={onAccept} style={{
            width:"100%", padding:"14px", borderRadius:10, border:"none",
            background:"linear-gradient(135deg,#1e3a8a,#2563eb)", color:"white",
            fontSize:15, fontWeight:800, cursor:"pointer", fontFamily:"inherit",
            boxShadow:"0 4px 14px rgba(30,58,138,0.4)"
          }}>
            He llegit i accepto continuar →
          </button>
          <p style={{ textAlign:"center", fontSize:11, color:"#94a3b8", marginTop:10, lineHeight:1.5 }}>
            Aquesta acceptació es guarda al teu navegador.<br/>No se't tornarà a demanar en aquest dispositiu.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── BANNER IA (peu de cada apartat) ─────────────────────────────────────────
function IaBanner() {
  return (
    <div style={{
      display:"flex", alignItems:"flex-start", gap:8,
      background:"#f0f9ff", border:"1px solid #bae6fd",
      borderRadius:10, padding:"10px 14px", marginTop:24,
      fontSize:12, color:"#0c4a6e", lineHeight:1.6
    }}>
      <AlertTriangle size={14} color="#0284c7" style={{ flexShrink:0, marginTop:2 }} />
      <span>
        <strong>Contingut generat per IA:</strong> Els textos i documents generats per aquesta eina són propostes basades en el currículum LOMLOE de Catalunya. La IA pot cometre errors. És responsabilitat del docent revisar i validar tot el contingut abans d'usar-lo.
      </span>
    </div>
  );
}

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
        <div style={{ padding:"24px 28px 28px" }}>
          <div style={{
            background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10,
            padding:"14px 16px", marginBottom:20, fontSize:13, color:"#0c4a6e", lineHeight:1.7
          }}>
            <strong>Com obtenir la clau gratuïta:</strong>
            <ol style={{ margin:"8px 0 0 16px", padding:0 }}>
              <li>Ves a <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" style={{ color:"#0284c7", fontWeight:700 }}>console.groq.com</a></li>
              <li>Crea un compte gratuït</li>
              <li>Ves a <strong>"API Keys"</strong> → <strong>"Create API Key"</strong></li>
              <li>Copia la clau i enganxa-la aquí sota</li>
            </ol>
            <div style={{ marginTop:10, padding:"6px 10px", background:"#dcfce7", borderRadius:7, fontSize:12, color:"#166534" }}>
              ✅ Pla gratuït de Groq: més que suficient per a ús docent.
            </div>
          </div>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:6 }}>
            Clau API de Groq
          </label>
          <div style={{ position:"relative", marginBottom:err ? 10 : 20 }}>
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={e => { setKey(e.target.value); setLocalError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="gsk_..."
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
              {err === "CLAU_INVALIDA" ? "Clau API no vàlida o caducada. Comprova-la a console.groq.com." : err}
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

// ─── ÀTOMS ───────────────────────────────────────────────────────────────────
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

// ─── SdA STRUCTURED VIEW (per Arquitecte) ────────────────────────────────────
function SdADocView({ data, onCopyModal, onDownload }) {
  if (!data) return null;
  const THead = ({ cols, bg="#1e3a8a" }) => (
    <thead><tr>{cols.map((c, i) => (
      <th key={i} style={{ background:bg, color:"white", padding:"8px 10px", textAlign:"left",
        fontSize:11, fontWeight:700, letterSpacing:"0.04em", borderRight:"1px solid rgba(255,255,255,0.15)" }}>{c}</th>
    ))}</tr></thead>
  );
  const tblStyle = { width:"100%", borderCollapse:"collapse", fontSize:12, marginBottom:0, border:"1px solid #cbd5e1", overflow:"hidden" };
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
          <Section title="2. Marc Curricular" color="#1e40af">
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
          <Section title="3. Objectius" color="#1e40af">
            <ul style={{ listStyle:"none", padding:0, margin:0 }}>
              {(data.objectius || []).map((o, i) => (
                <li key={i} style={{ display:"flex", gap:8, marginBottom:6, fontSize:12, lineHeight:1.5, color:"#374151" }}>
                  <span style={{ flexShrink:0, width:18, height:18, background:"#dbeafe", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#1e40af", marginTop:1 }}>{i+1}</span>
                  {o}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="4. Rúbrica" color="#1e40af">
            <table style={tblStyle}>
              <THead cols={["Criteri", "Satisfactori", "Notable", "Excel·lent"]} bg="#2563eb" />
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
          <Section title="5. Seqüència" color="#1e40af">
            <table style={tblStyle}>
              <THead cols={["Sessió", "Activitat", "Agrupament", "Temps", "Materials", "Avaluació"]} bg="#2563eb" />
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
        </div>
      </div>
    </div>
  );
}

function sdaToText(data) {
  if (!data) return "";
  let t = `SITUACIÓ D'APRENENTATGE\n${"═".repeat(60)}\n\n`;
  t += `Títol: ${data.titol}\n\n`;
  t += `MARC CURRICULAR\n${"-".repeat(40)}\n`;
  (data.marc_curricular||[]).forEach(r => { t += `CE: ${r.ce}\nCA: ${r.ca}\nSabers: ${r.sabers}\n\n`; });
  t += `OBJECTIUS\n${"-".repeat(40)}\n`;
  (data.objectius||[]).forEach((o,i) => { t += `  ${i+1}. ${o}\n`; });
  t += `\nRÚBRICA\n${"-".repeat(40)}\n`;
  (data.rubrica||[]).forEach(r => { t += `Criteri: ${r.criteri}\n  N1: ${r.satisfactori}\n  N2: ${r.notable}\n  N3: ${r.excellent}\n\n`; });
  t += `SEQÜÈNCIA\n${"-".repeat(40)}\n`;
  (data.sequencia||[]).forEach(s => { t += `Sessió ${s.sessio}: ${s.activitat}\n  Agrupament: ${s.agrupament} | Temps: ${s.temps}\n\n`; });
  return t;
}

const SDA_SCHEMA = `{
  "num_sda": "01", "ambit": "àmbit principal", "trimestre": "1r Trimestre", "sessions": 6,
  "titol": "títol", "justificacio": "justificació", "producte_collectiu": "producte col·lectiu",
  "producte_individual": "producte individual",
  "marc_curricular": [{"area": "Català", "ce": "CE 1.1: ...", "ca": "CA 1.1.1: ...", "sabers": "sabers"}],
  "objectius": ["objectiu 1"], "rubrica": [{"criteri": "criteri 1", "satisfactori": "...", "notable": "...", "excellent": "..."}],
  "sequencia": [{"sessio": 1, "activitat": "descripció", "agrupament": "Gran grup", "temps": "50 min", "materials": "materials", "instrument": "observació"}],
  "ods": ["ODS 4"], "connexions_arees": "connexions"
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
      const PROHIBIT = `\nPROHIBIT absolutament:\n- Cap símbol markdown: ni #, ni **, ni *, ni _, ni ---, ni ___\n- Cap "Codi de document" ni codis alfanumèrics\n- Cap "Modalitat: Presencial"\n- Cap línia de signatures\n- Cap peu de pàgina\n- Cap fórmula de tancament\nEscriu text pla, net, directament llegible.`;
      const toConfig = {
        families: {
          system: `Ets un tutor/a de primària que escriu notes de reunions amb famílies. To proper, clar i directe. Frases curtes. Mai inventes dades.${PROHIBIT}`,
          instruccions: `Escriu una nota de reunió amb to proper i directe. Text pla.\nEstructura:\n- Data i qui hi era\n- Aspectes positius de l'alumne/a (primer)\n- Temes tractats\n- Acords\n${tBon.length ? "- Tasques pendents" : ""}`,
        },
        cicle: {
          system: `Ets un coordinador/a de cicle que escriu actes de reunions internes. To professional i directe. Mai inventes dades.${PROHIBIT}`,
          instruccions: `Escriu l'acta de la reunió de cicle. Text pla.\nEstructura:\n- Data, assistents i objectiu\n- Punts tractats\n- Acords i decisions, numerats\n${tBon.length ? "- Tasques pendents amb responsable i termini" : ""}`,
        },
        claustre: {
          system: `Ets un/a secretari/a de centre que escriu actes de claustre. To professional i accessible. Mai inventes dades.${PROHIBIT}`,
          instruccions: `Escriu l'acta del claustre. Text pla.\nEstructura:\n- Data, assistents i ordre del dia\n- Cada punt, explicat clarament\n- Acords adoptats, numerats\n${tBon.length ? "- Tasques i responsables" : ""}`,
        },
        professionals: {
          system: `Ets un/a mestre/a que escriu notes de reunions amb professionals externs. To professional i proper. Mai inventes dades.${PROHIBIT}`,
          instruccions: `Escriu la nota de reunió amb professional extern. Text pla.\nEstructura:\n- Data, qui hi era i motiu\n- Informació compartida\n- Acords i passos a seguir\n${tBon.length ? "- Tasques concretes amb responsable i termini" : ""}`,
        },
      };
      const cfg = toConfig[tipus] || toConfig.cicle;
      resetAnon();
      const anonAssistents = anonymize(form.assistents || "").anon;
      const anonTemes      = anonymize(form.temes || "").anon;
      const anonAcords     = anonymize(form.acords || "").anon;
      const anonAspectes   = anonymize(form.aspectes || "").anon;
      const anonTasques    = tBon.map(t => ({
        que: anonymize(t.que).anon, qui: anonymize(t.qui).anon, quan: t.quan
      }));
      const prompt = `${cfg.instruccions}\n\nDades de la reunió:\n- Data: ${form.data || "No especificada"}\n- Objectiu: ${form.objectiu || "No especificat"}\n- Assistents: ${anonAssistents || "No especificats"}\n- Temes tractats: ${anonTemes}\n- Acords: ${anonAcords || "No especificats"}\n${esFamilies && anonAspectes ? `- Aspectes positius: ${anonAspectes}` : ""}\n${anonTasques.length ? `- Tasques:\n${anonTasques.map((t,i) => `  ${i+1}. ${t.que} | Responsable: ${t.qui || "Per determinar"} | Termini: ${t.quan || "Per determinar"}`).join("\n")}` : ""}`;
      const raw = await gemini(cfg.system, prompt, 1400);
      setResult(cleanActa(restoreAnon(raw)));
    } catch(e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); return; }
      if (isLimitError(e)) { setResult(LIMIT_MSG); setLoading(false); return; }
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
                <Inp value={form.objectiu} onChange={v => sf("objectiu", v)} placeholder="Per exemple: fer seguiment acadèmic" />
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Assistents</label>
              <Inp value={form.assistents} onChange={v => sf("assistents", v)}
                placeholder={esFamilies ? "Ex: Tutora Sra. P., mare Sra. G." : "Ex: Directora, mestres de cicle"} />
            </div>
            {esFamilies && (
              <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:11, padding:"13px 14px", marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#15803d", marginBottom:5 }}>
                  ⭐ Aspectes positius de l'alumne/a <span style={{ color:"#e11d48" }}>*</span>
                </label>
                <Txa value={form.aspectes} onChange={v => sf("aspectes", v)} rows={3}
                  placeholder="Ex: Molt participatiu/va, gran esforç en matemàtiques..." />
              </div>
            )}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:3 }}>Temes tractats</label>
              <p style={{ fontSize:11, color:"#94a3b8", marginBottom:5 }}>Escriu lliurement — la IA els redactarà en prosa formal.</p>
              <Txa value={form.temes} onChange={v => sf("temes", v)} rows={5}
                placeholder="Ex: rendiment àrees, comportament, relació iguals..." />
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Acords i decisions</label>
              <Txa value={form.acords} onChange={v => sf("acords", v)} rows={3}
                placeholder="Ex: Es pactarà 15 min de lectura diària." />
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
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
        <button onClick={() => {
          if (confirm("Vols esborrar totes les dades de Reunions? No es pot desfer.")) {
            clearPersisted("reun_");
            setTipus(null); setForm({ data:"", objectiu:"", assistents:"", temes:"", acords:"", aspectes:"" });
            setTasques([emptyTasca()]); setResult("");
          }
        }} style={{
          fontSize:11, color:"#94a3b8", background:"none", border:"1px solid #e2e8f0",
          borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit",
          display:"flex", alignItems:"center", gap:5
        }}>
          🗑️ Esborrar dades de Reunions
        </button>
      </div>
      <IaBanner />
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

function tag_SDC(text, nom) {
  const re = new RegExp(`<${nom}>([\\s\\S]*?)<\\/${nom}>`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

// ─── INDICADOR DE PASSOS ─────────────────────────────────────────
function StepIndicator({ currentStep, steps }) {
  return (
    <div style={{ display:"flex", alignItems:"center", marginBottom:20 }}>
      {steps.map((step, i) => {
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{
                width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                fontWeight:700, fontSize:13, flexShrink:0,
                background: isDone ? "#059669" : isActive ? "#1e3a8a" : "#e2e8f0",
                color: isDone || isActive ? "white" : "#94a3b8",
                border: isActive ? "3px solid #93c5fd" : "none",
              }}>
                {isDone ? "✓" : i + 1}
              </div>
              <span style={{ fontSize:10, fontWeight:600, color: isActive ? "#1e3a8a" : isDone ? "#059669" : "#94a3b8", whiteSpace:"nowrap" }}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex:1, height:2, background: isDone ? "#059669" : "#e2e8f0", margin:"0 4px", marginBottom:16 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── SdACreador amb flux per passos ──────────────────────────────
function SdACreador({ onToast, onApiKeyError }) {
  const [titol, setTitol]         = usePersistedState("sda_titol", "");
  const [fil, setFil]             = usePersistedState("sda_fil", "");
  const [trimestre, setTrimestre] = usePersistedState("sda_trimestre", "1r Trimestre");
  const [curs, setCurs]           = usePersistedState("sda_curs", "3r");
  const [sessions, setSessions]   = usePersistedState("sda_sessions", "6");
  const [arees, setArees]         = usePersistedState("sda_arees", []);
  const [step, setStep]           = usePersistedState("sda_step", 0);
  const [marcData, setMarcData]   = usePersistedState("sda_marc_data", []);
  const [objData, setObjData]     = usePersistedState("sda_obj_data", []);
  const [finalData, setFinalData] = usePersistedState("sda_final_data", null);
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState("");
  const [error, setError]         = useState("");

  const toggleArea = a => setArees(prev =>
    prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
  );
  const numSessions = Math.min(parseInt(sessions) || 6, 12);
  const STEPS = ["Formulari", "Marc Curricular", "Objectius", "SdA Completa"];

  function resetCreador() {
    setStep(0); setMarcData([]); setObjData([]); setFinalData(null); setError("");
  }

  function parseMarcBloc(raw) {
    const marcBloc = tag_SDC(raw, "marc");
    if (!marcBloc) return [];
    return marcBloc.split("---").map(bloc => {
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
    }).filter(r => r.ce || r.ca);
  }

  function parseObjBloc(raw) {
    // Intentem treure el contingut de les etiquetes; si no hi ha etiquetes, usem el raw sencer
    let contingut = tag_SDC(raw, "objectius");
    if (!contingut) contingut = raw.trim();
    if (!contingut) return [];

    // Separador robust: ---, línies en blanc dobles, o nova entrada OBJ:
    let blocs = contingut.split(/\n\s*---+\s*\n/);
    if (blocs.length <= 1) blocs = contingut.split(/\n{2,}(?=OBJ:|OBJECTIU:)/i);
    if (blocs.length <= 1 && (contingut.match(/^OBJ:/gim) || []).length > 1) {
      blocs = contingut.split(/(?=^OBJ:)/im);
    }

    return blocs.map(bloc => {
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
    }).filter(r => r.obj);
  }

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
      return {
        act: get("ACT:", "ACTIVITAT:", "NOM:") || lines[0] || "",
        desc: get("DESC:", "DESCRIPCIÓ:", "DESENVOLUPAMENT:") || lines[1] || "",
        agrupament: get("AGRUPAMENT:", "GRUP:"),
        temps: get("TEMPS:", "DURADA:"),
        materials: get("MATERIALS:", "RECURSOS:"),
        avaluacio: get("AVALUACIO:", "AVALUACIÓ:", "INSTRUMENT:")
      };
    }).filter(a => a.act || a.desc);
  }

  // PAS 1: Generar Marc Curricular
  async function generarMarc() {
    if (!titol || !fil || arees.length === 0) return;
    setLoading(true); setError(""); setMarcData([]); // neteja per si es reinicia
    try {
      const cursObj = CURSOS_SDC.find(c => c.id === curs) || CURSOS_SDC[2];
      setProgress("Generant marc curricular LOMLOE...");
      const raw = await geminiSDC(`Ets expert LOMLOE primària Catalunya. Per la SdA "${titol}" (fil conductor: "${fil}") amb àrees: ${arees.join(", ")}, curs: ${cursObj.label} (${cursObj.edat}), genera el MARC COMPETENCIAL OFICIAL LOMLOE.

IMPORTANT: usa les competències específiques i criteris d'avaluació REALS del currículum LOMLOE català. Genera ${arees.length === 1 ? "EXACTAMENT 5 ENTRADES de la mateixa àrea, amb CE i CA diferents" : "ENTRE 5 I 7 ENTRADES repartides entre les àrees"}.

FORMAT EXACTE (respecta els prefixos CE:, CA: i SABERS: a cada línia):

<marc>
CE: CE 2.2 (Medi): Plantejar-se preguntes sobre el món aplicant el pensament científic
CA: CA 2.2.3: Dissenyar i realitzar experiments senzills per respondre preguntes plantejades
SABERS: Selecció de tècniques d'indagació. Instruments de mesura. Vocabulari científic bàsic.
---
CE: CE 1.2 (Català): Comprendre textos orals i multimodals identificant la informació rellevant
CA: CA 1.2.1: Comprendre textos orals senzills procedents de diversos àmbits
SABERS: Estratègies de comprensió oral. Vocabulari específic. Identificació d'idees principals.
</marc>

Genera el MARC competencial REAL per "${titol}" amb les àrees ${arees.join(", ")}. ${arees.length === 1 ? "Com que només hi ha UNA àrea, genera EXACTAMENT 5 entrades amb 5 CE i CA DIFERENTS d'aquesta àrea." : "Genera ENTRE 5 I 7 ENTRADES repartides entre les àrees, com a mínim 1 per àrea."} Cadascuna amb CE:, CA: i SABERS:, separades per "---".`, 1800);

      const parsed = parseMarcBloc(raw);
      if (parsed.length === 0) throw new Error("No s'ha pogut parsejar el marc curricular. Torna-ho a intentar.");
      setMarcData(parsed);
      setStep(1);
    } catch (e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); setLoading(false); setProgress(""); return; }
      if (isLimitError(e)) { setError(LIMIT_MSG); setLoading(false); setProgress(""); return; }
      setError(e.message || "Error desconegut");
    }
    setProgress(""); setLoading(false);
  }

  // PAS 2: Generar Objectius
  async function generarObjectius() {
    setLoading(true); setError(""); setObjData([]); // neteja per si es reinicia
    try {
      const cursObj = CURSOS_SDC.find(c => c.id === curs) || CURSOS_SDC[2];
      setProgress("Generant objectius d'aprenentatge...");
      const caList = marcData.map((r, i) => `${i+1}. ${r.ca}`).join("\n");
      const raw = await geminiSDC(`Ets expert LOMLOE primària Catalunya. Per la SdA "${titol}", curs ${cursObj.label} (${cursObj.edat}):

Aquests són els Criteris d'Avaluació (CA) del marc competencial:
${caList}

Genera UN O MÉS OBJECTIUS D'APRENENTATGE per cadascun d'aquests ${marcData.length} CA, en el mateix ordre. Total màxim: 6 objectius.
IMPORTANT: omple TOTS els camps N1, N2, N3 amb text real i concret.
CRÍTIC: Separa CADA objectiu amb una línia que contingui EXACTAMENT tres guions: ---

Format EXACTE (cada objectiu separat per ---):
<objectius>
OBJ: Identificar les propietats dels estats de la matèria
CA: CA 2.1.1
CRITERI: Descriure les característiques principals dels estats de la matèria
N1: Sap identificar alguns estats però necessita suport constant
N2: Identifica els estats però no sempre usa vocabulari adequat
N3: Identifica amb precisió tots els estats i usa vocabulari científic adequat
---
OBJ: Relacionar les interaccions de les persones amb el medi
CA: CA 3.2.1
CRITERI: Identificar i descriure les interaccions entre persones i entorn
N1: Identifica algunes interaccions amb suport
N2: Identifica les interaccions però no sempre les relaciona amb conseqüències
N3: Identifica i relaciona amb precisió totes les interaccions
---
OBJ: Tercer exemple
CA: CA 4.1.2
CRITERI: Criteri del tercer objectiu
N1: Descripció nivell 1
N2: Descripció nivell 2
N3: Descripció nivell 3
</objectius>

Genera els objectius (mínim 1 per CA, màxim 6 en total). RECORDA: cada objectiu separat per --- en una línia sola.`, 2000);

      const parsed = parseObjBloc(raw);
      if (parsed.length === 0) {
        // Fallback: crear objectius bàsics a partir dels CA del marc
        const fallback = marcData.map(r => ({
          obj: `Assolir: ${r.ca}`,
          ca: r.ca.split(":")[0].trim(),
          criteri: r.ca,
          n1: "Assoliment inicial amb suport del docent",
          n2: "Assoliment amb autonomia creixent",
          n3: "Assoliment autònom i amb iniciativa pròpia"
        })).slice(0, 6);
        if (fallback.length === 0) throw new Error("No s'han pogut generar els objectius. Torna-ho a intentar.");
        setObjData(fallback);
      } else {
        setObjData(parsed);
      }
      setStep(2);
    } catch (e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); setLoading(false); setProgress(""); return; }
      if (isLimitError(e)) { setError(LIMIT_MSG); setLoading(false); setProgress(""); return; }
      setError(e.message || "Error desconegut");
    }
    setProgress(""); setLoading(false);
  }

  // PAS 3: Generar SdA Completa
  async function generarFinal() {
    setLoading(true); setError("");
    try {
      const cursObj = CURSOS_SDC.find(c => c.id === curs) || CURSOS_SDC[2];
      const base = `SdA: "${titol}" | Fil conductor: "${fil}" | Curs: ${cursObj.label} (${cursObj.edat}) | ${trimestre} | ${numSessions} sessions | Àrees: ${arees.join(", ")}`;
      const sessDesenv = numSessions - 2;

      setProgress("Generant capçalera i activitats inicials/síntesi... (1/2)");
      const [raw1, raw3] = await Promise.all([
        geminiSDC(`Ets expert LOMLOE primària Catalunya. ${base}

Genera EXACTAMENT aquest format:
<ambit>àmbit principal (ex: Científic i Tecnològic, Comunicatiu i Artístic)</ambit>
<justificacio>2-3 frases que justifiquen pedagògicament la SdA</justificacio>
<producte_final>descripció detallada del producte final que crearan els alumnes</producte_final>
<metodologia>descripció de la metodologia (ABP, cooperatiu, indagació, etc.)</metodologia>
`, 800),

        geminiSDC(`Ets expert LOMLOE primària Catalunya. ${base}

Genera les activitats INICIALS (1a sessió) i de SÍNTESI (última sessió).

FORMAT EXACTE:
<inicials>
ACT: Activitat 1 - Sessió 1
DESC: Introducció de la SdA, activació de coneixements previs amb pregunta provocadora.
AGRUPAMENT: Gran grup - Aula
TEMPS: 30 min
MATERIALS: Pissarra digital
AVALUACIO: Registre oral de coneixements previs
---
ACT: Activitat 2 - Sessió 1
DESC: Presentació d'objectius, producte final i rúbrica d'avaluació.
AGRUPAMENT: Gran grup - Aula
TEMPS: 30 min
MATERIALS: Dossier de l'alumne
AVALUACIO: Autoavaluació inicial
</inicials>
<sintesi>
ACT: Activitat final - Sessió ${numSessions}
DESC: Presentació del producte final, debat conjunt i avaluació.
AGRUPAMENT: Individual i gran grup
TEMPS: 60 min
MATERIALS: Rúbrica, producte final
AVALUACIO: Rúbrica i autoavaluació
</sintesi>

Genera activitats REALS per "${titol}".`, 1400),
      ]);

      setProgress("Generant sessions de desenvolupament... (2/2)");
      const sessionsLlista = Array.from({length: sessDesenv}, (_, i) => `Sessió ${i + 2}`).join(", ");
      const raw4 = await geminiSDC(`Ets expert LOMLOE primària Catalunya. ${base}

Genera exactament ${sessDesenv} activitats de DESENVOLUPAMENT, una per sessió: ${sessionsLlista}.
Els objectius d'aquesta SdA són: ${objData.map(o => o.obj).join("; ")}

FORMAT EXACTE (separa cada activitat amb "---"):
<desenvolupament>
ACT: Activitat 3 - Sessió 2
DESC: Descripció detallada alineada amb els objectius d'aprenentatge.
AGRUPAMENT: Petit grup (4 alumnes) - Aula
TEMPS: 60 min
MATERIALS: Materials necessaris
AVALUACIO: Instrument d'avaluació
---
ACT: Activitat 4 - Sessió 3
DESC: Descripció detallada.
AGRUPAMENT: Petit grup - Aula
TEMPS: 60 min
MATERIALS: Materials necessaris
AVALUACIO: Instrument d'avaluació
</desenvolupament>

Genera EXACTAMENT ${sessDesenv} activitats per "${titol}".`, 2000);

      setFinalData({
        titol, ambit: tag_SDC(raw1, "ambit"), trimestre, sessions: numSessions,
        curs: cursObj.label,
        justificacio: tag_SDC(raw1, "justificacio"),
        producte_final: tag_SDC(raw1, "producte_final"),
        metodologia: tag_SDC(raw1, "metodologia"),
        marc: marcData,
        objectius: objData,
        acts_inicials: parseActs(raw3, "inicials"),
        acts_desenv: parseActs(raw4, "desenvolupament"),
        acts_sintesi: parseActs(raw3, "sintesi"),
      });
      setStep(3);
    } catch (e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); setLoading(false); setProgress(""); return; }
      if (isLimitError(e)) { setError(LIMIT_MSG); setLoading(false); setProgress(""); return; }
      setError(e.message || "Error desconegut");
    }
    setProgress(""); setLoading(false);
  }

  const canGen = titol && fil && curs && arees.length > 0 && !loading;

  const thStyle = { background:"#1e3a8a", color:"white", padding:"8px 10px", fontSize:11, fontWeight:700, textAlign:"left", border:"1px solid #1e40af" };
  const tdStyle = { padding:"8px 10px", fontSize:12, border:"1px solid #e2e8f0", verticalAlign:"top", lineHeight:1.6 };
  const tdGrey  = { ...tdStyle, background:"#f8fafc", fontWeight:700, color:"#374151", width:"18%" };

  return (
    <div>
      <StepIndicator currentStep={step} steps={STEPS} />

      {error && (
        <div style={{ background:"#fff5f5", border:"1.5px solid #fca5a5", borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#b91c1c", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>⚠️ <strong>Error:</strong> {error}</span>
          <button onClick={() => setError("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#b91c1c", fontWeight:700, fontSize:16 }}>✕</button>
        </div>
      )}

      {/* PAS 0: FORMULARI */}
      {step === 0 && (
        <div style={{ background:"white", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"1.25rem", marginBottom:16 }}>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:5 }}>Títol de la SdA</label>
            <input value={titol} onChange={e => setTitol(e.target.value)} placeholder="Ex: Els estats de la matèria"
              style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, outline:"none", boxSizing:"border-box" }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#475569", marginBottom:5 }}>Fil conductor / Repte</label>
            <textarea value={fil} onChange={e => setFil(e.target.value)} rows={2}
              placeholder="Ex: Com podem descobrir les propietats de la matèria experimentant?"
              style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"1.5px solid #e2e8f0", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box" }} />
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
                    background: sel ? "#dbeafe" : "white", color: sel ? "#1e3a8a" : "#64748b",
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
          <button onClick={generarMarc} disabled={!canGen} style={{
            width:"100%", padding:"12px", borderRadius:10, border:"none",
            background:canGen?"#1e3a8a":"#e2e8f0", color:canGen?"white":"#94a3b8",
            fontSize:14, fontWeight:700, cursor:canGen?"pointer":"not-allowed", fontFamily:"system-ui",
          }}>
            {loading ? `⏳ ${progress}` : "1. Generar Marc Curricular →"}
          </button>
        </div>
      )}

      {/* PAS 1: REVISIÓ MARC CURRICULAR */}
      {step === 1 && (
        <div>
          <div style={{ background:"#eff6ff", border:"1.5px solid #93c5fd", borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <Edit3 size={15} color="#1e3a8a" />
              <span style={{ fontSize:13, fontWeight:700, color:"#1e3a8a" }}>Revisa el Marc Curricular</span>
            </div>
            <p style={{ fontSize:12, color:"#1e40af", margin:0, lineHeight:1.6 }}>
              Comprova que les competències i criteris siguin correctes. Pots editar qualsevol camp. Quan estiguis satisfet/a, prem "Continuar".
            </p>
          </div>
          <div style={{ background:"white", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"1rem", marginBottom:16, overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Competència Específica (CE)</th>
                  <th style={thStyle}>Criteri d'Avaluació (CA)</th>
                  <th style={thStyle}>Sabers Vinculats</th>
                  <th style={{ ...thStyle, width:40 }}></th>
                </tr>
              </thead>
              <tbody>
                {marcData.map((r, i) => (
                  <tr key={i} style={{ background: i%2===0?"white":"#f8fafc" }}>
                    <td style={tdStyle}>
                      <textarea value={r.ce} rows={3}
                        onChange={e => setMarcData(prev => prev.map((x, j) => j===i ? {...x, ce:e.target.value} : x))}
                        style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:6, padding:"5px 7px", fontSize:11, resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                    </td>
                    <td style={tdStyle}>
                      <textarea value={r.ca} rows={3}
                        onChange={e => setMarcData(prev => prev.map((x, j) => j===i ? {...x, ca:e.target.value} : x))}
                        style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:6, padding:"5px 7px", fontSize:11, resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                    </td>
                    <td style={tdStyle}>
                      <textarea value={r.sabers} rows={3}
                        onChange={e => setMarcData(prev => prev.map((x, j) => j===i ? {...x, sabers:e.target.value} : x))}
                        style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:6, padding:"5px 7px", fontSize:11, resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign:"center" }}>
                      <button onClick={() => setMarcData(prev => prev.filter((_, j) => j !== i))}
                        style={{ background:"none", border:"1px solid #fca5a5", borderRadius:6, padding:"3px 7px", cursor:"pointer", color:"#dc2626", fontSize:13 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setMarcData(prev => [...prev, { ce:"", ca:"", sabers:"" }])}
              style={{ marginTop:10, padding:"6px 14px", background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"system-ui" }}>
              + Afegir fila
            </button>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => setStep(0)} style={{
              padding:"11px 20px", borderRadius:10, border:"1.5px solid #e2e8f0",
              background:"white", color:"#374151", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"system-ui",
              display:"flex", alignItems:"center", gap:6
            }}>
              <ChevronLeft size={14} /> Tornar
            </button>
            <button onClick={generarObjectius} disabled={loading || marcData.length === 0} style={{
              flex:1, padding:"12px", borderRadius:10, border:"none",
              background: marcData.length > 0 ? "#1e3a8a" : "#e2e8f0",
              color: marcData.length > 0 ? "white" : "#94a3b8",
              fontSize:14, fontWeight:700, cursor: marcData.length > 0 ? "pointer" : "not-allowed", fontFamily:"system-ui",
            }}>
              {loading ? `⏳ ${progress}` : "2. Generar Objectius d'Aprenentatge →"}
            </button>
          </div>
        </div>
      )}

      {/* PAS 2: REVISIÓ OBJECTIUS */}
      {step === 2 && (
        <div>
          <div style={{ background:"#eff6ff", border:"1.5px solid #93c5fd", borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <Edit3 size={15} color="#1e3a8a" />
              <span style={{ fontSize:13, fontWeight:700, color:"#1e3a8a" }}>Revisa els Objectius d'Aprenentatge</span>
            </div>
            <p style={{ fontSize:12, color:"#1e40af", margin:0, lineHeight:1.6 }}>
              Comprova que els objectius i la gradació siguin adequats al curs. Pots editar-los. Quan estiguis satisfet/a, prem "Generar SdA Completa".
            </p>
          </div>
          <div style={{ background:"white", border:"1.5px solid #e2e8f0", borderRadius:12, padding:"1rem", marginBottom:16, overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr>
                  <th style={thStyle}>CA</th>
                  <th style={thStyle}>Objectiu</th>
                  <th style={thStyle}>Criteri</th>
                  <th style={{ ...thStyle, background:"#b45309" }}>N1 Satisfactori</th>
                  <th style={{ ...thStyle, background:"#1565c0" }}>N2 Notable</th>
                  <th style={{ ...thStyle, background:"#2e7d32" }}>N3 Excel·lent</th>
                  <th style={{ ...thStyle, width:40 }}></th>
                </tr>
              </thead>
              <tbody>
                {objData.map((o, i) => (
                  <tr key={i} style={{ background: i%2===0?"white":"#f8fafc" }}>
                    <td style={{ ...tdStyle, width:"8%" }}>
                      <input value={o.ca}
                        onChange={e => setObjData(prev => prev.map((x, j) => j===i ? {...x, ca:e.target.value} : x))}
                        style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", boxSizing:"border-box" }} />
                    </td>
                    {["obj","criteri","n1","n2","n3"].map(field => (
                      <td key={field} style={{ ...tdStyle, background: field==="n1"?"#fffbeb":field==="n2"?"#eff6ff":field==="n3"?"#f0fdf4":"white" }}>
                        <textarea value={o[field]} rows={2}
                          onChange={e => setObjData(prev => prev.map((x, j) => j===i ? {...x, [field]:e.target.value} : x))}
                          style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:6, padding:"4px 6px", fontSize:11, resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" }} />
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign:"center" }}>
                      <button onClick={() => setObjData(prev => prev.filter((_, j) => j !== i))}
                        style={{ background:"none", border:"1px solid #fca5a5", borderRadius:6, padding:"3px 7px", cursor:"pointer", color:"#dc2626", fontSize:13 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setObjData(prev => [...prev, { obj:"", ca:"", criteri:"", n1:"", n2:"", n3:"" }])}
              style={{ marginTop:10, padding:"6px 14px", background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"system-ui" }}>
              + Afegir objectiu
            </button>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => setStep(1)} style={{
              padding:"11px 20px", borderRadius:10, border:"1.5px solid #e2e8f0",
              background:"white", color:"#374151", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"system-ui",
              display:"flex", alignItems:"center", gap:6
            }}>
              <ChevronLeft size={14} /> Tornar
            </button>
            <button onClick={generarFinal} disabled={loading || objData.length === 0} style={{
              flex:1, padding:"12px", borderRadius:10, border:"none",
              background: objData.length > 0 ? "#059669" : "#e2e8f0",
              color: objData.length > 0 ? "white" : "#94a3b8",
              fontSize:14, fontWeight:700, cursor: objData.length > 0 ? "pointer" : "not-allowed", fontFamily:"system-ui",
            }}>
              {loading ? `⏳ ${progress}` : "3. Generar SdA Completa ✨"}
            </button>
          </div>
        </div>
      )}

      {/* PAS 3: RESULTAT FINAL */}
      {step === 3 && finalData && (
        <div>
          <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <CheckCircle2 size={16} color="#059669" />
              <span style={{ fontSize:13, fontWeight:700, color:"#166534" }}>
                SdA generada · {finalData.sessions} sessions · {finalData.marc.length} competències · {finalData.objectius.length} objectius
              </span>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => {
                const doc = document.getElementById("sda-doc");
                if (!doc) return;
                const win = window.open("", "_blank");
                if (!win) { alert("El navegador ha bloquejat l'obertura. Permet finestres emergents."); return; }
                const styles = `<style>@page{size:A4 landscape;margin:1cm}body{font-family:Calibri,Arial,sans-serif;font-size:9pt;margin:0;padding:10px;color:#1e293b}table{width:100%!important;border-collapse:collapse;margin-bottom:12px;page-break-inside:avoid}th{background-color:#1e3a8a!important;color:#fff!important;padding:5px 7px;border:1px solid #1e40af;font-weight:700;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}td{padding:5px 7px;border:1px solid #cbd5e1;vertical-align:top;font-size:9pt}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.no-print{position:fixed;top:10px;right:10px;background:#1e3a8a;color:white;padding:10px 20px;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:700}</style>`;
                win.document.write(`<!DOCTYPE html><html><head><meta charset='utf-8'><title>SdA - ${finalData.titol}</title>${styles}</head><body><button class='no-print' onclick='window.print()'>🖨️ Imprimir / PDF</button><h1>${finalData.titol}</h1>${doc.innerHTML}</body></html>`);
                win.document.close();
              }} style={{ padding:"8px 14px", background:"#1e3a8a", color:"white", border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"system-ui" }}>
                🖨️ PDF
              </button>
              <button onClick={resetCreador} style={{ padding:"8px 14px", background:"white", color:"#374151", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"system-ui" }}>
                Nova SdA
              </button>
            </div>
          </div>

          <div id="sda-doc" style={{ background:"white" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:12 }}>
              <tbody>
                <tr>
                  <td style={tdGrey}>Nº SdA</td><td style={tdStyle}>01</td>
                  <td style={tdGrey}>Àmbit</td><td style={tdStyle}>{finalData.ambit}</td>
                  <td style={tdGrey}>Àrees</td><td style={tdStyle}>{arees.join(", ")}</td>
                </tr>
                <tr>
                  <td style={tdGrey}>Curs</td><td style={tdStyle}>{finalData.curs}</td>
                  <td style={tdGrey}>Trimestre</td><td style={tdStyle}>{finalData.trimestre}</td>
                  <td style={tdGrey}>Sessions</td><td style={tdStyle}>{finalData.sessions}</td>
                </tr>
                <tr>
                  <td style={tdGrey}>Títol</td>
                  <td colSpan={5} style={{ ...tdStyle, fontWeight:700, fontSize:14, color:"#1e3a8a" }}>{finalData.titol}</td>
                </tr>
                <tr><td style={tdGrey}>Fil conductor</td><td colSpan={5} style={tdStyle}>{fil}</td></tr>
                <tr><td style={tdGrey}>Justificació</td><td colSpan={5} style={tdStyle}>{finalData.justificacio}</td></tr>
                <tr><td style={tdGrey}>Producte Final</td><td colSpan={5} style={tdStyle}>{finalData.producte_final}</td></tr>
                <tr><td style={tdGrey}>Metodologia</td><td colSpan={5} style={tdStyle}>{finalData.metodologia}</td></tr>
              </tbody>
            </table>

            <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:12 }}>
              <thead><tr>
                <th style={thStyle}>Competència Específica (CE)</th>
                <th style={thStyle}>Criteri d'Avaluació (CA)</th>
                <th style={thStyle}>Sabers Vinculats</th>
              </tr></thead>
              <tbody>{finalData.marc.map((r, i) => (
                <tr key={i} style={{ background: i%2===0?"white":"#f8fafc" }}>
                  <td style={tdStyle}>{r.ce}</td>
                  <td style={tdStyle}>{r.ca}</td>
                  <td style={tdStyle}>{r.sabers}</td>
                </tr>
              ))}</tbody>
            </table>

            <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:12 }}>
              <thead><tr>
                <th style={thStyle}>CA</th>
                <th style={thStyle}>Objectiu d'Aprenentatge</th>
                <th style={thStyle}>Criteri d'Avaluació</th>
                <th style={{ ...thStyle, background:"#b45309" }}>N1 Satisfactori</th>
                <th style={{ ...thStyle, background:"#1565c0" }}>N2 Notable</th>
                <th style={{ ...thStyle, background:"#2e7d32" }}>N3 Excel·lent</th>
              </tr></thead>
              <tbody>{finalData.objectius.map((o, i) => (
                <tr key={i} style={{ background: i%2===0?"white":"#f8fafc" }}>
                  <td style={{ ...tdStyle, fontWeight:700, color:"#1e3a8a", width:"5%" }}>{o.ca}</td>
                  <td style={{ ...tdStyle, width:"18%" }}>{o.obj}</td>
                  <td style={{ ...tdStyle, width:"18%", fontStyle:"italic", color:"#475569" }}>{o.criteri}</td>
                  <td style={{ ...tdStyle, background:"#fffbeb" }}>{o.n1}</td>
                  <td style={{ ...tdStyle, background:"#eff6ff" }}>{o.n2}</td>
                  <td style={{ ...tdStyle, background:"#f0fdf4" }}>{o.n3}</td>
                </tr>
              ))}</tbody>
            </table>

            <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:16, fontSize:12 }}>
              <thead>
                <tr><th colSpan={6} style={{ ...thStyle, textAlign:"center", fontSize:13 }}>SEQÜÈNCIA D'ACTIVITATS</th></tr>
                <tr>
                  <th style={{ ...thStyle, background:"#1e40af", width:"5%" }}>Fase</th>
                  <th style={{ ...thStyle, background:"#1e40af", width:"18%" }}>Activitat / Sessió</th>
                  <th style={{ ...thStyle, background:"#1e40af" }}>Desenvolupament</th>
                  <th style={{ ...thStyle, background:"#1e40af", width:"12%" }}>Agrupament</th>
                  <th style={{ ...thStyle, background:"#1e40af", width:"8%" }}>Temps</th>
                  <th style={{ ...thStyle, background:"#1e40af", width:"14%" }}>Avaluació</th>
                </tr>
              </thead>
              <tbody>
                {finalData.acts_inicials.map((a, i) => (
                  <tr key={`ini_${i}`} style={{ background:"#fefce8" }}>
                    {i === 0 && <td rowSpan={finalData.acts_inicials.length} style={{ ...tdStyle, fontWeight:700, color:"#92400e", textAlign:"center", background:"#fef3c7", width:"5%" }}>Inicials</td>}
                    <td style={{ ...tdStyle, fontWeight:700 }}>{a.act}</td>
                    <td style={tdStyle}>{a.desc}</td>
                    <td style={tdStyle}>{a.agrupament}</td>
                    <td style={tdStyle}>{a.temps}</td>
                    <td style={tdStyle}>{a.avaluacio}</td>
                  </tr>
                ))}
                {finalData.acts_desenv.map((a, i) => (
                  <tr key={`dev_${i}`} style={{ background:"white" }}>
                    {i === 0 && <td rowSpan={finalData.acts_desenv.length} style={{ ...tdStyle, fontWeight:700, color:"#1e3a8a", textAlign:"center", background:"#eff6ff", width:"5%" }}>Desenvol.</td>}
                    <td style={{ ...tdStyle, fontWeight:700 }}>{a.act}</td>
                    <td style={tdStyle}>{a.desc}</td>
                    <td style={tdStyle}>{a.agrupament}</td>
                    <td style={tdStyle}>{a.temps}</td>
                    <td style={tdStyle}>{a.avaluacio}</td>
                  </tr>
                ))}
                {finalData.acts_sintesi.map((a, i) => (
                  <tr key={`sin_${i}`} style={{ background:"#f0fdf4" }}>
                    {i === 0 && <td rowSpan={finalData.acts_sintesi.length} style={{ ...tdStyle, fontWeight:700, color:"#166534", textAlign:"center", background:"#dcfce7", width:"5%" }}>Síntesi</td>}
                    <td style={{ ...tdStyle, fontWeight:700 }}>{a.act}</td>
                    <td style={tdStyle}>{a.desc}</td>
                    <td style={tdStyle}>{a.agrupament}</td>
                    <td style={tdStyle}>{a.temps}</td>
                    <td style={tdStyle}>{a.avaluacio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <IaBanner />
        </div>
      )}

      {loading && <Loading text={progress || "La IA està generant contingut..."} />}
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
        <button onClick={() => {
          if (confirm("Vols esborrar totes les dades de Situacions d'Aprenentatge? No es pot desfer.")) {
            clearPersisted("sda_");
            setTitol(""); setFil(""); setTrimestre("1r Trimestre"); setCurs("3r");
            setSessions("6"); setArees([]); setStep(0);
            setMarcData([]); setObjData([]); setFinalData(null); setError("");
          }
        }} style={{
          fontSize:11, color:"#94a3b8", background:"none", border:"1px solid #e2e8f0",
          borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit",
          display:"flex", alignItems:"center", gap:5
        }}>
          🗑️ Esborrar dades de SdA
        </button>
      </div>
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
      if (isLimitError(e)) { alert(LIMIT_MSG); return; }
      alert("Error processant el material. Torna-ho a intentar.");
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ background:"white", border:"1.5px solid #7dd3fc", borderRadius:14, padding:"1.25rem", marginBottom:16, borderTop:"4px solid #0284c7" }}>
        <SecLabel icon={Blocks} label="Estructura els teus materials en format SdA oficial" color="#0284c7" />
        <p style={{ fontSize:13, color:"#64748b", marginBottom:14, lineHeight:1.6 }}>
          Enganxa qualsevol descripció d'activitat, unitat didàctica o notes de classe. La IA les estructurarà en el format oficial LOMLOE.
        </p>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>Material existent</label>
          <Txa value={text} onChange={setText} rows={10} placeholder="Enganxa aquí la sessió, activitat o fragment que vols estructurar com a SdA..." />
        </div>
        <Btn variant="primary" full onClick={generar} disabled={loading || !text}>
          {loading ? <><Spinner /> Estructurant en format LOMLOE...</> : <><Wand2 size={14} /> Estructurar com a SdA Oficial LOMLOE</>}
        </Btn>
      </div>
      {loading && <Loading text="Analitzant el contingut i omplint la graella oficial LOMLOE..." />}
      <SdADocView data={data} onCopyModal={() => setCopyModal(true)}
        onDownload={() => downloadTxt(sdaToText(data), "sda_arquitecte")} />
      {copyModal && data && <CopyModal text={sdaToText(data)} onClose={() => setCopyModal(false)} />}
      <IaBanner />
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
        `Ets especialista en Disseny Universal per a l'Aprenentatge (DUA) i educació inclusiva a Catalunya. Adaptes continguts educatius aplicant les tres xarxes del DUA. Escrius en català acadèmic professional.`,
        `Adapta el contingut educatiu següent aplicant principis DUA per a alumnat amb: ${necessitat}\n\nCONTINGUT ORIGINAL:\n${contingut}\n\nGenera un document estructurat amb:\n\n## ANÀLISI DE BARRERES\nIdentifica les barreres principals.\n\n## MESURES DE REPRESENTACIÓ (Xarxa de Reconeixement)\nAdapta com es presenta la informació.\n\n## MESURES D'ACCIÓ I EXPRESSIÓ (Xarxa Estratègica)\nAdapta com l'alumnat demostra l'aprenentatge.\n\n## MESURES D'IMPLICACIÓ (Xarxa Afectiva)\nAdapta la motivació i l'autoregulació.\n\n## ACTIVITATS ADAPTADES\nReformula les activitats amb adaptacions concretes.\n\n## MATERIALS ESPECÍFICS\nLlista materials recomanats.\n\n## INDICADORS D'ASSOLIMENT ADAPTATS\nCriteris d'avaluació ajustats.`,
        2000
      );
      setResult(res);
    } catch(e) {
      if (isApiKeyError(e)) { onApiKeyError(e.message); return; }
      if (isLimitError(e)) { setResult(LIMIT_MSG); return; }
      setResult("Error de connexió.");
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ background:"white", border:"1.5px solid #fda4af", borderRadius:14, padding:"1.25rem", marginBottom:16, borderTop:"4px solid #e11d48" }}>
        <SecLabel icon={Accessibility} label="Adaptació DUA per a la Inclusió" color="#e11d48" />
        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:6 }}>Necessitat específica</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
            {NECESSITATS.map(n => {
              const sel = necessitat===n;
              return (
                <button key={n} onClick={() => setNecessitat(n)}
                  style={{ padding:"5px 11px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit",
                    border:sel ? "1.5px solid #e11d48" : "1.5px solid #e2e8f0",
                    background:sel ? "#ffe4e6" : "white", color:sel ? "#9f1239" : "#64748b" }}>
                  {n}
                </button>
              );
            })}
          </div>
          <Inp value={necessitat} onChange={setNecessitat} placeholder="O descriu la necessitat específica..." />
        </div>
        <div style={{ marginBottom:18 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:3 }}>Contingut a adaptar</label>
          <Txa value={contingut} onChange={setContingut} rows={8} placeholder="Enganxa aquí la sessió o activitat que vols adaptar..." />
        </div>
        <Btn variant="primary" full onClick={generar} disabled={loading || !contingut || !necessitat}>
          {loading ? <><Spinner /> Aplicant mesures DUA...</> : <><Accessibility size={14} /> Generar Adaptació DUA</>}
        </Btn>
      </div>
      {loading && <Loading text="Aplicant les tres xarxes DUA..." />}
      {result && (
        <div style={{ marginTop:16 }}>
          <DocActionBar onCopy={() => setCopyModal(true)} onDownload={() => downloadTxt(result, `dua_${necessitat}`)} />
          <div style={{ background:"#e2e8f0", padding:"20px 16px", borderRadius:"0 0 10px 10px", border:"1.5px solid #e2e8f0", borderTop:"none" }}>
            <div style={{ background:"white", margin:"0 auto", maxWidth:720, padding:"40px 48px",
              boxShadow:"0 4px 24px rgba(0,0,0,0.10)", borderRadius:4, fontFamily:"'Georgia','Times New Roman',serif" }}>
              <div style={{ borderBottom:"3px solid #e11d48", paddingBottom:12, marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#881337" }}>Adaptació DUA per a: {necessitat}</div>
              </div>
              <div style={{ fontSize:13, lineHeight:1.9, whiteSpace:"pre-wrap", color:"#1e293b" }}>{result}</div>
            </div>
          </div>
          {copyModal && <CopyModal text={result} onClose={() => setCopyModal(false)} />}
        </div>
      )}
      <IaBanner />
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

function MobSelBtn({ active, color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      width:"100%", padding:"0.7rem 1rem", borderRadius:8, textAlign:"center",
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
          <button onClick={onDelete} style={{ background:"none", border:"none", color:"#e57373", fontSize:"1rem", cursor:"pointer", padding:"0 2px" }}>✕</button>
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


// ─── CÀLCUL MITJANA PER ÀREA ─────────────────────────────────────────────────
const VAL_NUM = { NA: 4, AS: 5.5, AN: 7.5, AE: 9.5 };

function numToVal(n) {
  if (n === null) return null;
  if (n < 5) return "NA";
  if (n < 7) return "AS";
  if (n < 9) return "AN";
  return "AE";
}

function calcMitjanaArea(aId, ai, valoracions, criterisPerArea, criterisGeneral, comentarisGeneral) {
  let vals = [];
  if (aId === "general") {
    criterisGeneral.forEach((_, ci) => {
      const v = comentarisGeneral[`g_${ai}_${ci}`];
      if (v && VAL_NUM[v] !== undefined) vals.push(VAL_NUM[v]);
    });
  } else {
    const crit = criterisPerArea[aId] || [];
    const aVals = (valoracions[aId] || {})[ai] || {};
    crit.forEach((_, ci) => {
      const v = aVals[ci];
      if (v && VAL_NUM[v] !== undefined) vals.push(VAL_NUM[v]);
    });
  }
  if (vals.length === 0) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { num: Math.round(avg * 10) / 10, lletra: numToVal(avg) };
}

function InformesTab({ onToast, onApiKeyError }) {
  const [tab, setTab]               = usePersistedState("inf_tab", "config");
  const [trimestre, setTrimestre]   = usePersistedState("inf_trimestre", null);
  const [curs, setCurs]             = usePersistedState("inf_curs", "");
  const [arees, setArees]           = usePersistedState("inf_arees", []);
  const [areaActiva, setAreaActiva] = usePersistedState("inf_areaActiva", null);
  const [centre, setCentre]         = usePersistedState("inf_centre", "");
  const [tutor, setTutor]           = usePersistedState("inf_tutor", "");
  const [alumnes, setAlumnes]       = usePersistedState("inf_alumnes", []);
  const [criterisPerArea, setCriterisPerArea] = usePersistedState("inf_criteris", {});
  const [criterisGeneral, setCriterisGeneral] = usePersistedState("inf_criterisGeneral", CRITERIS_GENERAL_INF_DEFAULT);
  const [valoracions, setValorations]           = usePersistedState("inf_valoracions", {});
  const [comentaris, setComentaris]             = usePersistedState("inf_comentaris", {});
  const [comentarisGeneral, setComentarisGeneral] = usePersistedState("inf_comentGen", {});
  const [alumneActiu, setAlumneActiu]           = usePersistedState("inf_alumneActiu", 0);
  const [nomInput, setNomInput]     = useState("");
  const [nomsBloc, setNomsBloc]     = useState("");
  const [showImport, setShowImport] = useState(false);
  const [nouCriteri, setNouCriteri] = useState("");
  const [nouCriteriGeneral, setNouCriteriGeneral] = useState("");
  const [generant, setGenerant]     = useState({});
  const [copyModal, setCopyModal]   = useState(false);
  const [textExport, setTextExport] = useState("");

  const trimestreObj = TRIMESTRES_INF.find(t => t.id === trimestre);
  const configOk     = trimestre && curs && arees.length > 0;
  const graellaOk    = configOk && alumnes.length > 0;
  const areesSelObj  = AREES_INF.filter(a => arees.includes(a.id));
  const areaActivaObj = AREES_INF.find(a => a.id === areaActiva);
  const esGeneral    = areaActiva === "general";

  function toggleArea(id) {
    setArees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
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
    setValorations(v => { const nou = {}; Object.keys(v).forEach(aId => { nou[aId] = reindex(v[aId] || {}); }); return nou; });
    setComentaris(c => { const nou = {}; Object.keys(c).forEach(aId => { nou[aId] = reindex(c[aId] || {}); }); return nou; });
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
    setValorations(v => ({ ...v, [aId]: { ...(v[aId] || {}), [ai]: { ...((v[aId] || {})[ai] || {}), [ci]: val } } }));
  }
  function setValG(ai, ci, val) {
    setComentarisGeneral(c => ({ ...c, [`g_${ai}_${ci}`]: val }));
  }
  function getValG(ai, ci) { return comentarisGeneral[`g_${ai}_${ci}`] || null; }

  function llegenda() {
    return `DEFINICIONS EXACTES:\n- NA = No ha assolit els objectius.\n- AS = Assoliment suficient. Necessita ajuda.\n- AN = Assoliment notable.\n- AE = Assoliment excel·lent.\nIMPORTANT: AE > AN > AS > NA.`;
  }

  function buildPromptArea(aId, ai) {
    const aObj  = AREES_INF.find(a => a.id === aId);
    const crit  = criterisPerArea[aId] || [];
    const vals  = (valoracions[aId] || {})[ai] || {};
    const detall = crit.map((c, ci) => `- ${c}: ${vals[ci] || "sense valorar"}`).join("\n");
    return `Ets un mestre de primària que redacta informes d'avaluació en català.\nEscriu un comentari breu (3-4 frases) per a l'alumne/a sobre l'àrea de ${aObj?.label}, curs ${curs}, ${trimestreObj?.label}.\n${llegenda()}\nVALORACIONS:\n${detall}\nFORMAT: Segona persona singular. Comença amb "Aquest trimestre" o similar. Paràgraf continu. Sense sigles NA/AS/AN/AE.`;
  }

  function buildPromptGeneral(ai) {
    const detall = criterisGeneral.map((c, ci) => `- ${c}: ${getValG(ai, ci) || "sense valorar"}`).join("\n");
    return `Ets un mestre de primària que redacta informes d'avaluació en català.\nEscriu un comentari general breu (3-4 frases) sobre l'actitud i el comportament de l'alumne/a, curs ${curs}, ${trimestreObj?.label}.\n${llegenda()}\nVALORACIONS:\n${detall}\nFORMAT: Segona persona singular. Comença amb "Aquest trimestre" o similar. Paràgraf continu. Sense sigles.`;
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
      const errMsg = isLimitError(e) ? LIMIT_MSG : "Error. Torna-ho a intentar.";
      if (aId === "general") setComentarisGeneral(c => ({ ...c, [ai]: errMsg }));
      else setComentaris(c => ({ ...c, [aId]: { ...(c[aId] || {}), [ai]: errMsg } }));
    }
    setGenerant(g => ({ ...g, [key]: false }));
  }

  async function generarTots() {
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
        const resumArea = crit.map((c, ci) => { const v = vals[ci]; return v ? `  ${c}: ${v}` : null; }).filter(Boolean).join("\n");
        return `── ${aObj?.icon} ${aObj?.label} ──\n${resumArea || "  (sense valorar)"}\n${(comentaris[aId] || {})[ai] || "(sense comentari)"}`;
      }).join("\n\n");
      return `═══════════════════════════════════\nALUMNE/A: ${alumne}\n${trimestreObj?.label} · ${curs}\n═══════════════════════════════════\n\n${seccions}\n`;
    }).join("\n");
    setTextExport(text);
    setCopyModal(true);
  }

  return (
    <div style={{ maxWidth:600, margin:"0 auto" }}>
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
              fontWeight: actiu ? 700 : 400, fontSize:"0.72rem", cursor:disabled ? "default" : "pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:"0.15rem",
            }}>
              <span style={{ fontSize:"1.1rem" }}>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      {/* CONFIG */}
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
          <MobCard title="Àrees a avaluar">
            <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>
              {AREES_INF.map(a => (
                <div key={a.id} style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
                  <button onClick={() => toggleArea(a.id)} style={{
                    flex:1, padding:"0.7rem 1rem", borderRadius:8, textAlign:"left",
                    border:`2px solid ${arees.includes(a.id) ? "#7b1fa2" : "#e0e0e0"}`,
                    background: arees.includes(a.id) ? "#f3e5f5" : "white",
                    color: arees.includes(a.id) ? "#7b1fa2" : "#444",
                    fontWeight: arees.includes(a.id) ? 700 : 400, fontSize:"0.88rem", cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                  }}>
                    <span>{a.icon} {a.label}</span>
                    {arees.includes(a.id) && <span>✓</span>}
                  </button>
                  {arees.includes(a.id) && (
                    <button onClick={() => eliminarArea(a.id)}
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
          <IaBanner />
        </div>
      )}

      {/* GRAELLA */}
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
              <div style={{ fontWeight:700, color:"#1a3a5c", fontSize:"0.85rem" }}>Selecciona l'àrea a valorar:</div>
              <div style={{ overflowX:"auto", display:"flex", gap:"0.5rem", paddingBottom:"0.3rem" }}>
                {areesSelObj.map(a => {
                  const prog = progresArea(a.id);
                  const activa = areaActiva === a.id;
                  return (
                    <button key={a.id} onClick={() => setAreaActiva(a.id)} style={{
                      flexShrink:0, padding:"0.45rem 0.9rem", borderRadius:20,
                      border:`2px solid ${activa ? "#7b1fa2" : "#ddd"}`,
                      background: activa ? "#f3e5f5" : "white", color: activa ? "#7b1fa2" : "#555",
                      fontWeight: activa ? 700 : 400, fontSize:"0.82rem", cursor:"pointer", whiteSpace:"nowrap",
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
          <IaBanner />
        </div>
      )}

      {/* INFORMES */}
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
                      fontWeight: alumneActiu === i ? 700 : 400, fontSize:"0.82rem", cursor:"pointer", whiteSpace:"nowrap", position:"relative",
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
                    {(() => {
                      const mitjana = calcMitjanaArea(aObj.id, alumneActiu, valoracions, criterisPerArea, criterisGeneral, comentarisGeneral);
                      return (
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"0.4rem" }}>
                          <InfLabel>{aObj.icon} {aObj.label}</InfLabel>
                          {mitjana && (
                            <div style={{
                              display:"flex", alignItems:"center", gap:5,
                              background: VAL_META[mitjana.lletra].bg,
                              border: `1.5px solid ${VAL_META[mitjana.lletra].border}`,
                              borderRadius:20, padding:"2px 10px",
                            }}>
                              <span style={{ fontSize:"0.7rem", color:"#666" }}>Mitjana</span>
                              <span style={{ fontWeight:800, fontSize:"0.82rem", color: VAL_META[mitjana.lletra].color }}>
                                {mitjana.lletra}
                              </span>
                              <span style={{ fontSize:"0.68rem", color:"#999" }}>({mitjana.num})</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
                        {generant[`${aObj.id}_${alumneActiu}`] ? "..." : "✨ Generar"}
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
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
            <button onClick={() => {
              if (confirm("Vols esborrar tots els comentaris generats? Les valoracions es mantindran.")) {
                clearPersisted("inf_comentaris");
                clearPersisted("inf_comentGen");
                setComentaris({}); setComentarisGeneral({});
              }
            }} style={{
              fontSize:11, color:"#94a3b8", background:"none", border:"1px solid #e2e8f0",
              borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:5
            }}>
              🗑️ Esborrar comentaris
            </button>
            <button onClick={() => {
              if (confirm("Vols esborrar TOTES les dades d'Informes (alumnes, valoracions i comentaris)? No es pot desfer.")) {
                clearPersisted("inf_");
                setTab("config"); setTrimestre(null); setCurs(""); setArees([]);
                setAreaActiva(null); setCentre(""); setTutor(""); setAlumnes([]);
                setCriterisPerArea({}); setCriterisGeneral(CRITERIS_GENERAL_INF_DEFAULT);
                setValorations({}); setComentaris({}); setComentarisGeneral({});
                setAlumneActiu(0);
              }
            }} style={{
              fontSize:11, color:"#dc2626", background:"none", border:"1px solid #fca5a5",
              borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:5
            }}>
              🗑️ Esborrar tot d'Informes
            </button>
          </div>
          <IaBanner />
        </div>
      )}

      {copyModal && <CopyModal text={textExport} onClose={() => setCopyModal(false)} />}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// ─── TAB 4: ATENEU DIGITAL ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

function AteneuDigital({ onApiKeyError }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hola! Soc el teu assistent del currículum LOMLOE de primària de Catalunya (Decret 175/2022). Tinc integrades totes les Competències Específiques, Criteris d'Avaluació i Sabers de totes les àrees per als tres cicles. Fes-me qualsevol pregunta!" }
  ]);
  const [input, setInput]       = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef               = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const q = input.trim();
    if (!q || thinking) return;
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setInput(""); setThinking(true);
    try {
      const context = buildCurriculumContext(q);
      const history = messages.slice(-6).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text
      }));
      const systemPrompt = `Ets un expert en el currículum de primària de Catalunya (Decret 175/2022, LOMLOE).
Respon les preguntes dels docents basant-te ÚNICAMENT en el currículum oficial que t'adjunto.
Si la informació no hi és, digues-ho honestament.
Respon en català, de manera clara i concisa.
Quan citis competències o criteris, usa la numeració oficial (CE 1, CA 1.1, etc.).

CURRÍCULUM OFICIAL:
${context}`;
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("CAL_CLAU");
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: q }
          ],
          max_tokens: 1200, temperature: 0.2, reasoning_effort: "low",
        }),
      });
      const d = await r.json();
      if (d.error) {
        if (d.error.code === 401) { onApiKeyError("CLAU_INVALIDA"); setThinking(false); return; }
        if (d.error.code === 429 || (d.error.message||"").includes("rate limit")) throw new Error(LIMIT_MSG);
        throw new Error(d.error.message);
      }
      const rawAnswer = d.choices?.[0]?.message?.content || "No he pogut generar una resposta.";
      const answer = rawAnswer.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      setMessages(prev => [...prev, { role: "assistant", text: answer }]);
    } catch(err) {
      if (isApiKeyError(err)) { onApiKeyError(err.message); setThinking(false); return; }
      setMessages(prev => [...prev, { role: "assistant", text: `⚠️ ${err.message || "Error de connexió."}` }]);
    }
    setThinking(false);
  }

  const SUGGERIMENTS = [
    "Quines CE té Matemàtiques al cicle mitjà?",
    "Criteris d'avaluació de Llengua al cicle inicial",
    "Sabers de Medi Natural al cicle superior",
    "CE d'Educació Física",
    "Criteris de Matemàtiques per a 5è i 6è",
    "Sabers de Llengua Estrangera"
  ];

  return (
    <div style={{ maxWidth:720, margin:"0 auto" }}>
      <div style={{
        background:"white", border:"1.5px solid #e2e8f0", borderRadius:12,
        padding:"1rem 1.25rem", marginBottom:14,
        display:"flex", alignItems:"center", gap:12, flexWrap:"wrap"
      }}>
        <div style={{
          width:44, height:44, borderRadius:10, flexShrink:0,
          background:"linear-gradient(135deg,#1e3a8a,#2563eb)",
          display:"flex", alignItems:"center", justifyContent:"center"
        }}>
          <Library size={22} color="white" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#1e293b" }}>
            Currículum LOMLOE Primària · Decret 175/2022
          </div>
          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
            51 Competències Específiques · 145 Criteris d'Avaluació · Sabers per cicle · 7 àrees
          </div>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
          {["Medi","Artística","Ed. Física","Llengua","Estrangera","Matemàtiques","Valors"].map(a => (
            <span key={a} style={{
              fontSize:10, padding:"2px 7px", borderRadius:20,
              background:"#eff6ff", color:"#1e40af",
              border:"1px solid #bfdbfe", fontWeight:600
            }}>{a}</span>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        {SUGGERIMENTS.map(s => (
          <button key={s} onClick={() => setInput(s)}
            style={{
              fontSize:11, padding:"5px 10px", borderRadius:20, cursor:"pointer",
              background:"#f8fafc", border:"1px solid #e2e8f0", color:"#475569",
              fontFamily:"inherit"
            }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{
        background:"white", border:"1.5px solid #e2e8f0", borderRadius:12,
        overflow:"hidden", display:"flex", flexDirection:"column", height:520
      }}>
        <div style={{ flex:1, overflowY:"auto", padding:"1.25rem", display:"flex", flexDirection:"column", gap:14 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display:"flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", gap:8 }}>
              {m.role === "assistant" && (
                <div style={{
                  width:30, height:30, borderRadius:"50%",
                  background:"linear-gradient(135deg,#1e3a8a,#2563eb)",
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2
                }}>
                  <MessageCircle size={15} color="white" />
                </div>
              )}
              <div style={{
                maxWidth:"78%", padding:"10px 14px",
                borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: m.role === "user" ? "#1e3a8a" : "#f1f5f9",
                color: m.role === "user" ? "white" : "#1e293b",
                fontSize:13, lineHeight:1.7, whiteSpace:"pre-wrap"
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {thinking && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{
                width:30, height:30, borderRadius:"50%",
                background:"linear-gradient(135deg,#1e3a8a,#2563eb)",
                display:"flex", alignItems:"center", justifyContent:"center"
              }}>
                <MessageCircle size={15} color="white" />
              </div>
              <div style={{ background:"#f1f5f9", borderRadius:"18px 18px 18px 4px", padding:"10px 14px" }}>
                <Spinner />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{
          borderTop:"1.5px solid #e2e8f0", padding:"12px 16px",
          display:"flex", gap:8, alignItems:"flex-end", background:"white"
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Pregunta sobre el currículum LOMLOE de primària..."
            disabled={thinking}
            rows={1}
            style={{
              flex:1, padding:"9px 12px", borderRadius:10, border:"1.5px solid #e2e8f0",
              fontSize:13, outline:"none", resize:"none", fontFamily:"inherit",
              background: thinking ? "#f8fafc" : "white",
              color:"#1e293b", lineHeight:1.5, maxHeight:100, overflowY:"auto"
            }}
          />
          <button onClick={handleSend} disabled={!input.trim() || thinking}
            style={{
              width:40, height:40, borderRadius:10, border:"none", flexShrink:0,
              background: (input.trim() && !thinking) ? "#1e3a8a" : "#e2e8f0",
              cursor: (input.trim() && !thinking) ? "pointer" : "not-allowed",
              display:"flex", alignItems:"center", justifyContent:"center"
            }}>
            <Send size={16} color={(input.trim() && !thinking) ? "white" : "#94a3b8"} />
          </button>
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
        <button onClick={() => {
          if (!confirm("Vols esborrar l'historial de la conversa?")) return;
          setMessages([{ role:"assistant", text:"Hola! Soc el teu assistent del currículum LOMLOE de primària. Fes-me qualsevol pregunta!" }]);
        }} style={{
          fontSize:11, color:"#94a3b8", background:"none", border:"1px solid #e2e8f0",
          borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit",
          display:"flex", alignItems:"center", gap:5
        }}>
          🗑️ Esborrar conversa
        </button>
      </div>
      <IaBanner />
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// ─── APP PRINCIPAL ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]     = useState("reunions");
  const [toast, setToast] = useState("");
  const [apiKey, setApiKey]             = useState(() => getApiKey());
  const [showApiModal, setShowApiModal] = useState(() => !getApiKey());
  const [apiModalError, setApiModalError] = useState("");
  const [showDisclaimer, setShowDisclaimer] = useState(() => !getDisclaimerAccepted());

  const onToast = useCallback(msg => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const onApiKeyError = useCallback((errorType) => {
    setApiModalError(errorType === "CLAU_INVALIDA" ? "CLAU_INVALIDA" : "");
    setShowApiModal(true);
  }, []);

  const handleSaveKey = useCallback((newKey) => {
    setApiKey(newKey);
    setShowApiModal(false);
    setApiModalError("");
  }, []);

  const handleAcceptDisclaimer = useCallback(() => {
    setDisclaimerAccepted();
    setShowDisclaimer(false);
  }, []);

  const TABS = [
    { id:"reunions",  label:"Reunions",          icon:ClipboardList  },
    { id:"sda",       label:"Sit. Aprenentatge", icon:BookOpen       },
    { id:"informes",  label:"Informes Avaluació",icon:ClipboardCheck },
    { id:"ateneu",    label:"Ateneu Digital",     icon:Library        },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", fontFamily:"'Nunito','Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform:rotate(360deg); } }
        * { box-sizing:border-box; margin:0; padding:0; }
        select { appearance:auto; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:#f1f5f9; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
      `}</style>

      {showDisclaimer && <DisclaimerModal onAccept={handleAcceptDisclaimer} />}
      {!showDisclaimer && showApiModal && <ApiKeyModal onSave={handleSaveKey} errorMsg={apiModalError} />}

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
              <button onClick={() => { setApiModalError(""); setShowApiModal(true); }}
                title="Canviar Clau API de Groq"
                style={{ fontSize:11, color: apiKey ? "#059669" : "#dc2626", background:"none",
                  border:`1px solid ${apiKey ? "#86efac" : "#fca5a5"}`,
                  borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit",
                  display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
                <Key size={11} /> {apiKey ? "Clau activa" : "Sense clau"}
              </button>
              <button onClick={() => {
                if (confirm("Vols esborrar totes les dades guardades? No es pot desfer.")) {
                  clearAllPersisted();
                  location.reload();
                }
              }} style={{ fontSize:11, color:"#94a3b8", background:"none", border:"1px solid #e2e8f0", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
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
        {tab==="reunions" && <ReunionsTab    onToast={onToast} onApiKeyError={onApiKeyError} />}
        {tab==="sda"      && <SdATab         onToast={onToast} onApiKeyError={onApiKeyError} />}
        {tab==="informes" && <InformesTab    onToast={onToast} onApiKeyError={onApiKeyError} />}
        {tab==="ateneu"   && <AteneuDigital  onApiKeyError={onApiKeyError} />}
      </main>

      <Toast msg={toast} onClose={() => setToast("")} />
    </div>
  );
}
