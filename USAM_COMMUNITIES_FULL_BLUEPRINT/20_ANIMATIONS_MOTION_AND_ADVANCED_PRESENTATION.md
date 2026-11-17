# Motion and Advanced Presentation

**Purpose:** Purposeful motion map  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Keep hover lift at ~200ms, navigation/drawer transitions at ~200ms, marquee at 35s and shimmer only during data loading. Respect `prefers-reduced-motion` globally. Pricing toggle changes content without layout jump; payment state updates use toast plus persistent status text. Avoid autoplay media, scroll-jacking and heavy parallax. Performance budget: no animation should block input or cause meaningful cumulative layout shift.

