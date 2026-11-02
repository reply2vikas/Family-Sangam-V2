# Accessibility

Target: WCAG 2.1 AA for the things this app does.

- **Structure:** one `h1`, headings in order, `main` landmark, skip link, `lang="en"`.
- **Forms:** every input has a visible or screen-reader label. Errors appear in a live region next to the form.
- **Keyboard:** everything is a real button, input or select. Focus rings are 3px and high contrast. The main area takes focus after the plan is built.
- **Screen readers:** status messages use `aria-live="polite"`. The cash chart has a text equivalent in its label and a "show as table" option with the same data by month.
- **Colour:** text pairs are defined as tokens in `styles.css` and checked at 4.5:1 or better by `test/evidence.test.ts`. Meaning is never colour-only: "late", "estimate" and "you entered" are words.
- **Touch targets:** controls are at least 2.75rem high (chips 2.25rem).
- **Motion:** `prefers-reduced-motion` is honoured.
- **Small screens:** layout reflows to one column. Wide tables scroll inside their own box, not the page.
- **Print:** a print stylesheet hides controls and starts each event on a new page.
- **Plain language:** short sentences, rupees with Indian digit grouping, no jargon.

Not yet done: automated screen-reader testing with real assistive technology, and a Hindi interface. The checks above were run with the test suite and by hand in a desktop and a phone-sized browser.
