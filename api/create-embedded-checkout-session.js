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

const PLAN_ENV = {
  Starter: 'STRIPE_PRICE_BUILD_STARTER_ONETIME',
  Growth: 'STRIPE_PRICE_BUILD_GROWTH_ONETIME',
  BackendGrowth: 'STRIPE_PRICE_BACKEND_GROWTH_ONETIME',
  Pro: 'STRIPE_PRICE_BUILD_PRO_ONETIME',
  Elite: 'STRIPE_PRICE_BUILD_ELITE_ONETIME',
  CareBasic: 'STRIPE_PRICE_CARE_BASIC_MONTHLY',
  CareStandard: 'STRIPE_PRICE_CARE_STANDARD_MONTHLY',
  CarePriority: 'STRIPE_PRICE_CARE_PRIORITY_MONTHLY',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-04-22.dahlia',
    });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const plan = body && body.plan;
    const envKey = PLAN_ENV[plan];
    if (!envKey) return json(res, 400, { error: 'Invalid plan' });

    const priceId = requireEnv(envKey);
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;

    const isSubscription = String(plan).startsWith('Care');

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${appUrl}/?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
      customer_creation: 'always',
      metadata: { plan },
    });

    return json(res, 200, { clientSecret: session.client_secret });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
  }
};

