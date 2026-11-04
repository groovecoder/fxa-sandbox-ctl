# Quality bar for a dashboard v2 view (what "passes" means)

Copy this file for the view under review, and write the view's 5-second question at the top. For the Overview it is: does anything need me, is work running, is spend normal.

1. Priority: what needs a person is the first thing the eye lands on above the fold at 1440 and 1024, and in the first screen at 375. Nothing on the page shows twice by mistake.
2. Truth: every number says its time window and unit. A missing value says "?" or "unknown", never 0. A loading state differs from a failed state. Figures that sit side by side agree, or say why they differ.
3. Legibility: no text overlaps, clips or runs into a neighbour at 1440, 1024, 768 and 375, in light and dark. Text 4.5:1, marks 3:1, in both themes.
4. Words: short plain sentences, sentence case, no stray punctuation, no internal jargon that a new operator cannot decode, the same word for the same thing.
5. Keyboard and screen reader: every action is reachable in a sensible order. Names are short and read well. Headings are plain titles. No decorative focus stops. Targets are at least 24x24 px, or spaced as WCAG 2.2 2.5.8 allows.
6. Design system: tokens only, tones as pairs with a word, motion only for a data change (guide/dashboard-design.md).
7. Density: no card wastes space on nothing, similar cards line up, and the page does not scroll more than it must.

A fix passes only when the page is better on the bar AND every existing check still passes (typecheck, lint, vitest, build budget, e2e, parity).
