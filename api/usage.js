const ACCOUNT_ENDPOINT = 'https://serpapi.com/account.json';

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Metoda nepermisa.' });
    return;
  }

  if (!process.env.SERPAPI_KEY) {
    sendJson(response, 500, { error: 'Lipseste variabila de mediu SERPAPI_KEY pe server.' });
    return;
  }

  try {
    const params = new URLSearchParams({ api_key: process.env.SERPAPI_KEY });
    const accountResponse = await fetch(`${ACCOUNT_ENDPOINT}?${params.toString()}`);
    const account = await accountResponse.json();

    if (!accountResponse.ok || account.error) {
      sendJson(response, accountResponse.status || 502, {
        error: account.error || 'SerpApi Account API nu a raspuns.',
      });
      return;
    }

    const hourLimit = Number(account.account_rate_limit_per_hour || 0);
    const hourUsed = Number(account.last_hour_searches || 0);
    const monthLimit = Number(account.searches_per_month || 0);
    const monthUsed = Number(account.this_month_usage || 0);
    const monthLeft = Number(account.total_searches_left ?? account.plan_searches_left ?? 0);

    sendJson(response, 200, {
      planName: account.plan_name || account.plan_id || 'SerpApi',
      hourLimit,
      hourUsed,
      hourLeft: Math.max(0, hourLimit - hourUsed),
      monthLimit,
      monthUsed,
      monthLeft,
      extraCredits: Number(account.extra_credits || 0),
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Eroare necunoscuta.' });
  }
}
