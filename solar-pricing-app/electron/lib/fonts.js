const fs = require('fs');
const path = require('path');

let cached = null;

function getFontFaceCss(assetsDir) {
  if (cached) return cached;
  const weights = [
    { weight: 400, file: 'cairo-400.woff2' },
    { weight: 600, file: 'cairo-600.woff2' },
    { weight: 700, file: 'cairo-700.woff2' },
  ];
  const faces = weights
    .map(({ weight, file }) => {
      const filePath = path.join(assetsDir, 'fonts', file);
      const base64 = fs.readFileSync(filePath).toString('base64');
      return `
@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${base64}) format('woff2');
}`;
    })
    .join('\n');
  cached = faces;
  return faces;
}

module.exports = { getFontFaceCss };
