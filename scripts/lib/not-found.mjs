// Not-found (404) page model: a default page synthesized for every site, and
// an optional per-site override declared as a top-level `not_found` block in
// build-plan.yaml. Pure helpers, shared by render-templates.mjs (rendering) and
// validate-plan.mjs (the disallowed-type list) and exercised by not-found.test.mjs.

// Components that need page-scoped wiring the 404 slot does not provide:
// catalog/personalized-product depend on the commerce catalog join and cart
// chrome; certificate-award depends on a proxy + Turnstile pairing. None of
// them make sense on a not-found page, and allowing them would mean extending
// every commerce/proxy cross-check to a non-page slot.
export const NOT_FOUND_DISALLOWED_TYPES = [
  'catalog',
  'personalized-product',
  'certificate-award',
];

export const DEFAULT_NOT_FOUND_TITLE = 'Page not found';

// navLinks mirrors write-site-json.mjs's href rule so the default page links to
// the same routes the header nav does.
export function navLinks(plan) {
  const order = (plan.nav && Array.isArray(plan.nav.order)) ? plan.nav.order : [];
  const firstId = order[0];
  const links = [];
  for (const id of order) {
    const page = (plan.pages || []).find((p) => p.id === id);
    if (!page) continue;
    const href = (page.id === 'home' || id === firstId) ? '/' : '/' + page.id + '/';
    links.push({ title: page.title, href });
  }
  return links;
}

// defaultNotFoundMarkdown builds the body for the synthesized 404: a heading, a
// short message, and links back to every nav page so a lost visitor can recover.
export function defaultNotFoundMarkdown(plan) {
  const lines = [
    '# Page not found',
    '',
    "The page you're looking for doesn't exist or may have moved.",
  ];
  const links = navLinks(plan);
  if (links.length > 0) {
    lines.push('', 'Here are some places to go instead:', '');
    for (const link of links) {
      lines.push('- [' + link.title + '](' + link.href + ')');
    }
  }
  return lines.join('\n') + '\n';
}

// notFoundTitle resolves the <title> for the 404 page.
export function notFoundTitle(plan) {
  const custom = plan.not_found && typeof plan.not_found.title === 'string'
    ? plan.not_found.title.trim()
    : '';
  return custom || DEFAULT_NOT_FOUND_TITLE;
}

// notFoundComponents returns the component array to render at /404.html: the
// author's `not_found.components` when present, otherwise a single synthesized
// prose component carrying the default body.
export function notFoundComponents(plan) {
  if (plan.not_found && Array.isArray(plan.not_found.components) &&
      plan.not_found.components.length > 0) {
    return plan.not_found.components;
  }
  return [{ type: 'prose', markdown: defaultNotFoundMarkdown(plan) }];
}
