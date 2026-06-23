# FlyCheck

Site static pentru gasirea destinatiilor ieftine din Google Travel Explore.

Utilizatorul alege doar aeroportul/orasul de plecare, numarul de persoane, pretul maxim si durata flexibila a calatoriei. Aplicatia returneaza destinatii din toata lumea pentru urmatoarele 6 luni.

## Live

Aplicatia cu rezultate live ruleaza pe Vercel:

https://20260623-flycheck.vercel.app/

## Rulare locala

```bash
npm install
npm run dev
```

## Rezultate live

Google Flights nu are API public direct pentru site-uri statice. Aplicatia foloseste SerpApi Google Travel Explore API (`engine=google_travel_explore`) ca intermediar pentru rezultate live.

Cheia API nu se pune in frontend. Trebuie setata pe server ca variabila de mediu:

```bash
SERPAPI_KEY=cheia_ta
```

Pe GitHub Pages aplicatia ramane in mod demo, fiindca GitHub Pages nu ruleaza endpoint-uri `/api`. Pentru live, publica repo-ul pe Vercel sau Netlify si seteaza `SERPAPI_KEY` in Environment Variables.

## Publicare GitHub Pages

```bash
npm run build
npm run deploy
```
