import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_NOT_FOUND_TITLE,
  NOT_FOUND_DISALLOWED_TYPES,
  defaultNotFoundMarkdown,
  navLinks,
  notFoundComponents,
  notFoundTitle,
} from './not-found.mjs';

function makePlan(overrides = {}) {
  return {
    pages: [
      { id: 'home', title: 'Home', components: [{ type: 'prose', markdown: 'hi' }] },
      { id: 'about', title: 'About', components: [{ type: 'prose', markdown: 'hi' }] },
    ],
    nav: { order: ['home', 'about'] },
    ...overrides,
  };
}

test('navLinks maps nav order to titles and hrefs, home as /', () => {
  assert.deepEqual(navLinks(makePlan()), [
    { title: 'Home', href: '/' },
    { title: 'About', href: '/about/' },
  ]);
});

test('navLinks treats the first nav entry as the root even when it is not "home"', () => {
  const plan = makePlan({
    pages: [
      { id: 'start', title: 'Start', components: [] },
      { id: 'more', title: 'More', components: [] },
    ],
    nav: { order: ['start', 'more'] },
  });
  assert.deepEqual(navLinks(plan), [
    { title: 'Start', href: '/' },
    { title: 'More', href: '/more/' },
  ]);
});

test('navLinks skips nav ids with no matching page and tolerates missing nav', () => {
  assert.deepEqual(navLinks({ pages: [], nav: { order: ['ghost'] } }), []);
  assert.deepEqual(navLinks({ pages: [] }), []);
});

test('defaultNotFoundMarkdown has the heading and a link per nav page', () => {
  const md = defaultNotFoundMarkdown(makePlan());
  assert.match(md, /^# Page not found/);
  assert.match(md, /\[Home\]\(\/\)/);
  assert.match(md, /\[About\]\(\/about\/\)/);
});

test('defaultNotFoundMarkdown omits the links section when there are no nav pages', () => {
  const md = defaultNotFoundMarkdown({ pages: [], nav: { order: [] } });
  assert.match(md, /# Page not found/);
  assert.doesNotMatch(md, /places to go/);
});

test('notFoundTitle defaults, and uses a trimmed custom title when present', () => {
  assert.equal(notFoundTitle(makePlan()), DEFAULT_NOT_FOUND_TITLE);
  assert.equal(notFoundTitle(makePlan({ not_found: { title: '  Lost  ' } })), 'Lost');
  assert.equal(notFoundTitle(makePlan({ not_found: { title: '   ' } })), DEFAULT_NOT_FOUND_TITLE);
});

test('notFoundComponents synthesizes a prose component by default', () => {
  const components = notFoundComponents(makePlan());
  assert.equal(components.length, 1);
  assert.equal(components[0].type, 'prose');
  assert.match(components[0].markdown, /# Page not found/);
});

test('notFoundComponents returns the override components verbatim when declared', () => {
  const custom = [{ type: 'hero', heading: 'Gone', markdown: 'x' }];
  const components = notFoundComponents(makePlan({ not_found: { components: custom } }));
  assert.deepEqual(components, custom);
});

test('notFoundComponents falls back to default when override components is empty', () => {
  const components = notFoundComponents(makePlan({ not_found: { components: [] } }));
  assert.equal(components[0].type, 'prose');
});

test('disallowed types are the commerce/proxy-wired components', () => {
  assert.deepEqual(
    [...NOT_FOUND_DISALLOWED_TYPES].sort(),
    ['catalog', 'certificate-award', 'personalized-product'],
  );
});
