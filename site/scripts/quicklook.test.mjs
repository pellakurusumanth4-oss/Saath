// The iPhone AR Quick Look banner's fragment (web/ar/quicklook.mjs): every value percent-encoded (never '+' for a space,
// so an '&' in a shop's name can't start a new key), the subtitle and the button only when given.
// Run: node --test site/scripts/quicklook.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ??= { createElement: () => ({ relList: { supports: () => false } }) };   // the module makes its anchor on import
const { quickLookHash } = await import('../../web/ar/quicklook.mjs');

test('title, subtitle and the button, each encoded', () => {
  assert.equal(quickLookHash({ title: 'Kiran · Kettle & Kulhad', subtitle: 'Save $4', cta: 'Walk there' }),
    '#allowsContentScaling=0&checkoutTitle=Kiran%20%C2%B7%20Kettle%20%26%20Kulhad&checkoutSubtitle=Save%20%244&callToAction=Walk%20there');
});

test('no button at the door, no empty subtitle', () => {
  assert.equal(quickLookHash({ title: 'Kiran', subtitle: undefined, cta: undefined }), '#allowsContentScaling=0&checkoutTitle=Kiran');
  assert.equal(quickLookHash({ title: 'Kiran', subtitle: '' }), '#allowsContentScaling=0&checkoutTitle=Kiran');
});
