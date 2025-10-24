// script.js
// Chatbot PA Intelligence "JELU PAI"
// - UI in italiano
// - Legge ultimi atti pubblici dal Senato (RSS Ultimi Atti)
// - Risponde con logica consulenziale (no paid API)
// - Se il feed è bloccato da CORS, usa fallback interno

const ddlFeedEl = document.getElementById('ddlFeed');
const chatLogEl = document.getElementById('chatLog');
const chatFormEl = document.getElementById('chatForm');
const userInputEl = document.getElementById('userInput');

// === FETCHERS ============================================================

// 1. Feed atti dal Senato (RSS "Ultimi Atti")
async function fetchSenatoDDL(maxItems = 10) {
  const FEED_URL = 'https://www.senato.it/static/bgt/UltimiAtti/feedDDL.xml';
  try {
    const res = await fetch(FEED_URL);
    const xml = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = [...doc.querySelectorAll('item')].slice(0, maxItems).map(item => ({
      title: item.querySelector('title')?.textContent?.trim() ?? "",
      link: item.querySelector('link')?.textContent?.trim() ?? "",
      date: item.querySelector('pubDate')?.textContent?.trim() ?? "",
      desc: item.querySelector('description')?.textContent?.trim() ?? ""
    }));
    return items;
  } catch (err) {
    console.warn('RSS fetch failed (probabile CORS browser)', err);
    return [];
  }
}

// 2. Knowledge base di fallback
async function fetchFallbackKB() {
  try {
    const res = await fetch('./data/fallback.json');
    return await res.json();
  } catch(e) {
    console.warn('fallback KB non caricata', e);
    return {};
  }
}

// === RENDERERS ===========================================================

function renderDDLList(ddls) {
  if (!ddls.length) {
    ddlFeedEl.innerHTML = `
      <div class="intel-item">
        <div class="intel-ddl">Nessun atto caricato in questo momento (o feed non accessibile da questa rete).</div>
        <div class="intel-meta">Fonte diretta: Senato della Repubblica — feed "Ultimi Atti".</div>
      </div>
    `;
    return;
  }

  ddlFeedEl.innerHTML = ddls.map(d => `
    <a class="intel-item" href="${d.link}" target="_blank" rel="noopener noreferrer">
      <div class="intel-ddl">${escapeHTML(d.title)}</div>
      <div class="intel-meta">${escapeHTML(d.date)}</div>
    </a>
  `).join('');
}

function appendMessage({from, text}) {
  const isAgent = from === 'agent';
  const node = document.createElement('div');
  node.className = `msg ${isAgent ? 'agent':''}`;
  node.innerHTML = `
    <div class="avatar">${isAgent ? 'AI':'TU'}</div>
    <div class="msg-bubble">${linkify(escapeHTML(text))}</div>
  `;
  chatLogEl.appendChild(node);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

// === LOGICA RISPOSTE =====================================================

function normalize(s){
  return (s || "").toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu,'');
}

