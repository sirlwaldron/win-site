const Stripe = require('stripe');

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
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

// return_url is built from this fixed allowlist, never from request headers or env vars.
const RETURN_ORIGINS = ['https://waldronhq.com', 'https://www.waldronhq.com'];
const DEFAULT_RETURN_ORIGIN = 'https://waldronhq.com';

// Only our own pages may start checkout. Browsers always send Origin on a cross-origin or same-origin POST fetch,
// so a missing or foreign Origin (curl, another site) is refused.
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }
  if (!isSameOrigin(req)) return json(res, 403, { error: 'Forbidden' });

  // Reading req.body throws on malformed JSON, which is the caller's mistake (400), not a server fault.
  let plan;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    plan = body && body.plan;
  } catch (e) {
    return json(res, 400, { error: 'Invalid request' });
  }
  const cfg = typeof plan === 'string' && Object.prototype.hasOwnProperty.call(PLANS, plan) ? PLANS[plan] : null;
  if (!cfg) return json(res, 400, { error: 'Invalid plan' });

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env[cfg[0]] || cfg[1];
    if (!secretKey || !priceId) throw new Error('Checkout is not configured for plan ' + plan);

    const stripe = new Stripe(secretKey, { apiVersion: '2026-04-22.dahlia' });
    const appUrl = RETURN_ORIGINS.includes(req.headers.origin) ? req.headers.origin : DEFAULT_RETURN_ORIGIN;

    // Recurring prices must use subscription mode; one-time prices use payment mode.
    const price = await stripe.prices.retrieve(priceId);
    const isSubscription = !!price.recurring;

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      // Card payments finish in place (the page shows a thank-you panel); only redirect-based methods use return_url.
      redirect_on_completion: 'if_required',
      return_url: `${appUrl}/?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
      custom_text: { submit: { message: 'By paying, you agree to our [Terms of Service](https://waldronhq.com/terms).' } },
      ...(isSubscription ? {} : { customer_creation: 'always' }),
      metadata: { plan },
    });

    return json(res, 200, { clientSecret: session.client_secret });
  } catch (err) {
    // Details stay in the server log; callers only get a generic message.
    console.error('create-embedded-checkout-session failed:', err && err.message ? err.message : err);
    return json(res, 500, { error: 'Checkout is unavailable right now.' });
  }
};
