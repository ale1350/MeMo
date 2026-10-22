# MeMo

Fai una foto, detta una scadenza e dimenticatela: ti avvisa MeMo quando è il momento.

## Pubblicarla (come FinanciAle)

1. Su GitHub crea un repository nuovo, per esempio `MeMo`.
2. Carica tutti i file di questa cartella, mantenendo la cartella `icons`.
3. Vai in **Settings → Pages**, scegli il ramo `main` e la cartella `/ (root)`, poi salva.
4. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/MeMo/`.
5. Aprila in **Safari** sull'iPhone, tocca **Condividi → Aggiungi alla schermata Home**.

## File

- `index.html`: l'app (grafica e funzioni)
- `parser.js`: il motore che capisce foto e frasi dette a voce
- `sw.js`: la fa funzionare anche offline. Quando aggiorni i file, cambia `VERSION` qui dentro.
- `manifest.json` e `icons/`: nome e icona sulla Home

## Dove stanno i dati

Tutto resta sull'iPhone (IndexedDB), foto comprese. Niente server, niente account.
Il repository può essere pubblico: contiene solo il codice, non le tue scadenze.
Dalle impostazioni (i tre puntini) puoi salvare e ripristinare un backup.

## Lettura delle foto

Il testo viene letto direttamente sul telefono con Tesseract.js. La prima foto richiede
la connessione e qualche secondo in più per scaricare il lettore; poi resta in memoria.