// Produce risposta "tipo consulente PA"
function answerQuestion(q, state) {
  const nq = normalize(q);

  // Utente chiede ultimi DDL / cosa sta succedendo ora
  if (nq.includes("ultimo") && (nq.includes("ddl") || nq.includes("disegno di legge") || nq.includes("senato") || nq.includes("parlamento"))) {
    if (state.ddl.length) {
      const top = state.ddl[0];
      return (
        "Ecco un atto parlamentare recente al Senato:\n\n" +
        "• Titolo: " + top.title + "\n" +
        (top.date ? "• Data: " + top.date + "\n" : "") +
        "• Perché è rilevante: gli atti depositati più di recente indicano le priorità politiche immediate " +
        "(bilancio, lavoro, sicurezza, PA, ecc.). È fondamentale capire chi lo firma e a quale Commissione " +
        "viene assegnato: lì si gioca la vera partita.\n\n" +
        "Fonte: feed pubblico 'Ultimi Atti' del Senato della Repubblica."
      );
    } else {
      return "Sto provando a leggere il feed 'Ultimi Atti' del Senato ma sembra non accessibile da qui. In generale, l'ultimo DDL depositato mostra le priorità politiche immediate (fisco, lavoro, sicurezza nazionale, ecc.).";
    }
  }

  // Iter legislativo / processo legge
  if (
    nq.includes("come funziona") ||
    nq.includes("iter legislativo") ||
    nq.includes("procedimento legislativo") ||
    nq.includes("come diventa legge") ||
    nq.includes("come passa una legge")
  ) {
    return (
      "Iter legislativo standard in Italia:\n" +
      "1. Presentazione del DDL (disegno di legge) alla Camera o al Senato.\n" +
      "2. Commissione parlamentare: analisi tecnica e politica, emendamenti articolo per articolo.\n" +
      "3. Aula del ramo in cui è stato presentato: discussione politica e voto finale.\n" +
      "4. Passaggio all'altro ramo del Parlamento: l'altro ramo deve approvare lo stesso testo.\n" +
      "5. Promulgazione del Presidente della Repubblica, poi pubblicazione in Gazzetta.\n\n" +
      "Finché Camera e Senato non approvano lo stesso identico testo, la norma non nasce. " +
      "Questo crea finestre tattiche per influenzare il contenuto prima che sia definitivo."
    );
  }

  // Impatto su imprese / PA
  if (
    nq.includes("impatto") ||
    nq.includes("imprese") ||
    nq.includes("aziende") ||
    nq.includes("pubblica amministrazione") ||
    nq.includes("pa ")
  ) {
    return (
      "Impatti tipici di un nuovo DDL su imprese / PA:\n" +
      "• COSTO: nuove tasse, nuovi obblighi di compliance, responsabilità amministrativa.\n" +
      "• ACCESSO: incentivi fiscali, fondi PNRR, credito d'imposta, finanziamenti mirati.\n" +
      "• TEMPO: semplificazioni o complicazioni procedurali per bandi, appalti, autorizzazioni.\n" +
      "• RISCHIO: sanzioni, obblighi di rendicontazione, responsabilità penale/amministrativa.\n\n" +
      "In ottica consulenziale, noi mappiamo subito questi 4 assi e valutiamo: rischio regolatorio, opportunità di finanziamento, esposizione reputazionale."
    );
  }

  // fallback generale con tono consulenza PA
  let extra = "";
  if (state.ddl.length) {
    const top = state.ddl[0];
    extra = "\n\nAl Senato risulta in agenda, tra gli altri: \""+
      top.title+"\" ("+ (top.date || "data non disponibile") +").";
  }

  return (
    "Ricevuto. Ti do una lettura politica e di impatto operativo.\n\n" +
    "1. Contesto: in Parlamento l'agenda si legge da quali DDL entrano davvero in Commissione " +
    "e chi li sponsorizza. Quello ti dice gli interessi politici dietro.\n\n" +
    "2. Impatto: guardiamo subito obblighi nuovi, soldi nuovi, o nuovi rischi per dirigenti PA / amministratori d'azienda.\n\n" +
    "3. Prossimo passo: dimmi un tema preciso (es. appalti pubblici, sicurezza lavoro, green transition, contratti PA) " +
    "e ti do un brief operativo.\n" +
    extra +
    "\n\nFonte: dati pubblici Parlamento (Senato/Camera) e analisi consulenziale JELU PAI."
  );
}

// === UTILS ==============================================================

function escapeHTML(str){
  return str.replace(/[&<>"']/g, m => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]
  ));
}

function linkify(str){
  return str.replace(/(https?:\/\/[^\s]+)/g, url => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

// === STATE + INIT =======================================================

const state = {
  ddl: [],
  kb: {}
};

async function init() {
  // carico feed senato
  const ddls = await fetchSenatoDDL(12);
  state.ddl = ddls;
  renderDDLList(ddls);

  // carico fallback knowledge base
  state.kb = await fetchFallbackKB();

  // messaggio di benvenuto
  appendMessage({
    from:'agent',
    text:
`Ciao, sono l'assistente legislativo JELU PAI.
Posso aiutarti a capire:
• Cosa c'è nei DDL più recenti al Senato
• Perché interessa PA e imprese
• Dove sta l'iter politico

Scrivi un tema, ad esempio:
"Parlami delle novità sugli appalti pubblici"
oppure:
"Qual è l'ultimo DDL rilevante sul lavoro?"`
  });
}

init();

// === CHAT HANDLER =======================================================

chatFormEl.addEventListener('submit', e => {
  e.preventDefault();
  const q = userInputEl.value.trim();
  if(!q) return;

  appendMessage({from:'user', text:q});
  userInputEl.value = "";

  const reply = answerQuestion(q, state);
  appendMessage({from:'agent', text:reply});
});
