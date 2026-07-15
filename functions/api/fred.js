export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const seriesId = url.searchParams.get('series_id');

  if (!seriesId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing series_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    let dataPoints = [];

    // Check if API key is configured
    if (env.FRED_API_KEY) {
      // Use Official API
      const apiUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${env.FRED_API_KEY}&file_type=json`;
      const res = await fetch(apiUrl);
      
      if (!res.ok) {
        throw new Error(`FRED API error: ${res.status}`);
      }
      
      const data = await res.json();
      if (data.observations) {
        dataPoints = data.observations.map(obs => ({
          date: obs.date,
          value: parseFloat(obs.value)
        })).filter(obs => !isNaN(obs.value));
      }
    } else {
      // Fallback: Use CSV graph download
      const csvUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
      const res = await fetch(csvUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (!res.ok) {
        throw new Error(`FRED CSV error: ${res.status}`);
      }
      
      const csvText = await res.text();
      const lines = csvText.split('\n');
      
      // First line is header: DATE, M2SL
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [dateStr, valueStr] = line.split(',');
        const value = parseFloat(valueStr);
        if (!isNaN(value)) {
          dataPoints.push({
            date: dateStr,
            value: value
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, data: dataPoints }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
