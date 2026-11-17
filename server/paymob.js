// -------------------------------------------------------------------------
// Paymob (Accept) payment integration for the Egyptian market.
//
// Implements the documented Accept flow:
//   1. POST /auth/tokens            -> auth token
//   2. POST /ecommerce/orders       -> order id (idempotent via merchant ref)
//   3. POST /acceptance/payment_keys-> payment key
//   4. Build iframe checkout URL
//
// Webhook callbacks are verified with HMAC-SHA512 over the Paymob-ordered
// field concatenation (see verifyHmac). Amounts are handled in piasters
// (EGP * 100) as Paymob requires.
//
// When credentials are absent (config.paymob.configured === false) the module
// exposes isConfigured()=false and callers must NOT attempt live calls; the
// subscription flow keeps its existing "pending_payment" behavior so nothing
// is presented as a real charge.
// -------------------------------------------------------------------------
import crypto from "node:crypto";
import { config } from "./config.js";

export function isConfigured() {
  return config.paymob.configured && config.paymob.enabled;
}

const p = config.paymob;

async function paymobFetch(pathname, body) {
  const res = await fetch(`${p.baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.message || json?.detail || `paymob_http_${res.status}`;
    const err = new Error(String(msg));
    err.paymobStatus = res.status;
    throw err;
  }
  return json;
}

async function authenticate() {
  const json = await paymobFetch("/auth/tokens", { api_key: p.apiKey });
  return json.token;
}

// Create (or reconcile) an order. merchantOrderId makes the call idempotent:
// Paymob rejects a duplicate merchant_order_id, which we treat as "already
// created" upstream. amountEgp is in whole EGP; converted to piasters here.
async function createOrder(authToken, { amountEgp, merchantOrderId, items = [] }) {
  const json = await paymobFetch("/ecommerce/orders", {
    auth_token: authToken,
    delivery_needed: false,
    merchant_order_id: merchantOrderId,
    amount_cents: Math.round(amountEgp * 100),
    currency: p.currency,
    items,
  });
  return json.id;
}

async function paymentKey(authToken, { amountEgp, orderId, billing }) {
  const json = await paymobFetch("/acceptance/payment_keys", {
    auth_token: authToken,
    amount_cents: Math.round(amountEgp * 100),
    expiration: 3600,
    order_id: orderId,
    currency: p.currency,
    integration_id: Number(p.integrationIdCard),
    billing_data: {
      first_name: billing.firstName || "USAM",
      last_name: billing.lastName || "Member",
      email: billing.email,
      phone_number: billing.phone || "+20000000000",
      apartment: "NA",
      floor: "NA",
      street: "NA",
      building: "NA",
      shipping_method: "NA",
      postal_code: "NA",
      city: "Cairo",
      country: "EG",
      state: "NA",
    },
  });
  return json.token;
}

export function iframeUrl(token) {
  return `${p.baseUrl.replace(/\/api$/, "")}/api/acceptance/iframes/${p.iframeId}?payment_token=${token}`;
}

// DEPLOYMENT NOTE (documented here because it cannot be set per-request):
// Paymob's post-payment "Transaction redirection URL" is configured once per
// integration in the Paymob dashboard (Settings -> Payment Integrations),
// not passed in this API call. Set it to {FRONTEND_URL}/billing?payment=return
// so the frontend's BillingPage polling (which only trusts OUR webhook-verified
// state, never the redirect itself) kicks in immediately after the member
// returns from checkout. This is tracked in PRODUCTION_DEPLOYMENT_GUIDE.md.

function assertConfigured() {
  if (!isConfigured()) {
    const err = new Error("payment_provider_not_configured");
    err.code = "not_configured";
    throw err;
  }
}

// Full initialization. Returns { orderId, paymentKey, checkoutUrl }.
// `existingOrderId` lets a retry reuse the Paymob order already created for
// this attempt (Paymob rejects a second order with the same merchant_order_id).
export async function initCheckout({
  amountEgp,
  merchantOrderId,
  billing,
  items,
  existingOrderId,
}) {
  assertConfigured();
  const authToken = await authenticate();
  const orderId =
    existingOrderId ||
    (await createOrder(authToken, { amountEgp, merchantOrderId, items }));
  const token = await paymentKey(authToken, { amountEgp, orderId, billing });
  return { orderId, paymentKey: token, checkoutUrl: iframeUrl(token) };
}

// Refund (full or partial) a captured transaction. Amount in whole EGP.
// Returns the provider's refund transaction object ({ id, success, ... }).
export async function refundTransaction({ transactionId, amountEgp }) {
  assertConfigured();
  const authToken = await authenticate();
  return paymobFetch("/acceptance/void_refund/refund", {
    auth_token: authToken,
    transaction_id: Number(transactionId),
    amount_cents: Math.round(amountEgp * 100),
  });
}

// Look up the current transaction for one of our orders. Used by
// reconciliation to recover from a missed/failed webhook. Returns the
// transaction object (same shape as the webhook `obj`) or null.
export async function inquireByMerchantOrderId(merchantOrderId) {
  assertConfigured();
  const authToken = await authenticate();
  try {
    const json = await paymobFetch("/ecommerce/orders/transaction_inquiry", {
      auth_token: authToken,
      merchant_order_id: merchantOrderId,
    });
    return json && json.id ? json : null;
  } catch (err) {
    if (err.paymobStatus === 404) return null;
    throw err;
  }
}

// -------------------------------------------------------------------------
// Webhook HMAC verification.
// Paymob computes HMAC-SHA512 over a FIXED ORDER concatenation of transaction
// fields. We reproduce that order exactly and compare in constant time.
// -------------------------------------------------------------------------
const HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order",
  "owner",
  "pending",
  "source_data_pan",
  "source_data_sub_type",
  "source_data_type",
  "success",
];

export function verifyHmac(obj, providedHmac) {
  if (!p.hmacSecret || !providedHmac) return false;
  const source = obj.obj || obj; // Paymob wraps the transaction in `obj`
  const concatenated = HMAC_FIELDS.map((f) => {
    const v = pluck(source, f);
    if (typeof v === "boolean") return v ? "true" : "false";
    return v === undefined || v === null ? "" : String(v);
  }).join("");
  const computed = crypto
    .createHmac("sha512", p.hmacSecret)
    .update(concatenated)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(String(providedHmac)),
    );
  } catch {
    return false;
  }
}

// Some fields are nested (order.id, source_data.*); resolve the documented keys.
function pluck(src, field) {
  if (field === "order") return src.order?.id ?? src.order;
  if (field === "source_data_pan") return src.source_data?.pan;
  if (field === "source_data_sub_type") return src.source_data?.sub_type;
  if (field === "source_data_type") return src.source_data?.type;
  return src[field];
}

export default {
  isConfigured,
  initCheckout,
  refundTransaction,
  inquireByMerchantOrderId,
  iframeUrl,
  verifyHmac,
};
