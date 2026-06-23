import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Globe2,
  Plane,
  RefreshCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import './styles.css';

const EXPLORE_ENDPOINT = '/api/explore';
const USAGE_ENDPOINT = '/api/usage';

const formatDate = (iso) =>
  new Intl.DateTimeFormat('ro-RO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${iso}T12:00:00`));

const formatMoney = (amount, currency) =>
  new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const formatDuration = (minutes) => {
  if (!minutes) return 'Durata indisponibila';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const addDays = (date, days) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};

const durationOptions = [
  { value: '1', label: 'Weekend', note: '2-4 nopti' },
  { value: '2', label: 'O saptamana', note: '5-8 nopti' },
  { value: '3', label: 'Doua saptamani', note: '10-16 nopti' },
];

const sampleFlights = [
  {
    id: 'demo-lis',
    price: 96,
    currency: 'EUR',
    destination: 'Lisabona',
    country: 'Portugalia',
    airport: 'LIS',
    outboundDate: addDays(todayIso(), 19),
    returnDate: addDays(todayIso(), 23),
    airline: 'Wizz Air',
    duration: '4h 10m',
    stops: 'Direct',
    bookingUrl: 'https://www.google.com/travel/explore',
  },
  {
    id: 'demo-ath',
    price: 121,
    currency: 'EUR',
    destination: 'Atena',
    country: 'Grecia',
    airport: 'ATH',
    outboundDate: addDays(todayIso(), 38),
    returnDate: addDays(todayIso(), 45),
    airline: 'Aegean',
    duration: '1h 35m',
    stops: 'Direct',
    bookingUrl: 'https://www.google.com/travel/explore',
  },
  {
    id: 'demo-tok',
    price: 548,
    currency: 'EUR',
    destination: 'Tokyo',
    country: 'Japonia',
    airport: 'NRT',
    outboundDate: addDays(todayIso(), 93),
    returnDate: addDays(todayIso(), 107),
    airline: 'Qatar Airways',
    duration: '16h 20m',
    stops: '1 stop',
    bookingUrl: 'https://www.google.com/travel/explore',
  },
];

function getNights(flight) {
  if (!flight.outboundDate || !flight.returnDate) return null;
  const start = new Date(`${flight.outboundDate}T12:00:00`);
  const end = new Date(`${flight.returnDate}T12:00:00`);
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function extractDestination(destination, settings, durationValue) {
  return {
    id: `${durationValue}-${destination.destination_id || destination.name}-${destination.start_date}-${destination.flight_price}`,
    price: Number(destination.flight_price),
    currency: settings.currency,
    destination: destination.name || 'Destinatie',
    country: destination.country || 'Oriunde',
    airport: destination.destination_airport?.code || '',
    outboundDate: destination.start_date,
    returnDate: destination.end_date,
    airline: destination.airline || 'Google Flights',
    duration: formatDuration(destination.flight_duration),
    stops: destination.number_of_stops === 0 ? 'Direct' : `${destination.number_of_stops || 0} stop`,
    bookingUrl: destination.link || 'https://www.google.com/travel/explore',
    durationBucket: durationValue,
  };
}

async function fetchExploreDestinations(settings, travelDuration, signal) {
  const response = await fetch(EXPLORE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      departure: settings.departure.trim().toUpperCase(),
      people: Number(settings.people),
      currency: settings.currency,
      maxPrice: Number(settings.maxPrice),
      travelDuration,
    }),
    signal,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `API ${response.status}`);
  if (data.error) throw new Error(data.error);

  return (data.destinations || [])
    .map((destination) => extractDestination(destination, settings, travelDuration))
    .filter((flight) => flight.price > 0 && flight.price <= Number(settings.maxPrice));
}

async function scanExplore(settings, onProgress, signal) {
  const selectedDurations = settings.travelDurations;
  const results = [];
  let completed = 0;

  for (const durationValue of selectedDurations) {
    if (signal.aborted) break;

    const destinations = await fetchExploreDestinations(settings, durationValue, signal);
    results.push(...destinations);
    completed += 1;
    onProgress({ completed, total: selectedDurations.length });
  }

  const unique = new Map();
  for (const result of results) {
    const key = `${result.destination}-${result.outboundDate}-${result.returnDate}-${result.price}`;
    if (!unique.has(key)) unique.set(key, result);
  }

  return [...unique.values()].sort(
    (a, b) => a.price - b.price || a.destination.localeCompare(b.destination),
  );
}

