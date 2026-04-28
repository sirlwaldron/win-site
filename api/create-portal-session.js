const Stripe = require('stripe');

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function isEmailLike(s) {
  const v = String(s || '').trim();
  return v.length >= 5 && v.includes('@') && v.includes('.');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-04-22.dahlia',
    });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = body && body.email;
    if (!isEmailLike(email)) return json(res, 400, { error: 'Please enter a valid email.' });

    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;

    const customers = await stripe.customers.list({
      email: String(email).trim(),
      limit: 10,
    });

    if (!customers.data.length) {
      return json(res, 404, { error: 'No Stripe customer found for that email.' });
    }

    // Prefer the most recently created customer.
    const customer = customers.data.sort((a, b) => (b.created || 0) - (a.created || 0))[0];

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${appUrl}/`,
    });

    return json(res, 200, { url: portal.url });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
  }
};

