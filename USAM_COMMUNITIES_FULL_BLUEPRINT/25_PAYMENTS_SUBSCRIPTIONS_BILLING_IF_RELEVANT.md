# Payments, Subscriptions and Billing

**Purpose:** Implemented foundation and live-payment gate  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Four plans and monthly/annual selection are implemented. Free activates immediately. Paid requests create `pending_payment` subscriptions and idempotent payment attempts; they do not claim a charge occurred. Admin activation is explicit, audited and forbidden to normal members. Cancellation closes current access state.

Target lifecycle: created → pending → paid/active → past_due → canceled/expired; payment may also fail/refund. Paymob is the verified Egypt-oriented candidate. Before live use: merchant approval, sandbox, hosted checkout, HMAC webhook validation, unique event IDs, reconciliation, refund/cancellation policy approval, tax invoice decision and secret rotation. Never store PAN/CVV.

