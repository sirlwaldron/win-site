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

// Plan key -> [env var name, fallback price ID].
// Stripe price IDs are public identifiers (not secrets), so fallbacks are safe to keep in code.
const PLANS = {
  Starter: ['STRIPE_PRICE_BUILD_STARTER_ONETIME'],
  Growth: ['STRIPE_PRICE_BUILD_GROWTH_ONETIME'],
  BackendGrowth: ['STRIPE_PRICE_BACKEND_GROWTH_ONETIME'],
  HostingHandsOff: ['STRIPE_PRICE_HOSTING_HANDSOFF_MONTHLY', 'price_1TUqlB2KV2wDniiLT5X8j83D'],
  HostingSmallBusiness: ['STRIPE_PRICE_HOSTING_SMALLBUSINESS_MONTHLY', 'price_1TUqlC2KV2wDniiLZp48cWw3'],
  HostingEcommerce: ['STRIPE_PRICE_HOSTING_ECOMMERCE_MONTHLY', 'price_1TUqwL2KV2wDniiLoboCts6d'],
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-04-22.dahlia',
    });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const plan = body && body.plan;
    const cfg = Object.prototype.hasOwnProperty.call(PLANS, plan) ? PLANS[plan] : null;
    if (!cfg) return json(res, 400, { error: 'Invalid plan' });

    const priceId = process.env[cfg[0]] || cfg[1] || requireEnv(cfg[0]);
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`;

    // Recurring prices must use subscription mode; one-time prices use payment mode.
    const price = await stripe.prices.retrieve(priceId);
    const isSubscription = !!price.recurring;

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${appUrl}/?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
      ...(isSubscription ? {} : { customer_creation: 'always' }),
      metadata: { plan },
    });

    return json(res, 200, { clientSecret: session.client_secret });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
  }
};