async function fetchUsage(signal) {
  const response = await fetch(USAGE_ENDPOINT, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `API ${response.status}`);
  return data;
}

function App() {
  const [settings, setSettings] = useState({
    departure: 'OTP',
    people: 2,
    maxPrice: 250,
    currency: 'EUR',
    travelDurations: ['1', '2', '3'],
  });
  const [flights, setFlights] = useState(sampleFlights);
  const [progress, setProgress] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [notice, setNotice] = useState('Mod demo pana cand site-ul este publicat pe o platforma cu endpoint serverless.');
  const [controller, setController] = useState(null);
  const [usage, setUsage] = useState(null);
  const [usageNotice, setUsageNotice] = useState('Apasa refresh pentru quota SerpApi.');
  const [isUsageLoading, setIsUsageLoading] = useState(false);

  const visibleFlights = useMemo(
    () => flights.filter((flight) => flight.price <= Number(settings.maxPrice)),
    [flights, settings.maxPrice],
  );

  const update = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const searchCost = settings.travelDurations.length;

  const refreshUsage = async () => {
    if (window.location.hostname.endsWith('github.io')) {
      setUsageNotice('Quota live este disponibila pe Vercel, nu pe GitHub Pages.');
      return;
    }

    setIsUsageLoading(true);
    try {
      const nextUsage = await fetchUsage();
      setUsage(nextUsage);
      setUsageNotice('Actualizat acum.');
    } catch (error) {
      setUsageNotice(error.message);
    } finally {
      setIsUsageLoading(false);
    }
  };

  useEffect(() => {
    refreshUsage();
  }, []);

  const toggleDuration = (value) => {
    setSettings((current) => {
      const exists = current.travelDurations.includes(value);
      const nextDurations = exists
        ? current.travelDurations.filter((item) => item !== value)
        : [...current.travelDurations, value];

      return {
        ...current,
        travelDurations: nextDurations.length ? nextDurations : [value],
      };
    });
  };

  const runSearch = async (event) => {
    event.preventDefault();
    setProgress(null);

    if (window.location.hostname.endsWith('github.io')) {
      setFlights(sampleFlights.filter((flight) => flight.price <= Number(settings.maxPrice)));
      setNotice('GitHub Pages nu poate rula API serverless. Publica pe Vercel/Netlify cu SERPAPI_KEY pentru rezultate live.');
      return;
    }

    const activeController = new AbortController();
    setController(activeController);
    setIsSearching(true);
    setNotice('Caut destinatii globale in Google Travel Explore pentru urmatoarele 6 luni.');
    setProgress({ completed: 0, total: settings.travelDurations.length });

    try {
      const liveFlights = await scanExplore(settings, setProgress, activeController.signal);
      setFlights(liveFlights);
      setNotice(liveFlights.length ? `Am gasit ${liveFlights.length} destinatii sub pretul ales.` : 'Nu am gasit destinatii sub pretul ales.');
      refreshUsage();
    } catch (error) {
      if (error.name !== 'AbortError') setNotice(error.message);
    } finally {
      setIsSearching(false);
      setController(null);
    }
  };

  const stopSearch = () => {
    controller?.abort();
    setIsSearching(false);
    setNotice('Cautarea a fost oprita.');
  };

  return (
    <main className="app-shell">
      <section className="search-panel">
        <div className="brand-row">
          <div className="brand-mark"><Plane size={24} /></div>
          <div>
            <h1>FlyCheck</h1>
            <p>Alegi doar plecarea. FlyCheck gaseste destinatii din toata lumea sub buget.</p>
          </div>
        </div>

        <form onSubmit={runSearch} className="controls">
          <label>
            Plecare
            <input
              value={settings.departure}
              onChange={(event) => update('departure', event.target.value)}
              maxLength={24}
              placeholder="OTP, CLJ, TSR sau oras"
            />
          </label>

          <div className="field-grid">
            <label>
              <span><Users size={16} /> Persoane</span>
              <input type="number" min="1" max="9" value={settings.people} onChange={(event) => update('people', event.target.value)} />
            </label>
            <label>
              <span><CircleDollarSign size={16} /> Pret maxim</span>
              <input type="number" min="1" value={settings.maxPrice} onChange={(event) => update('maxPrice', event.target.value)} />
            </label>
          </div>

          <label>
            Moneda
            <select value={settings.currency} onChange={(event) => update('currency', event.target.value)}>
              <option>EUR</option>
              <option>USD</option>
              <option>RON</option>
              <option>GBP</option>
            </select>
          </label>

          <div className="duration-group" aria-label="Numar de nopti variabil">
            <span><CalendarDays size={16} /> Numar de nopti</span>
            {durationOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={settings.travelDurations.includes(option.value) ? 'toggle active' : 'toggle'}
                onClick={() => toggleDuration(option.value)}
              >
                <strong>{option.label}</strong>
                <small>{option.note}</small>
              </button>
            ))}
          </div>

          <div className="actions">
            <button type="submit" disabled={isSearching}>
              <Search size={18} />
              Cauta oriunde
            </button>
            {isSearching && (
              <button type="button" className="ghost" onClick={stopSearch}>
                <X size={18} />
                Stop
              </button>
            )}
          </div>
        </form>

        <div className="usage-panel">
          <div className="usage-header">
            <span>SerpApi quota</span>
            <button type="button" className="icon-button" onClick={refreshUsage} disabled={isUsageLoading} title="Actualizeaza quota">
              <RefreshCcw size={16} />
            </button>
          </div>

          <div className="usage-grid">
            <div>
              <strong>{usage ? usage.hourLeft : '-'}</strong>
              <span>ramase ora</span>
            </div>
            <div>
              <strong>{usage ? usage.monthLeft : '-'}</strong>
              <span>ramase luna</span>
            </div>
          </div>

          <p>{usageNotice}</p>
          <small>O cautare curenta consuma estimativ {searchCost} searches.</small>
          {usage && (
            <small>
              Mai incap aproximativ {Math.floor(usage.monthLeft / searchCost)} cautari ca aceasta luna asta.
            </small>
          )}
        </div>
      </section>

      <section className="results-panel">
        <div className="results-header">
          <div>
            <p className="eyebrow">Urmatoarele 6 luni</p>
            <h2>Destinatii sub {formatMoney(Number(settings.maxPrice), settings.currency)}</h2>
          </div>
          <div className="count-pill">{visibleFlights.length}</div>
        </div>

        <div className="notice">
          <span>{notice}</span>
          {progress && <strong>{progress.completed}/{progress.total}</strong>}
        </div>

        <div className="flight-list">
          {visibleFlights.map((flight) => {
            const nights = getNights(flight);

            return (
              <article className="flight-card" key={flight.id}>
                <div className="price-block">
                  <strong>{formatMoney(flight.price, flight.currency)}</strong>
                  <span>{settings.people} pers.</span>
                </div>
                <div className="flight-main">
                  <h3>{flight.destination}{flight.airport ? ` (${flight.airport})` : ''}</h3>
                  <p>{flight.country} - {flight.airline}</p>
                  <div className="meta-row">
                    <span><CalendarDays size={15} /> {formatDate(flight.outboundDate)} - {formatDate(flight.returnDate)}</span>
                    {nights && <span>{nights} nopti</span>}
                    <span><Clock3 size={15} /> {flight.duration}</span>
                    <span>{flight.stops}</span>
                  </div>
                </div>
                <a className="open-link" href={flight.bookingUrl} target="_blank" rel="noreferrer" title="Deschide in Google Flights">
                  <ChevronRight size={22} />
                </a>
              </article>
            );
          })}

          {!visibleFlights.length && (
            <div className="empty-state">
              <Globe2 size={30} />
              <h3>Nimic sub buget inca</h3>
              <p>Mareste pretul maxim, schimba numarul de nopti sau incearca alt aeroport de plecare.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
