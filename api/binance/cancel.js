import crypto from 'crypto';

const BINANCE_API = 'https://api.binance.com';

function createSignature(queryString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, symbol, orderId } = req.body;
    const apiSecret = process.env.BINANCE_API_SECRET || req.body.apiSecret;

    if (!apiKey || !apiSecret || !symbol || !orderId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const timestamp = Date.now();
    const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = createSignature(queryString, apiSecret);

    const response = await fetch(
      `${BINANCE_API}/api/v3/order?${queryString}&signature=${signature}`,
      {
        method: 'DELETE',
        headers: {
          'X-MBX-APIKEY': apiKey
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.msg || 'Failed to cancel order' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Cancel API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
