import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Plane,
  Search,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import './styles.css';

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const todayIso = () => new Date().toISOString().slice(0, 10);

const addDays = (date, days) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};

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

const sampleFlights = [
  {
    id: 'demo-1',
    price: 148,
    currency: 'EUR',
    outboundDate: addDays(todayIso(), 18),
    returnDate: addDays(todayIso(), 23),
    airline: 'Wizz Air',
    route: 'OTP -> BCN',
    duration: '3h 20m',
    stops: 'Direct',
    bookingUrl: 'https://www.google.com/travel/flights',
  },
  {
    id: 'demo-2',
    price: 212,
    currency: 'EUR',
    outboundDate: addDays(todayIso(), 47),
    returnDate: addDays(todayIso(), 54),
    airline: 'Lufthansa',
    route: 'OTP -> BCN',
    duration: '5h 45m',
    stops: '1 stop',
    bookingUrl: 'https://www.google.com/travel/flights',
  },
  {
    id: 'demo-3',
    price: 176,
    currency: 'EUR',
    outboundDate: addDays(todayIso(), 91),
    returnDate: addDays(todayIso(), 96),
    airline: 'Ryanair',
    route: 'OTP -> BCN',
    duration: '3h 15m',
    stops: 'Direct',
    bookingUrl: 'https://www.google.com/travel/flights',
  },
];

function buildDateWindow(startDate, monthsAhead, stepDays) {
  const dates = [];
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + monthsAhead);

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + stepDays)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}

function extractFlight(result, context, index) {
  const firstLeg = result.flights?.[0];
  const lastLeg = result.flights?.[result.flights.length - 1];
  const route = firstLeg?.departure_airport?.id && lastLeg?.arrival_airport?.id
    ? `${firstLeg.departure_airport.id} -> ${lastLeg.arrival_airport.id}`
    : `${context.departure} -> ${context.arrival}`;

  const stops = result.flights?.length > 1 ? `${result.flights.length - 1} stop` : 'Direct';
  const bookingUrl = result.booking_token
    ? `https://www.google.com/travel/flights/booking?tfs=${encodeURIComponent(result.booking_token)}`
    : 'https://www.google.com/travel/flights';

  return {
    id: `${context.outboundDate}-${index}-${result.price}`,
    price: Number(result.price),
    currency: context.currency,
    outboundDate: context.outboundDate,
    returnDate: context.returnDate,
    airline: firstLeg?.airline || result.airline_logo ? firstLeg?.airline || 'Google Flights' : 'Google Flights',
    route,
    duration: result.total_duration ? `${Math.floor(result.total_duration / 60)}h ${result.total_duration % 60}m` : 'Durata indisponibila',
    stops,
    bookingUrl,
  };
}

