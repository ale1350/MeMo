/* MeMo — motore "smart": capisce cosa scade e quando, da una foto (testo OCR) o da una frase detta a voce.
   Funziona sia nel browser (window.MeMoParser) sia in Node (module.exports) per i test. */
(function (root) {
  'use strict';

  // ---------- Catalogo dei tipi di scadenza ----------
  // lead: giorni di anticipo con cui avvisare. recur: mesi dopo cui si ripete (null = non si ripete).
  // dateKind: 'expiry' = la data è la scadenza; 'purchase' = la data è l'acquisto (garanzia: +24 mesi).
  // done: cosa succede quando tocchi "Fatto": 'reschedule' (riprogramma), 'renew' (nuovo documento), 'archive'.
  const TYPES = [
    { id: 'passaporto', label: 'Passaporto', emoji: '🛂', lead: 120, recur: null, dateKind: 'expiry', done: 'renew',
      ask: 'Quando scade?',
      todo: 'Prenota un appuntamento in Questura dal sito della Polizia di Stato. I tempi di attesa possono essere lunghi, per questo ti avviso con largo anticipo. Servono foto tessera, ricevuta del contributo e marca da bollo.',
      link: { label: 'Prenota il passaporto', url: 'https://passaportonline.poliziadistato.it/' },
      kw: [[/\bpassaport/, 5], [/\bpassport\b/, 5], [/p<ita/, 6]] },
    { id: 'cie', label: "Carta d'identità", emoji: '🪪', lead: 90, recur: null, dateKind: 'expiry', done: 'renew',
      ask: 'Quando scade?',
      todo: "Prenota il rinnovo in Comune: puoi farlo già da 6 mesi prima della scadenza. Porta una fototessera recente, la tessera sanitaria e la vecchia carta.",
      link: { label: 'Prenota la carta d\'identità', url: 'https://www.prenotazionicie.interno.gov.it/' },
      kw: [[/carta\s*d.?\s*identit/, 6], [/carta\s*di\s*identit/, 6], [/identity\s*card/, 5], [/\bcie\b/, 4], [/\bc[i1]?<ita/, 6], [/\bdocumento\s*d.?\s*identit/, 4], [/\bcarta\s*identit/, 5]] },
    { id: 'patente', label: 'Patente', emoji: '🚗', lead: 60, recur: null, dateKind: 'expiry', done: 'renew',
      ask: 'Quando scade?',
      todo: "Prenota la visita medica per il rinnovo: in autoscuola, in un'agenzia di pratiche auto o all'ASL. Dopo la visita la nuova patente arriva a casa per posta.",
      link: { label: 'Portale dell\'automobilista', url: 'https://www.ilportaledellautomobilista.it/' },
      kw: [[/\bpatent[ei]\b/, 6], [/driving\s*licen/, 5], [/permis\s*de\s*conduire/, 5], [/\b4b\b/, 1]] },
    { id: 'tessera', label: 'Tessera sanitaria', emoji: '💳', lead: 60, recur: null, dateKind: 'expiry', done: 'renew',
      ask: 'Quando scade?',
      todo: "Di solito la nuova tessera arriva a casa da sola. Se manca un mese alla scadenza e non è arrivata, richiedila all'Agenzia delle Entrate o alla tua ASL.",
      link: { label: 'Agenzia delle Entrate', url: 'https://www.agenziaentrate.gov.it/' },
      kw: [[/tes+e?ra\s*sa\s*nit/, 8], [/tessera\s*europea/, 9], [/assicurazione\s*malattia/, 9], [/\bteam\b/, 3], [/carta\s*(nazionale|regionale)\s*dei\s*servizi/, 6], [/\b(cns|crs)\b/, 3], [/servizio\s*sanitario/, 5], [/\bssn\b/, 3], [/sanitari[ao]/, 3], [/codice\s*fiscale/, 3], [/ministero\s*dell.?\s*economia/, 3], [/european\s*health|health\s*insurance\s*card/, 8], [/numero\s*di\s*identificazione\s*della\s*tessera/, 6]] },
    { id: 'revisione', label: 'Revisione auto', emoji: '🔧', lead: 30, recur: 24, dateKind: 'expiry', done: 'reschedule',
      ask: 'Entro quando va fatta?',
      todo: "Prenota in un centro revisioni: va fatta entro la fine del mese di scadenza. Dopo la prima, si rifà ogni 2 anni.",
      link: { label: 'Verifica l\'ultima revisione', url: 'https://www.ilportaledellautomobilista.it/' },
      kw: [[/\brevision[ei]\b/, 6]] },
    { id: 'bollo', label: 'Bollo auto', emoji: '🚙', lead: 15, recur: 12, dateKind: 'expiry', done: 'reschedule',
      ask: 'Quando scade?',
      todo: "Pagalo online con pagoPA (app IO o home banking), in tabaccheria o in una delegazione ACI. Si paga entro la fine del mese successivo alla scadenza.",
      link: { label: 'Paga il bollo', url: 'https://www.aci.it/' },
      kw: [[/\bbollo\b(?!\s*(da|virtuale))/, 5], [/tassa\s*automobilistic/, 6]] },
    { id: 'assicurazione', label: 'Assicurazione', emoji: '🛡️', lead: 30, recur: 12, dateKind: 'expiry', done: 'reschedule',
      ask: 'Quando scade?',
      todo: "Prima del rinnovo confronta qualche preventivo: spesso si risparmia. Per l'RC auto hai 15 giorni di tolleranza dopo la scadenza, ma non contarci.",
      link: null,
      kw: [[/assicura(?!zione\s*malattia)/, 5], [/\bpolizz/, 5], [/\brc\s*auto\b/, 6], [/\brca\b/, 4]] },
    { id: 'caldaia', label: 'Controllo caldaia', emoji: '🔥', lead: 30, recur: 12, dateKind: 'expiry', done: 'reschedule',
      ask: 'Entro quando va fatto?',
      todo: "Chiama il tecnico per il controllo e fatti aggiornare il libretto d'impianto.",
      link: null,
      kw: [[/caldaia/, 6], [/condizionator/, 4], [/climatizzator/, 4], [/\bfiltri\b/, 2]] },
    { id: 'viaggio', label: 'Viaggio', emoji: '✈️', lead: 1, leadMin: 180, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando parti?',
      todo: 'Controlla documenti, biglietti e orari. Se voli, fai il check-in online appena apre.',
      link: null,
      kw: [[/\bvol[oi]\b/, 5], [/\baereo\b|\baeroporto\b/, 5], [/\btren[oi]\b|\bstazione\b/, 4], [/\bpartenz|\bpart[oi]\b|\bparte\b/, 2], [/check.?in|\bimbarco\b/, 5], [/\bvaligi/, 4]] },
    { id: 'compleanno', label: 'Compleanno', emoji: '🎂', lead: 1, recur: 12, dateKind: 'expiry', done: 'reschedule',
      ask: 'Quando?',
      todo: "Fai gli auguri. Se vuoi fare un regalo, hai ancora un giorno.",
      link: null,
      kw: [[/compleann/, 7], [/anniversari/, 6], [/onomastic/, 6]] },
    { id: 'chiamata', label: 'Chiamata', emoji: '📞', lead: 0, leadMin: 5, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: '',
      link: null,
      kw: [[/\b(chiamar|telefonar|richiamar|videochiamat)/, 7], [/\bscrivere\s+a\b|\bmandare\s+un\s+messaggio|\bwhatsapp\b|\bsentire\b/, 4]] },
    { id: 'appuntamento', label: 'Appuntamento', emoji: '⏰', lead: 0, leadMin: 15, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: '',
      link: null,
      kw: [[/parrucchier|barbier|estetist|manicure|massagg/, 6], [/appuntament/, 4], [/riunion|\bmeeting\b|\bcall\b|colloquio/, 5], [/\bcena\b|\bpranzo\b|aperitiv|\bcolazione\s+con/, 4], [/\bincontr/, 3], [/\bandare\s+(da|dal|dalla|al|alla)\b/, 2]] },
    { id: 'salute', label: 'Visita', emoji: '🩺', lead: 1, leadMin: 60, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: "Prenota per tempo e segnati l'orario.",
      link: null,
      kw: [[/\bmedic[oa]\b/, 4], [/dentist/, 5], [/\bvisit[ae]\b/, 4], [/vaccin/, 5], [/\besami\b/, 3], [/\banalisi\b/, 3], [/oculist/, 5], [/\bigienista\b/, 5], [/\bcontroll[oi]\s*(dal|medic)/, 3]] },
    { id: 'abbonamento', label: 'Abbonamento', emoji: '🔁', lead: 7, recur: 12, dateKind: 'expiry', done: 'reschedule',
      ask: 'Quando si rinnova?',
      todo: "Se non lo usi più, disdicilo prima del rinnovo. Se lo usi, non devi fare niente.",
      link: null,
      kw: [[/abboname/, 5], [/rinnovo\s*automatic/, 5], [/netflix|spotify|disney|dazn|icloud|amazon\s*prime|youtube\s*premium/, 5], [/\bdisdett|\bdisdir/, 3]] },
    { id: 'bolletta', label: 'Pagamento', emoji: '💡', lead: 3, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Entro quando va pagato?',
      todo: "Pagalo o controlla che l'addebito automatico sia attivo.",
      link: null,
      kw: [[/bollett/, 6], [/\bluce\b|\bgas\b|\bacqua\b/, 2], [/\benel\b|\ba2a\b|\biren\b|\bhera\b|\bedison\b|\bsorgenia\b/, 3], [/\bpagar[ei]\b|\bpagament/, 2], [/\brata\b/, 3], [/\bf24\b|\btari\b|\bimu\b|\bcanone\b/, 4], [/scadenza\s*(di\s*)?pagament/, 4], [/importo\s*da\s*pagare/, 4]] },
    { id: 'garanzia', label: 'Garanzia', emoji: '🧾', lead: 30, recur: null, dateKind: 'purchase', done: 'archive',
      ask: "Quando l'hai comprato?",
      todo: "Se qualcosa non funziona, portalo al negozio con lo scontrino prima che scada la garanzia: hai diritto a riparazione o sostituzione.",
      link: null,
      kw: [[/garanzi/, 6], [/scontrin/, 5], [/documento\s*commerciale/, 6], [/\btotale\b/, 1], [/\biva\b/, 1], [/pagamento\s*elettronico|contanti|\bresto\b/, 1], [/\bcomprat[oaie]\b|\bacquistat[oaie]\b|\bpres[oaie]\s+(oggi|ieri)/, 3]] },
    { id: 'commissione', label: 'Commissione', emoji: '🛍️', lead: 0, leadMin: 30, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: '',
      link: null,
      kw: [[/\b(comprare|compra|compro|prendere|prendi|prendo|ritirare|ritira|ritiro|recuperare|acquistare|procurare|portare|porta|porto)\b/, 3], [/\bspesa\b|supermercat|farmacia|lavanderia|\bpacco\b|\bvino\b|\bfiori\b|\bregalo\b|\btorta\b/, 2]] },
    { id: 'altro', label: 'Altro', emoji: '📌', lead: 0, leadMin: 10, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: '',
      link: null,
      kw: [] }
  ];
  const TYPE_BY_ID = Object.fromEntries(TYPES.map(t => [t.id, t]));

  // ---------- Utilità sulle date (sempre stringhe 'YYYY-MM-DD', ora locale) ----------
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function todayISO(now) { const d = now || new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function toISO(dt) { return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
  function valid(y, m, d) {
    if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getMonth() === m - 1 && dt.getDate() === d;
  }
  function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
  function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
  function addMonths(s, n) {
    const [y, m, d] = s.split('-').map(Number);
    const tot = (y * 12 + (m - 1)) + n; const ny = Math.floor(tot / 12), nm = tot % 12 + 1;
    return iso(ny, nm, Math.min(d, lastDay(ny, nm)));
  }
  function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); } // b - a
  function fullYear(y) { y = Number(y); if (y < 100) y += 2000; return y; }

  const MONTHS = {
    gen: 1, genn: 1, gennaio: 1, jan: 1, january: 1, janvier: 1,
    feb: 2, febb: 2, febbraio: 2, february: 2, fev: 2,
    mar: 3, marzo: 3, march: 3, mars: 3,
    apr: 4, aprile: 4, april: 4, avr: 4,
    mag: 5, maggio: 5, may: 5, mai: 5,
    giu: 6, giugno: 6, jun: 6, june: 6, juin: 6,
    lug: 7, luglio: 7, jul: 7, july: 7, juil: 7,
    ago: 8, agosto: 8, aug: 8, august: 8, aou: 8,
    set: 9, sett: 9, settembre: 9, sep: 9, sept: 9, september: 9,
    ott: 10, ottobre: 10, oct: 10, october: 10,
    nov: 11, novembre: 11, november: 11,
    dic: 12, dicembre: 12, dec: 12, december: 12
  };
  const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

  function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function norm(s) { return stripAccents(String(s || '')).toLowerCase().replace(/[’`´]/g, "'"); }

  // ---------- Titoli puliti per le cose che scadono ----------
  const DOC_TITLE = { cie: "Scadenza carta d'identità", passaporto: 'Scadenza passaporto', patente: 'Scadenza patente', tessera: 'Scadenza tessera sanitaria',
    bollo: 'Scadenza bollo auto', assicurazione: 'Scadenza assicurazione', revisione: 'Revisione auto' };
  const DOC_WORD = { cie: /carta\s*d.?\s*identit\S*|carta\s*di\s*identit\S*|\bcie\b/, passaporto: /passaport\S*/, patente: /patent\S*/, tessera: /tessera\s*sanitaria/,
    bollo: /bollo(\s+(dell[a']?\s*)?(auto|macchina|moto))?/, assicurazione: /assicurazion\S*(\s+(dell[a']?\s*)?(auto|macchina|moto|casa))?/, revisione: /revision\S*(\s+(dell[a']?\s*)?(auto|macchina|moto))?/ };
  function docTitle(typeId, said) {
    if (!DOC_TITLE[typeId]) return null;
    const t = norm(said), m = DOC_WORD[typeId].exec(t);
    let extra = '';
    if (m) { const after = said.slice(m.index + m[0].length).match(/^\s+(di|del|della|dello|dei|delle)\s+([A-ZÀ-Ý][\wà-ÿ']+|mi[ao]\s+\w+|tu[ao]\s+\w+)/i); if (after) extra = ` ${after[1].toLowerCase()} ${after[2]}`; }
    return DOC_TITLE[typeId] + extra;
  }

  // ---------- Riconoscimento del tipo ----------
  // Codice fiscale (RSSMRA85B01F205X), tollerando gli errori tipici dell'OCR: è il segno più sicuro della tessera
  // sanitaria, anche quando l'intestazione sulla foto non si legge. La carta d'identità lo ha solo sul retro, con la MRZ.
  const CF_RE = /[A-Z0]{6}[0-9OILSZB]{2}[ABCDEHLMPRST][0-9OILSZB]{2}[A-Z][0-9OILSZB]{3}[A-Z0-9]/;
  function hasCodiceFiscale(text) {
    if (/<<|[ci1]<ita/i.test(text)) return false;
    return String(text || '').toUpperCase().split(/\n/).some(line => {
      const l = line.replace(/[^A-Z0-9]/g, ''); const m = CF_RE.exec(l);
      if (!m) return false; const c = m[0], digits = (c[6] + c[7] + c[9] + c[10] + c[12] + c[13] + c[14]).match(/[0-9]/g) || [];
      return (c.slice(0, 6).match(/[A-Z]/g) || []).length >= 5 && digits.length >= 5;
    });
  }
  function detectType(text, fromPhoto) {
    const t = norm(text), cf = fromPhoto && hasCodiceFiscale(text);
    let best = null, bestScore = 0;
    for (const ty of TYPES) {
      let s = ty.id === 'tessera' && cf ? 7 : 0;
      for (const [re, w] of ty.kw) if (re.test(t)) s += w;
      if (s > bestScore) { best = ty; bestScore = s; }
    }
    return { type: best ? best.id : 'altro', score: bestScore };
  }

  // ---------- Date nel testo di una foto (OCR) ----------
  // Corregge errori tipici dell'OCR dentro gruppi che sembrano date: O→0, I/l/|→1, S→5, B→8.
  // l'OCR a volte perde una barra: "3112/2029", "31/122029", "31122029" → 31/12/2029 (solo se è una data vera)
  const okDM = (d, m) => +d >= 1 && +d <= 31 && +m >= 1 && +m <= 12;
  function fixLostSlash(text) {
    return String(text || "")
      .replace(/\b(\d{2})(\d{2})[\/.\-](20\d{2})\b/g, (x, d, m, y) => okDM(d, m) ? `${d}/${m}/${y}` : x)
      .replace(/\b(\d{2})[\/.\-](\d{2})(20\d{2})\b/g, (x, d, m, y) => okDM(d, m) ? `${d}/${m}/${y}` : x)
      .replace(/\b(\d{2})(\d{2})(20\d{2})\b/g, (x, d, m, y) => okDM(d, m) ? `${d}/${m}/${y}` : x);
  }
  function fixOcrDigits(text) {
    return fixLostSlash(text).replace(/[0-9OoIl|SB]{1,2}\s?[\/.\-]\s?[0-9OoIl|SB]{1,2}\s?[\/.\-]\s?[0-9OoIl|SB]{2,4}/g, m =>
      m.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8'));
  }

  function findDates(text) {
    const out = [];
    const t = fixOcrDigits(text);
    const low = norm(t);
    let m;
    const reNum = /(?<!\d)(\d{1,2})\s?[\/.\-]\s?(\d{1,2})\s?[\/.\-]\s?(\d{4}|\d{2})(?!\d)/g;
    while ((m = reNum.exec(t))) {
      const d = +m[1], mo = +m[2], y = fullYear(m[3]);
      if (valid(y, mo, d)) out.push({ date: iso(y, mo, d), index: m.index, len: m[0].length });
    }
    const reIso = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
    while ((m = reIso.exec(t))) {
      const y = +m[1], mo = +m[2], d = +m[3];
      if (valid(y, mo, d)) out.push({ date: iso(y, mo, d), index: m.index, len: m[0].length });
    }
    const reTxt = new RegExp(`(?<!\\d)(\\d{1,2})\\s*(?:°|º)?\\s*(?:/\\s*)?(${MONTH_RE})\\.?(?:\\s*/\\s*[a-z]{3,5}\\.?)?\\s*(?:/\\s*)?(\\d{4}|\\d{2})(?!\\d)`, 'g');
    while ((m = reTxt.exec(low))) {
      const d = +m[1], mo = MONTHS[m[2]], y = fullYear(m[3]);
      if (valid(y, mo, d)) out.push({ date: iso(y, mo, d), index: m.index, len: m[0].length });
    }
    return out;
  }

  // Zona leggibile dalla macchina (MRZ) di passaporti e carte d'identità: ...AAMMGG<cifra><sesso>AAMMGG...
  function findMrzExpiry(text) {
    const lines = text.toUpperCase().split(/\n/).map(l => l.replace(/\s/g, ''));
    for (const l of lines) {
      if ((l.match(/</g) || []).length < 3) continue;
      const fixed = l.replace(/O/g, '0');
      const m = fixed.match(/(\d{6})\d?[MF<](\d{6})/);
      if (m) {
        const e = m[2]; const y = 2000 + +e.slice(0, 2), mo = +e.slice(2, 4), d = +e.slice(4, 6);
        if (valid(y, mo, d)) return iso(y, mo, d);
      }
    }
    return null;
  }

  const EXPIRY_LABEL = /(scad|expir|valid|fino\s*al|until|4b|date\s*of\s*expiry|data\s*di\s*scadenza|entro\s*il|pagare\s*entro|rinnov)/;
  const ISSUE_LABEL = /(emission|rilasci|issue|nascita|birth|nato|nata|4a\b|\b3\.|data\s*di\s*nascita)/;

  // l'etichetta che conta è la più vicina alla data: sulla stessa riga, oppure sulla riga sopra se la data apre la riga
  function labelBefore(text, idx) {
    const lineStart = text.lastIndexOf('\n', idx - 1) + 1;
    let seg = norm(text.slice(lineStart, idx));
    if (!/[a-z]{3}/.test(seg)) { const prev = text.lastIndexOf('\n', lineStart - 2) + 1; seg = norm(text.slice(prev, lineStart)); }
    const lastPos = re => { const g = new RegExp(re.source, 'g'); let m, p = -1; while ((m = g.exec(seg))) { p = m.index; if (!m[0].length) g.lastIndex++; } return p; };
    const e = lastPos(EXPIRY_LABEL), i = lastPos(ISSUE_LABEL);
    return { expiry: e >= 0 && e > i, issue: i >= 0 && i > e };
  }

  function columnLabels(text, dates) {
    const map = new Map(), lines = text.split('\n'); let pos = 0; const starts = lines.map(l => { const p = pos; pos += l.length + 1; return p; });
    for (let i = 0; i < lines.length; i++) {
      const n = norm(lines[i]), found = [];
      for (const [kind, re] of [['expiry', EXPIRY_LABEL], ['issue', ISSUE_LABEL]]) { const g = new RegExp(re.source, 'g'); let m; while ((m = g.exec(n))) { found.push([m.index, kind]); if (!m[0].length) g.lastIndex++; } }
      if (found.length < 2 || !found.some(f => f[1] === 'expiry') || !found.some(f => f[1] === 'issue')) continue;
      found.sort((x, y) => x[0] - y[0]);
      const end = starts[i + 1] ?? text.length;
      let blockEnd = end;
      for (let j = i + 1; j < lines.length && j <= i + 3; j++) { if (/[a-z]{3}/i.test(lines[j].replace(/\d/g, ''))) break; blockEnd = starts[j] + lines[j].length; }
      const under = dates.filter(d => d.index >= end && d.index < blockEnd).sort((x, y) => x.index - y.index);
      under.forEach((d, k) => { if (found[k]) map.set(d.index, found[k][1]); });
    }
    return map;
  }
  function guessStore(text) {
    const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4);
    for (const l of lines) {
      const letters = (l.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (l.length >= 3 && l.length <= 26 && letters / l.length > 0.75 && !/scontrino|documento|commerciale|fattura|ricevuta/i.test(l)) {
        return l.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/\s+/g, ' ');
      }
    }
    return null;
  }

  /** Analizza il testo letto da una foto. */
  const ID_DOCS = new Set(['cie', 'passaporto', 'patente', 'tessera']);
  function parseOcr(text, now) {
    const today = todayISO(now);
    const { type, score } = detectType(text, true);
    const T = TYPE_BY_ID[type];
    const dates = findDates(text);
    const mrz = findMrzExpiry(text);
    let date = null, purchase = null, confident = false;

    if (T.dateKind === 'purchase') {
      // Scontrino: la data è l'acquisto. Prendo la più recente non nel futuro.
      const past = dates.map(d => d.date).filter(d => d <= addDays(today, 1)).sort();
      purchase = past.length ? past[past.length - 1] : null;
      if (purchase) { date = addMonths(purchase, 24); confident = true; }
    } else if (ID_DOCS.has(type)) {
      // documenti d'identità: nascita < emissione < scadenza, quindi la scadenza è sempre la data più lontana.
      // Le etichette qui ingannano (sulla CIE "emissione" e "scadenza" stanno sulla stessa riga, con le date sotto).
      // una data già passata qui è la nascita o l'emissione, non la scadenza: meglio chiederla che sbagliarla
      const all = dates.map(d => d.date).filter(d => d >= today);
      if (mrz) all.push(mrz);
      if (all.length) {
        date = all.sort().pop();
        // la riga in fondo alle carte (MRZ) è la fonte più affidabile, se non è più vicina della data stampata
        if (mrz && mrz >= today) date = mrz > date ? mrz : (date === mrz ? mrz : date);
        confident = date > today || all.length === 1;
      }
    } else {
      // intestazioni in colonna ("Data emissione   Scadenza") con le date sotto: si abbinano nell'ordine
      const cols = columnLabels(text, dates);
      const labelled = dates.filter(d => { if (cols.has(d.index)) return cols.get(d.index) === 'expiry'; const l = labelBefore(text, d.index); return l.expiry && !l.issue; });
      if (labelled.length) { date = labelled.map(d => d.date).sort().pop(); confident = true; }
      else if (mrz) { date = mrz; confident = true; }
      else if (dates.length) {
        const sorted = dates.map(d => d.date).sort();
        date = sorted[sorted.length - 1]; // la scadenza è quasi sempre la data più lontana
        confident = dates.length === 1 || date > today;
      }
    }

    let title = DOC_TITLE[type] || (type === 'altro' ? '' : T.label);
    if (type === 'garanzia') { const s = guessStore(text); title = s ? `Garanzia ${s}` : 'Garanzia acquisto'; }
    if (type === 'bolletta') { // "Bolletta luce Enel", "Bolletta gas", "Rata", "TARI"
      const n = norm(text), what = /\bluce\b|energia\s+elettrica/.test(n) ? 'luce' : /\bgas\b/.test(n) ? 'gas' : /\bacqua\b|idric/.test(n) ? 'acqua' : /telefon|internet|fibra|mobile/.test(n) ? 'telefono' : '';
      const who = (n.match(/\b(enel|a2a|iren|hera|edison|sorgenia|eni\s*plenitude|acea|tim|vodafone|windtre|fastweb|iliad|illumia|engie)\b/) || [])[1];
      if (/\btari\b/.test(n)) title = 'Pagare la TARI'; else if (/\bimu\b/.test(n)) title = "Pagare l'IMU"; else if (/\bf24\b/.test(n)) title = 'Pagare F24';
      else if (/bollett/.test(n) || what) title = 'Bolletta' + (what ? ' ' + what : '') + (who ? ' ' + who.replace(/\s+/g, ' ').replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/^(A2a|Tim)$/, m => m.toUpperCase()) : '');
    }
    return { type, title, date, purchase, confident: confident && score > 0, typeScore: score };
  }

  // ---------- Frasi dette a voce ----------
  const NUM_WORDS = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
    undici: 11, dodici: 12, quindici: 15, venti: 20, venticinque: 25, trenta: 30, quaranta: 40, quarantacinque: 45, cinquanta: 50, sessanta: 60, novanta: 90 };
  const HOUR_WORDS = { una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
    tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19, venti: 20, ventuno: 21, ventidue: 22, ventitre: 23 };
  const WEEKDAYS = { domenica: 0, lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6 };
  const NUMW = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|');
  const HOURW = Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join('|');
  const hhmm = (h, m) => `${pad(h)}:${pad(m)}`;

  function nextOccurrence(today, mo, d) {
    const y = +today.slice(0, 4);
    let cand = iso(y, mo, Math.min(d, lastDay(y, mo)));
    if (cand < today) cand = iso(y + 1, mo, Math.min(d, lastDay(y + 1, mo)));
    return cand;
  }

  // Orari: "alle 18", "alle 9 e mezza", "all'una", "a mezzogiorno", "tra mezz'ora", "tra 2 ore"
  function findTime(t, nowD) {
    const n = v => /^\d+$/.test(v) ? +v : NUM_WORDS[v.replace(/'$/, '')];
    let m;
    const rel = [
      [new RegExp(`\\b(?:tra|fra)\\s+(\\d+|${NUMW})\\s+minut[oi]\\b`), mm => n(mm[1])],
      [new RegExp(`\\b(?:tra|fra)\\s+(\\d+|un'?|una|${NUMW})\\s*'?\\s*or[ae]\\b`), mm => 60 * (n(mm[1]) || 1)],
      [/\b(?:tra|fra)\s+mezz'?\s*ora\b/, () => 30],
      [/\b(?:tra|fra)\s+un\s+quarto\s+d'?\s*ora\b/, () => 15],
      [/\b(?:tra|fra)\s+un'?\s*ora\s+e\s+mezz[ao]\b/, () => 90]
    ];
    for (const [re, f] of rel.slice().reverse()) {
      if ((m = re.exec(t))) {
        const mins = f(m); if (!mins) continue;
        const d = new Date(nowD.getTime() + mins * 60000);
        return { date: toISO(d), time: hhmm(d.getHours(), d.getMinutes()), span: [m.index, m.index + m[0].length], relative: true };
      }
    }
    if ((m = /\b(?:a|verso|per|entro)\s+mezzogiorno\b/.exec(t))) return { h: 12, min: 0, fixed: true, span: [m.index, m.index + m[0].length] };
    if ((m = /\b(?:a|verso|per|entro)\s+mezzanotte\b/.exec(t))) return { h: 23, min: 59, fixed: true, span: [m.index, m.index + m[0].length] };
    const abs = new RegExp(`(?:\\b(?:alle|verso\\s+le|per\\s+le|entro\\s+le|dalle|ore|h)\\s*|\\ball'\\s*)(\\d{1,2}|${HOURW})(?:\\s*(?:[:.]|e)\\s*(\\d{2}|mezza|mezzo|un\\s+quarto|tre\\s+quarti|\\d{1,2})(?!\\s*(?:giorn|settiman|mes|ann|minut|or[ae])))?(?:\\s+(di\\s+sera|di\\s+mattina|del\\s+mattino|del\\s+pomeriggio|di\\s+pomeriggio|di\\s+notte))?\\b`);
    if ((m = abs.exec(t))) {
      const h = /^\d+$/.test(m[1]) ? +m[1] : HOUR_WORDS[m[1]];
      let min = 0, hasMin = false;
      if (m[2]) { hasMin = true; min = /^\d+$/.test(m[2]) ? +m[2] : /mezz/.test(m[2]) ? 30 : /tre\s+quarti/.test(m[2]) ? 45 : 15; }
      if (h > 23 || min > 59) return null;
      return { h, min, hasMin, qual: m[3] || '', zero: /^0\d$/.test(m[1]) || h >= 13, span: [m.index, m.index + m[0].length] };
    }
    return null;
  }

  /** Analizza una frase tipo "ricordami che il bollo scade a fine novembre" o "oggi alle 18 parrucchiere". */
  function parseOne(raw, now, opt) {
    opt = opt || {};
    const nowD = now || new Date();
    const today = todayISO(nowD);
    const src = String(raw || '').trim();
    const t = norm(src);
    const spans = []; // [start,end] da togliere per costruire il titolo
    let date = null, time = null, part = null;

    // l'orario si cerca per primo, così "alle 9.12" non diventa il 9 dicembre
    const tm = findTime(t, nowD);
    let tD = t;
    if (tm) { spans.push(tm.span); tD = t.slice(0, tm.span[0]) + ' '.repeat(tm.span[1] - tm.span[0]) + t.slice(tm.span[1]); }

    // "il giorno prima del 22 novembre", "una settimana prima", "la sera prima": quanto prima avvisare
    let leadDays = null, eveBefore = false;
    { // "il giorno prima", "due giorni prima", "la sera prima", "il giorno precedente", "la vigilia", "con un giorno di anticipo", "24 ore prima"
      const Q = `(?:(\\d+|${NUMW}|un\\s+paio\\s+di|qualche)\\s+)?`, U = `(giorn[oi]|sera|mattina|settiman[ae]|mes[ei]|or[ae])`;
      const forms = [
        new RegExp(`\\b(?:per\\s+|con\\s+(?:un\\s+)?(?:avviso|anticipo)\\s+(?:di\\s+)?)?(?:(?:il|la|un|una|lo)\\s+)?${Q}${U}\\s+(?:prima|precedente|avanti|innanzi)(?:\\s+(?:del|della|dello|dell'|dei|di|che))?\\b`),
        new RegExp(`\\b(?:con\\s+)?(?:(?:il|la|un|una)\\s+)?${Q}${U}\\s+(?:di|d')\\s*(?:anticipo|preavviso)\\b`),
        /\b(?:la\s+)?vigilia\b/
      ];
      for (const re of forms) {
        const lm = re.exec(tD); if (!lm) continue;
        if (/vigilia/.test(lm[0])) { leadDays = 1; eveBefore = false; }
        else {
          const q = lm[1] || '', u = lm[2];
          if (/^or/.test(u)) { const h = /^\d+$/.test(q) ? +q : NUM_WORDS[q] || 1; if (h < 24) continue; leadDays = Math.round(h / 24); } // "24 ore prima" = il giorno prima
          else {
            const k = !q ? 1 : /paio/.test(q) ? 2 : q === 'qualche' ? 3 : /^\d+$/.test(q) ? +q : NUM_WORDS[q] || 1;
            leadDays = /^giorn/.test(u) ? k : /^settiman/.test(u) ? 7 * k : /^mes/.test(u) ? 30 * k : 1;
            eveBefore = u === 'sera';
          }
        }
        spans.push([lm.index, lm.index + lm[0].length]); tD = tD.slice(0, lm.index) + ' '.repeat(lm[0].length) + tD.slice(lm.index + lm[0].length);
        break;
      } }
    const take = (re, fn) => {
      if (date) return;
      re.lastIndex = 0;
      const mm = re.exec(tD);
      if (mm) { const r = fn(mm); if (r) { date = r; spans.push([mm.index, mm.index + mm[0].length]); } }
    };

    // 1) data completa numerica: 12/03/2027, 12-3-27
    take(/(?:\b(?:il|al|del|entro\s+il|per\s+il)\s+)?(?<!\d)(\d{1,2})\s?[\/\-]\s?(\d{1,2})(?:\s?[\/.\-]\s?(\d{4}|\d{2}))?(?!\d)|(?:\b(?:il|al|del|entro\s+il|per\s+il)\s+)?(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/, mm => {
      const d = +(mm[1] || mm[4]), mo = +(mm[2] || mm[5]), yy = mm[3] || mm[6];
      if (yy) { const y = fullYear(yy); return valid(y, mo, d) ? iso(y, mo, d) : null; }
      return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? nextOccurrence(today, mo, d) : null;
    });
    // 2) "12 marzo 2027", "il primo marzo", "3 di giugno"
    take(new RegExp(`(?:\\b(?:il|al|del|entro\\s+il|per\\s+il|dal)\\s+)?\\b(\\d{1,2}|primo|1o)\\s*(?:°|º)?\\s*(?:di\\s+)?(${MONTH_RE})\\b\\.?(?:\\s+(?:del\\s+)?(\\d{4}|\\d{2})\\b)?`), mm => {
      const d = /^\d+$/.test(mm[1]) ? +mm[1] : 1, mo = MONTHS[mm[2]];
      if (mm[3]) { const y = fullYear(mm[3]); return valid(y, mo, d) ? iso(y, mo, d) : null; }
      return nextOccurrence(today, mo, d);
    });
    // 3) solo mese: "a fine novembre", "entro giugno", "novembre 2027" → ultimo giorno del mese
    take(new RegExp(`(?:\\b(?:a|ad|di|entro|per|verso|nel\\s+mese\\s+di|il\\s+mese\\s+di)\\s+)?(?:\\b(?:fine|inizio|meta)\\s+(?:di\\s+)?)?\\b(${MONTH_RE})\\b(?:\\s+(?:del\\s+)?(\\d{4}|\\d{2})\\b)?`), mm => {
      const mo = MONTHS[mm[1]];
      const whole = mm[0];
      if (mm[1].length <= 4 && !/\b(a|ad|di|entro|per|verso|fine|inizio|meta|mese)\b/.test(whole) && !mm[2]) return null;
      const dayOf = y => /\binizio\b/.test(whole) ? 1 : /\bmeta\b/.test(whole) ? 15 : lastDay(y, mo);
      let y = mm[2] ? fullYear(mm[2]) : +today.slice(0, 4);
      let cand = iso(y, mo, dayOf(y));
      if (!mm[2] && cand < today) { y += 1; cand = iso(y, mo, dayOf(y)); }
      return cand;
    });
    // 4) relative con il momento della giornata: domattina, domani sera, oggi pomeriggio, stasera
    take(/\b(?:per\s+|entro\s+)?(?:(dopodomani|domani|oggi)\s+(?:in\s+)?(?:(?:la|di|alla|nel)\s+)?(mattina|mattinata|mattino|pomeriggio|sera|serata|notte)|(domattina|stamattina|stamani|stasera|stanotte))\b/, mm => {
      const w = mm[1] || mm[3];
      part = mm[2] ? (/^matt/.test(mm[2]) ? 'mattina' : /^pom/.test(mm[2]) ? 'pomeriggio' : /^ser/.test(mm[2]) ? 'sera' : 'notte')
        : /domattina|stamattina|stamani/.test(w) ? 'mattina' : w === 'stasera' ? 'sera' : 'notte';
      return addDays(today, w === 'dopodomani' ? 2 : /^(domani|domattina)$/.test(w) ? 1 : 0);
    });
    // 4b) relative: oggi, domani, dopodomani, fine mese, fine anno
    take(/\b(?:per\s+|entro\s+)?(dopodomani|domani|oggi|stasera|stamattina|stamani|stanotte|altro\s*ieri|ieri)\b/, mm => addDays(today, mm[1] === 'dopodomani' ? 2 : mm[1] === 'domani' ? 1 : mm[1] === 'ieri' ? -1 : /altro/.test(mm[1]) ? -2 : 0));
    take(/\b(?:a\s+|entro\s+(?:la\s+)?)?fine\s+(mese|anno)\b/, mm => {
      const y = +today.slice(0, 4), mo = +today.slice(5, 7);
      return mm[1] === 'mese' ? iso(y, mo, lastDay(y, mo)) : iso(y, 12, 31);
    });
    // 5) "tra 3 mesi", "fra una settimana", "tra due anni"
    take(new RegExp(`\\b(?:tra|fra|entro)\\s+(\\d+|${NUMW})\\s+(giorn[oi]|settiman[ae]|mes[ei]|ann[oi])\\b`), mm => {
      const k = /^\d+$/.test(mm[1]) ? +mm[1] : NUM_WORDS[mm[1]];
      if (/^giorn/.test(mm[2])) return addDays(today, k);
      if (/^settiman/.test(mm[2])) return addDays(today, k * 7);
      if (/^mes/.test(mm[2])) return addMonths(today, k);
      return addMonths(today, k * 12);
    });
    take(/\b(?:tra|fra|entro)\s+(?:un|una)?\s*(settimana|mese|anno)\b/, mm =>
      mm[1] === 'settimana' ? addDays(today, 7) : mm[1] === 'mese' ? addMonths(today, 1) : addMonths(today, 12));
    // 6) giorno della settimana: "lunedì", "venerdì prossimo"
    take(/\b(?:(?:per|entro)\s+)?(?:il\s+|la\s+)?(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)(?:\s+prossim[oa])?\b/, mm => {
      const target = WEEKDAYS[mm[1]]; const cur = parseISO(today).getDay();
      let delta = (target - cur + 7) % 7; if (delta === 0) delta = 7;
      return addDays(today, delta);
    });
    // 7) solo giorno: "il 5", "il 20 del mese"
    take(/\b(?:il|entro\s+il|per\s+il)\s+(\d{1,2})\b(?:\s+del\s+mese)?(?!\s*(?:giorn|settiman|mes|ann|euro|€))/, mm => {
      const d = +mm[1]; if (d < 1 || d > 31) return null;
      const y = +today.slice(0, 4), mo = +today.slice(5, 7);
      let cand = iso(y, mo, Math.min(d, lastDay(y, mo)));
      if (cand < today) { const nx = addMonths(iso(y, mo, 1), 1); const ny = +nx.slice(0, 4), nm = +nx.slice(5, 7); cand = iso(ny, nm, Math.min(d, lastDay(ny, nm))); }
      return cand;
    });

    const { type, score } = detectType(src);

    // orario
    if (tm) {
      if (tm.relative) { date = tm.date; time = tm.time; }
      else {
        let h = tm.h;
        const pm = /sera|pomeriggio/.test(tm.qual) || part === 'sera' || part === 'pomeriggio' || /\b(stasera|sera|pomeriggio|stanotte)\b/.test(t);
        const am = /mattin/.test(tm.qual) || /\b(stamattina|stamani|mattina|mattino)\b/.test(t);
        if (!tm.fixed && !(tm.zero && tm.hasMin)) { // "alle 07:00" è già chiaro: niente da indovinare
          if (pm && h < 12) h += 12;
          else if (!am && h >= 1 && h <= 7 && !(tm.hasMin && type === 'viaggio')) h += 12;
        }
        time = hhmm(h === 24 ? 12 : h, tm.min);
        if (!date && !opt.noDefault) {
          // nessun giorno detto: oggi se l'ora non è ancora passata, altrimenti domani
          const cand = new Date(nowD); cand.setHours(h, tm.min, 0, 0);
          date = cand > nowD ? today : addDays(today, 1);
        }
      }
    }

    let purchase = null;
    const boughtWords = /\b(comprat[oaie]|acquistat[oaie]|pres[oaie]|preso)\b/.test(t);
    if (type === 'garanzia' || (boughtWords && type === 'altro')) {
      const pd = date && date <= today ? date : (date ? null : today);
      if (pd || boughtWords) {
        purchase = pd || today;
        date = addMonths(purchase, 24); time = null;
        return finish('garanzia');
      }
    }
    return finish(type);

    function finish(typeId) {
      let s = src;
      const sorted = spans.slice().sort((a, b) => b[0] - a[0]);
      for (const [a, b] of sorted) s = s.slice(0, a) + ' ' + s.slice(b);
      const fillers = [
        /^\s*(ehi|ok|ciao)?\s*,?\s*memo\s*,?\s*/i,
        /^\s*(per\s+favore\s+)?(ricordami|ricordarmi|ricorda|ricordati|segnami|segna|segnati|aggiungi|metti|memorizza|promemoria|nota|devo|dovrei|bisogna|ho)\b\s*(di|che|per|:)?\s*/i,
        /^\s*(che|di|per|il|lo|la|i|gli|le|l'|un|uno|una|mio|mia|miei|mie|mi|ti|ci|sera|mattina|pomeriggio|notte)\s+/i,
        /^\s*(ho|abbiamo|l'ho|l'abbiamo)\s+(comprat[oaie]|acquistat[oaie]|pres[oaie]|preso)\s+/i,
        /\s+(che\s+)?(scade|scadono|scadra|scadrà|va\s+fatt[oa]|va\s+pagat[oa]|da\s+pagare|da\s+rinnovare|si\s+rinnova|e|ed|il|lo|la|l'|al|alla|entro|per|di|del|della|a|ad|che|comprat[oaie]|acquistat[oaie]|l'ho\s+comprat[oaie]|l'ho\s+pres[oaie]|ho\s+comprato|pres[oaie]|sera|mattina|pomeriggio|parte|parto|domattina|stasera)\s*$/i
      ];
      for (let i = 0; i < 6; i++) { for (const f of fillers) s = s.replace(f, ' ').trim(); }
      s = s.replace(/\s{2,}/g, ' ').replace(/[\s,.;:!]+$/, '').trim();
      const T2 = TYPE_BY_ID[typeId];
      if (typeId !== 'garanzia') s = summarize(s, opt.ctx != null ? opt.ctx : src);
      const dt = docTitle(typeId, src); if (dt) s = dt;
      if (typeId === 'garanzia' && s && !/garanzi/i.test(s)) s = 'Garanzia ' + s.replace(/^(?:(?:ho|abbiamo)\s+)?(?:comprat[oaie]|acquistat[oaie]|pres[oaie])\s+/i, '').replace(/^(?:(?:il|lo|la|i|gli|le|un|uno|una)\s+|l'|un')/i, '');
      if (!s || s.length < 2) s = typeId === 'altro' ? 'MeMo' : T2.label;
      s = s.charAt(0).toUpperCase() + s.slice(1);
      if (s.length > 60) s = s.slice(0, 57).trim() + '…';
      const out = { type: typeId, title: s, date, time, purchase, confident: !!date, typeScore: score };
      if (part && date && !time && TYPE_BY_ID[typeId].dateKind !== 'purchase') out.askTime = { part };
      if (leadDays != null) {
        if (time && eveBefore) { const [hh, mm] = time.split(':').map(Number); out.leadMin = hh * 60 + mm + 24 * 60 - 19 * 60; }
        else out.leadMin = leadDays * 1440;
        out.leadEve = eveBefore;
      }
      return out;
    }
  }

  // ---------- Titolo breve: "andare a prendere il vino" (sapendo che vai da Mattia) → "Vino per Mattia" ----------
  const GET_RE = /^(?:(?:andare|passare|correre|fare\s+un\s+salto|uscire)\s+(?:a|ad)\s+)?(prendere|prendi|prendo|comprare|compra|compro|acquistare|recuperare|procurare|procurarmi|portare|porta|porto)\s+(.+)$/i;
  const MOVE_RE = /^(?:andare|passare|correre|fare\s+un\s+salto|uscire)\s+(?:a|ad)\s+(?=\S+(?:are|ere|ire)\b)/i;
  const ART_RE = /^(?:(?:il|lo|la|i|gli|le|un|uno|una|del|dello|della|dei|degli|delle|qualche|un\s+po'?\s+di|un\s+paio\s+di)\s+|(?:l'|un'|dell'))/i;
  const PEOPLE_RE = /^(?:(?:i|il|la|le|gli|lo|mio|mia|miei|mie|tuo|tua|nostro|nostra)\s+)*(?:bambin|figli|ragazz|bimb|mamma|madre|papa|papà|padre|nonn|zi[oaie]\b|moglie|marito|fidanzat|amic|compagn|cugin|fratell|sorell|suocer|cane|gatto|nipot|collega|capo)/i;
  const KIN_RE = /^(mamma|madre|papa|papà|padre|nonn[oaie]|zi[oaie]|moglie|marito|fidanzat[oaie]|sorell[ae]|fratell[oi]|suocer[oaie]|cugin[oaie]|amic[oaie]|nipot[ei]|capo|collega|colleghi|bambini|figli[oa]?)$/i;
  const NOT_NAME = new Set(('me te lui lei noi voi loro solo sola soli sole casa qui qua li la lo fare bere mangiare pagare parte tempo ora adesso subito sempre poco molto ' +
    'oggi domani dopodomani stasera stamattina lunedi martedi mercoledi giovedi venerdi sabato domenica calma favore sicurezza qualche qualcuno tutti tutto niente ' +
    'medico dentista parrucchiere parrucchiera barbiere meccanico dottore dottoressa avvocato commercialista notaio estetista veterinario tabaccaio benzinaio farmacista ' +
    'idraulico elettricista fornaio panettiere macellaio gommista ottico oculista psicologo fisioterapista sarto calzolaio lavoro scuola ufficio palestra mercato ' +
    'supermercato centro fuori dentro sopra sotto quando dove come cosa chi due tre quattro cinque sei sette otto nove dieci mezzogiorno mezzanotte').split(' '));
  const capw = w => w.charAt(0).toUpperCase() + w.slice(1);
  const INF = { prendere: 'Prendere', prendi: 'Prendere', prendo: 'Prendere', comprare: 'Comprare', compra: 'Comprare', compro: 'Comprare', acquistare: 'Comprare',
    recuperare: 'Recuperare', procurare: 'Procurare', portare: 'Portare', porta: 'Portare', porto: 'Portare' };
  const isName = w => { const n = norm(w); return n.length >= 3 && !NOT_NAME.has(n) && !/(?:are|ere|ire|ando|endo|mente)$/.test(n) && !/^\d/.test(n) && !MONTHS[n]; };
  // a chi è destinato: "per Mattia", "per la cena", "a Giulia" (con portare), o dal contesto "vado da Mattia", "cena da Luca", "festa di Anna"
  function forWhom(text, ownPer) {
    if (!text) return '';
    if (ownPer) { const m = /\bper\s+((?:(?:il|la|lo|l'|i|le|gli|mia|mio|tua|tuo)\s+)*[A-Za-zÀ-ÿ']+(?:\s+di\s+[A-Za-zÀ-ÿ']+)?)/i.exec(text); if (m && !/^(favore|sicurezza|tempo|piacere|caso|bene|ora|oggi|domani|stasera)$/i.test(m[1])) return 'per ' + fixName(m[1]); }
    const re = /\b(?:a\s+casa\s+(?:di|del|della|dello)|a\s+(?:cena|pranzo|colazione)\s+da|alla\s+festa\s+di|festa\s+di|compleanno\s+di|da)\s+((?:(?:la|il|lo|mia|mio|tua|tuo|nostra|nostro)\s+)*)([A-Za-zÀ-ÿ']+)/gi;
    let m;
    while ((m = re.exec(text))) {
      const pre = m[1].trim(), w = m[2];
      if (KIN_RE.test(norm(w))) return 'per ' + (pre ? pre.toLowerCase() + ' ' : '') + w.toLowerCase();
      if (!pre && isName(w)) return 'per ' + capw(w);
    }
    return '';
  }
  function fixName(x) { const ws = x.split(/\s+/); const last = ws[ws.length - 1]; if (!KIN_RE.test(norm(last)) && isName(last) && ws.length === 1) ws[ws.length - 1] = capw(last); return ws.join(' '); }
  const CUT_RE = /\s+(?:per|da|dal|dalla|dallo|dai|dalle|al|alla|allo|ai|alle|all'|agli|in|nel|nella|a|ad|prima|dopo|quando|perch[eé]|che|cos[iì]|poi|quindi|mentre|appena|domani|oggi|stasera)(?![\wÀ-ÿ']).*$|\s*[,;:.!?].*$/i;
  const BEFORE_RE = new RegExp(`\\s*\\b(?:un'?\\s*ora(?:\\s+e\\s+mezz[ao])?|mezz'?\\s*ora|un\\s+quarto\\s+d'?\\s*ora|(?:\\d+|${NUMW})\\s+(?:minut[oi]|or[ae]))\\s+prima\\b`, 'i');
  function summarize(s, ctx) {
    s = String(s || '').replace(BEFORE_RE, ' ').replace(/\s{2,}/g, ' ').replace(MOVE_RE, '').trim();
    const g = GET_RE.exec(s);
    if (g) {
      const verb = g[1].toLowerCase(), rest = g[2].trim();
      if (PEOPLE_RE.test(rest)) {
        // "prendere i bambini" resta com'è: non sono una cosa da comprare
        const inf = /^prend/.test(verb) ? 'Prendere' : /^port/.test(verb) ? 'Portare' : capw(verb);
        return inf + ' ' + rest.replace(CUT_RE, '').trim();
      }
      const full = rest.replace(CUT_RE, '').trim();
      const obj = full.replace(ART_RE, '').replace(/\s+e\s+(?:(?:il|lo|la|i|gli|le|un|uno|una|del|dello|della|dei|degli|delle)\s+|(?:l'|un'|dell'))/gi, ' e ').trim();
      if (!obj) return s;
      let who = forWhom(rest, true);
      if (!who && /^port/.test(verb)) { const a = /\s+a\s+([A-Za-zÀ-ÿ']+)/i.exec(rest); if (a && (isName(a[1]) || KIN_RE.test(norm(a[1])))) who = 'per ' + fixName(a[1]); }
      if (!who) who = forWhom(ctx, false);
      if (who) return capw(obj) + ' ' + who;           // "Vino per Mattia"
      return INF[verb.replace(/^procurarmi$/, 'procurare')] + ' ' + full; // "Comprare il pane"
    }
    // altri verbi: si tiene l'azione, senza i "perché..." e i "quindi..." in coda
    return s.replace(/\s+(?:perch[eé]|cos[iì]|quindi|che\s+poi|e\s+poi)(?![\wÀ-ÿ']).*$|\s*[,;.!?]\s.*$/i, '').trim();
  }

  // "…domani vado da Mattia alle 19, quindi ricordami di prendere il vino alle 18": il contesto prima, la cosa da fare dopo
  const TRIGGER_RE = /(?:^|[\s,.;:!?]+)(?:(?:e|quindi|allora|poi|percio|cosi|ma)\s+)?(?:per\s+favore\s+)?(?:ricordami|ricordarmi|ricordamelo|ricordati|ricorda|non\s+(?:farmi\s+)?dimenticare|non\s+dimenticarti|fammi\s+ricordare|segnami|segnati|avvisami|(?:(?:metti|mettimi|fammi|imposta|impostami|crea|creami|segna|segnami|aggiungi|programma|programmami)\s+)?(?:un|una)\s+(?:reminder|promemoria|memo|avviso|allarme|notifica))\s*(di|che|:)?\s*/;
  const DUTY_RE = /(?:[,.;:]\s*|\s+(?:quindi|allora|percio|cosi)\s+)(?:(?:e|quindi|allora|percio|cosi)\s+)?(?:devo|dovrei|dobbiamo|bisogna|mi\s+serve|ho\s+bisogno\s+di)\s+(?=\S+(?:are|ere|ire)\b)/;
  const LEAD_IN_RE = /^(?:\s*(?:ehi|ok|okay|ciao|senti|guarda|allora|dunque|niente|cioe|memo|per\s+favore|mi\s+raccomando)\b[\s,.!]*)*$/;
  function splitTask(src) {
    const t = norm(src);
    let m = TRIGGER_RE.exec(t), di = false;
    if (m) {
      di = m[1] === 'di' || (!m[1] && /^\s*(alle|all'|tra|fra|domani|oggi|stasera|il|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b[^]*?\bdi\s+\S+(?:are|ere|ire)\b/.test(t.slice(m.index + m[0].length)));
      if (/reminder|promemoria|memo|avviso|allarme|notifica/.test(m[0])) di = true; // "mettimi un avviso alle 8": l'avviso è proprio alle 8
      const ctx = src.slice(0, m.index); let task = src.slice(m.index + m[0].length);
      for (let k = 0; k < 3; k++) { // "ricordamelo o mettimi un reminder il giorno prima": una richiesta sola, detta in due modi
        const m2 = new RegExp('^\\s*(?:o|oppure|anzi|cioe)\\s+' + TRIGGER_RE.source.replace(/^\(\?:\^\|\[\\s,\.;:!\?\]\+\)/, '')).exec(norm(task));
        if (!m2) break; if (/reminder|promemoria|memo|avviso|allarme|notifica/.test(m2[0])) di = true; task = task.slice(m2[0].length);
      }
      if (!task.trim()) return { ctx: '', task: ctx, di };
      return { ctx: LEAD_IN_RE.test(norm(ctx)) ? '' : ctx.replace(/[\s,.;:!?]+$/, ''), task, di };
    }
    m = DUTY_RE.exec(t);
    if (m && m.index > 3) return { ctx: src.slice(0, m.index), task: src.slice(m.index + m[0].length), di: false, duty: true };
    return null;
  }
  // "un'ora prima", "mezz'ora prima", "20 minuti prima": anticipo rispetto all'orario del contesto
  function minutesBefore(t) {
    let m;
    if ((m = /\b(?:un'?\s*ora\s+e\s+mezz[ao])\s+prima\b/.exec(t))) return 90;
    if ((m = /\bmezz'?\s*ora\s+prima\b/.exec(t))) return 30;
    if ((m = /\bun\s+quarto\s+d'?\s*ora\s+prima\b/.exec(t))) return 15;
    if ((m = /\b(?:un'?|una)\s*ora\s+prima\b/.exec(t))) return 60;
    if ((m = new RegExp(`\\b(\\d+|${NUMW})\\s+(minut[oi]|or[ae])\\s+prima\\b`).exec(t))) { const k = /^\d+$/.test(m[1]) ? +m[1] : NUM_WORDS[m[1]]; return /^or/.test(m[2]) ? k * 60 : k; }
    return null;
  }
  const EVENT_TYPES = ['appuntamento', 'salute', 'viaggio', 'compleanno'];
  // "…perché poi stasera vedo Mattia alle 18": la spiegazione non decide quando avvisare
  const REASON_RE = /\s*[,;.]?\s*\b(?:perche|siccome|visto\s+che|dato\s+che|tanto\s+poi|che\s+poi|cosi\s+poi)\b/;
  function parseSpeech(raw, now) {
    const nowD = now || new Date(), today = todayISO(nowD);
    let src = String(raw || '').trim().replace(/\s+/g, ' ');
    let reason = '';
    const rm = REASON_RE.exec(norm(src));
    if (rm && rm.index > 3) { reason = src.slice(rm.index + rm[0].length); src = src.slice(0, rm.index); }
    const sp = splitTask(src);
    if (!sp) { const r = parseOne(src, nowD, { ctx: src + ' ' + reason }); if (!r.title || r.title === 'MeMo') r.needTitle = true; return r; }
    const a = parseOne(sp.task, nowD, { noDefault: true, ctx: sp.ctx + ' ' + reason });
    const c = sp.ctx ? parseOne(sp.ctx, nowD, { noDefault: true }) : null;
    if (a.type === 'garanzia') return a.date ? a : parseOne(src, nowD);
    let date = a.date, time = a.time, leadMin = null, askTime = a.askTime || null;
    if (time) {
      if (!date && c && c.date) date = c.date;
      if ((sp.di || sp.duty) && !EVENT_TYPES.includes(a.type)) leadMin = 0;
    } else if (c && c.time) {
      const onlyTime = !c.typeScore && (!c.title || c.title === 'MeMo'); // "tra un'ora ricordami di…": quello è proprio l'orario dell'avviso
      const pre = minutesBefore(norm(sp.task));
      if (onlyTime) { time = c.time; date = date || c.date; if (sp.di && !EVENT_TYPES.includes(a.type)) leadMin = 0; }
      else if (a.leadMin != null) {                                                       // "…alle 10 dentista, avvisami la sera prima"
        time = c.time; date = date || c.date;
        const [hh, mm] = time.split(':').map(Number);
        a.leadMin = a.leadEve ? hh * 60 + mm + 24 * 60 - 19 * 60 : a.leadMin;
      }
      else if (pre != null && !date) { time = c.time; date = c.date; leadMin = pre; }       // "…un'ora prima": rispetto all'impegno
      else { date = date || c.date; if (!askTime) askTime = { part: a.askTime ? a.askTime.part : null, ctxTime: c.time }; } // altrimenti chiedo io l'ora
    } else if (!date && c) { date = c.date; if (c.askTime && !askTime) askTime = c.askTime; }
    if (time && !date) {
      const [h, mi] = time.split(':').map(Number), cand = new Date(nowD); cand.setHours(h, mi, 0, 0);
      date = cand > nowD ? today : addDays(today, 1);
    }
    let type = a.typeScore ? a.type : 'altro', title = a.title;
    if ((!title || title === 'MeMo') && c) { title = c.title; if (!a.typeScore) type = c.type; }
    const out = { type, title, date, time, purchase: null, confident: !!date, typeScore: a.typeScore };
    if (a.leadMin != null) leadMin = a.leadMin; else if (leadMin == null && c && c.leadMin != null) leadMin = c.leadMin;
    if (leadMin != null && (time || leadMin % 1440 === 0)) out.leadMin = leadMin;
    if (!title || title === 'MeMo') out.needTitle = true;
    if (askTime && date && !time) out.askTime = askTime;
    return out;
  }

  // ---------- Dall'AI al MeMo ----------
  // L'AI dice cosa, quando e quanto prima avvisare (a parole); qui si calcolano date e orari con il nostro motore.
  function leadFrom(text, item, now) {
    if (!text) return null;
    const nowD = now || new Date(), t = norm(text);
    const r = parseOne(text, nowD, { noDefault: true });
    if (r.leadMin != null) {
      if (r.leadEve && item.time) { const [hh, mm] = item.time.split(':').map(Number); return hh * 60 + mm + 24 * 60 - 19 * 60; }
      return r.leadMin;
    }
    const mb = minutesBefore(t); if (mb != null && item.time) return mb;
    if (r.date) { // "domattina alle 8", "il 21 alle 18": un momento preciso
      const rem = parseISO(r.date); if (r.time) { const [hh, mm] = r.time.split(':').map(Number); rem.setHours(hh, mm, 0, 0); } else rem.setHours(9, 0, 0, 0);
      const diff = Math.round((dueAt(item) - rem) / 60000);
      if (diff >= 0) return item.time ? diff : Math.max(0, Math.round(diff / 1440)) * 1440;
    }
    return null;
  }
  function fromAI(ai, said, now) {
    const nowD = now || new Date(), today = todayISO(nowD);
    let type = TYPE_BY_ID[ai.type] ? ai.type : 'altro';
    if (type === 'altro') { const d = detectType(said + ' ' + (ai.title || '')); if (d.score >= 3) type = d.type; }
    const w = ai.when ? parseSpeech(ai.when, nowD) : null;
    let date = w && w.date || null, time = w && w.time || null, purchase = null, askTime = null, leadMin = null;
    if (!date && ai.when) { const all = parseSpeech(said, nowD); date = all.date; time = time || all.time; } // l'AI ha scritto il quando in un modo che non conosco: provo con la frase intera
    if (type === 'garanzia') { purchase = date && date <= today ? date : today; date = addMonths(purchase, 24); time = null; }
    if (!time && w && w.askTime) askTime = w.askTime;
    if (!time && ai.ask === 'time' && !askTime) askTime = { part: null };
    if (time && ai.exact) leadMin = 0;
    if (ai.remind && date) {
      let lm = leadFrom(ai.remind, { due: date, time, type }, nowD);
      if (lm == null) { const loc = parseOne(said, nowD, { noDefault: true }); if (loc.leadMin != null) lm = loc.leadEve && time ? (() => { const [hh, mm] = time.split(':').map(Number); return hh * 60 + mm + 24 * 60 - 19 * 60; })() : loc.leadMin; }
      if (lm != null) { leadMin = lm; askTime = null; }
    }
    // rete di sicurezza: se l'AI si è persa un "il giorno prima" o il tipo, li prendo dalla frase intera
    if (leadMin == null && !ai.remind && date) {
      const loc = parseOne(said, nowD, { noDefault: true });
      if (loc.leadMin != null) leadMin = loc.leadEve && time ? (() => { const [hh, mm] = time.split(':').map(Number); return hh * 60 + mm + 24 * 60 - 19 * 60; })() : loc.leadMin;
      else { const mb = minutesBefore(norm(said)); if (mb != null && time) leadMin = mb; }
      if (leadMin != null) askTime = null;
    }
    let title = String(ai.title || '').trim();
    const dt = docTitle(type, said); if (dt) title = dt;
    if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
    const out = { type, title: title || 'MeMo', date, time, purchase, confident: !!date, typeScore: 9, ai: true };
    if (leadMin != null && (time || leadMin % 1440 === 0)) out.leadMin = leadMin;
    if (!title || ai.ask === 'title') out.needTitle = true;
    if (askTime && date && !time) out.askTime = askTime;
    return out;
  }

  // ---------- Come dirlo a parole: "di comprare il pane", "del dentista", "di rinnovare la patente" ----------
  const DOC_DO = { cie: "di rinnovare la carta d'identità", passaporto: 'di rinnovare il passaporto', patente: 'di rinnovare la patente', tessera: 'di rinnovare la tessera sanitaria',
    bollo: 'di pagare il bollo auto', assicurazione: "di rinnovare l'assicurazione", revisione: "di fare la revisione dell'auto", caldaia: 'di far controllare la caldaia' };
  const MASC_A = /^(dentista|oculista|ortodontista|pediatra|ginecologo|problema|programma|tema|sistema|cinema|pigiama|clima|pilota|collega|papa|papà|commercialista|farmacista|fisioterapista|giornalista|artista)$/i;
  function articleOf(word) {
    const w = norm(word);
    const plural = /[i]$/.test(w) && !/^(taxi|bici|brindisi|analisi|crisi|tesi)$/.test(w);
    if (/^[aeiouh]/.test(w)) return plural ? 'degli' : /a$/.test(w) && !MASC_A.test(w) ? "dell'" : "dell'";
    if (/^(s[bcdfgklmnpqrtv]|z|gn|ps|x|y|pn)/.test(w)) return plural ? 'degli' : /a$/.test(w) ? 'della' : 'dello';
    if (plural) return 'dei';
    if (/(?:zione|sione|gione|tà|tù|ice|igine|ite)$/.test(w) || /ione$/.test(w) && !/^(camion|milione|campione|pallone)$/.test(w)) return 'della';
    if (/e$/.test(w) && /^(chiave|nave|notte|neve|carne|fame|gente|lezione|madre|moglie|classe|parte|fine|febbre|mente|sede|sete|torre|voce|luce|pelle|frase|base|fase|crème)$/.test(w)) return 'della';
    if (/a$/.test(w) && !MASC_A.test(w)) return 'della';
    if (/e$/.test(w) && /[^i]e$/.test(w) && /^(uova|patate|pere|mele|banane|olive|scarpe|chiavi)$/.test(w)) return 'delle';
    return 'del';
  }
  function phraseOf(item) {
    const title = String(item.title || '').trim(), t = norm(title);
    if (DOC_DO[item.type] && /^scadenza|^revisione|^controllo|^bollo|^assicuraz|^patente|^passaport|^carta|^tessera/.test(t)) {
      const extra = title.match(/\s(di|del|della)\s+([A-ZÀ-Ý][\wà-ÿ']+)$/); return DOC_DO[item.type] + (extra ? ` ${extra[1]} ${extra[2]}` : '');
    }
    if (item.type === 'compleanno') { const m = title.match(/^(?:compleanno|onomastico)\s+(?:di|del|della)\s+(.+)$/i); if (m) return `di fare gli auguri a ${m[1]}`; }
    const first = (t.split(/\s+/)[0] || '').replace(/[^a-z']/g, '');
    if (/(?:are|ere|ire|arsi|ersi|irsi|urre|orre|arre)$/.test(first) && first.length > 3) return 'di ' + title.charAt(0).toLowerCase() + title.slice(1);
    const head = title.split(/\s+/)[0] || '', art = articleOf(head);
    const rest = /^[A-Z][a-zà-ÿ]+$/.test(head) && !/\s/.test(title) ? title.toLowerCase() : title.charAt(0).toLowerCase() + title.slice(1);
    return art.endsWith("'") ? art + rest : art + ' ' + rest;
  }

  // ---------- Promemoria: quando avvisare ----------
  // Senza orario: N giorni prima, alle 9 del mattino. Con orario: N minuti prima (parrucchiere 15, chiamata 5...).
  function dueAt(item) { const d = parseISO(item.due); if (item.time) { const [h, m] = item.time.split(':').map(Number); d.setHours(h, m, 0, 0); } else d.setHours(23, 59, 0, 0); return d; }
  function leadOf(item) {
    const T = TYPE_BY_ID[item.type] || TYPE_BY_ID.altro;
    if (item.leadMin != null) return item.leadMin;
    if (item.time && T.leadMin != null) return T.leadMin;
    return null; // si usa T.lead in giorni
  }
  function remindAt(item) {
    const T = TYPE_BY_ID[item.type] || TYPE_BY_ID.altro;
    const lm = leadOf(item);
    if (lm != null && item.time) return new Date(dueAt(item).getTime() - lm * 60000);
    if (lm != null && !item.time) { const d = parseISO(addDays(item.due, -Math.round(lm / 1440))); d.setHours(9, 0, 0, 0); return d; }
    const d = parseISO(addDays(item.due, -T.lead)); d.setHours(9, 0, 0, 0);
    if (item.time) { const due = dueAt(item); if (d >= due) return new Date(due.getTime() - 15 * 60000); }
    return d;
  }
  // anticipo predefinito in minuti, per mostrarlo e per cambiarlo
  function defaultLeadMin(item) { const T = TYPE_BY_ID[item.type] || TYPE_BY_ID.altro; return item.time && T.leadMin != null ? T.leadMin : T.lead * 1440; }
  function remindDate(item) { return toISO(remindAt(item)); }
  // Tutti gli avvisi di un MeMo: il primo (con l'anticipo scelto) e i richiami sempre più vicini alla scadenza.
  // Senza orario: un mese prima, una settimana prima, il giorno prima e la mattina stessa (solo quelli dopo il primo).
  // Con orario: per visite e viaggi anche la sera prima. Si fermano quando il MeMo è segnato come fatto.
  function remindersOf(item) {
    const T = TYPE_BY_ID[item.type] || TYPE_BY_ID.altro;
    const first = remindAt(item), due = dueAt(item), out = [first];
    const at = (iso, h, m) => { const d = parseISO(iso); d.setHours(h, m || 0, 0, 0); return d; };
    if (!item.time) {
      for (const d of [30, 7, 1, 0]) { const r = at(addDays(item.due, -d), 9); if (r > first) out.push(r); }
    } else if (T.lead >= 1) {
      const r = at(addDays(item.due, -1), 19); if (r < due && due - r > 3 * 3600000) out.push(r);
    }
    const seen = new Set();
    return out.filter(d => { const k = d.getTime(); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a - b);
  }
  function statusOf(item, now) {
    const nowD = now || new Date();
    const today = todayISO(nowD);
    const left = diffDays(today, item.due);
    const rem = remindAt(item), due = dueAt(item);
    const minutesLeft = Math.round((due - nowD) / 60000);
    const base = { left, remind: rem, minutesLeft };
    if (nowD >= rem) return { key: 'now', ...base };
    if (rem - nowD <= 60 * 86400000) return { key: 'soon', ...base };
    return { key: 'calm', ...base };
  }

  const API = { TYPES, TYPE_BY_ID, detectType, findDates, findMrzExpiry, parseOcr, parseSpeech,
    phraseOf, fromAI, leadFrom, docTitle, todayISO, addDays, addMonths, diffDays, parseISO, toISO, remindDate, remindAt, remindersOf, dueAt, defaultLeadMin, statusOf, lastDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MeMoParser = API;
})(typeof window !== 'undefined' ? window : globalThis);
