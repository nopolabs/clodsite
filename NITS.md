# Nits

Known rough edges that are tolerated for now but worth fixing eventually.

---

- **`media-section/component.css` hardcoded figcaption color** — `color: #666` is hardcoded on `.c-media-section__media figcaption`. Should use `var(--color-muted)` instead. Will look wrong on any dark theme (terminal, punk, etc.). Fix before shipping dark themes.