async function fetchFlightsForDate(settings, outboundDate, signal) {
  const returnDate = settings.tripType === 'round'
    ? addDays(outboundDate, Number(settings.stayDays))
    : undefined;

  const params = new URLSearchParams({
    engine: 'google_flights',
    api_key: settings.apiKey,
    departure_id: settings.departure.trim().toUpperCase(),
    arrival_id: settings.arrival.trim().toUpperCase(),
    outbound_date: outboundDate,
    adults: String(settings.people),
    currency: settings.currency,
    type: settings.tripType === 'round' ? '1' : '2',
    hl: 'ro',
    gl: 'ro',
    max_price: String(settings.maxPrice),
  });

  if (returnDate) params.set('return_date', returnDate);

  const response = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(`SerpApi ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  return [...(data.best_flights || []), ...(data.other_flights || [])]
    .map((flight, index) => extractFlight(flight, {
      departure: settings.departure,
      arrival: settings.arrival,
      currency: settings.currency,
      outboundDate,
      returnDate,
    }, index))
    .filter((flight) => flight.price > 0 && flight.price <= Number(settings.maxPrice));
}

async function scanFlights(settings, onProgress, signal) {
  const dates = buildDateWindow(settings.startDate, 6, Number(settings.stepDays));
  const results = [];
  let completed = 0;

  for (const date of dates) {
    if (signal.aborted) break;

    try {
      const dailyFlights = await fetchFlightsForDate(settings, date, signal);
      results.push(...dailyFlights);
    } catch (error) {
      results.push({
        id: `error-${date}`,
        error: error.message,
        outboundDate: date,
      });
    }

    completed += 1;
    onProgress({ completed, total: dates.length });
  }

  return results
    .filter((flight) => !flight.error)
    .sort((a, b) => a.price - b.price || a.outboundDate.localeCompare(b.outboundDate));
}

function App() {
  const [settings, setSettings] = useState({
    apiKey: localStorage.getItem('flycheck-serpapi-key') || '',
    departure: 'OTP',
    arrival: 'BCN',
    people: 2,
    maxPrice: 250,
    currency: 'EUR',
    tripType: 'round',
    stayDays: 5,
    stepDays: 7,
    startDate: todayIso(),
  });
  const [flights, setFlights] = useState(sampleFlights);
  const [progress, setProgress] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [notice, setNotice] = useState('Mod demo: adauga cheia SerpApi pentru rezultate live din Google Flights.');
  const [controller, setController] = useState(null);

  const visibleFlights = useMemo(
    () => flights.filter((flight) => flight.price <= Number(settings.maxPrice)),
    [flights, settings.maxPrice],
  );

  const update = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const runSearch = async (event) => {
    event.preventDefault();

    if (!settings.apiKey.trim()) {
      setFlights(sampleFlights.filter((flight) => flight.price <= Number(settings.maxPrice)));
      setNotice('Rezultate demo. Pentru cautare live, introdu cheia SerpApi si ruleaza din nou.');
      return;
    }

    localStorage.setItem('flycheck-serpapi-key', settings.apiKey.trim());
    const activeController = new AbortController();
    setController(activeController);
    setIsSearching(true);
    setNotice('Caut rezultate live in urmatoarele 6 luni.');
    setProgress({ completed: 0, total: buildDateWindow(settings.startDate, 6, Number(settings.stepDays)).length });

    try {
      const liveFlights = await scanFlights(settings, setProgress, activeController.signal);
      setFlights(liveFlights);
      setNotice(liveFlights.length ? `Am gasit ${liveFlights.length} zboruri sub pretul ales.` : 'Nu am gasit zboruri sub pretul ales.');
    } catch (error) {
      setNotice(error.message);
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
            <p>Scaneaza Google Flights pe 6 luni si pastreaza tarifele sub buget.</p>
          </div>
        </div>

        <form onSubmit={runSearch} className="controls">
          <label>
            Cheie SerpApi
            <input
              type="password"
              value={settings.apiKey}
              onChange={(event) => update('apiKey', event.target.value)}
              placeholder="opțional pentru demo"
            />
          </label>

          <div className="field-grid">
            <label>
              Plecare
              <input value={settings.departure} onChange={(event) => update('departure', event.target.value)} maxLength={3} />
            </label>
            <label>
              Destinatie
              <input value={settings.arrival} onChange={(event) => update('arrival', event.target.value)} maxLength={3} />
            </label>
          </div>

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

          <div className="field-grid">
            <label>
              Moneda
              <select value={settings.currency} onChange={(event) => update('currency', event.target.value)}>
                <option>EUR</option>
                <option>USD</option>
                <option>RON</option>
                <option>GBP</option>
              </select>
            </label>
            <label>
              Tip zbor
              <select value={settings.tripType} onChange={(event) => update('tripType', event.target.value)}>
                <option value="round">Dus-intors</option>
                <option value="one">Doar dus</option>
              </select>
            </label>
          </div>

          <div className="field-grid">
            <label>
              <span><CalendarDays size={16} /> Start</span>
              <input type="date" value={settings.startDate} onChange={(event) => update('startDate', event.target.value)} />
            </label>
            <label>
              Nopti
              <input type="number" min="1" max="60" disabled={settings.tripType !== 'round'} value={settings.stayDays} onChange={(event) => update('stayDays', event.target.value)} />
            </label>
          </div>

          <label>
            <span><Settings2 size={16} /> Pas scanare</span>
            <select value={settings.stepDays} onChange={(event) => update('stepDays', event.target.value)}>
              <option value="1">Zilnic</option>
              <option value="3">La 3 zile</option>
              <option value="7">Saptamanal</option>
              <option value="14">La 2 saptamani</option>
            </select>
          </label>

          <div className="actions">
            <button type="submit" disabled={isSearching}>
              <Search size={18} />
              Cauta
            </button>
            {isSearching && (
              <button type="button" className="ghost" onClick={stopSearch}>
                <X size={18} />
                Stop
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="results-panel">
        <div className="results-header">
          <div>
            <p className="eyebrow">Urmatoarele 6 luni</p>
            <h2>Zboruri sub {formatMoney(Number(settings.maxPrice), settings.currency)}</h2>
          </div>
          <div className="count-pill">{visibleFlights.length}</div>
        </div>

        <div className="notice">
          <span>{notice}</span>
          {progress && <strong>{progress.completed}/{progress.total}</strong>}
        </div>

        <div className="flight-list">
          {visibleFlights.map((flight) => (
            <article className="flight-card" key={flight.id}>
              <div className="price-block">
                <strong>{formatMoney(flight.price, flight.currency)}</strong>
                <span>{settings.people} pers.</span>
              </div>
              <div className="flight-main">
                <h3>{flight.route}</h3>
                <p>{flight.airline}</p>
                <div className="meta-row">
                  <span><CalendarDays size={15} /> {formatDate(flight.outboundDate)}{flight.returnDate ? ` - ${formatDate(flight.returnDate)}` : ''}</span>
                  <span><Clock3 size={15} /> {flight.duration}</span>
                  <span>{flight.stops}</span>
                </div>
              </div>
              <a className="open-link" href={flight.bookingUrl} target="_blank" rel="noreferrer" title="Deschide in Google Flights">
                <ChevronRight size={22} />
              </a>
            </article>
          ))}

          {!visibleFlights.length && (
            <div className="empty-state">
              <Plane size={30} />
              <h3>Nimic sub buget inca</h3>
              <p>Mareste pretul maxim, schimba pasul de scanare sau incearca o alta ruta.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
