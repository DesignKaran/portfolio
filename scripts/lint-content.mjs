#!/usr/bin/env node
/* Content lint for the portfolio pages. Fails when a page breaks the site's
   voice and honesty rules:
   1. No em-dash (U+2014) anywhere in the HTML sources; sentences get recast.
   2. No "shipped" claims in the ElderMotion / AI Study Buddy case studies.
      The honest scope statement ("... not shipped") is allowed.
   3. Every <img> carries an alt attribute.
   Run from the repo root: node scripts/lint-content.mjs */
import { readFileSync, readdirSync } from 'fs';

const pages = readdirSync('.').filter((f) => f.endsWith('.html')).sort();
const conceptPages = new Set(['eldermotion-case-study.html', 'ai-study-buddy-case-study.html']);

let problems = 0;
const report = (file, line, msg) => {
  problems += 1;
  console.error(`${file}:${line} ${msg}`);
};

for (const file of pages) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    const line = i + 1;
    if (text.includes('—')) report(file, line, 'em-dash (U+2014): recast the sentence instead');
    for (const tag of text.matchAll(/<img\b[^>]*>/gi)) {
      if (!/\balt\s*=/i.test(tag[0])) report(file, line, '<img> is missing an alt attribute');
    }
    if (conceptPages.has(file)) {
      for (const m of text.matchAll(/\bshipped\b/gi)) {
        const before = text.slice(Math.max(0, m.index - 12), m.index);
        if (!/\bnot\s+$/i.test(before)) {
          report(file, line, `"${m[0]}": this project was designed and evaluated, not shipped`);
        }
      }
    }
  });
}

if (problems) {
  console.error(`\ncontent lint: ${problems} problem(s) found`);
  process.exit(1);
}
console.log(`content lint: OK (${pages.length} pages checked)`);
