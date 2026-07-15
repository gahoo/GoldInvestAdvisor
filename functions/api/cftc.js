export async function onRequest({ request }) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol') || '088691'; // Default to GOLD
  const limit = url.searchParams.get('limit') || '1000';

  try {
    // Socrata open data API (不需要 API key，但可能会有频率限制)
    const targetUrl = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?cftc_contract_market_code=${symbol}&$order=report_date_as_yyyy_mm_dd DESC&$limit=${limit}`;
    
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!res.ok) {
      throw new Error(`CFTC API error: ${res.status}`);
    }

    const data = await res.json();

    return new Response(JSON.stringify({ success: true, data }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400' // Cache for 24 hours at the Edge since it only updates weekly
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
