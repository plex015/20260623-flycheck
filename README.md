# FlyCheck

Site static pentru gasirea destinatiilor ieftine din Google Travel Explore.

Utilizatorul alege doar aeroportul/orasul de plecare, numarul de persoane, pretul maxim si durata flexibila a calatoriei. Aplicatia returneaza destinatii din toata lumea pentru urmatoarele 6 luni.

## Rulare locala

```bash
npm install
npm run dev
```

## Rezultate live

Google Flights nu are API public direct pentru site-uri statice. Aplicatia foloseste SerpApi Google Travel Explore API (`engine=google_travel_explore`) ca intermediar pentru rezultate live.

Cheia API se introduce in interfata si ramane in `localStorage` pe browserul tau.

Fara cheie API, site-ul porneste in mod demo.

## Publicare GitHub Pages

```bash
npm run build
npm run deploy
```
