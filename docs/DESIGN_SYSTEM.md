# Design system

The supplied USAM reference was visually inspected on 26 October 2026. Its actual public appearance uses an off-white background, deep green text and buttons, a teal emphasis, and restrained gold details. This implementation uses the official public USAM wordmark downloaded from `https://usamif.com/brand/usam-wordmark.png`, plus a separate Communities label. It has no access to prior Hub approved screenshots; this is a new interpretation of the supplied brand, not a claim that it preserves an unseen existing screen.

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--bg` | `#f7f8f6` | `#081c1b` | page |
| `--surface` | `#ffffff` | `#12302c` | cards |
| `--ink` | `#092522` | `#e9f5ef` | text |
| `--accent` | `#16736d` | `#68c3b4` | emphasis and actions |
| `--line` | `#d9e1dc` | `#31524b` | borders |
| `--dark` | `#082f2c` | `#e9f5ef` | dark brand surface |
| gold detail | `#d9ad47` | `#d9ad47` | selective highlight |

The four community surfaces use pale gold, teal, grey and sage treatments. Fonts: Tajawal for Arabic, DM Sans and Manrope for English. Main grid width is 1380px; responsive breakpoints are 1150px, 800px and 560px. Semantic regions, keyboard focus and reduced-motion preference are implemented. Visual screenshots and contrast audits of this local build remain unverified because the available cloud browser could not connect to the local server.
