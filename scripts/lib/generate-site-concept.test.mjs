import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSiteConcept } from './generate-site-concept.mjs';
import { parseFrontmatter, validateFrontmatter } from './validate-okf.mjs';

const commercePlan = {
  slug: 'anchovy',
  name: 'Anchovy',
  overview: 'A personal site for Anchovy the cat —\nphoto gallery and treat shop.',
  style: 'bold',
  custom_domain: 'anchovy.nopolabs.com',
  commerce: { enabled: true, provider: 'manual', currency: 'usd', checkout: { provider: 'stripe', mode: 'live' } },
  pages: [
    { id: 'home', components: [{ type: 'hero' }, { type: 'prose' }] },
    { id: 'treats', components: [{ type: 'catalog' }] },
  ],
};

const plainPlan = {
  slug: 'ndig',
  name: 'NDIG',
  overview: 'An informational site.',
  style: 'minimal',
  custom_domain: '',
  pages: [{ id: 'home', components: [{ type: 'prose' }] }],
};

test('Site concept frontmatter is OKF-conformant', () => {
  for (const [plan, slug] of [[commercePlan, 'anchovy'], [plainPlan, 'ndig']]) {
    const { frontmatter } = parseFrontmatter(renderSiteConcept(plan, { slug }));
    assert.equal(frontmatter.type, 'Site');
    assert.deepEqual(validateFrontmatter(frontmatter), []);
  }
});

test('commerce site: resource from custom_domain, commerce tag + summary', () => {
  const md = renderSiteConcept(commercePlan, { slug: 'anchovy' });
  const { frontmatter } = parseFrontmatter(md);
  assert.equal(frontmatter.resource, 'https://anchovy.nopolabs.com');
  assert.deepEqual(frontmatter.tags, ['site', 'commerce']);
  assert.match(md, /\| Commerce \| manual · checkout stripe \(live\) · USD \|/);
  assert.match(md, /\| Components \| catalog, hero, prose \|/); // sorted, unique
});

test('plain site: no resource, no commerce tag, description collapses whitespace', () => {
  const md = renderSiteConcept(plainPlan, { slug: 'ndig' });
  const { frontmatter } = parseFrontmatter(md);
  assert.equal(frontmatter.resource, undefined);
  assert.deepEqual(frontmatter.tags, ['site']);
  assert.match(md, /\| Commerce \| — \|/);
  assert.match(md, /\| Custom domain \| — \|/);
});

test('multiline overview is collapsed to a single description line', () => {
  const { frontmatter } = parseFrontmatter(renderSiteConcept(commercePlan, { slug: 'anchovy' }));
  assert.ok(!frontmatter.description.includes('\n'));
  assert.match(frontmatter.description, /Anchovy the cat — photo gallery/);
});
