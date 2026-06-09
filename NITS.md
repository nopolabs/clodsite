# Nits

Known rough edges that are tolerated for now but worth fixing eventually.

---

(no open nits)

## Fixed

- **Theme `.site-footer` hardcoded text colors** — minimal (`#888`), bold (`#666`), and professional (`#555`) each hardcoded the footer text color instead of using their own `var(--color-muted)`; bold's `#666` was low-contrast on its dark surface.

- **`mailto-form` and `resend-form` hardcoded colors** — borders now use `var(--color-border)`, error text uses the new `--color-error` theme variable (added to all three themes), submit buttons use `var(--color-accent)`/`var(--color-on-accent)` with `filter: brightness(1.08)` hover (matching the hero `.c-action` pattern), and hardcoded `4px` radii now use `var(--border-radius)`.
- **`media-section/component.css` hardcoded figcaption color** — `color: #666` was hardcoded on `.c-media-section__media figcaption`; replaced with `var(--color-muted)` (defined by all three themes).
