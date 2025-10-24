// JELU PAI — Assistente Legislazione (IT)
// AI via Hugging Face + Wikipedia + fallback rule-based
// NOTE: token in frontend is fine for a quick demo. Revoke after use.

const HF_TOKEN = "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"; // <-- incolla qui il tuo token
const HF_MODEL = "it5-base"; // puoi provare: "morenolq/Italpaca-7B-Instruct" (più 'umano', più lento)
const WIKI_SUMMARY = "https://it.wikipedia.org/api/rest_v1/page/summary/";

// --- DOM
const ddlFeedEl = document.getElementById('ddlFeed');
const chatLogEl = document.getElementById('chatLog');
const chatFormEl = document.getElementById('chatForm');
const userInputEl = document.getElementById('userInput');

// ========== 1) DATI: feed Senato ==========
async function fetchSenatoDDL(maxItems = 10) {
  const FEED_URL = 'https://www.senato.it/static/bgt/UltimiAtti/feedDDL.xml';
  try {
    const res = await fetch(FEED_URL);
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return [...doc.querySelectorAll('item')].slice(0, maxItems).map(item => ({
      title: item.querySelector('title')?.textContent?.trim() ?? "",
      link: item.querySelector('link')?.textContent?.trim() ?? "",
      date: item.querySelector('pubDate')?.textContent?.trim() ?? ""
    }));
  } catch (err) {
    console.warn('RSS fetch failed (CORS o rete)', err);
    return [];
  }
}

function renderDDLList(ddls) {
  if (!ddls.length) {
    ddlFeedEl.innerHTML = `
      <div class="intel-item">
        <div class="intel-ddl">Nessun atto caricato (feed non accessibile da questa rete).</div>
        <div class="intel-meta">Fonte: Senato della Repubblica — "Ultimi Atti".</div>
      </div>`;
    return;
  }
  ddlFeedEl.innerHTML = ddls.map(d => `
    <a class="intel-item" href="${d.link}" target="_blank" rel="noopener">
      <div class="intel-ddl">${escapeHTML(d.title)}</div>
      <div class="intel-meta">${escapeHTML(d.date)}</div>
    </a>`).join('');
}

// ========== 2) AI: Hugging Face ==========
async function askHuggingFace(question, context = "") {
  if (!HF_TOKEN || HF_TOKEN.includes("XXXX")) return null; // no token -> skip

  // Prompt in stile consulente JELU
  const prompt =
`Sei un consulente JELU di public affairs. Rispondi in italiano, chiaro e professionale.
Domanda: ${question}
Contesto:
${context}
Richiedi: sintesi operativa (max 10 righe), perché rileva per PA/imprese, eventuali prossimi passi.`;

  try {
    const resp = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt })
    });

    if (!resp.ok) {
      console.warn("HF error:", resp.status, await safeText(resp));
      return null;
    }
    const data = await resp.json();
    // risposta può essere in forme diverse a seconda del modello
    const text =
      (Array.isArray(data) && data[0]?.generated_text) ||
      data.generated_text ||
      (Array.isArray(data) && data[0]?.summary_text) ||
      "";
    return (text || "").trim() || null;
  } catch (e) {
    console.error("HF exception:", e);
    return null;
  }
}

async function safeText(r){ try{return await r.text()}catch{ return "" }}

// ========== 3) Wikipedia (it) ==========
async function wikiSummary(term) {
  try {
    const url = WIKI_SUMMARY + encodeURIComponent(term);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.extract ? `${data.title}: ${data.extract}` : null;
  } catch {
    return null;
  }
}

// ========== 4) Fallback rule-based ==========
function fallbackAnswer(q, ddlList) {
  const nq = q.toLowerCase();
  if (nq.includes("iter") || nq.includes("procedimento") || nq.includes("come diventa legge")) {
    return "Iter legislativo: presentazione DDL; Commissione con emendamenti e voti; Aula; passaggio all’altro ramo; promulgazione del Presidente; pubblicazione in Gazzetta. Finché i testi non coincidono in entrambi i rami, la legge non nasce.";
  }
  if (nq.includes("imprese") || nq.includes("aziende") || nq.includes("pa ")) {
    return "Impatto tipico: COSTO (nuovi oneri/tributi), ACCESSO (incentivi/fondi), TEMPO (semplificazioni o burocrazia), RISCHIO (sanzioni/responsabilità). JELU mappa questi assi per valutare rischio/opportunità.";
  }
  if (ddlList.length) {
    const t = ddlList[0];
    return `Atto recente al Senato: “${t.title}” (${t.date}). Da monitorare in Commissione per capire emendamenti e sponsor politici.`;
  }
  return "Posso analizzare un DDL o un tema (lavoro, appalti, energia, fisco). Chiedimi ad esempio: “Spiegami in breve la legge di bilancio” oppure “Cosa cambia nel nuovo codice appalti?”.";
}

// ========== 5) Utils ==========
function escapeHTML(str){
  return str.replace(/[&<>"']/g, m => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]
  ));
}
function linkify(str){
  return str.replace(/(https?:\/\/[^\s]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}
function appendMessage({from, text}) {
  const el = document.createElement('div');
  el.className = `msg ${from === 'agent' ? 'agent':''}`;
  el.innerHTML = `
    <div class="avatar">${from === 'agent' ? 'AI' : 'TU'}</div>
    <div class="msg-bubble">${linkify(escapeHTML(text))}</div>`;
  chatLogEl.appendChild(el);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

// ========== 6) Stato + Init ==========
const state = { ddl: [] };

async function init() {
  state.ddl = await fetchSenatoDDL(12);
  renderDDLList(state.ddl);

  appendMessage({
    from:'agent',
    text:
`Ciao, sono l'assistente legislativo **JELU PAI**.
• Riassumo atti in linguaggio semplice
• Evidenzio impatti per PA/imprese
• Integro fonti pubbliche (Senato, Wikipedia)

Scrivi un tema (es. “legge di bilancio”, “codice appalti”, “green transition”).`
  });
}
init();

// ========== 7) Chat handler ==========
chatFormEl.addEventListener('submit', async e => {
  e.preventDefault();
  const q = userInputEl.value.trim();
  if (!q) return;
  appendMessage({from:'user', text:q});
  userInputEl.value = "";

  appendMessage({from:'agent', text:'Sto elaborando…'});

  // costruiamo contesto: 1 riga feed + estratto wiki
  let context = "";
  if (state.ddl.length) {
    const t = state.ddl[0];
    context += `Ultimo atto al Senato: ${t.title} (${t.date}). `;
  }
  const wiki = await wikiSummary(q);
  if (wiki) context += `\nWikipedia: ${wiki}`;

  // 1) prova AI
  let reply = await askHuggingFace(q, context);

  // 2) se nulla, usa Wikipedia pura
  if (!reply && wiki) reply = wiki;

  // 3) se ancora nulla, fallback rule-based
  if (!reply) reply = fallbackAnswer(q, state.ddl);

  appendMessage({from:'agent', text:reply});
});
