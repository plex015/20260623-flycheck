# FlyCheck

Site static pentru scanarea Google Flights pe urmatoarele 6 luni dupa ruta, numar de persoane si pret maxim.

## Rulare locala

```bash
npm install
npm run dev
```

## Rezultate live

Aplicatia foloseste SerpApi Google Flights API (`engine=google_flights`). Cheia API se introduce in interfata si ramane in `localStorage` pe browserul tau.

Fara cheie API, site-ul porneste in mod demo.

## Publicare GitHub Pages

```bash
npm run build
npm run deploy
```
