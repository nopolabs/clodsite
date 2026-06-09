# Nits

Known rough edges that are tolerated for now but worth fixing eventually.

---

- **`mailto-form` and `resend-form` hardcoded colors** — both form components hardcode `border: 1px solid #ccc` (should be `var(--color-border)`), error `color: #c00` (no `--color-error` theme variable exists yet), and submit button `background: #222` / hover `#444` (arguably should be `var(--color-accent)`). Needs a small design decision: add `--color-error` to the theme contract, and decide whether form buttons follow the accent color. Fix before shipping dark themes.

## Fixed

- **`media-section/component.css` hardcoded figcaption color** — `color: #666` was hardcoded on `.c-media-section__media figcaption`; replaced with `var(--color-muted)` (defined by all three themes).
