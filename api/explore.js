const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const DEALS_DURATION_BY_UI_VALUE = {
  1: '2',
  2: '1',
  3: '3',
};
const ROUTE_FALLBACK_AIRPORTS = [
  { code: 'BGY', city: 'Bergamo / Milano', country: 'Italia' },
  { code: 'FCO', city: 'Roma', country: 'Italia' },
  { code: 'ATH', city: 'Atena', country: 'Grecia' },
  { code: 'VIE', city: 'Viena', country: 'Austria' },
];
const NIGHTS_BY_UI_VALUE = {
  1: 3,
  2: 7,
  3: 14,
};

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

async function fetchSerpApi(params) {
  const serpResponse = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`);
  const data = await serpResponse.json();
  return { serpResponse, data };
}

function getUrlParam(url, key) {
  if (!url) return '';

  try {
    return new URL(url).searchParams.get(key) || '';
  } catch {
    return '';
  }
}

function getDealDate(deal, directKey, serpApiKey) {
  return (
    deal[directKey] ||
    getUrlParam(deal.serpapi_flight_link, serpApiKey) ||
    getUrlParam(deal.flight_link, serpApiKey)
  );
}

function normalizeDeals(deals, people) {
  return (deals || []).map((deal) => ({
    destination_id: deal.destination_id,
    name: deal.name,
    country: deal.country,
    destination_airport: { code: deal.arrival_airport_code || '' },
    start_date: getDealDate(deal, 'start_date', 'outbound_date'),
    end_date: getDealDate(deal, 'end_date', 'return_date'),
    flight_price: Number(deal.price) * people,
    flight_price_per_person: deal.price,
    flight_duration: deal.flight_duration,
    number_of_stops: deal.stops,
    airline: deal.airline,
    airline_code: deal.airline_code,
    link: deal.flight_link || deal.serpapi_flight_link,
    serpapi_link: deal.serpapi_flight_link,
    thumbnail: deal.thumbnail,
    description: deal.description,
    highlights: deal.highlights,
  }));
}

function isoDateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeFlightOption(option, destination, outboundDate, returnDate) {
  const legs = option.flights || [];
  const firstLeg = legs[0] || {};
  const lastLeg = legs[legs.length - 1] || {};
  const arrivalAirport = lastLeg.arrival_airport || {};
  const airportCode = arrivalAirport.id || destination.code;

  return {
    destination_id: airportCode,
    name: destination.city || arrivalAirport.name || airportCode,
    country: destination.country || '',
    destination_airport: { code: airportCode },
    start_date: outboundDate,
    end_date: returnDate,
    flight_price: option.price,
    flight_duration: option.total_duration,
    number_of_stops: Math.max(0, legs.length - 1),
    airline: firstLeg.airline || 'Google Flights',
    airline_code: '',
    link: 'https://www.google.com/travel/flights',
  };
}

async function fetchRouteFallback({ departure, people, currency, maxPrice, travelDuration }) {
  const outboundDate = isoDateAfter(45);
  const returnDate = isoDateAfter(45 + (NIGHTS_BY_UI_VALUE[travelDuration] || 7));

  const searches = ROUTE_FALLBACK_AIRPORTS.map(async (destination) => {
    const params = new URLSearchParams({
      engine: 'google_flights',
      api_key: process.env.SERPAPI_KEY,
      departure_id: departure,
      arrival_id: destination.code,
      outbound_date: outboundDate,
      return_date: returnDate,
      adults: String(people),
      currency,
      type: '1',
      sort_by: '2',
      max_price: String(maxPrice),
      hl: 'en',
      gl: 'us',
    });

    const { serpResponse, data } = await fetchSerpApi(params);
    if (!serpResponse.ok || data.error) return null;

    const options = [...(data.best_flights || []), ...(data.other_flights || [])]
      .filter((option) => Number(option.price) > 0)
      .sort((a, b) => Number(a.price) - Number(b.price));

    return options[0] ? normalizeFlightOption(options[0], destination, outboundDate, returnDate) : null;
  });

  const settled = await Promise.allSettled(searches);
  return settled
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value)
    .sort((a, b) => Number(a.flight_price) - Number(b.flight_price));
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Metoda nepermisa.' });
    return;
  }

  if (!process.env.SERPAPI_KEY) {
    sendJson(response, 500, { error: 'Lipseste variabila de mediu SERPAPI_KEY pe server.' });
    return;
  }

  try {
    const body = request.body || {};
    const departure = String(body.departure || '').trim().toUpperCase();
    const people = Math.max(1, Math.min(9, Number(body.people || 1)));
    const currency = String(body.currency || 'EUR').trim().toUpperCase();
    const maxPrice = Math.max(1, Number(body.maxPrice || 250));
    const maxPricePerPerson = Math.max(1, Math.floor(maxPrice / people));
    const travelDuration = String(body.travelDuration || '1');
    const debug = Boolean(body.debug);

    if (!departure) {
      sendJson(response, 400, { error: 'Alege aeroportul sau orasul de plecare.' });
      return;
    }

    const baseParams = {
      engine: 'google_flights_deals',
      api_key: process.env.SERPAPI_KEY,
      departure_id: departure,
      currency,
      hl: 'en',
      gl: 'us',
    };

    const attempts = [
      {
        ...baseParams,
        type: '1',
        adults: String(people),
        travel_duration: DEALS_DURATION_BY_UI_VALUE[travelDuration] || travelDuration,
        max_price: String(maxPricePerPerson),
      },
      {
        ...baseParams,
        type: '1',
        adults: String(people),
        max_price: String(maxPricePerPerson),
      },
      baseParams,
    ];

    let lastData = null;
    let lastStatus = 502;
    let usedAttempt = null;
    const errors = [];

    for (const attempt of attempts) {
      const params = new URLSearchParams(attempt);
      const { serpResponse, data } = await fetchSerpApi(params);
      lastData = data;
      lastStatus = serpResponse.status;

      if (!serpResponse.ok || data.error) {
        errors.push(data.error || `SerpApi HTTP ${serpResponse.status}`);
        usedAttempt = attempt;
        continue;
      }

      if (Array.isArray(data.deals) && data.deals.length) {
        const destinations = normalizeDeals(data.deals, people)
          .filter((destination) => Number(destination.flight_price) <= maxPrice);
        sendJson(response, 200, {
          destinations,
          source: 'google_flights_deals',
          price_basis: 'group_total',
          fallback: attempt === baseParams ? 'minimal' : 'filtered',
          ...(debug
            ? {
                debug: {
                  keys: Object.keys(data),
                  status: data.search_metadata?.status,
                  parameters: data.search_parameters,
                  dealsCount: data.deals.length,
                },
              }
            : {}),
        });
        return;
      }

      usedAttempt = attempt;
    }

    if (lastData?.error || !lastData) {
      const routeFallback = await fetchRouteFallback({
        departure,
        people,
        currency,
        maxPrice,
        travelDuration,
      });

      if (routeFallback.length) {
        sendJson(response, 200, {
          destinations: routeFallback,
          source: 'google_flights_route_fallback',
          fallback: 'routes',
          ...(debug ? { attempts: errors } : {}),
        });
        return;
      }

      sendJson(response, lastStatus === 200 ? 424 : lastStatus, {
        error: errors.find(Boolean) || lastData?.error || 'SerpApi nu a returnat rezultate.',
        ...(debug ? { attempts: errors } : {}),
      });
      return;
    }

    const routeFallback = await fetchRouteFallback({
      departure,
      people,
      currency,
      maxPrice,
      travelDuration,
    });

    if (routeFallback.length) {
      sendJson(response, 200, {
        destinations: routeFallback,
        source: 'google_flights_route_fallback',
        fallback: 'routes',
        ...(debug
          ? {
              debug: {
                keys: Object.keys(lastData),
                status: lastData.search_metadata?.status,
                parameters: lastData.search_parameters || usedAttempt,
                dealsCount: Array.isArray(lastData.deals) ? lastData.deals.length : null,
              },
            }
          : {}),
      });
      return;
    }

    sendJson(response, 200, {
      destinations: [],
      source: 'google_flights_deals',
      ...(debug
        ? {
            debug: {
              keys: Object.keys(lastData),
              status: lastData.search_metadata?.status,
              parameters: lastData.search_parameters || usedAttempt,
              dealsCount: Array.isArray(lastData.deals) ? lastData.deals.length : null,
            },
          }
        : {}),
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Eroare necunoscuta.' });
  }
}
