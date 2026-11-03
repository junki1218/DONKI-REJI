/* 商品のQRカード（印刷用）を生成する。
   使い方:  node tools/make-cards.js
   出力:    cards.html（QRはSVGで埋め込むので、実行時に外部ライブラリは要らない）

   QRの中身は商品のバーコード番号そのもの。そうしておくと、
   QRカードでも本物のJANバーコードでも同じ照合処理で商品が引ける。 */

const fs = require('fs');
const path = require('path');
const qrcode = require('./qrcode-generator.js');

const root = path.join(__dirname, '..');

/* js/data.js をそのまま評価して商品データを取り出す */
const dataSrc = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
const sandbox = {};
new Function('g', dataSrc + '\ng.PRODUCTS=PRODUCTS; g.BAGS=BAGS;')(sandbox);
const { PRODUCTS } = sandbox;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function qrSvg(text, px) {
  const qr = qrcode(0, 'M');          // 型番自動・誤り訂正レベルM
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = px / n;
  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${px} ${px}" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">`
       + `<rect width="${px}" height="${px}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

const cards = [
  { title: 'majica カード', sub: 'さいしょに よみとる', code: 'MAJICA', icon: '💳', majica: true },
  ...PRODUCTS.map((p) => ({ title: p.k, sub: p.h, code: p.barcode, icon: p.icon, price: p.price }))
];

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QRカード（印刷用）｜DONKI-REJI</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 14mm 10mm;
    font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif;
    color: #111; background: #fff;
  }
  h1 { font-size: 16pt; margin: 0 0 4mm; }
  .lead { font-size: 9pt; color: #444; margin: 0 0 8mm; line-height: 1.7; }
  .lead code { background: #eee; padding: 1px 4px; border-radius: 3px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .card {
    border: 1.2pt dashed #888; border-radius: 3mm;
    padding: 4mm; text-align: center;
    break-inside: avoid; page-break-inside: avoid;
  }
  .card.majica { border-color: #d8251b; border-style: solid; }
  .card .icon { font-size: 20pt; line-height: 1; }
  .card .name { font-size: 10.5pt; font-weight: 700; margin: 1.5mm 0 0; }
  .card .kana { font-size: 8pt; color: #555; }
  .card .price { font-size: 13pt; font-weight: 800; color: #c0392b; margin: 1mm 0 2mm; }
  .card svg { width: 30mm; height: 30mm; display: block; margin: 0 auto; }
  .card .code { font-size: 7pt; color: #777; font-family: ui-monospace, monospace; margin-top: 1mm; }
  .note { margin-top: 8mm; font-size: 8.5pt; color: #555; line-height: 1.8; }
  @media print {
    body { padding: 10mm 8mm; }
    .lead, h1 { display: none; }
    .note { display: none; }
  }
</style>
</head>
<body>
<h1>QRカード（印刷用）</h1>
<p class="lead">
  そのまま印刷して、点線で切り分けて使います。空き箱や実物に貼ると、より本物に近い練習になります。<br>
  アプリのスキャン画面で「カメラでスキャン」を押し、このQRをカメラに向けると商品が登録されます。<br>
  <strong>majica カード</strong>は、最初の「majicaをお持ちですか」の画面で読み取るものです。
</p>
<div class="grid">
${cards.map((c) => `  <div class="card${c.majica ? ' majica' : ''}">
    <div class="icon">${c.icon}</div>
    <div class="name">${esc(c.title)}</div>
    <div class="kana">${esc(c.sub)}</div>
    ${c.price ? `<div class="price">${c.price.toLocaleString('ja-JP')}円</div>` : '<div class="price">&nbsp;</div>'}
    ${qrSvg(c.code, 300)}
    <div class="code">${esc(c.code)}</div>
  </div>`).join('\n')}
</div>
<p class="note">
  ※ このページは <code>node tools/make-cards.js</code> で生成しています。商品を増やしたら
  <code>js/data.js</code> を直してから、もう一度実行してください。
</p>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'cards.html'), html);
console.log(`cards.html を生成しました（カード ${cards.length} 枚）`);
