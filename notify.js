/* MeMo — la voce delle notifiche. Crea titolo e testo simpatici per ogni MeMo.
   Funziona nel browser (window.MeMoNotify) e in Node (per i test). */
(function (root) {
  'use strict';
  const P = root.MeMoParser || (typeof require !== 'undefined' ? require('./parser.js') : null);

  const lc = s => (s && /^[A-ZÀ-Ý][a-zà-ÿ']/.test(s) && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s || '');
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
    if (item.time && min <= 0 && min > -30) return 'adesso';
    if (item.time && min > 0 && min < 60) return min === 1 ? 'tra un minuto' : `tra ${min} min`;
    if (item.time && min >= 60 && min < 180) { const h = Math.round(min / 60); return h === 1 ? "tra un'ora" : `tra ${h} ore`; }
    if (d === 0) return item.time ? `oggi alle ${t}` : 'oggi';
    if (d === 1) return item.time ? `domani alle ${t}` : 'domani';
    if (d < 0) return 'già passato';
    if (d >= 2 && d <= 6) { const wd = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][P.parseISO(item.due).getDay()]; return item.time ? `${wd} alle ${t}` : wd; }
    if (d < 45) return `tra ${d} giorni`;
    const m = Math.round(d / 30.44);
    if (m < 18) return `tra ${m} mesi`;
    return `tra ${Math.round(d / 365.25)} anni`;
  }

  // MeMo non ricorda mai come ti chiami (ma ricorda tutto il resto): ogni volta un nome diverso
  const NAMES = ['Mario', 'Franca', 'Gigi', 'Teresa', 'Pino', 'Carla', 'Ugo', 'Rita', 'Tonino', 'Gina', 'Fabrizio', 'Nives',
    'Ornella', 'Beppe', 'Loredana', 'Sandro', 'Graziella', 'Renato', 'Pinuccia', 'Gianni', 'Lella', 'Ottavio', 'Marisa', 'Ezio',
    'Silvana', 'Nando', 'Rosetta', 'Aldo', 'Fiorella', 'Mimmo', 'Carmela', 'Tullio', 'Wanda', 'Armando', 'Ivana', 'Gastone'];
  const HELLO = [n => `We ${n}!`, n => `Ehi ${n}!`, n => `Ciao ${n}!`, n => `Psst, ${n}!`, n => `Ehilà ${n}!`, n => `${n}!`, n => `Buone notizie, ${n}:`, n => `Toc toc, ${n}!`];
  const JOKE_Q = [n => `Non sei ${n}? Vabbè.`, n => `Non ti chiami ${n}? Dettagli.`, n => `Ah, non sei ${n}? Pazienza.`, n => `Sì, lo so che non sei ${n}.`];
  const JOKE = [n => `Non sei ${n}? Vabbè.`, n => `Non ti chiami ${n}? Dettagli.`, n => `Ah, non sei ${n}? Pazienza.`, n => `${n} o non ${n}, il punto è questo.`,
    n => `I nomi non li ricordo, il resto sì.`, n => `Sì, lo so che non sei ${n}.`, n => `Memoria da pesce, ma solo per i nomi.`];

  // battute buone per tutto
  const ANY = ['Io ho fatto la mia parte.', 'Memoria da pesce rosso? Ci sono io.', "Me l'avevi chiesto tu.", 'Fatto il mio. Ora tocca a te.',
    'Un pensiero in meno, appena lo fai.', 'Tu fai, io mi segno il prossimo.', 'Puntuale come un pesce svizzero.', 'Te lo dico con calma, eh.',
    'Respira, c\'è tempo.', 'Promemoria servito.', 'Glu glu: era questo.', 'Nessuna fretta, solo un colpetto sulla spalla.'];

  // per ogni tipo: titoli e testi si combinano tra loro, così le notifiche cambiano quasi sempre
  const L = {
    appuntamento: {
      T: [c => J(c.hello, `${c.t} ${c.q} ${c.e}`), c => `${c.e} ${cap(c.t)} ${c.q}`, c => `${c.e} ${cap(c.q)}: ${c.t}`, c => `${c.e} Promemoria: ${c.t} ${c.q}`],
      B: ['Esci ora e arrivi puntuale.', 'Scarpe e via.', 'Chiavi, telefono, portafoglio.', 'Arrivare cinque minuti prima è un superpotere.', 'Ce la fai con calma.',
        { j: c => `${c.joke} Tu vai.` }, 'Se sei in ritardo, avvisa: fa sempre piacere.', 'Un bicchiere d\'acqua e parti.']
    },
    chiamata: {
      T: [c => `📞 ${cap(c.t)} ${c.q}`, c => J(c.hello, 'squilla squilla 📞'), c => `📞 ${cap(c.q)}: ${c.t}`, c => '📞 È il momento di quella chiamata'],
      B: ['Telefono in mano, sorriso pronto.', c => `${cap(c.t)}, ${c.q}.`, 'Due minuti e via il pensiero.', 'Una telefonata allunga la vita, dicono.', 'Se non risponde, ci riprovi dopo.', 'Cuffiette e chiama camminando.']
    },
    salute: {
      T: [c => `🩺 ${cap(c.t)} ${c.q}`, c => J(c.hello, `${c.t} ${c.q}`), c => `🩺 ${cap(c.q)}: ${c.t}`],
      B: ['Tessera sanitaria in tasca?', 'Il dottore ti aspetta.', 'Porta referti e impegnativa, se servono.', { j: c => `${c.joke} Il dottore ti aspetta.` }, 'Prenditi cura di te: è questo il momento.', 'Esci con un po\' di anticipo, le sale d\'attesa sono lunghe.']
    },
    viaggio: {
      T: [c => `✈️ ${cap(c.t)} ${c.q}`, c => J(c.hello, 'valigia pronta? ✈️'), c => `✈️ Si parte ${c.q}`, c => `🧳 ${cap(c.t)}: ${c.q}`],
      B: ['Documenti, biglietti, caricabatterie.', c => `${cap(c.t)}, ${c.q}.`, 'Check-in fatto? Se no, è il momento.', 'Il caricabatterie si dimentica sempre: controlla.', 'Buon viaggio, da un pesce che non viaggia.', 'Passaporto o carta d\'identità a portata di mano.']
    },
    compleanno: {
      T: [c => `🎂 ${cap(c.q)}: ${c.t}`, c => `🎂 ${cap(c.t)} ${c.q}`, c => J(c.hello, `${c.t} ${c.q} 🎂`), c => '🎉 Candeline in vista'],
      B: ['Fingi di essertene ricordato da solo.', 'Un messaggio, almeno.', 'Gli auguri a voce valgono doppio.', 'Un vocale con gli auguri fa sempre effetto.', 'Il regalo? Hai ancora un po\' di tempo.', 'Nessuno saprà che te l\'ho ricordato io.']
    },
    cie: {
      T: [c => `🪪 Carta d'identità: scade ${c.q}`, c => J(c.hello, `la carta d'identità scade ${c.q}`), c => `🪪 La carta d'identità ha i giorni contati`],
      B: ['Il Comune è lento. Tu no.', 'Prenota ora, poi dimenticatela.', 'Fototessera recente e vecchia carta: basta questo.', 'Meglio rinnovarla adesso che in aeroporto.', c => `Scade ${c.q}. C'è tempo, ma non troppo.`]
    },
    passaporto: {
      T: [c => '🛂 Valigia pronta? Il passaporto no.', c => J(c.hello, `il passaporto scade ${c.q} 🛂`), c => `🛂 Passaporto: scade ${c.q}`],
      B: [c => `Scade ${c.q}.`, 'La Questura ha i suoi tempi.', 'Prenota online: gli appuntamenti volano.', 'Molti paesi lo vogliono valido per altri 6 mesi.', 'Rinnovarlo ora vuol dire viaggiare tranquillo dopo.']
    },
    patente: {
      T: [c => `🚗 Patente: scade ${c.q}`, c => J(c.hello, `la patente scade ${c.q} 🚗`), c => '🚗 La patente chiede il rinnovo'],
      B: ['Meglio ora che spiegarlo a un vigile.', "Mezz'ora dal medico e via.", 'Visita medica, foto, e la nuova arriva a casa.', c => `Scade ${c.q}: c'è tutto il tempo.`]
    },
    tessera: {
      T: [c => `💳 Tessera sanitaria: scade ${c.q}`, c => J(c.hello, `la tessera sanitaria scade ${c.q}`), c => '💳 Tessera sanitaria in scadenza'],
      B: ['Di solito arriva da sola a casa.', 'Se non arriva, la chiedi online all\'Agenzia delle Entrate.', 'Controlla la cassetta della posta nei prossimi giorni.', 'Niente panico: quella nuova arriva per posta.']
    },
    bollo: {
      T: [c => '🚙 Il bollo bussa alla porta', c => J(c.hello, `bollo auto ${c.q} 🚙`), c => `🚙 Bollo auto: ${c.q}`],
      B: [c => `Scade ${c.q}. Un minuto con l'app IO.`, 'Il fisco ringrazia.', 'Con pagoPA lo paghi dal divano.', 'Pagato in tempo, niente more.', 'Anche in tabaccheria, se preferisci.']
    },
    revisione: {
      T: [c => `🔧 Revisione ${c.q}`, c => J(c.hello, `revisione dell'auto ${c.q}`), c => '🔧 La tua auto chiede un check-up'],
      B: ['La tua auto chiede un check-up.', 'Prenota in officina, di solito c\'è posto.', 'Luci, gomme, freni: ci pensano loro.', 'Mezz\'ora e sei a posto per due anni.']
    },
    assicurazione: {
      T: [c => `🛡️ Assicurazione: si rinnova ${c.q}`, c => J(c.hello, `l'assicurazione scade ${c.q}`), c => '🛡️ Tempo di assicurazione'],
      B: ['Un preventivo non costa niente.', 'Confronta due offerte: spesso si risparmia.', 'Controlla anche la classe di merito.', c => `Si rinnova ${c.q}. Valuta con calma.`]
    },
    caldaia: {
      T: [c => `🔥 Controllo caldaia ${c.q}`, c => J(c.hello, `controllo caldaia ${c.q}`), c => '🔥 La caldaia vuole il suo tagliando'],
      B: ['Docce calde garantite.', 'Chiama il tecnico prima che faccia freddo.', 'Fatti aggiornare il libretto.', 'Inverno tranquillo, caldaia felice.']
    },
    gomme: {
      T: [c => `🛞 ${cap(c.t)} ${c.q}`, c => J(c.hello, `${c.t} ${c.q} 🛞`), c => '🛞 Tempo di cambio gomme'],
      B: ['Chiama il gommista adesso: tra poco sono tutti pieni.', 'Prenota prima della corsa dell\'ultimo minuto.', 'Controlla anche il battistrada.', 'Strada sicura, testa tranquilla.', 'Il gommista ti aspetta (ma non per sempre).']
    },
    tasse: {
      T: [c => `🏛️ ${cap(c.t)} ${c.q}`, c => J(c.hello, `${c.t} ${c.q}`), c => `🏛️ Scadenza: ${c.t}`],
      B: ['Un F24 dall\'home banking e via.', 'Il fisco non dimentica. Neanche io.', 'Pagato in tempo, niente sanzioni.', 'Se hai un commercialista, giragli il promemoria.', 'Togliamocela, che poi è più leggera.']
    },
    bolletta: {
      T: [c => `💡 ${cap(c.t)} ${c.q}`, c => J(c.hello, `${c.t} ${c.q} 💡`), c => `💡 Da pagare ${c.q}: ${c.t}`],
      B: ['Un minuto e via il pensiero.', 'Togliamocela.', { j: c => `${c.joke} La bolletta resta.` }, 'Con l\'addebito automatico non ci pensi più.', 'Pagata in tempo, niente more.', 'App della banca, due tocchi, fatto.']
    },
    abbonamento: {
      T: [c => `🔁 ${cap(c.t)}: si rinnova ${c.q}`, c => J(c.hello, `${c.t} si rinnova ${c.q}`), c => `🔁 Rinnovo in arrivo: ${c.t}`],
      B: ['Lo usi ancora? Se no, disdici.', 'Se ti piace, non devi fare niente.', 'Ultima occasione per disdire senza pagare.', 'Abbonamenti dimenticati: il miglior amico del portafoglio altrui.']
    },
    garanzia: {
      T: [c => `🧾 ${cap(c.t)}: scade ${c.q}`, c => J(c.hello, `${c.t} scade ${c.q}`), c => '🧾 La garanzia sta per finire'],
      B: ['Fa i capricci? Ora o mai più.', 'Se c\'è un difetto, è il momento di farlo presente.', 'Lo scontrino lo trovi qui in MeMo.', 'Funziona tutto? Allora niente da fare.']
    },
    commissione: {
      T: [c => `${c.e} ${cap(c.t)} ${c.q}`, c => J(c.hello, `${c.t} ${c.q}`), c => `${c.e} Non scordarti: ${c.t}`, c => `${c.e} ${cap(c.q)}: ${c.t}`],
      B: ['Borsa, portafoglio e via.', { j: c => `${c.joke} Ma la spesa no.` }, 'Te lo dico ora, così non torni a mani vuote.', 'Mettilo in lista prima di uscire.', 'Missione semplice, la porti a casa.', 'Se passi di lì, è fatta.']
    },
    altro: {
      T: [c => J(c.hello, `${c.t} ${c.q}`), c => `${c.e} ${cap(c.t)} ${c.q}`, c => `${c.e} ${cap(c.q)}: ${c.t}`, c => `${c.e} Ti ricordo: ${c.t}`],
      B: [{ j: c => `${c.joke} Ma questa me la sono segnata.` }, 'Memoria da pesce rosso? Ci sono io.', 'Fatto il mio. Ora tocca a te.', "Me l'avevi chiesto tu.", 'Eccolo, come promesso.', 'Un colpetto sulla spalla, niente di più.']
    }
  };
  const REP_TAIL = [r => `E ci risentiamo ${r}.`, r => `Te lo ricordo ${r}, tranquillo.`, r => `Prossimo giro: ${r}.`];

  /** Titolo e testo della notifica per un MeMo. `at` = quando arriva la notifica. */
  function make(item, opts = {}) {
    const at = opts.at || P.remindAt(item);
    const seed = hash(item.id + '|' + at.getTime() + '|' + (opts.salt || ''));
    const fake = pick(NAMES, seed >> 7);
    const c = {
      t: lc(item.title), q: when(item, at), hello: pick(HELLO, seed >> 3)(fake), joke: pick(JOKE_Q, seed >> 5)(fake),
      e: opts.emoji || (P.TYPE_BY_ID[item.type] || P.TYPE_BY_ID.altro).emoji
    };
    // "commissione" con le frasi della spesa solo se è davvero qualcosa da prendere
    const shop = /compr|spesa|prend|ritir|acquist|regal|pane|vino|latte|farmac|pacco|fiori|torta/i.test(item.title || '');
    const set = item.type === 'commissione' && !shop ? L.altro : L[item.type] || L.altro;
    const tf = pick(set.T, seed); let title = tf(c); const named = title.includes(fake);
    // il quando deve esserci sempre: un avviso in anticipo senza il giorno non serve a niente
    if (c.q && c.q !== 'adesso' && !title.toLowerCase().includes(c.q.toLowerCase()) && !/scade|rinnov|garanzia/i.test(title)) title = `${title} · ${c.q}`;
    const jokes = set.B.filter(x => x && x.j), plain = set.B.filter(x => !(x && x.j));
    let bf = named && jokes.length && (seed >> 19) % 2 === 0 ? pick(jokes, seed >> 9) : (seed >> 11) % 4 === 0 ? pick(ANY, seed >> 13) : pick(plain, seed >> 9);
    if (named && (seed >> 21) % 3 === 0) bf = pick(JOKE, seed >> 5)(fake);
    let body = typeof bf === 'function' ? bf(c) : bf && bf.j ? bf.j(c) : bf;
    if (item.rep && P.repText && (seed >> 15) % 3 === 0) body = pick(REP_TAIL, seed >> 17)(P.repText(item.rep));
    return { title: title.replace(/\s+/g, ' ').trim(), body: body.replace(/\s+/g, ' ').trim(), url: `./?memo=${encodeURIComponent(item.id)}` };
  }

  // ---------- Il riepilogo della domenica ----------
  const WD = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const WEEK_EMPTY_T = ['Settimana libera 🌿', 'Niente in vista 🐟', 'Calma piatta 🌊', 'Settimana leggera ☁️', 'Tutto tranquillo 🐠', 'Agenda pulita ✨', 'Mare calmo 🌊', 'Nessun pensiero in vista 🫧'];
  const WEEK_EMPTY_B = ['Questa settimana non ho niente da ricordarti. Goditela.', 'Nessun MeMo in arrivo: testa libera fino a domenica prossima.',
    'Per i prossimi sette giorni non c\'è niente in agenda. Se salta fuori qualcosa, dimmelo.', 'Niente scadenze, niente impegni segnati. Respira.',
    'Settimana senza pensieri. Io resto qui, nel caso.', 'Zero cose da ricordare. Più spazio per tutto il resto.',
    'Non c\'è niente in arrivo. Se ti viene in mente qualcosa, sai dove trovarmi.', 'Sette giorni liberi da promemoria. Te li sei meritati.'];
  const WEEK_T1 = ['Una cosa sola questa settimana 🐟', 'Settimana quasi libera 🌿', 'Solo un MeMo in vista', 'Una cosetta per la settimana'];
  const WEEK_TN = ['La tua settimana 🐟', 'Pronto per la settimana?', 'Ecco cosa ti aspetta', 'Uno sguardo alla settimana 👀', 'Settimana in arrivo', 'Domani si riparte 🐠', 'La settimana in due righe'];
  const WEEK_TAIL = ['Al resto ci penso io.', 'Te li ricordo uno alla volta.', 'Tu goditi la domenica.', 'Niente ansia: ti avviso io al momento giusto.', 'Io tengo il conto, tu rilassati.', 'Buona settimana!'];
  const WEEK_TAIL1 = ['Al momento giusto ti avviso io.', 'Tu goditi la domenica.', 'Per il resto, settimana libera.', 'Buona settimana!'];
  /** Riepilogo della settimana: list = [{ id, title, due, time, rep }] già nella settimana. */
  function week(list, opts = {}) {
    const seed = hash(String(opts.seed || '') + '|' + (opts.mon || ''));
    if (!list.length) return { title: pick(WEEK_EMPTY_T, seed), body: pick(WEEK_EMPTY_B, seed >> 4) };
    // le cose che si ripetono si scrivono una volta sola: "Palestra martedì e giovedì"
    const groups = [];
    for (const x of list) { let g = groups.find(g => g.key === (x.id || x.title)); if (!g) groups.push(g = { key: x.id || x.title, title: x.title, days: [], time: x.time }); g.days.push(x.due); }
    const part = g => {
      const days = [...new Set(g.days)], names = days.map(d => WD[P.parseISO(d).getDay()]);
      const when = days.length >= 7 ? 'ogni giorno' : names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
      return `${groups.indexOf(g) ? lc(g.title) : cap(lc(g.title))} ${when}${g.time && days.length === 1 ? ' alle ' + g.time.replace(/^0/, '') : ''}`;
    };
    const shown = groups.slice(0, 3).map(part), more = groups.length - shown.length;
    const listTxt = shown.length === 1 ? shown[0] : shown.slice(0, -1).join(', ') + (more ? ', ' : ' e ') + shown[shown.length - 1] + (more ? ` e ${more === 1 ? "un'altra cosa" : more + ' altre cose'}` : '');
    const one = groups.length === 1;
    return { title: pick(one ? WEEK_T1 : WEEK_TN, seed), body: `${listTxt}. ${pick(one ? WEEK_TAIL1 : WEEK_TAIL, seed >> 4)}` };
  }

  const API = { make, when, week };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MeMoNotify = API;
})(typeof window !== 'undefined' ? window : globalThis);
