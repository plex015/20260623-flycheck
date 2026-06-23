const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
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
    const travelDuration = String(body.travelDuration || '1');

    if (!departure) {
      sendJson(response, 400, { error: 'Alege aeroportul sau orasul de plecare.' });
      return;
    }

    const params = new URLSearchParams({
      engine: 'google_travel_explore',
      api_key: process.env.SERPAPI_KEY,
      departure_id: departure,
      adults: String(people),
      currency,
      type: '1',
      month: '0',
      travel_duration: travelDuration,
      travel_mode: '1',
      hl: 'ro',
      gl: 'ro',
      max_price: String(maxPrice),
    });

    const serpResponse = await fetch(`${SERPAPI_ENDPOINT}?${params.toString()}`);
    const data = await serpResponse.json();

    if (!serpResponse.ok || data.error) {
      sendJson(response, serpResponse.status || 502, {
        error: data.error || 'SerpApi nu a returnat rezultate.',
      });
      return;
    }

    sendJson(response, 200, { destinations: data.destinations || [] });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Eroare necunoscuta.' });
  }
}
