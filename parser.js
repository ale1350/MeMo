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
      kw: [[/\bpatent[ei]\b/, 6], [/driving\s*licen/, 5], [/permis\s*de\s*conduire/, 5], [/f.hrerschein/, 5], [/\b4a\b/, 2], [/\b4b\b/, 2], [/\b4c\b/, 2], [/\bmit-?uco\b|\bmc-[a-z]{2}\b|motorizzazione/, 4]] },
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
    { id: 'chiamata', label: 'Chiamata', emoji: '📞', lead: 0, leadMin: 60, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: '',
      link: null,
      kw: [[/\b(chiamar|telefonar|richiamar|videochiamat)/, 7], [/\bscrivere\s+a\b|\bmandare\s+un\s+messaggio|\bwhatsapp\b|\bsentire\b/, 4]] },
    { id: 'appuntamento', label: 'Appuntamento', emoji: '⏰', lead: 0, leadMin: 60, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: '',
      link: null,
      kw: [[/parrucchier|barbier|estetist|manicure|massagg/, 6], [/appuntament/, 4], [/riunion|\bmeeting\b|\bcall\b|colloquio/, 5], [/\bcena\b|\bpranzo\b|aperitiv|\bcolazione\s+con/, 4], [/\bincontr/, 3], [/\bandare\s+(da|dal|dalla|al|alla)\b/, 2]] },
    { id: 'salute', label: 'Visita', emoji: '🩺', lead: 1, leadMin: 60, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: "Prenota per tempo e segnati l'orario.",
      link: null,
      kw: [[/\bmedic[oa]\b/, 4], [/\bdott(?:or[ei]|oressa|\.)?\b(?!\s+[A-Z])/, 3], [/\b(?:pediatra|ginecolog|dermatolog|cardiolog|fisioterap|ortoped|osteopat)/, 5], [/dentist/, 5], [/\bvisit[ae]\b/, 4], [/vaccin/, 5], [/\besami\b/, 3], [/\banalisi\b/, 3], [/oculist/, 5], [/\bigienista\b/, 5], [/\bcontroll[oi]\s*(dal|medic)/, 3]] },
    { id: 'abbonamento', label: 'Abbonamento', emoji: '🔁', lead: 7, recur: 12, dateKind: 'expiry', done: 'reschedule',
      ask: 'Quando si rinnova?',
      todo: "Se non lo usi più, disdicilo prima del rinnovo. Se lo usi, non devi fare niente.",
      link: null,
      kw: [[/abboname/, 5], [/rinnovo\s*automatic/, 5], [/netflix|spotify|disney|dazn|icloud|amazon\s*prime|youtube\s*premium/, 5], [/\bdisdett|\bdisdir/, 3]] },
    { id: 'gomme', label: 'Cambio gomme', emoji: '🛞', lead: 14, recur: 12, dateKind: 'expiry', done: 'reschedule',
      ask: 'Entro quando?',
      todo: "Le invernali si possono montare dal 15 ottobre e servono dal 15 novembre al 15 aprile. Le estive vanno rimesse entro il 15 maggio. Qualche comune ha date sue: occhio ai cartelli.",
      link: null,
      kw: [[/cambi\w*\s*(le\s*)?gomm/, 8], [/gomm[ae]\s*(invernal|estiv|termic|da\s*neve)/, 8], [/pneumatic/, 6], [/\bgommista\b/, 6], [/\bgomme\b/, 4], [/catene\s*da\s*neve/, 4]] },
    { id: 'tasse', label: 'Tasse', emoji: '🏛️', lead: 10, recur: 12, dateKind: 'expiry', done: 'reschedule',
      ask: 'Entro quando?',
      todo: "Si paga con l'F24, anche dall'home banking o dall'app della banca.",
      link: { label: 'Agenzia delle Entrate', url: 'https://www.agenziaentrate.gov.it/' },
      kw: [[/\bimu\b/, 7], [/\b730\b/, 7], [/dichiarazione\s*dei\s*redditi|modello\s*redditi/, 7], [/\btasse\b|\bimposte\b/, 4], [/\bf24\b/, 3]] },
    { id: 'bolletta', label: 'Pagamento', emoji: '💡', lead: 3, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Entro quando va pagato?',
      todo: "Pagalo o controlla che l'addebito automatico sia attivo.",
      link: null,
      kw: [[/bollett/, 6], [/\bluce\b|\bgas\b|\bacqua\b/, 1], [/\benel\b|\ba2a\b|\biren\b|\bhera\b|\bedison\b|\bsorgenia\b/, 3], [/\bpagar[ei]\b|\bpagament/, 2], [/\brata\b/, 3], [/\btari\b|\bcanone\b/, 4], [/\bf24\b/, 2], [/scadenza\s*(di\s*)?pagament/, 4], [/importo\s*da\s*pagare/, 4]] },
    { id: 'garanzia', label: 'Garanzia', emoji: '🧾', lead: 30, recur: null, dateKind: 'purchase', done: 'archive',
      ask: "Quando l'hai comprato?",
      todo: "Se qualcosa non funziona, portalo al negozio con lo scontrino prima che scada la garanzia: hai diritto a riparazione o sostituzione.",
      link: null,
      kw: [[/garanzi/, 6], [/scontrin/, 5], [/documento\s*commerciale/, 6], [/\btotale\b/, 1], [/\biva\b/, 1], [/pagamento\s*elettronico|contanti|\bresto\b/, 1], [/\bcomprat[oaie]\b|\bacquistat[oaie]\b|\bpres[oaie]\s+(oggi|ieri)/, 3]] },
    { id: 'commissione', label: 'Commissione', emoji: '🛍️', lead: 0, leadMin: 60, recur: null, dateKind: 'expiry', done: 'archive',
      ask: 'Quando?',
      todo: '',
      link: null,
      kw: [[/\b(comprare|compra|compro|prendere|prendi|prendo|ritirare|ritira|ritiro|recuperare|acquistare|procurare|portare|porta|porto)\b/, 3], [/\bspesa\b|supermercat|farmacia|lavanderia|\bpacco\b|\bvino\b|\bfiori\b|\bregalo\b|\btorta\b/, 2]] },
    { id: 'altro', label: 'Altro', emoji: '📌', lead: 0, leadMin: 60, recur: null, dateKind: 'expiry', done: 'archive',
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
  // anni a due cifre: "27" è il 2027, ma "85" o "99" (le date di nascita sulla patente) sono del Novecento
  function fullYear(y) { y = Number(y); if (y < 100) { const cur = new Date().getFullYear(); y = 2000 + y > cur + 30 ? 1900 + y : 2000 + y; } return y; }
  // quanto può essere lontana, al massimo, una scadenza vera (in anni da oggi): oltre, è un errore di lettura
  const MAX_YEARS = { patente: 11, cie: 11, passaporto: 10.5, tessera: 6.5, bollo: 1.5, assicurazione: 1.5, revisione: 4.5, caldaia: 4.5, abbonamento: 1.5,
    bolletta: 1, tasse: 1.5, gomme: 1.1, viaggio: 1.5, compleanno: 1.1, garanzia: 5, altro: 20 };
  function plausible(type, isoDate, now) {
    const today = todayISO(now), max = MAX_YEARS[type] != null ? MAX_YEARS[type] : 20;
    return isoDate <= addMonths(today, Math.round(max * 12));
  }

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
    // dentro una riga sola, e solo se ogni pezzo ha già almeno una cifra vera ("MI" + "." a capo non è una data)
    return fixLostSlash(text).replace(/(?<![A-Za-z0-9])[0-9OoIl|SB]{1,2}[ \t]?[\/.\-][ \t]?[0-9OoIl|SB]{1,2}[ \t]?[\/.\-][ \t]?[0-9OoIl|SB]{2,4}(?![A-Za-z0-9])/g, m =>
      m.split(/[\/.\-]/).every(x => /\d/.test(x)) ? m.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8') : m);
  }

  function findDates(text) {
    const out = [];
    const t = fixOcrDigits(text);
    const low = norm(t);
    let m;
    const reNum = /(?<!\d)(\d{1,2})[ \t]?[\/.\-][ \t]?(\d{1,2})[ \t]?[\/.\-][ \t]?(\d{4}|\d{2})(?!\d)/g;
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
  // un documento qualsiasi: il titolo è la prima riga "vera" (corta, fatta di parole): "Concerto di Natale"
  function headline(text) {
    for (const raw of String(text || '').split('\n').slice(0, 8)) {
      const l = raw.replace(/[|_~*•]+/g, ' ').replace(/\s+/g, ' ').trim(), letters = (l.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (l.length < 4 || l.length > 42 || letters / l.length < 0.8 || !/[aeiouàèéìòù]/i.test(l) || (l.match(/\b[A-Za-zÀ-ÿ]{3,}\b/g) || []).length < 1) continue;
      const t = l === l.toUpperCase() ? l.charAt(0) + l.slice(1).toLowerCase() : l;
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    return '';
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

    // niente date assurde: una bolletta non scade tra dieci anni
    for (let i = dates.length - 1; i >= 0; i--) if (dates[i].date > today && !plausible(type, dates[i].date, now)) dates.splice(i, 1);
    if (T.dateKind === 'purchase') {
      // Scontrino: la data è l'acquisto. Prendo la più recente non nel futuro.
      const past = dates.map(d => d.date).filter(d => d <= addDays(today, 1)).sort();
      purchase = past.length ? past[past.length - 1] : null;
      if (purchase) { date = addMonths(purchase, 24); confident = true; }
    } else if (ID_DOCS.has(type)) {
      // documenti d'identità: nascita < emissione < scadenza. Una data passata è la nascita o l'emissione, non la scadenza;
      // una data troppo lontana (oltre la durata massima del documento) è un errore di lettura: meglio chiederla che sbagliarla.
      const fut = dates.filter(d => d.date >= today && plausible(type, d.date, now));
      const mrzOk = mrz && mrz >= today && plausible(type, mrz, now) ? mrz : null;
      const latest = list => list.map(d => d.date).sort().pop();
      // 1) l'etichetta della scadenza (4b sulla patente, "data di scadenza" sulla tessera). Sulla CIE le etichette ingannano: lì no.
      const lab = type === 'cie' ? [] : fut.filter(d => { const l = labelBefore(text, d.index); return l.expiry && !l.issue; });
      // 2) patente e carta d'identità scadono il giorno del compleanno: se c'è la data di nascita, la scadenza ha lo stesso giorno e mese
      const births = dates.filter(d => d.date < addMonths(today, -14 * 12)).map(d => d.date.slice(5));
      const bday = (type === 'patente' || type === 'cie') && births.length ? fut.filter(d => births.includes(d.date.slice(5))) : [];
      if (lab.length) { date = latest(lab); confident = true; }
      else if (bday.length) { date = latest(bday); confident = true; }
      else if (mrzOk) { date = mrzOk; confident = true; }
      else if (fut.length) { date = latest(fut); confident = fut.length === 1; }
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

    let title = DOC_TITLE[type] || (type === 'altro' ? headline(text) : T.label);
    if (type === 'garanzia') { const s = guessStore(text); title = s ? `Garanzia ${s}` : 'Garanzia acquisto'; }
    if (type === 'bolletta') { // "Bolletta luce Enel", "Bolletta gas", "Rata", "TARI"
      const n = norm(text), what = /\bluce\b|energia\s+elettrica/.test(n) ? 'luce' : /\bgas\b/.test(n) ? 'gas' : /\bacqua\b|idric/.test(n) ? 'acqua' : /telefon|internet|fibra|mobile/.test(n) ? 'telefono' : '';
      const who = (n.match(/\b(enel|a2a|iren|hera|edison|sorgenia|eni\s*plenitude|acea|tim|vodafone|windtre|fastweb|iliad|illumia|engie)\b/) || [])[1];
      if (/\btari\b/.test(n)) title = 'Pagare la TARI'; else if (/\bimu\b/.test(n)) title = "Pagare l'IMU"; else if (/\bf24\b/.test(n)) title = 'Pagare F24';
      else if (/bollett/.test(n) || what) title = 'Bolletta' + (what ? ' ' + what : '') + (who ? ' ' + who.replace(/\s+/g, ' ').replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/^(A2a|Tim)$/, m => m.toUpperCase()) : '');
    }
    if (type === 'tasse') { const n = norm(text); title = /\bimu\b/.test(n) ? "Pagare l'IMU" : /\b730\b/.test(n) ? 'Inviare il 730' : /\bf24\b/.test(n) ? "Pagare l'F24" : 'Pagare le tasse'; }
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

  const FIRST_PERSON = { esco: 'uscire', usciamo: 'uscire', vado: 'andare', andiamo: 'andare', vedo: 'vedere', vediamo: 'vedere', faccio: 'fare', facciamo: 'fare',
    porto: 'portare', prendo: 'prendere', compro: 'comprare', chiamo: 'chiamare', sento: 'sentire', incontro: 'incontrare', ceno: 'cenare', ceniamo: 'cenare',
    gioco: 'giocare', giochiamo: 'giocare', parto: 'partire', partiamo: 'partire', torno: 'tornare', passo: 'passare', mangio: 'mangiare', mangiamo: 'mangiare',
    accompagno: 'accompagnare', ritiro: 'ritirare', pago: 'pagare', mando: 'mandare', scrivo: 'scrivere', finisco: 'finire', consegno: 'consegnare', prenoto: 'prenotare' };
  const FIRST_PERSON_RE = new RegExp(`^(?:${Object.keys(FIRST_PERSON).join('|')})\\b`, 'i');
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
    // 1b) "venerdì 30", "mercoledì 28 ottobre": il giorno della settimana con il numero (il nome del giorno non resta nel titolo)
    take(new RegExp(`\\b(?:(?:il|per|entro|da)\\s+)?(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\\s+(\\d{1,2}|primo)(?:\\s*(?:di\\s+)?(${MONTH_RE})\\b\\.?(?:\\s+(\\d{4}))?)?(?!\\s*(?:[:.]\\d|e\\s+mezz|minut|or[ae]\\b))\\b`), mm => {
      const d = /^\d+$/.test(mm[1]) ? +mm[1] : 1; if (d < 1 || d > 31) return null;
      if (mm[2]) { if (mm[3]) { const y = +mm[3]; return valid(y, MONTHS[mm[2]], d) ? iso(y, MONTHS[mm[2]], d) : null; } return nextOccurrence(today, MONTHS[mm[2]], d); }
      const y = +today.slice(0, 4), mo = +today.slice(5, 7);
      let cand = iso(y, mo, Math.min(d, lastDay(y, mo)));
      if (cand < today) { const nx = addMonths(iso(y, mo, 1), 1); cand = iso(+nx.slice(0, 4), +nx.slice(5, 7), Math.min(d, lastDay(+nx.slice(0, 4), +nx.slice(5, 7)))); }
      return cand;
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

    const det = detectType(src), score = det.score, type = det.score >= 2 ? det.type : 'altro'; // una parola sola ("acqua") non basta

    // orario
    if (tm) {
      if (tm.relative) { date = tm.date; time = tm.time; }
      else {
        let h = tm.h;
        const pm = /sera|pomeriggio/.test(tm.qual) || part === 'sera' || part === 'pomeriggio' || /\b(stasera|sera|pomeriggio|stanotte)\b/.test(t);
        const am = /mattin/.test(tm.qual) || /\b(stamattina|stamani|mattina|mattino)\b/.test(t) || ((type === 'viaggio' || /\b(sveglia|svegliarmi|colazione)\b/.test(t)) && h >= 4 && h <= 9);
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
        /^\s*(c'[eè]|c'[eè]'|ci\s+sono|ci\s+sar[aà]|ci\s+saranno|c'era)\s+/i,
        /\s+(che\s+)?(scade|scadono|scadra|scadrà|va\s+fatt[oa]|va\s+pagat[oa]|da\s+pagare|da\s+rinnovare|si\s+rinnova|e|ed|il|lo|la|l'|al|alla|entro|per|di|del|della|a|ad|che|comprat[oaie]|acquistat[oaie]|l'ho\s+comprat[oaie]|l'ho\s+pres[oaie]|ho\s+comprato|pres[oaie]|sera|mattina|pomeriggio|parte|parto|domattina|stasera|è|e')\s*$/i
      ];
      for (let i = 0; i < 6; i++) { for (const f of fillers) s = s.replace(f, ' ').trim(); }
      s = s.replace(/\b(?:di|del|della|dello|dei|delle)\s+(?=(?:con|per|a|ad|da|in|su|tra|fra)\b)/gi, '').replace(/^\s*l'(?=[a-zà-ÿ])/i, '');
      s = s.replace(/\s{2,}/g, ' ').replace(/[\s,.;:!]+$/, '').trim();
      const T2 = TYPE_BY_ID[typeId];
      // "esco con Monica" → "Uscire con Monica": il titolo parla come una cosa da fare
      s = s.replace(FIRST_PERSON_RE, w => FIRST_PERSON[norm(w)] || w);
      if (typeId !== 'garanzia') s = summarize(s, opt.ctx != null ? opt.ctx : src);
      const dt = docTitle(typeId, src); if (dt) s = dt;
      if (typeId === 'garanzia' && s && !/garanzi/i.test(s)) s = 'Garanzia ' + s.replace(/^(?:(?:ho|abbiamo)\s+)?(?:comprat[oaie]|acquistat[oaie]|pres[oaie])\s+/i, '').replace(/^(?:(?:il|lo|la|i|gli|le|un|uno|una)\s+|l'|un')/i, '');
      if (!s || s.length < 2) s = typeId === 'altro' ? 'MeMo' : T2.label;
      s = s.charAt(0).toUpperCase() + s.slice(1);
      s = s.replace(/\b(imu|tari|f24|iva|inps|isee|spid|cie|rc)\b/gi, w => w.toUpperCase());
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

  // ---------- scritto di fretta: "dom h15 dentista", "tra 2 gg", "x domani", "03/2029" → italiano pieno, così lo capiscono motore e AI ----------
  const WD_FULL = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MONTH_FULL = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  // refusi sulle parole che contano ("iorno", "mercole", "reminfder", "parrichiere"): si correggono solo queste, mai le altre
  const KEYW = ['giorno', 'giorni', 'prima', 'domani', 'dopodomani', 'domattina', 'stamattina', 'stasera', 'pomeriggio', 'mattina', 'settimana', 'settimane', 'prossimo', 'prossima',
    'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica', 'ricordami', 'ricordarmi', 'ricordamelo', 'avvisami', 'reminder', 'promemoria', 'appuntamento', 'parrucchiere', 'parrucchiera', 'dentista', 'bolletta', 'compleanno', 'scadenza', 'mezzogiorno', 'quindi', 'questo', 'quello'];
  const KEY_ACC = { lunedi: 'lunedì', martedi: 'martedì', mercoledi: 'mercoledì', giovedi: 'giovedì', venerdi: 'venerdì' };
  const COMMON = new Set(['prime', 'primo', 'primi', 'giorna', 'domande', 'quelli', 'questi', 'questa', 'quella', 'mattine', 'mattino', 'sabati', 'domeniche', 'bollette', 'giornata', 'giornate', 'pomeriggi', 'scadenze', 'promemorie', 'appuntamenti', 'dentisti', 'compleanni', 'reminders', 'giornale', 'quinto', 'marzi', 'aprire', 'maggiore',
    // nomi di persona che somigliano a parole chiave: non si toccano mai
    'mattia', 'mattea', 'matteo', 'mario', 'maria', 'marta', 'marco', 'martina', 'martino', 'domenico', 'giorgio', 'giorgia', 'giordano', 'sabatino', 'sabina', 'venere', 'lucia', 'luciano', 'primo', 'prisca', 'quinto', 'dante', 'dania', 'dalia', 'gianni', 'gianna', 'giovanni', 'giovanna', 'vanessa', 'veronica', 'remo', 'romina', 'bianca', 'bruno', 'stella', 'serena', 'sergio', 'settimio', 'ottavio', 'ottavia']);
  function dist(a, b) { // Damerau-Levenshtein, piccolo
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  function fixWord(w) {
    const k = stripAccents(w.toLowerCase()); if (k.length < 5 || COMMON.has(k) || KEYW.includes(k)) return w;
    for (const d of ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi']) if (k.length >= 5 && d.startsWith(k)) return KEY_ACC[d]; // "mercole" → mercoledì
    let best = null, bd = 9;
    for (const v of KEYW) { const dd = dist(k, v); if (dd < bd) { bd = dd; best = v; } }
    // prudente: una lettera sbagliata (due solo nelle parole lunghe); nelle parole di 5 lettere deve tornare anche la fine ("iorno" → giorno, mai "mario" → marzo)
    const lim = k.length >= 10 ? 2 : 1;
    if (best && bd <= lim && Math.abs(best.length - k.length) <= lim && (k.length > 5 || k.slice(-3) === best.slice(-3))) { const out = KEY_ACC[best] || best; return w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out; }
    return w;
  }
  // le feste, con la data giusta (Pasqua cambia ogni anno)
  function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
  const FESTE = [
    ["il giorno dopo ferragosto", () => [7, 16]], ["la vigilia di natale|vigilia di natale", () => [11, 24]], ["la vigilia di capodanno|vigilia di capodanno|san silvestro|l'ultimo dell'anno|ultimo dell'anno", () => [11, 31]],
    ["santo stefano", () => [11, 26]], ["natale", () => [11, 25]], ["capodanno", () => [0, 1]], ["epifania|befana", () => [0, 6]], ["san valentino", () => [1, 14]], ["festa della donna", () => [2, 8]],
    ["festa della liberazione", () => [3, 25]], ["festa dei lavoratori|festa del lavoro", () => [4, 1]], ["festa della repubblica", () => [5, 2]], ["ferragosto", () => [7, 15]], ["halloween", () => [9, 31]], ["ognissanti|tutti i santi", () => [10, 1]],
    ["pasquetta", y => { const d = easter(y); d.setDate(d.getDate() + 1); return [d.getMonth(), d.getDate()]; }], ["pasqua", y => { const d = easter(y); return [d.getMonth(), d.getDate()]; }]
  ];
  function feste(s, nowD) {
    const today = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
    for (const [names, f] of FESTE) {
      // solo quando è un "quando": "a Natale", "per Pasqua", "entro Ferragosto", o a inizio frase (mai "il regalo di Natale")
      const re = new RegExp(`(^\\s*|[\\s,;(](?:a|ad|per|entro|il\\s+giorno\\s+di|la\\s+mattina\\s+di|la\\s+sera\\s+di|il|dopo|prima\\s+di|a\\s+ridosso\\s+di|il\\s+giorno\\s+della)\\s+)(?:${names})\\b`, 'gi');
      s = s.replace(re, (m, pre) => { let y = nowD.getFullYear(), [mo, d] = f(y); if (new Date(y, mo, d) < today) { y++; [mo, d] = f(y); } const lead = pre.match(/^\s*[\s,;(]?/)[0], bare = !/[a-z]/i.test(pre) && !/\s/.test(m.trim()); return bare ? `${lead}${m.trim()} il ${d} ${MONTH_FULL[mo]} ${y}` : `${lead}il ${d} ${MONTH_FULL[mo]} ${y}`; });
    }
    return s;
  }
  function typed(raw, now) {
    let s = ' ' + String(raw || '').replace(/\s*[\r\n]+\s*/g, '. ').replace(/([.!?;])\.\s/g, '$1 ').replace(/\s+/g, ' ').trim() + ' ';
    const nowD = now || new Date();
    const R = (re, to) => { s = s.replace(re, to); };
    s = s.replace(/[A-Za-zÀ-ÿ]{5,}/g, fixWord);
    R(/\bnnon\b/gi, 'non'); R(/\boil\b/gi, 'il'); R(/\bsiga\b/gi, 'sigarette'); R(/\bpigliare\b/gi, 'prendere');
    R(/\bun'?\s*oretta\b/gi, "un'ora"); R(/\bmezz'?\s*oretta\b/gi, "mezz'ora"); R(/\bun\s+paio\s+d'?\s*ore\b/gi, '2 ore'); R(/\boretta\b/gi, 'ora'); R(/\bprox\b\.?/gi, 'prossimo');
    // "alle 5, no anzi alle 6": vale la correzione
    R(/\balle\s+(\d{1,2}(?:[:.]\d{2})?)\s*,?\s*(?:no\s+anzi|no|anzi|cio[eè]|o\s+meglio|scusa)\s*,?\s*(?:alle\s+)?(\d{1,2}(?:[:.]\d{2})?)\b\s*,?/gi, 'alle $2 ');
    // "non domani, dopodomani": vale il secondo
    { const D = "oggi|domani|dopodomani|stasera|domattina|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica";
      R(new RegExp(`\\bnon\\s+(?:${D})\\s*[,:;]?\\s*(?:ma\\s+)?(${D})\\b\\s*[:,]?`, 'gi'), '$1 '); }
    // "ieri dovevo…": un promemoria non può stare nel passato, si fa oggi
    R(/\bieri\b/gi, 'oggi'); R(/\b(?:dovevo|avrei\s+dovuto|dovrei)\s+/gi, 'devo ');
    // le feste: "a Natale", "il giorno dopo Ferragosto", "a Pasqua"
    s = feste(s, nowD);
    // "il primo lunedì di dicembre", "l'ultimo venerdì di novembre"
    s = s.replace(/\b(?:il\s+|l')?(primo|1°|secondo|terzo|quarto|ultimo)\s+(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\s+(?:di|del\s+mese\s+di)\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/gi, (m, ord, w, mon) => {
      const wd = WD_FULL.findIndex(x => stripAccents(x) === stripAccents(w.toLowerCase())), mo = MONTH_FULL.indexOf(mon.toLowerCase());
      const k = { primo: 1, '1°': 1, secondo: 2, terzo: 3, quarto: 4 }[ord.toLowerCase()] || -1;
      const pick = y => { if (k > 0) { const d = new Date(y, mo, 1); while (d.getDay() !== wd) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7 * (k - 1)); return d; } const d = new Date(y, mo + 1, 0); while (d.getDay() !== wd) d.setDate(d.getDate() - 1); return d; };
      let d = pick(nowD.getFullYear()); if (d < new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate())) d = pick(nowD.getFullYear() + 1);
      return `il ${d.getDate()} ${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
    });
    // "il mese prossimo" senza giorno: il mese dopo
    R(/\b(?:il|nel|dal|per\s+il|entro\s+il)\s+mese\s+prossimo\b|\bprossimo\s+mese\b/gi, () => 'a ' + MONTH_FULL[(nowD.getMonth() + 1) % 12]);
    // date che non esistono ("31 novembre"): meglio chiedere che indovinare
    R(/\b(?:il\s+)?(?:31\s+(?:aprile|giugno|settembre|novembre)|3[01]\s+febbraio)\b/gi, ' ');
    // "questo weekend", "in settimana": periodi vaghi, si sistemano dopo
    R(/\b(?:questo|sto|nel|il|per\s+il|entro\s+il)\s+(?:weekend|week-end|week\s+end|fine\s+settimana)\b|\bweekend\b/gi, ' nel weekend ');
    R(/\b(?:in\s+settimana|entro\s+(?:la|questa)\s+settimana|entro\s+fine\s+settimana)\b/gi, ' in settimana ');
    R(/^\s*(?:(?:allora|quindi|dunque|ok|okay|ehi|ehm|senti|oh|bro|zio|tipo)[\s,!]+)+/i, ' ');
    R(/\b(?:mi\s+servirebbe|mi\s+serve|ho\s+bisogno\s*di|avrei\s+bisogno\s*di|vorrei|puoi\s+mettermi|mettimi|fammi|segnami)\s+(?:un|uno|una)\s+(?:reminder|promemoria|memo|notifica|avviso)\s+(?:per|di|che)?\s*/gi, 'ricordami ');
    // "sabato prossimo, non questo, quello dopo": il sabato della settimana dopo
    s = s.replace(/\b(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\s+prossim[oa][\s,]*(?:non|no)\s+(?:questo|questa)[\s,]*(?:ma\s+)?(?:quell[oa]\s+dopo|l'altr[oa]|dopo)\b/gi, (m, w) => {
      const wd = WD_FULL.findIndex(x => stripAccents(x) === stripAccents(w.toLowerCase())), d = new Date(nowD); d.setDate(d.getDate() + 1);
      while (d.getDay() !== wd) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7);
      return `${w} ${d.getDate()} ${MONTH_FULL[d.getMonth()]}`;
    });
    R(/([^\s\w']|\s)x(?=\s+\S)/gi, '$1per');                                           // x = per
    R(/\b(?:xk[eéè]|xch[eéè]|perche)\b/gi, 'perché'); R(/\bnn\b/gi, 'non'); R(/\bcn\b/gi, 'con'); R(/\bcmq\b/gi, 'comunque'); R(/\bke\b/gi, 'che'); R(/\bqnd\b/gi, 'quando');
    R(/(^|\s)app\.?(?=\s+(?:d[ai]l?l?[aoe']?|con|dentista|medico|dottor|parrucch|banca|commercialista|notaio|avvocato|estetista)\b)/gi, '$1appuntamento');
    R(/\b(?:dmn|doma)\b/gi, 'domani'); R(/\bdopodom\b\.?/gi, 'dopodomani'); R(/\bpom\b\.?/gi, 'pomeriggio'); R(/\bmatt\b\.?/gi, 'mattina');
    R(/(\d)\s*(?:gg|gior)\b\.?/gi, '$1 giorni'); R(/\b(un|1)\s+gg\b/gi, '$1 giorno');
    R(/(\d)\s*(?:sett|settim|sett\.)\b\.?/gi, (m, d) => d + (d === '1' ? ' settimana' : ' settimane'));
    R(/(\d)\s*(?:min|mins)\b\.?/gi, '$1 minuti'); R(/\b(\d+)\s*(?:mes|mm)\b\.?/gi, '$1 mesi');
    // giorni abbreviati, solo dove sono davvero un giorno ("lun 9", "mart ore 10", "dom alle 15"), mai un nome ("con Gio")
    const WD_AB = [['lun', 1], ['mart', 2], ['mar', 2], ['merc', 3], ['mer', 3], ['giov', 4], ['gio', 4], ['ven', 5], ['sab', 6], ['dom', 0]];
    for (const [ab, k] of WD_AB) {
      const after = ab === 'mar' ? `(?=\\s*(?:ore\\b|h\\s?\\d|alle\\b|all'|mattin|pomerigg|sera\\b|prossim))` : /^(?:gio|mer)$/.test(ab) ? `(?=\\s*(?:\\d|ore\\b|h\\s?\\d|alle\\b|all'|mattin|pomerigg|sera\\b|prossim|[,.;]|\\s*$))` : `(?![\\w'])`; // "sab", "dom", "lun" sono sempre giorni; "gio" può essere un nome
      s = s.replace(new RegExp(`(^|[\\s,;(])(?<!\\b(?:con|da|a|di|e|tra|fra)\\s)${ab}\\.?${after}`, 'gi'), (m, pre) => pre + WD_FULL[k]);
    }
    // "dopodomani 18 parrucchiere": dopo oggi/domani un numero da solo è l'ora
    R(/\b(oggi|domani|dopodomani|stasera|stamattina|stamani)\s+(?:h\s?|ore\s+)?(\d{1,2})(?:[:.](\d{2}))?(?!\s*(?:[\/\-]|\.\d{1,2}\.|gg|giorn|settim|mes|ann|minut|or[ae]\b|euro|€|°|%|x\b|volte|persone))\b/gi,
      (m, d, h, mi) => +h <= 23 && (!mi || +mi <= 59) ? `${d} alle ${h}${mi ? ':' + mi : ''}` : m);
    // "giovedì 17": se nelle prossime settimane non c'è un giovedì 17, è l'ora (le 17 di giovedì)
    s = s.replace(/\b(luned[iìí]|marted[iìí]|mercoled[iìí]|gioved[iìí]|venerd[iìí]|sabato|domenica)\s+(\d{1,2})(?![\d\/\-:.]|\s*(?:di\s+)?(?:gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic))\b/gi, (m, w, n) => {
      const wd = WD_FULL.findIndex(x => stripAccents(x) === stripAccents(w.toLowerCase())); n = +n;
      for (let i = 0; i <= 35; i++) { const d = new Date(nowD); d.setDate(d.getDate() + i); if (d.getDate() === n && d.getDay() === wd) return m; }
      return n >= 7 && n <= 23 && !/\b(?:alle|ore|h)\s*\d|\d[:.]\d\d/i.test(s) ? `${w} alle ${n}` : m;
    });
    // un orario scritto da solo, "15:30" o "h15": l'orario c'è anche senza "alle"
    R(/(^|[\s,;(])(?<!alle\s|ore\s|le\s)([01]?\d|2[0-3]):([0-5]\d)(?![\d\/])/g, '$1alle $2:$3');
    R(/(^|[\s,;(])h\.?\s?([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\b/gi, (m, pre, h, mi) => `${pre}alle ${h}${mi ? ':' + mi : ''}`);
    // "ven cena 20.30": con il punto è un orario se i minuti sono "da orologio" (00, 15, 30, 45), mai "il 12.11"
    R(/(^|[\s,;(])(?<!alle\s|ore\s|le\s|il\s|al\s|del\s)([01]?\d|2[0-3])\.(00|15|30|45)(?![\d.\/]|\s*(?:€|euro|eur\b|%|kg|km|g\b|l\b))/gi, '$1alle $2:$3');
    // "il 12.11": giorno e mese con il punto
    R(/(^|[\s,;(])((?:il|al|del|dal|entro(?:\s+il)?|per\s+il)\s+)?(\d{1,2})\.(\d{1,2})(?![\d.\/]|\s*(?:€|euro|eur\b|%|kg|km|g\b|l\b))/gi, (m, pre, prep, d, mo) => +d >= 1 && +d <= 31 && +mo >= 1 && +mo <= 12 ? `${pre}${prep || ''}${d}/${mo}` : m);
    // "scade 03/2029": il mese di scadenza dei documenti
    R(/(^|[\s,;(])(?:il\s+|al\s+|entro\s+(?:il\s+)?)?(0?[1-9]|1[0-2])\s?[\/\-]\s?(20\d{2})(?![\d\/])/g, (m, pre, mo, y) => `${pre}a ${MONTH_FULL[+mo - 1]} ${y}`);
    return s.replace(/\s+/g, ' ').trim();
  }


  // ---------- comandi sui MeMo che ci sono già: cerca, elenca, sposta, modifica, cancella, fatto, aggiungi ----------
  // qui si capisce solo COSA vuoi fare e su QUALE MeMo; a cercarlo tra i tuoi ci pensa il telefono (i MeMo non escono mai dall'app)
  const CMD_FILL = /^(?:(?:il|lo|la|i|gli|le|l'|un|uno|una)\s+)?(?:(?:reminder|memo|promemoria|avviso|notifica|appuntamento|impegno)\s+)?(?:(?:del|della|dello|dei|delle|di|per|sul|sulla|con|che\s+riguarda)\s+)?/i;
  const cleanTarget = t => String(t || '').replace(/[?!.,;:]+$/g, '').replace(/^\s*(?:che\s+)?/, '').replace(CMD_FILL, '').replace(CMD_FILL, '').replace(/\s+/g, ' ').trim();
  const PAST = { pagato: 'pagare', comprato: 'comprare', chiamato: 'chiamare', preso: 'prendere', ritirato: 'ritirare', portato: 'portare', prenotato: 'prenotare', inviato: 'inviare', mandato: 'mandare',
    rinnovato: 'rinnovare', consegnato: 'consegnare', spedito: 'spedire', fatto: 'fare', sentito: 'sentire', comprata: 'comprare', presa: 'prendere', pagata: 'pagare' };
  function period(txt, now) {
    const t = norm(txt), today = todayISO(now || new Date()), d0 = parseISO(today);
    const span = (a, b, label) => ({ from: a, to: b, label });
    if (/\boggi\b|\bstasera\b|\bstamattina\b/.test(t)) return span(today, today, 'oggi');
    if (/\bdopodomani\b/.test(t)) { const d = addDays(today, 2); return span(d, d, 'dopodomani'); }
    if (/\bdomani\b|\bdomattina\b/.test(t)) { const d = addDays(today, 1); return span(d, d, 'domani'); }
    if (/(?:settimana\s+prossima|prossima\s+settimana)/.test(t)) { const k = (8 - d0.getDay()) % 7 || 7, a = addDays(today, k); return span(a, addDays(a, 6), 'la prossima settimana'); }
    if (/(?:questa\s+settimana|in\s+settimana|settimana)/.test(t)) { const k = (7 - d0.getDay()) % 7; return span(today, addDays(today, k), 'questa settimana'); }
    if (/(?:mese\s+prossimo|prossimo\s+mese)/.test(t)) { const a = addMonths(today.slice(0, 8) + '01', 1); return span(a, iso(+a.slice(0, 4), +a.slice(5, 7), lastDay(+a.slice(0, 4), +a.slice(5, 7))), 'il mese prossimo'); }
    if (/(?:questo\s+mese|nel\s+mese)/.test(t)) { const y = d0.getFullYear(), m = d0.getMonth() + 1; return span(today, iso(y, m, lastDay(y, m)), 'questo mese'); }
    const mm = new RegExp(`\\b(${MONTH_RE})\\b`).exec(t);
    if (mm) { const m = MONTHS[mm[1]]; let y = d0.getFullYear(); if (m < d0.getMonth() + 1) y++; return span(iso(y, m, 1) < today ? today : iso(y, m, 1), iso(y, m, lastDay(y, m)), `a ${mm[1]}`); }
    const wm = /\b(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/.exec(t);
    if (wm) { const r = parseOne(wm[1], now, { noDefault: true }); if (r.date) return span(r.date, r.date, wm[1]); }
    return null;
  }
  function whenOf(txt, now) {
    const w = norm(txt).replace(/\b(?:cambiando\s+l'ora|cambiando\s+il\s+giorno|cambiando|mettilo|mettila|mettendolo|spostalo|spostala)\b/g, ' ');
    const r = parseOne('x ' + w, now, { noDefault: true });
    const hasDay = /\b(?:oggi|domani|dopodomani|stasera|domattina|luned|marted|mercoled|gioved|venerd|sabato|domenica|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|tra|fra|\d{1,2}\s*\/|il\s+\d)/.test(w);
    const out = { date: hasDay ? r.date || null : null, time: r.time || null };
    return out.date || out.time ? out : null;
  }
  function leadText(txt, now) { const r = parseOne('x ' + txt, now, { noDefault: true }); return r.leadMin != null ? r.leadMin : minutesBefore(norm(txt)); }
  function command(raw, now) {
    const src = typed(raw, now), t = norm(src).replace(/\s+/g, ' ').trim().replace(/^(?:ok|senti|ehi|scusa|allora)[\s,]+/, '');
    let m;
    // elenca: "cosa ho domani?", "che scadenze ho a novembre?", "fammi vedere i memo di questa settimana"
    if ((m = /^(?:mi\s+dici\s+)?(?:cosa|che\s+cosa|che|quali|quanti)\s+(?:ho|devo\s+fare|c'?e|ce|ci\s+sono|impegni\s+ho|scadenze\s+ho|memo\s+ho|reminder\s+ho|cose\s+ho)\b(.*)$/.exec(t))
      || (m = /^(?:che|quali)\s+(?:scadenze|impegni|memo|reminder|promemoria|cose)\b(.*)$/.exec(t))
      || (m = /^(?:elenca(?:mi)?|fammi\s+vedere|mostrami|dimmi)\s+(?:i\s+|le\s+|tutti\s+i\s+|tutte\s+le\s+)?(?:miei\s+|mie\s+)?(?:memo|reminder|promemoria|scadenze|impegni|cose)\b(.*)$/.exec(t))) {
      return { action: 'list', period: period(m[1], now), said: String(raw).trim() };
    }
    // cerca: "ho già segnato il bollo?", "mi dici se ho già segnato un reminder per fare il 730", "c'è un memo per la palestra?"
    if ((m = /\b(?:ho\s+(?:gia\s+)?(?:segnato|messo|salvato|inserito|creato)|hai\s+(?:gia\s+)?(?:segnato|salvato|messo)|c'?e\s+(?:gia\s+)?(?:un|il|una|la|qualche)?\s*(?:reminder|memo|promemoria|avviso)|esiste\s+(?:gia\s+)?(?:un|il)?\s*(?:reminder|memo|promemoria))\b(.*)$/.exec(t))) {
      const target = cleanTarget(m[1].replace(/^\s*(?:per\s+)?(?:fare\s+)?/, ''));
      if (target) return { action: 'find', target, said: String(raw).trim() };
    }
    // segna come fatto: "fatto, ho pagato la bolletta della luce", "ho chiamato Paolo"
    const NEWMEMO = /\b(?:oggi|domani|dopodomani|stasera|domattina|luned|marted|mercoled|gioved|venerd|sabato|domenica|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|alle\s+\d|ore\s+\d|\d{1,2}[\/:.]\d|ricordami|ricordamelo|avvisami|tra\s+\d|fra\s+\d)/;
    if ((m = /^(?:fatto|fatta|ok\s+fatto)\s*[,:!.-]+\s*(?:ho\s+)?(\w+)?\s*(.*)$/.exec(t)) || (m = /^ho\s+(pagato|comprato|chiamato|preso|ritirato|portato|prenotato|inviato|mandato|rinnovato|consegnato|spedito|sentito|pagata|comprata|presa)\b\s*(.*)$/.exec(t))
      || (m = /^segna(?:mi)?\s+(?:come\s+)?fatt[oa]\s+()(.*)$/.exec(t))) {
      const verb = m[1] && PAST[m[1]] ? PAST[m[1]] : '', rest = verb ? m[2] : [m[1], m[2]].filter(Boolean).join(' ');
      const target = cleanTarget(rest); if (target && !NEWMEMO.test(target)) return { action: 'done', target, verb, said: String(raw).trim() };
    }
    // cancella: "cancella il reminder della palestra", "togli il dentista"
    if ((m = /^(?:cancella|cancellami|elimina|eliminami|togli|toglimi|rimuovi|rimuovimi|leva|levami)\b\s*(.*)$/.exec(t)) && !/^(?:un|una)\s+/.test(m[1])) {
      const target = cleanTarget(m[1]); if (target) return { action: 'delete', target, said: String(raw).trim() };
    }
    // aggiungi: "aggiungi al reminder della spesa anche il detersivo", "aggiungi il detersivo alla spesa"
    if ((m = /^(?:aggiungi|aggiungimi|metti)\s+(?:anche\s+)?(?:al|alla|allo|all'|nel|nella|nello)\s+(?:reminder\s+|memo\s+|promemoria\s+|lista\s+)?(?:della\s+|del\s+|dello\s+|di\s+|per\s+la\s+|per\s+il\s+)?(.+?)\s+(?:anche\s+)(.+)$/.exec(t))) return { action: 'add', target: cleanTarget(m[1]), extra: m[2].replace(/[?!.]+$/, '').trim(), said: String(raw).trim() };
    if ((m = /^(?:aggiungi|aggiungimi|metti)\s+(?:anche\s+)?(?!un\s|una\s|uno\s)(.+?)\s+(?:al|alla|allo|all'|nel|nella|nello)\s+(?:reminder\s+|memo\s+|promemoria\s+|lista\s+)?(?:della\s+|del\s+|dello\s+|di\s+)?(.+)$/.exec(t))) return { action: 'add', target: cleanTarget(m[2]), extra: m[1].trim(), said: String(raw).trim() };
    // cambia l'avviso: "avvisami 2 ore prima invece di un'ora per il colloquio"
    if ((m = /^(?:avvisami|avvisamelo|ricordamelo|notificami|mettimi\s+l'avviso)\s+(.+?\s+prima)\s+invece\s+(?:di|che)\s+.+?\s+(?:per|del|della|dello|di|il|la|al|alla)\s+(.+)$/.exec(t))
      || (m = /^(?:cambia|modifica)\s+(?:l'avviso|la\s+notifica|il\s+preavviso)\s+(?:del|della|dello|di|per\s+il|per\s+la)\s+(.+?)\s+(?:a|in|con)\s+(.+?\s+prima)$/.exec(t))) {
      const leadTxt = /prima$/.test(m[1]) ? m[1] : m[2], target = cleanTarget(/prima$/.test(m[1]) ? m[2] : m[1]);
      const r = parseOne('x ' + leadTxt, now, { noDefault: true }), lm = r.leadMin != null ? r.leadMin : minutesBefore(norm(leadTxt));
      if (target && lm != null) return { action: 'lead', target, leadMin: lm, said: String(raw).trim() };
    }
    // sposta / rimanda / modifica: "sposta il dentista a venerdì alle 16", "rimanda la spesa a domani", "rimanda la palestra di un'ora",
    // "modificami il reminder di monica cambiando l'ora, mettilo alle 15"
    if ((m = /^(?:sposta|spostami|rimanda|rimandami|posticipa|anticipa|rinvia|modifica|modificami|cambia|cambiami|correggi)\b\s*(.*)$/.exec(t))) {
      let rest = m[1].replace(/[?!.]+$/, '');
      const sh = /\b(?:di|tra|fra)\s+(\d+|un'?|una|mezz'?|due|tre|quattro|cinque|sei|sette|dieci|quindici|venti|trenta)\s*(minut[oi]|or[ae]|'?\s*ora|giorn[oi]|settiman[ae]|mes[ei])\b/.exec(rest);
      let shift = null;
      if (sh) {
        const n = /^\d+$/.test(sh[1]) ? +sh[1] : /^mezz/.test(sh[1]) ? .5 : NUM_WORDS[sh[1].replace(/'$/, '')] || 1, u = sh[2];
        shift = /^minut/.test(u) ? { min: n } : /or/.test(u) ? { min: n * 60 } : /^giorn/.test(u) ? { days: n } : /^settiman/.test(u) ? { days: 7 * n } : { months: n };
        if (/^anticipa/.test(t)) { if (shift.min) shift.min = -shift.min; if (shift.days) shift.days = -shift.days; if (shift.months) shift.months = -shift.months; }
        rest = rest.slice(0, sh.index) + rest.slice(sh.index + sh[0].length);
      }
      // dove finisce il "quale" e comincia il "quando"
      const cut = /\s+(?:a|al|alle|all'|ad|per|in|cambiando\s+l'ora|cambiando\s+il\s+giorno|cambiando|mettilo|mettila|mettendolo|spostalo|spostala|e\s+mettilo|e\s+mettila)[\s,]/.exec(' ' + rest + ' ');
      let target = rest, whenTxt = '';
      const wIdx = (() => { const re = /(?:^|[\s,])(?:a|al|alle|all'|ad|per|mettilo|mettila|spostalo|spostala|cambiando\s+l'ora|cambiando\s+il\s+giorno|cambiando)(?=[\s,]|$)/g; let mm, first = -1;
        while ((mm = re.exec(rest))) { const after = rest.slice(mm.index + mm[0].length); if (/\b(?:oggi|domani|dopodomani|stasera|domattina|luned|marted|mercoled|gioved|venerd|sabato|domenica|\d|mezzogiorno|settimana|mese|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|ora)/.test(after)) { first = mm.index; break; } }
        return first; })();
      if (wIdx >= 0) { target = rest.slice(0, wIdx); whenTxt = rest.slice(wIdx); }
      target = cleanTarget(target.replace(/,?\s*(?:cambiando|mettilo|mettila).*$/, ''));
      const when = whenTxt ? whenOf(whenTxt, now) : null;
      if (target && (when || shift)) return { action: 'move', target, when, shift, said: String(raw).trim() };
    }
    return null;
  }

  // ---------- più cose in una frase: "vino per Mattia domani alle 18. E domattina il pane!" → due MeMo ----------
  // si divide solo dove è chiaro (punto, "e poi", "e domani"...) e solo se ogni pezzo sta in piedi da solo (cosa + quando)
  const MANY_NEXT = "(?:(?:la|alla)\\s+(?:sera|mattina)|il\\s+pomeriggio|nel\\s+pomeriggio|oggi|domani|dopodomani|stasera|stamattina|stamani|domattina|stanotte|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|il\\s+\\d|l'\\d|entro\\b|tra\\s|fra\\s|ogni\\b|ricordami\\b|ricordati\\b|devo\\b|mi\\s+scade|scade\\b|ho\\s)";
  function splitMany(raw, now) {
    const s = typed(raw, now);
    const P_ = x => { try { return parseSpeech(x.replace(/^(ricordami|ricordati|ricordarmi)\s+anche\s+/i, '$1 '), now); } catch (e) { return null; } };
    const DAYW = /\b(?:oggi|domani|dopodomani|stasera|stamattina|domattina|stanotte|luned|marted|mercoled|gioved|venerd|sabato|domenica|(?:tra|fra)\s+(?:\d|un|una|mezz|due|tre|quattro|cinque|qualche|poco|pochi)|ogni|entro|weekend|settimana|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|\d{1,2}\s*\/)/i;
    // "domani devo: comprare il pane, ritirare il pacco e chiamare il commercialista": una lista di cose da fare nello stesso giorno
    { const m = /^(.*?)\b(?:devo|ho\s+da|da\s+fare|mi\s+serve|ricordami\s+di)\s*:?\s+(.+)$/i.exec(s);
      if (m && DAYW.test(stripAccents(m[1]))) {
        const items = m[2].split(/\s*[,;]\s*(?:e\s+)?|\s+e\s+(?=\S+(?:are|ere|ire)\b)/i).map(x => x.replace(/[.!?]+$/, '').trim()).filter(Boolean);
        if (items.length >= 2 && items.every(x => /^\S+(?:are|ere|ire)\b/i.test(x))) {
          const lead = P_(m[1] + ' ricordami di ' + items[0]);
          if (lead && lead.date) { const out = items.slice(0, 6).map(x => x.charAt(0).toUpperCase() + x.slice(1)); out.inherit = out.map(() => lead.date); return out; }
        }
      } }
    // i punti dove la frase si può dividere, con il loro tipo: "A" = "e poi", "anche", "poi" (una cosa in più), "S" = fine frase
    const cut = new RegExp(`(?<=[.!?;])\\s+|(?<!\\b(?:perch[eé]|che|quando|cos[iì]|dato|visto))(?:,?\\s+)(?:e\\s+poi|e\\s+anche|poi|inoltre|ed?|anche)\\s+(?=${MANY_NEXT})|,\\s+(?:e\\s+)?poi\\s+`, 'gi');
    const pieces = [], seps = ['']; let last = 0, mm; cut.lastIndex = 0;
    while ((mm = cut.exec(s))) { if (!mm[0]) { cut.lastIndex++; continue; } pieces.push(s.slice(last, mm.index)); seps.push(/poi|anche|inoltre|(?:^|[\s,])ed?\s/i.test(mm[0]) ? 'A' : 'S'); last = mm.index + mm[0].length; }
    pieces.push(s.slice(last));
    const parts = [], sepOf = [];
    pieces.forEach((x, k) => { const c = String(x || '').replace(/^(?:e|ed|poi|e\s+poi|anche|inoltre)\s+/i, '').replace(/[\s.!?;,]+$/, '').trim(); if (c.length > 2) { parts.push(c); sepOf.push(/^(?:e\s+poi|poi|anche|inoltre|e\s+anche)\b/i.test(String(x).trim()) ? 'A' : seps[k]); } });
    if (parts.length < 2) return null;
    const ok = x => { const r = P_(x); return !!(r && r.date && !r.needTitle && r.title && r.title !== 'MeMo'); };
    const hasWhat = x => { const r = P_(x); return !!(r && !r.needTitle && r.title && r.title !== 'MeMo'); };
    const GENERIC = /^(?:l'?appuntamento|appuntamento|impegno|l'?impegno|visita|la visita|orario|ora|alle)$/i;
    const chunks = [], inherit = [];
    const lastDate = () => { for (let k = chunks.length - 1; k >= 0; k--) { if (inherit[k]) return inherit[k]; const r = P_(chunks[k]); if (r && r.date) return r.date; } return null; };
    parts.forEach((x, k) => {
      const noDay = !DAYW.test(stripAccents(x)), r = P_(x), prev = chunks.length ? P_(chunks[chunks.length - 1]) : null;
      // "Ho l'appuntamento alle 18": senza un giorno e senza una cosa sua, è l'orario di quella prima
      if (chunks.length && noDay && r && r.time && (!r.title || GENERIC.test(r.title) || r.needTitle) && prev && prev.date && !prev.time) { chunks[chunks.length - 1] += '. ' + x; return; }
      const another = sepOf[k] === 'A' || /^(?:ricordami|ricordati|ricordarmi)\s+anche\b/i.test(x);
      if (chunks.length && noDay && hasWhat(x) && (another || ok(x)) && lastDate()) { const d = lastDate(); chunks.push(x); inherit.push(d); return; } // una cosa in più, nello stesso giorno di prima
      if (chunks.length && !ok(x)) { chunks[chunks.length - 1] += '. ' + x; return; } // il seguito di quella prima ("Ricordami di portare le lastre")
      chunks.push(x); inherit.push(null);
    });
    if (chunks.length > 1 && !ok(chunks[0])) { chunks[1] = chunks[0] + '. ' + chunks[1]; chunks.shift(); inherit.shift(); }
    for (let k = 0; k < chunks.length; k++) chunks[k] = chunks[k].replace(/^(ricordami|ricordati|ricordarmi)\s+anche\s+/i, '$1 ');
    if (chunks.length < 2 || !chunks.every((x, k) => ok(x) || (inherit[k] && hasWhat(x)))) return null;
    const titles = chunks.map(x => norm(P_(x).title));
    if (new Set(titles).size < titles.length) return null;
    const out = chunks.slice(0, 6); out.inherit = inherit.slice(0, 6);
    return out;
  }
  // l'ora si chiede per le cose da fare a breve (entro una settimana) e per gli impegni con un avviso "il giorno prima";
  // per le scadenze (documenti, bollo, compleanni…) o le cose più lontane basta il giorno, con l'avviso a mezzogiorno
  const ASK_SOON = ['appuntamento', 'salute', 'chiamata', 'commissione', 'altro', 'bolletta', 'tasse', 'viaggio', 'gomme'];
  const ASK_EVENT = ['appuntamento', 'salute', 'gomme', 'viaggio', 'commissione', 'altro'];
  // "ciao", "grazie", "asdfg prova": non c'è niente da ricordare
  function chitchat(raw) {
    const t = norm(raw).replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); if (!t) return 'vuoto';
    if (/\b(?:oggi|domani|dopodomani|stasera|domattina|luned|marted|mercoled|gioved|venerd|sabato|domenica|alle|ore|tra|fra|ogni|scade|ricordami|ricordati|avvisami|devo|comprare|pagare|chiamare)\b|\d/.test(t)) return null;
    const w = t.split(' ');
    if (/^(?:grazie|grazie mille|ti ringrazio|thanks|thank you)\b/.test(t) && w.length <= 5) return 'grazie';
    if (/^(?:ciao|ehi|hey|ehila|buongiorno|buonasera|buonanotte|salve|come va|come stai|tutto bene|ok|okay|va bene|perfetto|ottimo|bravo|brava|grande|top)\b/.test(t) && w.length <= 6) return 'ciao';
    const junk = x => /^(?:prova|test|testing|bla|blabla|boh|mah|eh|ah|uff|ciao|memo|asd|lol)$/.test(x) || /[bcdfghjklmnpqrstvwxz]{4,}/.test(x) || !/[aeiou]/.test(x);
    if (w.every(junk)) return 'boh';
    return null;
  }
  function needsTime(res, now) {
    if (!res || !res.date || res.time || res.askTime || res.remindAsk || res.remindOn || res.rep || res.purchase || res.needTitle) return false;
    const d = diffDays(todayISO(now || new Date()), res.date);
    if (d >= 0 && d <= 7 && ASK_SOON.includes(res.type)) return true;
    return res.leadMin != null && res.leadMin >= 1440 && ASK_EVENT.includes(res.type);
  }
  function parseSpeech(raw, now) {
    const nowD = now || new Date(), T0 = typed(raw, nowD), tn = norm(T0);
    const wk = /\bnel weekend\b/.test(tn), ws = /\bin settimana\b/.test(tn);
    const out = parseSpeech0(wk || ws ? T0.replace(/\b(?:nel weekend|in settimana)\b/gi, ' ') : raw, nowD);
    return applyRules(out, raw, nowD);
  }
  // le regole di Ale, uguali per il motore e per l'AI
  function applyRules(out, raw, nowD) {
    if (!out) return out;
    const tn = norm(typed(raw, nowD)), wk = /\bnel weekend\b/.test(tn), ws = /\bin settimana\b/.test(tn);
    if (out.title) out.title = out.title.replace(TAIL_RE, '').trim() || out.title;
    if (/^(?:cosa|una cosa|qualcosa|una roba|roba|mattina|mattino|sera|pomeriggio|notte|la mattina|la sera)$/i.test(out.title || '')) { out.title = ''; out.needTitle = true; }
    const today = todayISO(nowD), d0 = parseISO(today), dow = d0.getDay();
    // periodi vaghi: "nel weekend" (scade domenica, avviso sabato a mezzogiorno e poi domenica), "in settimana" (entro venerdì)
    if (wk && !out.time) { const sat = addDays(today, (6 - dow + 7) % 7), sun = dow === 0 ? today : addDays(sat, 1); out.date = sun; if (dow !== 0) out.remindOn = `${sat}T12:00`; out.confident = true; delete out.askTime; if (out.title) delete out.needTitle; }
    if (ws && !out.time) { const fri = addDays(today, ((5 - dow + 7) % 7) || (dow === 5 ? 7 : 0) || 7); out.date = dow === 6 || dow === 0 ? addDays(today, (5 - dow + 7) % 7) : fri; const next = dow >= 5 || dow === 0 ? addDays(today, dow === 0 ? 1 : 8 - dow) : addDays(today, 1); if (next < out.date) out.remindOn = `${next}T12:00`; out.confident = true; delete out.askTime; }
    // avvisi puntuali: i timer ("tra 20 minuti"), le cose di tutti i giorni (la pastiglia alle 22), la sveglia
    if (out.time && out.leadMin == null && /\b(?:tra|fra)\s+(?:\d+|un'?|una|mezz'?|due|tre|quattro|cinque|dieci|venti|trenta|un\s+quarto)\s*(?:minut|or[ae]\b|'?\s*ora\b|d'?\s*ora)/.test(tn)) out.leadMin = 0;
    if (out.time && out.leadMin == null && out.rep && out.rep.u === 'd') out.leadMin = 0;
    if (/\bsveglia\b/.test(tn)) { out.title = 'Sveglia'; delete out.needTitle; if (out.time) out.leadMin = 0; }
    // "pranzo" senza ora: è a mezzogiorno
    if (!out.time && out.date && /\bpranzo\b/.test(tn) && !/\b(?:mattina|sera|pomeriggio)\b/.test(tn) && !(out.askTime && (out.askTime.part || out.askTime.ctxTime))) { out.time = '12:00'; delete out.askTime; }
    // si ripete "il martedì sera": l'ora si chiede
    if (out.rep && !out.time && !out.askTime) { const pm = /\b(mattina|pomeriggio|sera|notte)\b/.exec(tn); if (pm) out.askTime = { part: pm[1] }; }
    return out;
  }
  function parseSpeech0(raw, now) {
    raw = typed(raw, now);
    const A = anchorOf(raw, now);
    if (A) {
      const out = parseSpeechOnce(A.content, now); out.type = out.typeScore >= 2 ? out.type : detectType(raw).score >= 2 ? detectType(raw).type : out.type;
      if (out.needTitle && out.title === 'MeMo') return out;
      return withAnchor(out, A);
    }
    const R = extractRep(String(raw || '').trim().replace(/\s+/g, ' '));
    if (R) { const out = parseSpeechOnce(R.rest, now); return withRep(out, R, now); }
    return parseSpeechOnce(raw, now);
  }
  const TAIL_RE = /[\s,]+(?:ma|però|pero|e|poi|quindi)?\s*(?:avvisami|avvisamelo|ricordami|ricordamelo|mettimi\s+un\s+reminder|fammi\s+sapere)\s*$/i;
  function parseSpeechOnce(raw, now) {
    const nowD = now || new Date(), today = todayISO(nowD);
    let src = String(raw || '').trim().replace(/\s+/g, ' ');
    let reason = '';
    const rm = REASON_RE.exec(norm(src));
    if (rm && rm.index > 3) {
      const head = src.slice(0, rm.index), probe = parseOne(head, nowD, { noDefault: true });
      if (probe.title && probe.title !== 'MeMo' && !/^(ricordami|ricordarmi)$/i.test(norm(probe.title))) { reason = src.slice(rm.index + rm[0].length); src = head; }
      else src = (head + ' ' + src.slice(rm.index + rm[0].length)).replace(/\s+/g, ' ');
    }
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
    let type = a.typeScore >= 2 ? a.type : 'altro', title = a.title;
    if ((!title || title === 'MeMo') && c) { title = c.title; if (!a.typeScore) type = c.type; }
    const out = { type, title, date, time, purchase: null, confident: !!date, typeScore: a.typeScore };
    if (a.leadMin != null) leadMin = a.leadMin; else if (leadMin == null && c && c.leadMin != null) leadMin = c.leadMin;
    if (leadMin != null && (time || leadMin % 1440 === 0)) out.leadMin = leadMin;
    if (!title || title === 'MeMo') out.needTitle = true;
    if (askTime && date && !time) out.askTime = askTime;
    return out;
  }

  // ---------- MeMo che si ripetono: "ogni lunedì", "il primo di ogni mese", "ogni 3 mesi", "tutti i giorni alle 8" ----------
  // rep = { u: 'd'|'w'|'m'|'y', n: ogni quanti, wd: [giorni della settimana], dom: giorno del mese o 'last' }
  const WD_RE = '(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)';
  const DOM_RE = `(\\d{1,2}|primo|1o)`;
  function repPatterns() {
    const N = `(\\d+|${NUMW}|altr[aie])`;
    return [
      // più giorni della settimana: "ogni lunedì e giovedì", "il martedì e il venerdì di ogni settimana"
      [new RegExp(`\\b(?:ogni|tutti\\s+i|tutte\\s+le|il|la)\\s+${WD_RE}((?:\\s*(?:,|e)\\s*(?:il\\s+|la\\s+)?${WD_RE})+)(?:\\s+(?:di\\s+)?ogni\\s+settimana)?\\b`), m => {
        const wd = [WEEKDAYS[m[1]], ...m[2].match(new RegExp(WD_RE, 'g')).map(x => WEEKDAYS[x])];
        return { u: 'w', n: 1, wd: [...new Set(wd)].sort() }; }],
      [new RegExp(`\\b(?:ogni|tutti\\s+i|tutte\\s+le)\\s+(?:(due|2)\\s+)?${WD_RE}\\b`), m => ({ u: 'w', n: m[1] ? 2 : 1, wd: [WEEKDAYS[m[2]]] })],
      [new RegExp(`\\b(?:il|la)\\s+${WD_RE}\\s+(?:di\\s+)?ogni\\s+settimana\\b`), m => ({ u: 'w', n: 1, wd: [WEEKDAYS[m[1]]] })],
      // giorno del mese: "il primo di ogni mese", "ogni 5 del mese", "ogni mese il 10", "il 27 di ogni mese"
      [/\b(?:a\s+)?fine\s+(?:del\s+)?mese\s+(?:di\s+)?ogni\s+mese\b/, () => ({ u: 'm', n: 1, dom: 'last' })],
      [new RegExp(`\\b(?:ogni\\s+|il\\s+)?${DOM_RE}\\s*(?:°|º)?\\s+(?:di\\s+ogni|di\\s+tutti\\s+i|del|di\\s+ciascun)\\s+mes[ei]\\b`), m => ({ u: 'm', n: 1, dom: /^\d+$/.test(m[1]) ? +m[1] : 1 })],
      [new RegExp(`\\bogni\\s+${DOM_RE}\\s*(?:°|º)?\\s+(?:del|di)\\s+mese\\b`), m => ({ u: 'm', n: 1, dom: /^\d+$/.test(m[1]) ? +m[1] : 1 })],
      [new RegExp(`\\b(?:ogni|tutti\\s+i)\\s+mes[ei]\\s+(?:il|al)\\s+${DOM_RE}\\b`), m => ({ u: 'm', n: 1, dom: /^\d+$/.test(m[1]) ? +m[1] : 1 })],
      [/\b(?:a|ad|ogni)\s+inizio\s+(?:del\s+|di\s+ogni\s+)?mese\b|\bogni\s+inizio\s+mese\b/, () => ({ u: 'm', n: 1, dom: 1 })],
      [/\b(?:a|ogni)\s+fine\s+(?:del\s+|di\s+ogni\s+)?mese\b(?=.*\bogni\b)|\bogni\s+fine\s+(?:del\s+)?mese\b|\bfine\s+di\s+ogni\s+mese\b/, () => ({ u: 'm', n: 1, dom: 'last' })],
      // "ogni 3 mesi", "ogni due settimane", "ogni 15 giorni", "ogni altro giorno"
      [new RegExp(`\\bogni\\s+${N}\\s+(giorn[oi]|settiman[ae]|mes[ei]|ann[oi])\\b`), m => {
        const k = /^\d+$/.test(m[1]) ? +m[1] : /^altr/.test(m[1]) ? 2 : NUM_WORDS[m[1]] || 1;
        return { u: m[2][0] === 'g' ? 'd' : m[2][0] === 's' ? 'w' : m[2][0] === 'm' ? 'm' : 'y', n: k }; }],
      [/\b(?:ogni|tutti\s+i)\s+giorn[oi]\b|\bogni\s+(?:mattina|sera|notte|pomeriggio)\b|\btutte\s+le\s+(?:mattine|sere|notti)\b|\btutti\s+i\s+pomeriggi\b|\bquotidianamente\b|\bogni\s+santo\s+giorno\b/, () => ({ u: 'd', n: 1 })],
      [/\b(?:ogni|tutte\s+le)\s+settiman[ae]\b|\bsettimanalmente\b|\buna\s+volta\s+(?:a|alla|ogni)\s+settimana\b/, () => ({ u: 'w', n: 1 })],
      [/\b(?:ogni|tutti\s+i)\s+mes[ei]\b|\bmensilmente\b|\buna\s+volta\s+(?:al|ogni)\s+mese\b/, () => ({ u: 'm', n: 1 })],
      [/\b(?:ogni|tutti\s+gli)\s+ann[oi]\b|\bannualmente\b|\buna\s+volta\s+(?:l'|all')\s*anno\b/, () => ({ u: 'y', n: 1 })]
    ];
  }
  let REP_PATTERNS = null;
  const PART_OF = t => /\bogni\s+mattina|\btutte\s+le\s+mattine/.test(t) ? 'mattina' : /\bogni\s+sera|\btutte\s+le\s+sere/.test(t) ? 'sera' : /\bogni\s+pomeriggio|\btutti\s+i\s+pomeriggi/.test(t) ? 'pomeriggio' : /\bogni\s+notte|\btutte\s+le\s+notti/.test(t) ? 'notte' : null;
  // trova la ripetizione e la toglie dalla frase (così non finisce nel titolo e non confonde le date)
  function extractRep(src) {
    REP_PATTERNS = REP_PATTERNS || repPatterns();
    const text = String(src || ''), t = norm(text);
    for (const [re, f] of REP_PATTERNS) {
      const m = re.exec(t); if (!m) continue;
      const rep = f(m); if (!rep || !(rep.n >= 1) || rep.n > 60) continue;
      if (rep.dom != null && rep.dom !== 'last' && (rep.dom < 1 || rep.dom > 31)) continue;
      const same = t.length === text.length, base = same ? text : t;
      const rest = (base.slice(0, m.index) + ' ' + base.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
      return { rep, rest, part: PART_OF(t) };
    }
    return null;
  }
  const domIn = (y, mo, dom) => dom === 'last' ? lastDay(y, mo) : Math.min(dom, lastDay(y, mo));
  // la volta successiva a `due`
  function nextRep(item, fromISO) {
    const r = item.rep, due = fromISO || item.due;
    if (!r) return null;
    if (r.u === 'd') return addDays(due, r.n);
    if (r.u === 'w') {
      if (r.wd && r.wd.length > 1) { for (let k = 1; k <= 7; k++) { const c = addDays(due, k); if (r.wd.includes(parseISO(c).getDay())) return c; } }
      return addDays(due, 7 * r.n);
    }
    if (r.u === 'm') { const nx = addMonths(due, r.n); if (r.dom == null) return nx; const y = +nx.slice(0, 4), mo = +nx.slice(5, 7); return iso(y, mo, domIn(y, mo, r.dom)); }
    return addMonths(due, 12 * r.n);
  }
  // la prima volta: oggi se non è già passato, altrimenti la prossima
  function firstRep(rep, date, time, now) {
    const nowD = now || new Date(), today = todayISO(nowD);
    const passed = iso_ => { if (iso_ > today) return false; if (iso_ < today) return true; if (!time) return false; const [h, mi] = time.split(':').map(Number); const c = new Date(nowD); c.setHours(h, mi, 0, 0); return c <= nowD; };
    let d;
    if (rep.u === 'w' && rep.wd) { for (let k = 0; k < 14; k++) { const c = addDays(today, k); if (rep.wd.includes(parseISO(c).getDay()) && !passed(c)) { d = c; break; } } }
    else if (rep.u === 'm' && rep.dom != null) {
      const y = +today.slice(0, 4), mo = +today.slice(5, 7); d = iso(y, mo, domIn(y, mo, rep.dom));
      if (passed(d)) { const nx = addMonths(iso(y, mo, 1), 1); const ny = +nx.slice(0, 4), nm = +nx.slice(5, 7); d = iso(ny, nm, domIn(ny, nm, rep.dom)); }
    } else {
      d = date && date >= today ? date : today;
      let k = 0; while (passed(d) && k++ < 400) d = nextRep({ rep, due: d });
    }
    return d || today;
  }
  // le prossime volte, a partire da quella attuale (per il calendario e per gli avvisi già programmati)
  function occurrences(item, untilISO, max) {
    const out = [item.due]; if (!item.rep) return out;
    let d = item.due, k = 0;
    while (k++ < (max || 400)) { d = nextRep(item, d); if (!d || d > untilISO) break; out.push(d); }
    return out;
  }
  // un MeMo che si ripete e la cui volta è passata va avanti da solo alla prossima
  function rollRep(item, now) {
    if (!item.rep) return false;
    const nowD = now || new Date(); let moved = false, k = 0;
    while (k++ < 800) {
      const due = dueAt(item), grace = item.time ? 60 * 60000 : 0;
      if (due.getTime() + grace >= nowD.getTime()) break;
      item.due = nextRep(item); delete item.remindOn; moved = true;
    }
    return moved;
  }
  const WD_NAME = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const WD_PL = ['la domenica', 'il lunedì', 'il martedì', 'il mercoledì', 'il giovedì', 'il venerdì', 'il sabato'];
  // "ogni lunedì", "il 5 di ogni mese", "ogni 3 mesi", "ogni giorno"
  function repText(rep) {
    if (!rep) return '';
    const n = rep.n || 1;
    if (rep.u === 'd') return n === 1 ? 'ogni giorno' : n === 2 ? 'un giorno sì e uno no' : `ogni ${n} giorni`;
    if (rep.u === 'w') {
      if (rep.wd && rep.wd.length > 1) { const w = rep.wd.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(x => WD_NAME[x]); return 'ogni ' + w.slice(0, -1).join(', ') + ' e ' + w[w.length - 1]; }
      if (rep.wd) return n === 1 ? `ogni ${WD_NAME[rep.wd[0]]}` : `${WD_PL[rep.wd[0]]}, ogni ${n} settimane`;
      return n === 1 ? 'ogni settimana' : `ogni ${n} settimane`;
    }
    if (rep.u === 'm') {
      if (rep.dom === 'last') return n === 1 ? 'a fine mese' : `a fine mese, ogni ${n} mesi`;
      if (rep.dom != null) { const d = rep.dom === 1 ? 'il primo' : `il ${rep.dom}`; return n === 1 ? `${d} di ogni mese` : `${d} del mese, ogni ${n} mesi`; }
      return n === 1 ? 'ogni mese' : `ogni ${n} mesi`;
    }
    return n === 1 ? 'ogni anno' : `ogni ${n} anni`;
  }
  // applica la ripetizione detta a voce al risultato del motore (o dell'AI)
  function withRep(out, R, now) {
    if (!R || !out) return out;
    out.rep = R.rep;
    out.date = firstRep(R.rep, out.date, out.time, now);
    out.confident = true;
    if (R.part && !out.time) out.askTime = { part: R.part };
    if (out.askTime && out.time) delete out.askTime;
    return out;
  }
  const REP_WORDS_RE = /\s*\b(?:ogni|tutti\s+i|tutte\s+le|tutti\s+gli)\s+(?:\d+\s+|due\s+|tre\s+)?(?:giorn[oi]|settiman[ae]|mes[ei]|ann[oi]|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|lunedi|martedi|mercoledi|giovedi|venerdi|mattin[ae]|ser[ae])\b/gi;

  // ---------- Quando avvisare, detto a parte dal quando succede ----------
  // "Ricordami mercoledì che venerdì esco con Monica", "Mercoledì ricordami che venerdì…", "Venerdì esco con Monica, ricordamelo mercoledì",
  // "Avvisami lunedì alle 18 che martedì devo portare i documenti": la cosa è venerdì, l'avviso è mercoledì.
  const ANCHOR_TRIGGER = /(?:^|[\s,.;:!?]+)(?:(?:e|quindi|allora|poi|ma|pero)\s+)?(?:per\s+favore\s+)?(ricordami|ricordarmi|ricordamelo|ricordamela|ricordameli|avvisami|avvisamelo|avvisamela|avvertimi|notificami|fammelo\s+presente|fammi\s+presente|dimmelo|scrivimelo|scrivimi|fammi\s+(?:un\s+fischio|uno\s+squillo)|dammi\s+un\s+(?:colpo|colpetto|fischio)|mandami\s+un\s+messaggio|mandami\s+(?:un\s+)?(?:promemoria|avviso|reminder|notifica)|(?:metti|mettimi|fammi|imposta|impostami|programma|programmami|crea|creami)\s+(?:un|una)\s+(?:reminder|promemoria|avviso|notifica|allarme))\b/;
  const WHEN_WORD = /^(?:(?:il|la|lo|per|entro|da|di|alle|all'|verso|tra|fra|ore|domani|dopodomani|oggi|stasera|stamattina|domattina|stanotte|mattina|sera|pomeriggio|notte|prossim[oa]|mattino|lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|mezzogiorno|mezzanotte|e|mezza|mezzo|un|una|quarto|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|minut[oi]|or[ae]|giorn[oi]|settiman[ae]|mes[ei]|primo|inizio|fine|meta|del|della|mese|sett|\d{1,2}(?::\d{2})?|\d{4}|in|mattinata|serata|ottobre|novembre|dicembre|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[\s,.']*)+$/;
  const PART_HOUR = { mattina: '09:00', pomeriggio: '15:00', sera: '19:00', notte: '21:00' };
  // è solo un "quando"? ("mercoledì prossimo", "domani sera", "lunedì alle 18", "il 28")
  function onlyWhen(text, nowD) {
    const t = norm(text).replace(/[\s,.;:!?]+$/, '').trim(); if (!t || t.length > 48 || !WHEN_WORD.test(t + ' ')) return null;
    const r = parseOne(text, nowD, { noDefault: true }); if (!r.date && !r.time) return null;
    if (r.leadMin != null) return null; // "il giorno prima": è un anticipo, lo gestisce già il motore
    let date = r.date, time = r.time;
    if (!date && time) { const [h, mi] = time.split(':').map(Number), c = new Date(nowD); c.setHours(h, mi, 0, 0); date = c > nowD ? todayISO(nowD) : addDays(todayISO(nowD), 1); }
    return { date, time, part: r.askTime ? r.askTime.part : null };
  }
  function anchorOf(raw, now) {
    const nowD = now || new Date();
    const src = String(raw || '').trim().replace(/\s+/g, ' '), t = norm(src);
    if (t.length !== src.length) return null;
    const m = ANCHOR_TRIGGER.exec(t); if (!m) return null;
    const at = m.index + m[0].length;
    const before = src.slice(0, m.index).replace(/[\s,.;:!?]+$/, ''), after = src.slice(at);
    let R = null, content = '';
    // 1) subito dopo la richiesta, fino a "che"/"di"/":": "ricordami mercoledì prossimo che venerdì…"
    const cm = /^\s*([^]*?)\s*(?:\b(?:che|di|del|della|dello|dei|delle|per)\b|[:,;])\s*([^]*)$/.exec(norm(after));
    let viaDi = false;
    if (cm && cm[1].trim()) { const w = onlyWhen(after.slice(0, cm[1].length + (after.length - after.trimStart().length)), nowD); if (w) { R = w; content = after.slice(after.length - cm[2].length); viaDi = /\bdi\s*$/.test(norm(after.slice(0, after.length - cm[2].length))); } }
    // 2) subito prima: "mercoledì ricordami che venerdì…" (con l'eventuale "allora", "ok" davanti)
    if (!R && before) {
      const lead = before.replace(/^\s*(?:ehi|ok|okay|ciao|senti|allora|memo)[\s,]+/i, '');
      const w = onlyWhen(lead, nowD); if (w) { R = w; viaDi = /^\s*di\b/i.test(after); content = after.replace(/^\s*(?:che|di|:)\s*/i, ''); }
    }
    // 3) in coda: "venerdì esco con Monica, ricordamelo mercoledì"
    if (!R && before && after.trim()) { const w = onlyWhen(after, nowD); if (w) { R = w; content = before; } }
    if (!R || !content.trim()) return null;
    // "ricordami domani alle 9 di chiamare il dentista per la visita di martedì": una cosa da fare a quell'ora, martedì è solo il motivo
    if (viaDi && R.time) return null;
    const E = parseOne(content, nowD, { noDefault: true });
    if (!E.date) return null; // nella frase non c'è un altro "quando": allora il quando detto è proprio quello della cosa
    // "giovedì ricordami che sabato…": se il giorno della settimana viene prima dell'avviso, è quello della settimana dopo
    if (E.date < R.date && /\b(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/.test(norm(content))) {
      const noWd = norm(content).replace(/\b(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/g, ' ');
      if (!parseOne(noWd, nowD, { noDefault: true }).date) { let k = 0; while (E.date < R.date && k++ < 3) E.date = addDays(E.date, 7); }
    }
    let rTime = R.time || (R.part ? null : '12:00');
    const remDate = parseISO(R.date); if (rTime) { const [h, mi] = rTime.split(':').map(Number); remDate.setHours(h, mi, 0, 0); } else remDate.setHours(+PART_HOUR[R.part].slice(0, 2), 0, 0, 0);
    const due = parseISO(E.date); if (E.time) { const [h, mi] = E.time.split(':').map(Number); due.setHours(h, mi, 0, 0); } else due.setHours(23, 59, 0, 0);
    if (remDate >= due || R.date > E.date) return null; // un avviso dopo la cosa non ha senso: decide il motore
    if (R.date === E.date && !R.time && !R.part) return null;
    return { content, date: E.date, time: E.time || null, remindDate: R.date, remindTime: rTime, remindPart: rTime ? null : R.part };
  }
  // applica l'avviso "a parte" al risultato (del motore o dell'AI)
  function withAnchor(out, A) {
    if (!A || !out) return out;
    out.date = A.date; out.time = A.time || (out.date === A.date ? out.time : null) || null;
    delete out.leadMin; delete out.askTime; delete out.leadEve;
    if (A.remindTime) out.remindOn = `${A.remindDate}T${A.remindTime}`;
    else out.remindAsk = { date: A.remindDate, part: A.remindPart };
    out.confident = true;
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
      const rem = parseISO(r.date); if (r.time) { const [hh, mm] = r.time.split(':').map(Number); rem.setHours(hh, mm, 0, 0); } else rem.setHours(12, 0, 0, 0);
      const diff = Math.round((dueAt(item) - rem) / 60000);
      if (diff >= 0) return item.time ? diff : Math.max(0, Math.round(diff / 1440)) * 1440;
    }
    return null;
  }
  function fromAI(ai, said, now) { return applyRules(fromAI0(ai, said, now), said, now || new Date()); }
  function fromAI0(ai, said, now) {
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
    let remindOn = null, remindAsk = null;
    if (ai.remind && date) {
      // l'AI può dire un momento preciso per l'avviso ("mercoledì", "lunedì alle 18:00", "domani sera"): lo si tiene com'è, al giorno giusto
      const w = onlyWhen(ai.remind, nowD);
      if (w && w.date) {
        const due = parseISO(date); if (time) { const [h, mi] = time.split(':').map(Number); due.setHours(h, mi, 0, 0); } else due.setHours(23, 59, 0, 0);
        const rt = w.time || (w.part ? null : '12:00'), rd = parseISO(w.date); const [rh, rmi] = (rt || PART_HOUR[w.part] || '09:00').split(':').map(Number); rd.setHours(rh, rmi, 0, 0);
        if (rd < due && w.date !== date || rd < due && (w.time || w.part)) { if (rt) remindOn = `${w.date}T${rt}`; else remindAsk = { date: w.date, part: w.part }; }
      }
    }
    if (ai.remind && date && !remindOn && !remindAsk) {
      let lm = leadFrom(ai.remind, { due: date, time, type }, nowD);
      if (lm == null) { const loc = parseOne(said, nowD, { noDefault: true }); if (loc.leadMin != null) lm = loc.leadEve && time ? (() => { const [hh, mm] = time.split(':').map(Number); return hh * 60 + mm + 24 * 60 - 19 * 60; })() : loc.leadMin; }
      if (lm != null) { leadMin = lm; askTime = null; }
    }
    // rete di sicurezza: se l'AI si è persa un "il giorno prima" o il tipo, li prendo dalla frase intera
    if (leadMin == null && !ai.remind && date && !remindOn && !remindAsk) {
      const loc = parseOne(said, nowD, { noDefault: true });
      if (loc.leadMin != null) leadMin = loc.leadEve && time ? (() => { const [hh, mm] = time.split(':').map(Number); return hh * 60 + mm + 24 * 60 - 19 * 60; })() : loc.leadMin;
      else { const mb = minutesBefore(norm(said)); if (mb != null && time) leadMin = mb; }
      if (leadMin != null) askTime = null;
    }
    let title = String(ai.title || '').trim();
    const dt = docTitle(type, said); if (dt) title = dt;
    if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
    const R = extractRep(said);
    if (R && title) { title = title.replace(REP_WORDS_RE, ' ').replace(/\s{2,}/g, ' ').replace(/[\s,]+$/, '').trim(); title = title.charAt(0).toUpperCase() + title.slice(1); }
    const out = { type, title: title || 'MeMo', date, time, purchase, confident: !!date, typeScore: 9, ai: true };
    if (leadMin != null && (time || leadMin % 1440 === 0)) out.leadMin = leadMin;
    if (!title || ai.ask === 'title') out.needTitle = true;
    if (askTime && date && !time) out.askTime = askTime;
    if (remindOn || remindAsk) { if (remindOn) out.remindOn = remindOn; else out.remindAsk = remindAsk; delete out.leadMin; delete out.askTime; }
    const A = R ? null : anchorOf(said, nowD);
    if (A) { if (!out.time || out.date !== A.date) out.time = A.time; return withAnchor(out, A); }
    return R ? withRep(out, R, nowD) : out;
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
    if (item.time) return T.leadMin != null ? T.leadMin : 60; // con un orario: un'ora prima (i viaggi 3 ore)
    return null; // si usa T.lead in giorni
  }
  // senza un orario, gli avvisi arrivano a mezzogiorno
  const NOON = 12;
  const remindOnDate = item => { const [d, tm] = item.remindOn.split('T'); const r = parseISO(d); const [h, mi] = (tm || '12:00').split(':').map(Number); r.setHours(h, mi, 0, 0); return r; };
  function remindAt(item) {
    if (item.remindOn) { const r = remindOnDate(item); if (r < dueAt(item)) return r; }
    const T = TYPE_BY_ID[item.type] || TYPE_BY_ID.altro;
    const lm = leadOf(item);
    if (lm != null && item.time) return new Date(dueAt(item).getTime() - lm * 60000);
    if (lm != null && !item.time) { const d = parseISO(addDays(item.due, -Math.round(lm / 1440))); d.setHours(NOON, 0, 0, 0); return d; }
    const d = parseISO(addDays(item.due, -T.lead)); d.setHours(NOON, 0, 0, 0);
    if (item.time) { const due = dueAt(item); if (d >= due) return new Date(due.getTime() - 15 * 60000); }
    return d;
  }
  // anticipo predefinito in minuti, per mostrarlo e per cambiarlo
  function defaultLeadMin(item) { const T = TYPE_BY_ID[item.type] || TYPE_BY_ID.altro; return item.time ? (T.leadMin != null ? T.leadMin : 60) : T.lead * 1440; }
  function remindDate(item) { return toISO(remindAt(item)); }
  // Tutti gli avvisi di un MeMo: il primo (con l'anticipo scelto) e i richiami sempre più vicini alla scadenza.
  // Senza orario: un mese prima, una settimana prima, il giorno prima e la mattina stessa (solo quelli dopo il primo).
  // Con orario: per visite e viaggi anche la sera prima. Si fermano quando il MeMo è segnato come fatto.
  function remindersOf(item) {
    const T = TYPE_BY_ID[item.type] || TYPE_BY_ID.altro;
    const first = remindAt(item), due = dueAt(item), out = [first];
    const at = (iso, h, m) => { const d = parseISO(iso); d.setHours(h, m || 0, 0, 0); return d; };
    if (item.remindOn && first < due) {
      // avviso scelto da te: poi solo un ultimo richiamo vicino alla cosa (la mattina stessa, o poco prima dell'orario)
      const near = item.time ? new Date(due.getTime() - (T.leadMin != null ? Math.max(T.leadMin, 15) : 60) * 60000) : at(item.due, NOON);
      if (near > first) out.push(near);
      return out;
    }
    if (!item.time) {
      for (const d of [30, 7, 1, 0]) { const r = at(addDays(item.due, -d), NOON); if (r > first) out.push(r); }
    } else {
      if (item.type === 'viaggio') { const r = at(addDays(item.due, -1), 19); if (r < due && due - r > 3 * 3600000) out.push(r); } // la sera prima: la valigia
      // hai chiesto un avviso con più anticipo ("il giorno prima"): resta anche quello di un'ora prima dell'impegno
      const lm = leadOf(item), std = T.leadMin != null ? T.leadMin : 60;
      if (lm != null && lm > std) { const r = new Date(due.getTime() - std * 60000); if (r > first) out.push(r); }
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

  const API = { TYPES, TYPE_BY_ID, typed, splitMany, needsTime, chitchat, command, period, whenOf, leadText, detectType, findDates, findMrzExpiry, parseOcr, parseSpeech,
    phraseOf, fromAI, leadFrom, docTitle, extractRep, nextRep, firstRep, occurrences, rollRep, repText, anchorOf, plausible, MAX_YEARS, todayISO, addDays, addMonths, diffDays, parseISO, toISO, remindDate, remindAt, remindersOf, dueAt, defaultLeadMin, statusOf, lastDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MeMoParser = API;
})(typeof window !== 'undefined' ? window : globalThis);
