# Frontend implementation

## Stack and structure

- React 19, React DOM 19, React Router 7, Vite 7 and Lucide React.
- `src/main.jsx`: route tree, layouts, pages and stateful UI.
- `src/style.css`: design tokens, all component and responsive styling.
- `src/preview-api.js`: browser-local hosted adapter.
- `src/resources-data.js`: eight bilingual guides.
- `src/hub-content.js`: programs, curated rooms and partnership models.

`VITE_SITE_PREVIEW=true` selects HashRouter and the browser-local adapter for static hosting. The EC2 build selects BrowserRouter and `/api/v1`. The same UI is used in both modes.

## State, error and access behavior

App context owns locale, direction, theme, current user and toasts. `useData` supplies loading/error/data state. Protected pages render sign-in/onboarding when no member is present. Mutation controls check identity before calling the API. The server remains authoritative for roles and ownership.

## Accessibility and responsive baseline

Skip links, landmark elements, accessible names, focus outlines, form labels, semantic details/summary, keyboard search shortcut and responsive shells are implemented. RTL uses `dir` at the document root. Remaining work: automated axe checks, screen-reader walkthroughs, focus-trap review, 200% zoom, forced-colors and complete mobile breakpoint screenshots.

## No-dead-button review

Primary CTAs route to implemented pages or explicitly external USAM products. Mutating controls call API handlers. Provider-gated capabilities such as paid ticket checkout, AI generation and password recovery are not displayed as working controls.

