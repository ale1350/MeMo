# MeMo

Scansiona un documento, detta o scrivi una scadenza e dimenticatela: ti avvisa MeMo quando è il momento.

## Pubblicarla

1. Su GitHub crea un repository, per esempio `MeMo`.
2. Carica tutti i file di questa cartella.
3. Vai in **Settings → Pages**, scegli il ramo `main` e la cartella `/ (root)`, poi salva.
4. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/MeMo/`.
5. Aprila in **Safari** sull'iPhone e tocca **Condividi → Aggiungi alla schermata Home**.

## File

- `index.html`: l'app (grafica e funzioni)
- `parser.js`: il motore che capisce documenti scansionati e frasi direttamente sul telefono
- `notify.js`: i testi degli avvisi
- `memo-fish.js`: il pesciolino in 3D
- `sw.js`: la fa funzionare anche offline e mostra le notifiche. Quando aggiorni i file, cambia `VERSION` qui dentro.
- `manifest.json` e le icone: nome e icona sulla Home

## Dove stanno i dati

**Restano solo sul telefono** (IndexedDB): la lista dei MeMo con tutti i dettagli e i testi delle notifiche.
**Foto e documenti non si salvano mai**: quando scansioni un documento MeMo lo legge sul telefono, tiene solo i dati
che servono al MeMo (cos'è, il titolo, la data e, per le garanzie, la data d'acquisto) e poi lo dimentica:
niente immagine, niente PDF, niente testo letto. Le foto salvate dalle versioni precedenti vengono cancellate
da ogni telefono alla prima apertura della versione 2.7. Il repository contiene solo il codice, non le tue scadenze.
Dalle impostazioni (i tre puntini) puoi salvare e ripristinare un backup.

**Passa dal server** (un Worker di Cloudflare dell'autore dell'app), solo per due cose:

- **Notifiche ad app chiusa**, se le attivi. Il server conserva l'indirizzo per le notifiche del telefono e,
  per ogni avviso, solo un codice casuale e l'ora. Il testo non lo riceve: quando arriva la notifica
  è il telefono a scriverla, leggendola dalla sua memoria. Gli avvisi già mandati si cancellano dopo 3 giorni.
- **L'AI che capisce le frasi**, se è accesa (Impostazioni → Privacy → «Capire meglio con l'AI»).
  La frase che dici o scrivi viene mandata a Workers AI di Cloudflare, che risponde e non la conserva né la usa
  per addestrare modelli. Il server non la salva e non la scrive nei log: tiene solo un contatore di quante
  frasi ha capito oggi, che si cancella il giorno dopo. I comandi (cerca, sposta, cancella, fatto…) li capisce
  sempre il telefono da solo. Con l'AI spenta nessuna frase esce dal telefono.

Il telefono è riconosciuto da un codice casuale creato dall'app: nessun nome, email o account.
Come per ogni sito, Cloudflare vede l'indirizzo IP della connessione.

**La voce** la trascrive il telefono con la dettatura del sistema. Su iPhone è la dettatura di Apple, che a
seconda del modello e delle impostazioni può elaborare l'audio sui server di Apple; con Chrome (Android o computer)
passa dai server di Google. L'app non lo può controllare, e l'audio non arriva mai al server di MeMo.

## Scansione dei documenti

Il documento si legge direttamente sul telefono con Tesseract.js (per i PDF con pdf.js), mentre lo inquadri.
La prima volta serve la connessione per scaricare il lettore (solo il programma: il documento non esce mai
dal telefono); poi resta in memoria. Si può leggere anche un'immagine o un PDF già sul telefono («Da un file»):
anche in quel caso MeMo non ne tiene nessuna copia.
