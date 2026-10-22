/* MeMo — la voce delle notifiche. Crea titolo e testo simpatici per ogni MeMo.
   Funziona nel browser (window.MeMoNotify) e in Node (per i test). */
(function (root) {
  'use strict';
  const P = root.MeMoParser || (typeof require !== 'undefined' ? require('./parser.js') : null);

  // il nome di chi riceve la notifica: se non lo conosciamo, scherziamo con "Mario"
  const ARTICLE = {
    cie: "la carta d'identità", passaporto: 'il passaporto', patente: 'la patente', tessera: 'la tessera sanitaria',
    bollo: 'il bollo', revisione: 'la revisione', assicurazione: "l'assicurazione", caldaia: 'il controllo della caldaia'
  };
  const lc = s => (s && /^[A-ZÀ-Ý][a-zà-ÿ']/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s || '');
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
  // unisce il saluto al resto: dopo "!" maiuscola, dopo "," minuscola
  const J = (h, rest) => h + ' ' + (/[!?]$/.test(h) ? cap(rest) : lc(rest));
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }

  // "tra 15 minuti", "oggi alle 18", "domani", "il 12 marzo", "tra 3 mesi"
  function when(item, at) {
    const due = P.dueAt(item), min = Math.round((due - at) / 60000);
    const today = P.toISO(at), d = P.diffDays(today, item.due);
    const t = item.time ? item.time.replace(/^0/, '') : '';
    if (item.time && min >= 0 && min < 60) return min <= 1 ? 'tra un minuto' : `tra ${min} min`;
    if (item.time && min >= 60 && min < 180) { const h = Math.round(min / 60); return h === 1 ? "tra un'ora" : `tra ${h} ore`; }
    if (d === 0) return item.time ? `oggi alle ${t}` : 'oggi';
    if (d === 1) return item.time ? `domani alle ${t}` : 'domani';
    if (d < 0) return 'già passato';
    if (d < 45) return `tra ${d} giorni`;
    const m = Math.round(d / 30.44);
    if (m < 18) return `tra ${m} mesi`;
    return `tra ${Math.round(d / 365.25)} anni`;
  }

  // apertura: con il nome, oppure la gag di "Mario"
  // MeMo non ricorda mai come ti chiami (ma ricorda tutto il resto): ogni volta un nome diverso
  const NAMES = ['Mario', 'Franca', 'Gigi', 'Teresa', 'Pino', 'Carla', 'Ugo', 'Rita', 'Tonino', 'Gina', 'Fabrizio', 'Nives'];
  function hello(name, seed) { return pick([`We ${name}!`, `Ehi ${name}!`, `Ciao ${name}!`], seed); }
  function joke(name, seed) { return pick([`Non sei ${name}? Vabbè.`, `Non ti chiami ${name}? Dettagli.`, `Ah, non sei ${name}? Pazienza.`], seed); }

  // testi brevi: titolo corto, una riga di testo
  const L = {
    appuntamento: [
      (c) => [J(c.hello, `${c.t} ${c.q} ${c.e}`), c.name ? 'Scarpe e via.' : `${c.joke} Tu vai.`],
      (c) => [`${c.e} ${cap(c.t)} ${c.q}`, 'Esci ora e arrivi puntuale.'],
      (c) => [`${c.e} ${cap(c.t)} ${c.q}`, 'Io ho fatto la mia parte.']
    ],
    chiamata: [
      (c) => [`📞 ${cap(c.t)} ${c.q}`, 'Telefono in mano, sorriso pronto.'],
      (c) => [J(c.hello, 'squilla squilla 📞'), `${cap(c.t)}, ${c.q}.`]
    ],
    salute: [
      (c) => [`🩺 ${cap(c.t)} ${c.q}`, 'Tessera sanitaria in tasca?'],
      (c) => [J(c.hello, `${c.t} ${c.q}`), c.name ? 'Il dottore ti aspetta.' : `${c.joke} Il dottore ti aspetta.`]
    ],
    viaggio: [
      (c) => [`✈️ ${cap(c.t)} ${c.q}`, 'Documenti, biglietti, caricabatterie.'],
      (c) => [J(c.hello, 'valigia pronta? ✈️'), `${cap(c.t)}, ${c.q}.`]
    ],
    compleanno: [
      (c) => [`🎂 ${cap(c.q)}: ${c.t}`, 'Fingi di essertene ricordato da solo.'],
      (c) => [`🎂 ${cap(c.t)} ${c.q}`, 'Un messaggio, almeno.']
    ],
    cie: [
      (c) => [`🪪 Carta d'identità: scade ${c.q}`, 'Il Comune è lento. Tu no.'],
      (c) => [J(c.hello, `la carta d'identità scade ${c.q}`), 'Prenota ora, poi dimenticatela.']
    ],
    passaporto: [
      (c) => ['🛂 Valigia pronta? Il passaporto no.', `Scade ${c.q}.`],
      (c) => [J(c.hello, `il passaporto scade ${c.q} 🛂`), 'La Questura ha i suoi tempi.']
    ],
    patente: [
      (c) => [`🚗 Patente: scade ${c.q}`, 'Meglio ora che spiegarlo a un vigile.'],
      (c) => [J(c.hello, `la patente scade ${c.q} 🚗`), "Mezz'ora dal medico e via."]
    ],
    tessera: [(c) => [`💳 Tessera sanitaria: scade ${c.q}`, 'Di solito arriva da sola a casa.']],
    bollo: [
      (c) => ['🚙 Il bollo bussa alla porta', `Scade ${c.q}. Un minuto con l'app IO.`],
      (c) => [J(c.hello, `bollo auto ${c.q} 🚙`), 'Il fisco ringrazia.']
    ],
    revisione: [(c) => [`🔧 Revisione ${c.q}`, 'La tua auto chiede un check-up.']],
    assicurazione: [(c) => [`🛡️ Assicurazione: si rinnova ${c.q}`, 'Un preventivo non costa niente.']],
    caldaia: [(c) => [`🔥 Controllo caldaia ${c.q}`, 'Docce calde garantite.']],
    bolletta: [
      (c) => [`💡 ${cap(c.t)} ${c.q}`, 'Un minuto e via il pensiero.'],
      (c) => [J(c.hello, `${c.t} ${c.q} 💡`), c.name ? 'Togliamocela.' : `${c.joke} La bolletta resta.`]
    ],
    abbonamento: [(c) => [`🔁 ${cap(c.t)}: si rinnova ${c.q}`, 'Lo usi ancora? Se no, disdici.']],
    garanzia: [(c) => [`🧾 ${cap(c.t)}: scade ${c.q}`, 'Fa i capricci? Ora o mai più.']],
    altro: [
      (c) => [J(c.hello, `${c.t} ${c.q}`), c.name ? 'Me l\'avevi chiesto tu.' : `${c.joke} Ma questa me la sono segnata.`],
      (c) => [`📌 ${cap(c.t)} ${c.q}`, 'Memoria da pesce rosso? Ci sono io.'],
      (c) => [`📌 ${cap(c.t)} ${c.q}`, 'Fatto il mio. Ora tocca a te.']
    ]
  };

  /** Titolo e testo della notifica per un MeMo. `at` = quando arriva la notifica. */
  function make(item, opts = {}) {
    const at = opts.at || P.remindAt(item);
    const seed = hash(item.id + '|' + at.getTime() + '|' + (opts.salt || ''));
    const fake = pick(NAMES, seed >> 7), name = '';
    const c = {
      name, t: lc(item.title), q: when(item, at), a: ARTICLE[item.type] || lc(item.title),
      hello: hello(fake, seed >> 3), joke: joke(fake, seed >> 5), e: opts.emoji || '⏰'
    };
    const list = L[item.type] || L.altro;
    const [title, body] = pick(list, seed)(c);
    return { title: title.replace(/\s+/g, ' ').trim(), body: body.replace(/\s+/g, ' ').trim(), url: `./?memo=${encodeURIComponent(item.id)}` };
  }

  const API = { make, when };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MeMoNotify = API;
})(typeof window !== 'undefined' ? window : globalThis);
