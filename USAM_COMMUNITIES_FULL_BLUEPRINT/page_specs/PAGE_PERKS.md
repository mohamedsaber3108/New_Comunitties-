# Page spec — Member Perks

## Route and audience

- Route: `/perks`
- Audience: public catalog; applications require an authenticated active paid subscription.
- Navigation: public desktop/mobile navigation and footer; intentionally outside the dashboard sidebar.

## Purpose

Give members one place to discover USAM company credits and request USAM-assisted applications to selected external startup programs. Catalog visibility does not imply approval, partnership or guaranteed value.

## Content and states

- Premium bilingual hero with the USAM-companies value range.
- USAM catalog: USAM products, Flowly, Wasl, Rsmo and ForgeX.
- Assisted external-program catalog plus clearly labelled interest-list entries.
- Search and filters for source, Cloud & AI and growth.
- Free-member paywall with pricing handoff.
- Paid-member application drawer: project name, website, stage, use case and consent.
- Member application history and statuses.
- Empty, loading, error, submitted and duplicate-application states.

## Backend contract

- `GET /api/v1/perks`
- `GET /api/v1/my-perk-applications`
- `POST /api/v1/perks/:id/apply`
- Admin: catalog, application queue and state transitions.

## Rules

- Active paid subscription is checked server-side before application creation.
- One application per member and perk.
- External providers retain final eligibility, value and approval decisions.
- USAM-managed credits are reviewed against need, availability and stated use.

## Status

`IMPLEMENTED_TESTED`
