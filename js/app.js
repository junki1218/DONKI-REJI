'use strict';

/* ================= 状態 ================= */
const S = {
  mode: 'home',          // 'home' | 'settings' | 'register'
  screen: 'idle',
  kana: false,
  sound: true,
  regNo: 5,
  bagChoice: null,
  hasMajica: false,
  majicaMoney: 3000,
  majicaPoints: 230,
  cart: [],
  payMethod: null,
  usedPoints: 0,
  inserted: 0,
  insCount: {},
  coinsIn: 0,
  pointInput: '',
  chargeAmount: 0,
  change: 0,
  changeBreak: []
};

const STEPS = ['bag', 'majica', 'scan', 'pay', 'done'];
const STEP_OF = {
  bag: 0, bagsize: 0, mybag: 0,
  majicaAsk: 1, majicaScan: 1, majicaBalance: 1,
  scan: 2, confirm: 2,
  payMethod: 3, cash: 3, card: 3, point: 3, majicaPay: 3, majicaShort: 3, charge: 3,
  done: 4
};

/* ================= 小道具 ================= */
const $ = (sel) => document.querySelector(sel);
const screenEl = $('#screen');
const appEl = $('#app');

/* 設定画面で編集中のデータ。保存するまで PRODUCTS には反映しない */
let draft = null;
let draftDirty = false;

const t  = (key) => (S.kana ? T[key].h : T[key].k);
const en = (key) => T[key].en || '';
const nm = (o) => (S.kana ? o.h : o.k);
const yen = (n) => n.toLocaleString('ja-JP') + (S.kana ? 'えん' : '円');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 実物の硬貨の色味（500/100/50=白銅、5=黄銅、10=青銅、1=アルミ） */
/* 商品の見た目。写真を登録していれば写真、していなければ絵文字を出す */
const pic = (it, cls) => (it && it.img)
  ? `<img class="pic ${cls || ''}" src="${esc(it.img)}" alt="">`
  : `<span class="pic ${cls || ''} emoji">${it ? it.icon : '📦'}</span>`;

const coinTone = (v) => (v === 5 ? 'brass' : v === 10 ? 'copper' : v === 1 ? 'alum' : 'silver');

const cartTotal = () => S.cart.reduce((a, i) => a + i.price * i.qty, 0);
const cartCount = () => S.cart.reduce((a, i) => a + i.qty, 0);
const dueAfterPoints = () => Math.max(0, cartTotal() - S.usedPoints);

/* 実機のアイコン（白い線画）を SVG で起こしたもの */
const ICON = {
  bag: '<svg viewBox="0 0 48 48"><path d="M11 17h26l-2 24H13z"/><path d="M19 17V9h10v8"/></svg>',
  tote: '<svg viewBox="0 0 48 48"><path d="M10 19h28v22H10z"/><path d="M18 19c0-6 2.7-10 6-10s6 4 6 10"/></svg>',
  cash: '<svg viewBox="0 0 48 48"><rect x="6" y="13" width="36" height="22" rx="2"/><circle cx="24" cy="24" r="6"/><path d="M24 20v9M21 23h6M21 26h6"/></svg>',
  card: '<svg viewBox="0 0 48 48"><rect x="6" y="12" width="36" height="24" rx="3"/><path d="M6 20h36M11 29h8"/></svg>',
  charge: '<svg viewBox="0 0 48 48"><rect x="8" y="10" width="20" height="14" rx="2"/><path d="M18 30v6h18M36 36l-5-4M36 36l-5 4"/></svg>',
  bal: '<svg viewBox="0 0 48 48"><rect x="7" y="11" width="34" height="26" rx="3"/><path d="M13 19h10M13 25h18M13 30h8"/></svg>'
};

/* 音（Web Audio のみ。外部ファイルなし） */
let actx = null;
function beep(freq = 1760, dur = 0.09, type = 'square', vol = 0.12) {
  if (!S.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g).connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch (e) { /* 音が出せない環境は無音で続行 */ }
}
const sfxScan = () => beep(2093, 0.08);
const sfxTap  = () => beep(880, 0.05, 'sine', 0.08);
const sfxCoin = () => beep(1320, 0.06, 'triangle', 0.1);
const sfxOk   = () => { beep(1046, 0.1, 'sine', 0.12); setTimeout(() => beep(1568, 0.16, 'sine', 0.12), 110); };
const sfxNg   = () => beep(220, 0.22, 'sawtooth', 0.1);

function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => el.classList.remove('on'), ms);
}

function scannerFx(label, cb) {
  const sc = $('#scanner');
  sc.querySelector('.beam').textContent = label || 'ピッ';
  sc.classList.add('on');
  sfxScan();
  setTimeout(() => { sc.classList.remove('on'); if (cb) cb(); }, 500);
}

const go = (screen) => { if (CAM.stream) closeCamera(); S.screen = screen; render(); };

/* ================= カメラでQR/バーコードを読み取る =================
   iOS/iPadOS の Safari には BarcodeDetector が無いので、
   使える端末ではそれを、無い端末では同梱の jsQR を使う。
   QRの中身は商品のバーコード番号そのものなので、
   QRカードでも本物のJANバーコードでも同じ照合で商品が引ける。 */
const CAM = { stream: null, timer: null, detector: null, mode: null, last: '', lastAt: 0, canvas: null, ctx: null };

const camMsg = (text, cls) => {
  const el = $('#camMsg');
  el.textContent = text;
  el.className = 'cam-msg' + (cls ? ' ' + cls : '');
};

function camLog(item, name, price) {
  const li = document.createElement('li');
  li.innerHTML = pic(item, 'sm') + `<span>${esc(name)}</span>` + (price != null ? `<span class="pr">${esc(yen(price))}</span>` : '');
  const list = $('#camList');
  list.prepend(li);
  while (list.children.length > 12) list.lastChild.remove();
}

async function openCamera(mode) {
  CAM.mode = mode;
  CAM.last = ''; CAM.lastAt = 0;
  $('#camList').innerHTML = '';
  $('#camTitle').textContent = mode === 'majica'
    ? (S.kana ? 'マジカカードの QRを よみとります' : 'majicaカードのQRを読み取ります')
    : (S.kana ? 'しょうひんの QRを よみとります' : '商品のQRを読み取ります');
  $('#cam').classList.add('on');
  camMsg(S.kana ? 'カメラを じゅんび しています…' : 'カメラを準備しています…');

  if (!window.isSecureContext) {
    camMsg(S.kana ? 'https で ひらかないと カメラは つかえません' : 'httpsで開かないとカメラは使えません', 'err');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camMsg(S.kana ? 'この ブラウザでは カメラが つかえません' : 'このブラウザではカメラが使えません', 'err');
    return;
  }
  try {
    CAM.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false
    });
  } catch (e) {
    const name = e && e.name;
    camMsg(
      name === 'NotAllowedError' ? (S.kana ? 'カメラの しようが きょか されませんでした。ブラウザの せっていで きょか して ください' : 'カメラの使用が許可されませんでした。ブラウザの設定で許可してください')
      : name === 'NotFoundError' ? (S.kana ? 'カメラが みつかりません' : 'カメラが見つかりません')
      : (S.kana ? 'カメラを ひらけませんでした' : 'カメラを開けませんでした') + '（' + name + '）', 'err');
    return;
  }

  const v = $('#camVideo');
  v.srcObject = CAM.stream;
  try { await v.play(); } catch (e) { /* 自動再生が止められても下のループで拾える */ }

  /* 標準APIが使えるなら、本物のJANバーコードも読めるようにする */
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const want = ['qr_code', 'ean_13', 'ean_8', 'code_128'].filter((f) => supported.includes(f));
      if (want.length) CAM.detector = new window.BarcodeDetector({ formats: want });
    } catch (e) { CAM.detector = null; }
  }

  camMsg(S.kana ? 'わくの なかに QRを いれて ください' : '枠の中にQRを入れてください');
  CAM.timer = setInterval(camTick, 150);
}

async function camTick() {
  const v = $('#camVideo');
  if (!v || !v.videoWidth) return;
  let code = null;

  if (CAM.detector) {
    try {
      const found = await CAM.detector.detect(v);
      if (found && found.length) code = found[0].rawValue;
    } catch (e) { /* 読めなかっただけ */ }
  }
  if (!code && typeof window.jsQR === 'function') {
    const W = 480;
    const H = Math.max(1, Math.round(v.videoHeight * W / v.videoWidth));
    const cv = CAM.canvas || (CAM.canvas = document.createElement('canvas'));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; CAM.ctx = null; }
    const ctx = CAM.ctx || (CAM.ctx = cv.getContext('2d', { willReadFrequently: true }));
    ctx.drawImage(v, 0, 0, W, H);
    const res = window.jsQR(ctx.getImageData(0, 0, W, H).data, W, H, { inversionAttempts: 'dontInvert' });
    if (res && res.data) code = res.data;
  }
  if (code) handleCode(String(code).trim());
}

function handleCode(code) {
  const now = Date.now();
  if (code === CAM.last && now - CAM.lastAt < 2000) return;   // 同じコードの連続読みを防ぐ
  CAM.last = code; CAM.lastAt = now;

  if (CAM.mode === 'majica') {
    if (code.toUpperCase() === 'MAJICA') {
      sfxScan();
      camMsg(S.kana ? 'よみとりました' : '読み取りました', 'ok');
      closeCamera();
      go('majicaBalance');
    } else {
      sfxNg();
      camMsg(S.kana ? 'マジカの カードでは ありません' : 'majicaのカードではありません', 'err');
    }
    return;
  }

  const p = findItemByCode(PRODUCTS, code);
  if (p) {
    addToCart(p);
    sfxScan();
    camMsg(`${nm(p)}　${yen(p.price)}`, 'ok');
    camLog(p, nm(p), p.price);
    render();
    return;
  }
  if (code.toUpperCase() === 'MAJICA') {
    sfxNg();
    camMsg(S.kana ? 'マジカの カードは さいしょの がめんで よみとります' : 'majicaカードは最初の画面で読み取ります', 'err');
    return;
  }
  sfxNg();
  camMsg((S.kana ? 'とうろくの ない しょうひんです' : '登録されていない商品です') + `（${esc(code)}）`, 'err');
}

function closeCamera() {
  if (CAM.timer) { clearInterval(CAM.timer); CAM.timer = null; }
  if (CAM.stream) { CAM.stream.getTracks().forEach((t) => t.stop()); CAM.stream = null; }
  const v = $('#camVideo');
  if (v) v.srcObject = null;
  CAM.detector = null;
  $('#cam').classList.remove('on');
}



/* ================= カート ================= */
function addToCart(src, qty = 1) {
  const f = S.cart.find((i) => i.id === src.id);
  if (f) f.qty += qty;
  else S.cart.push({ id: src.id, k: src.k, h: src.h, icon: src.icon, img: src.img || '', price: src.price, qty });
}
function removeFromCart(id) {
  const i = S.cart.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (S.cart[i].qty > 1) S.cart[i].qty -= 1;
  else S.cart.splice(i, 1);
}

function breakChange(amount) {
  const out = [];
  let rest = amount;
  for (const u of [10000, 5000, 1000, 500, 100, 50, 10, 5, 1]) {
    const n = Math.floor(rest / u);
    if (n > 0) { out.push({ v: u, n }); rest -= u * n; }
  }
  return out;
}

function resetAll(keepMajica) {
  const m = S.majicaMoney, p = S.majicaPoints;
  Object.assign(S, {
    bagChoice: null, hasMajica: false, cart: [], payMethod: null,
    usedPoints: 0, inserted: 0, insCount: {}, coinsIn: 0, pointInput: '',
    chargeAmount: 0, change: 0, changeBreak: []
  });
  S.majicaMoney = keepMajica ? m : 3000;
  S.majicaPoints = keepMajica ? p : 230;
}

/* ================= 部品 ================= */
const tile = (act, v, label, opts = {}) => `
  <button class="tile${opts.red ? ' red' : ''}${opts.sm ? ' sm' : ''}"
          data-act="${act}"${v !== undefined ? ` data-v="${v}"` : ''}${opts.off ? ' disabled' : ''}>
    ${opts.mjc ? '<span class="mjc">majica</span>' : ''}
    ${opts.icon ? ICON[opts.icon] : ''}
    <span class="lab">${esc(label)}</span>
    ${opts.en ? `<span class="en">${esc(opts.en)}</span>` : ''}
    ${opts.sub ? `<span class="sub">${esc(opts.sub)}</span>` : ''}
  </button>`;

const band = () => `
  <div class="band">
    <span class="lb">${esc(t('total'))}</span>
    <span class="ct">${cartCount()}${esc(t('pieces'))}</span>
    <span class="am">${esc(yen(dueAfterPoints()))}</span>
  </div>`;

/* ================= 画面定義 =================
   各画面は { msg, body, center?, regno?, english?, balance? } を返す */
const VIEWS = {

  idle: () => ({
    msg: t('msg_idle'),
    body: `
      <div class="notice">${esc(t('bag_notice'))}</div>
      <div class="tiles c3">
        ${tile('bag', 'paid', t('bag_paid'), { icon: 'bag' })}
        ${tile('bag', 'my',   t('bag_my'),   { icon: 'tote' })}
        ${tile('bag', 'none', t('bag_none'))}
      </div>
      <div class="tiles sub">
        ${tile('noop', 'charge', t('top_charge'), { sm: true, icon: 'charge' })}
        ${tile('noop', 'bal',    t('top_balance'), { sm: true })}
      </div>`
  }),

  bagsize: () => ({
    msg: t('msg_bagsize'),
    body: `
      <div class="tiles c2">
        ${BAGS.map((b) => {
          const c = S.cart.find((i) => i.id === b.id);
          return tile('addbag', b.id, nm(b), {
            icon: 'bag',
            sub: `${yen(b.price)}${c ? `　選択 ${c.qty}${t('sheets')}` : ''}`
          });
        }).join('')}
      </div>
      <div class="scr-foot">
        <button class="btn btn-gray" data-act="go" data-v="idle">${esc(t('back'))}</button>
        <button class="btn btn-or" data-act="go" data-v="majicaAsk">${esc(t('next'))}</button>
      </div>`
  }),

  mybag: () => ({
    msg: t('msg_mybag'),
    body: `
      <div style="display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap;flex:1">
        <svg viewBox="0 0 120 110" style="width:190px;height:170px;fill:none;stroke:#7b8694;stroke-width:3">
          <path d="M14 14h92M20 14v76M100 14v76M20 90h80"/>
          <path d="M38 30c0-9 5-16 11-16s11 7 11 16M60 30c0-9 5-16 11-16s11 7 11 16" stroke="#c9a227"/>
          <path d="M34 34h52l-6 50H40z" fill="#f2ef9a" stroke="#b9b45a"/>
        </svg>
        <button class="btn btn-or" data-act="go" data-v="majicaAsk" style="min-width:160px;min-height:110px;font-size:1.5rem">${esc(t('next'))}</button>
      </div>
      <div class="scr-foot"><button class="btn btn-gray" data-act="go" data-v="idle">${esc(t('back'))}</button></div>`
  }),

  majicaAsk: () => ({
    msg: t('msg_majica'),
    body: `
      <div class="tiles c2">
        ${tile('majica', '1', t('yes'), { red: true, mjc: true })}
        ${tile('majica', '0', t('no'), {})}
      </div>`
  }),

  majicaScan: () => ({
    msg: t('msg_mscan'),
    body: `
      <div style="display:flex;align-items:center;justify-content:center;gap:18px;flex:1;flex-wrap:wrap">
        <div style="font-size:3.4rem">💳</div>
        <div style="font-size:2rem;color:#5d6b7a">➡</div>
        <div style="font-size:3.4rem">📡</div>
      </div>
      <div class="scr-foot">
        <button class="btn btn-gray" data-act="go" data-v="majicaAsk">${esc(t('back'))}</button>
        <button class="btn btn-red" data-act="cam" data-v="majica">📷 ${esc(t('cam_majica'))}</button>
        <button class="btn btn-or" data-act="majicaScan">${esc(S.kana ? 'カードを かざす' : 'カードをかざす')}</button>
      </div>`
  }),

  majicaBalance: () => ({
    msg: t('msg_mbal'),
    balance: true,
    body: `
      <div class="amt-row">
        <div class="amt"><div class="lab">${esc(t('money'))}</div><div class="val">${esc(yen(S.majicaMoney))}</div></div>
        <div class="amt"><div class="lab">${esc(t('points'))}</div><div class="val">${S.majicaPoints} P</div></div>
      </div>
      <div class="scr-foot"><button class="btn btn-or" data-act="go" data-v="scan">${esc(t('confirm'))}</button></div>`
  }),

  scan: () => ({
    msg: t('msg_scan'),
    fit: true,
    body: `
      <div class="panel scan-panel">
        <div class="ttl">${esc(t('cart'))}（${cartCount()}${esc(t('pieces'))}）</div>
        <div class="lines">
          ${S.cart.length === 0
            ? `<div class="empty">${esc(S.kana ? 'まだ ありません' : 'まだ登録がありません')}</div>`
            : S.cart.map((i) => `
              <div class="line">
                ${pic(i, 'sm')}<span class="l-nm">${esc(nm(i))}</span>
                <span class="l-qty">×${i.qty}</span>
                <span class="l-pr">${esc(yen(i.price * i.qty))}</span>
                <button class="l-del" data-act="del" data-v="${i.id}" aria-label="へらす">−</button>
              </div>`).join('')}
        </div>
        <div class="total-row">
          <span class="lab">${esc(t('total'))}</span>
          <span class="val">${esc(yen(cartTotal()))}</span>
        </div>
      </div>
      <div class="nb-block">
        <div class="nb-ttl">${esc(t('nobarcode'))}</div>
        <div class="nb-row">
          ${NO_BARCODE.map((n) => `<button class="nb-btn" data-act="nb" data-v="${n.id}">${n.icon} ${esc(nm(n))}</button>`).join('')}
          <button class="nb-btn" data-act="go" data-v="bagsize">🛍️ ${esc(t('addbag'))}</button>
        </div>
      </div>
      <div class="scr-foot">
        <button class="btn btn-gray" data-act="abort">${esc(t('cancel'))}</button>
        <button class="btn btn-red" data-act="cam" data-v="product">📷 ${esc(t('cam_scan'))}</button>
        <button class="btn btn-or" data-act="go" data-v="confirm" ${S.cart.length ? '' : 'disabled'}>${esc(t('checkout'))}</button>
      </div>`
  }),

  confirm: () => ({
    msg: t('msg_confirm'),
    balance: S.hasMajica,
    body: `
      <div class="panel" style="max-height:220px">
        <div class="ttl">${esc(t('cart'))}</div>
        <div class="lines">
          ${S.cart.map((i) => `
            <div class="line">${pic(i, 'sm')}<span class="l-nm">${esc(nm(i))}</span>
            <span class="l-qty">×${i.qty}</span><span class="l-pr">${esc(yen(i.price * i.qty))}</span></div>`).join('')}
        </div>
      </div>
      ${band()}
      <div class="scr-foot">
        <button class="btn btn-gray" data-act="go" data-v="scan">${esc(t('back'))}</button>
        <button class="btn btn-or" data-act="go" data-v="payMethod">${esc(t('topay'))}</button>
      </div>`
  }),

  /* 実機は マジカ払/チャージ・ポイント払・現金・クレジットカード の4つ */
  payMethod: () => ({
    msg: t('msg_pay'),
    regno: true, english: true, balance: true, center: true, theme: 'pink',
    body: `
      <div class="tiles c4">
        ${tile('pay', 'majica', t('pay_majica'), { red: true, mjc: true, en: en('pay_majica'), off: !S.hasMajica })}
        ${tile('pay', 'point',  t('pay_point'),  { red: true, mjc: true, en: en('pay_point'),  off: !S.hasMajica })}
        ${tile('pay', 'cash',   t('pay_cash'),   { icon: 'cash', en: en('pay_cash') })}
        ${tile('pay', 'credit', t('pay_credit'), { icon: 'card', en: en('pay_credit') })}
      </div>
      ${band()}
      ${S.hasMajica ? '' : `<div class="notice" style="margin-top:10px">${esc(S.kana ? '※ マジカを よみとって いないので マジカ払・ポイント払は つかえません' : '※ majica未読取のため、マジカ払・ポイント払は選択できません')}</div>`}
      <div class="scr-foot"><button class="btn btn-gray" data-act="go" data-v="confirm">${esc(t('back'))}</button></div>`
  }),

  cash: () => {
    const due = dueAfterPoints();
    const short = Math.max(0, due - S.inserted);
    return {
      msg: t('msg_cash'), regno: true, theme: 'pink',
      body: `
        <div class="amt-row">
          <div class="amt"><div class="lab">${esc(t('total'))}</div><div class="val">${esc(yen(due))}</div></div>
          <div class="amt big ${short > 0 ? '' : 'ok'}"><div class="lab">${esc(t('inserted'))}</div><div class="val">${esc(yen(S.inserted))}</div></div>
          <div class="amt ${short > 0 ? 'short' : 'ok'}">
            <div class="lab">${short > 0 ? esc(t('shortage')) : esc(t('change'))}</div>
            <div class="val">${esc(yen(short > 0 ? short : S.inserted - due))}</div>
          </div>
        </div>
        <div class="cash-group">
          <div class="gl">${esc(t('bills'))}</div>
          <div class="cash-row">
            ${BILLS.map((b) => `<button class="bill" data-act="ins" data-v="${b.v}">${esc(S.kana ? b.h : b.label)}${S.insCount[b.v] ? `<div class="cash-count">${S.insCount[b.v]}${esc(t('sheets'))}</div>` : ''}</button>`).join('')}
          </div>
        </div>
        <div class="cash-group">
          <div class="gl">${esc(t('coins'))}</div>
          <div class="cash-row">
            ${COINS.map((c) => `<button class="coin ${coinTone(c.v)}" data-act="ins" data-v="${c.v}">${esc(S.kana ? c.h : c.label)}</button>`).join('')}
          </div>
        </div>
        <div class="scr-foot">
          <button class="btn btn-gray" data-act="go" data-v="payMethod">${esc(t('back'))}</button>
          <button class="btn btn-gray" data-act="cashClear">${esc(t('clear'))}</button>
          <button class="btn btn-or" data-act="cashPay" ${short > 0 ? 'disabled' : ''}>${esc(t('pay_now'))}</button>
        </div>`
    };
  },

  card: () => ({
    msg: t('msg_card'), regno: true, theme: 'pink',
    body: `
      <div class="amt-row"><div class="amt big"><div class="lab">${esc(t('total'))}</div><div class="val">${esc(yen(dueAfterPoints()))}</div></div></div>
      <div style="text-align:center;font-size:3rem;flex:1">💳 ➡ 🏧</div>
      <div class="scr-foot">
        <button class="btn btn-gray" data-act="go" data-v="payMethod">${esc(t('back'))}</button>
        <button class="btn btn-or" data-act="finish" data-v="credit">${esc(S.kana ? 'カードを いれる' : 'カードを入れる')}</button>
      </div>`
  }),

  point: () => {
    const max = Math.min(S.majicaPoints, cartTotal());
    const val = parseInt(S.pointInput || '0', 10);
    const bad = val > max;
    return {
      msg: t('msg_point'), regno: true, balance: true, theme: 'pink',
      body: `
        <div class="amt-row">
          <div class="amt"><div class="lab">${esc(S.kana ? 'つかえる ポイント' : '利用可能ポイント')}</div><div class="val">${max} P</div></div>
          <div class="amt big ${bad ? 'short' : 'ok'}"><div class="lab">${esc(S.kana ? 'つかう ポイント' : '利用ポイント')}</div><div class="val">${val} P</div></div>
        </div>
        <div class="keypad">
          ${['1','2','3','4','5','6','7','8','9','0','00'].map((k) => `<button class="btn btn-gray" data-act="pk" data-v="${k}">${k}</button>`).join('')}
          <button class="btn btn-gray" data-act="pk" data-v="back">⌫</button>
        </div>
        ${bad ? `<div class="notice" style="color:#c0392b;font-weight:700;text-align:center;margin-top:10px">${esc(S.kana ? 'ポイントが たりません' : 'ポイントが不足しています')}</div>` : ''}
        <div class="scr-foot">
          <button class="btn btn-gray" data-act="go" data-v="payMethod">${esc(t('back'))}</button>
          <button class="btn btn-gray" data-act="pk" data-v="all">${esc(t('use_all'))}</button>
          <button class="btn btn-gray" data-act="pk" data-v="clear">${esc(t('clear'))}</button>
          <button class="btn btn-or" data-act="pointApply" ${bad || val <= 0 ? 'disabled' : ''}>${esc(t('confirm'))}</button>
        </div>`
    };
  },

  majicaPay: () => ({
    msg: t('msg_mpay'), regno: true, balance: true, theme: 'pink',
    body: `
      <div class="amt-row">
        <div class="amt big"><div class="lab">${esc(t('total'))}</div><div class="val">${esc(yen(dueAfterPoints()))}</div></div>
        <div class="amt"><div class="lab">${esc(S.kana ? 'はらった あとの のこり' : 'お支払い後の残高')}</div><div class="val">${esc(yen(S.majicaMoney - dueAfterPoints()))}</div></div>
      </div>
      <div class="notice">${esc(S.kana ? '※ マジカと げんきんの あわせばらいは できません' : '※ majicaマネーと現金の併用はできません')}</div>
      <div class="scr-foot">
        <button class="btn btn-gray" data-act="go" data-v="payMethod">${esc(t('back'))}</button>
        <button class="btn btn-or" data-act="finish" data-v="majica">${esc(t('pay_now'))}</button>
      </div>`
  }),

  majicaShort: () => ({
    msg: t('msg_mshort'), regno: true, balance: true, theme: 'pink',
    body: `
      <div class="amt-row">
        <div class="amt short"><div class="lab">${esc(t('shortage'))}</div><div class="val">${esc(yen(dueAfterPoints() - S.majicaMoney))}</div></div>
        <div class="amt"><div class="lab">${esc(t('money'))}</div><div class="val">${esc(yen(S.majicaMoney))}</div></div>
      </div>
      <div class="tiles c2">
        ${tile('go', 'charge', t('charge'), { red: true, mjc: true })}
        ${tile('go', 'payMethod', t('other_pay'), {})}
      </div>`
  }),

  charge: () => ({
    msg: t('msg_charge'), regno: true, balance: true, theme: 'pink',
    body: `
      <div class="tiles c4">
        ${[1000, 2000, 3000, 5000].map((v) => tile('charge', v, yen(v), { red: true })).join('')}
      </div>
      <div class="scr-foot"><button class="btn btn-gray" data-act="go" data-v="majicaShort">${esc(t('back'))}</button></div>`
  }),

  done: () => ({
    msg: S.change > 0 ? t('msg_done') : t('msg_done_nc'),
    center: true, regno: true, theme: 'pink',
    body: `
      ${S.change > 0 ? `
        <div class="amt-row"><div class="amt big ok">
          <div class="lab">${esc(t('change'))}</div>
          <div class="val">${esc(yen(S.change))}</div>
          <div class="lab" style="margin-top:6px;font-weight:400">
            ${S.changeBreak.map((c) => `${c.v.toLocaleString('ja-JP')}${S.kana ? 'えん' : '円'}×${c.n}`).join('　')}
          </div>
        </div></div>` : ''}
      <div class="receipt">
        <h4>${esc(S.kana ? 'レシート' : 'レ シ ー ト')}</h4>
        ${S.cart.map((i) => `<div class="r-line"><span>${esc(nm(i))} ×${i.qty}</span><span>${(i.price * i.qty).toLocaleString('ja-JP')}</span></div>`).join('')}
        <div class="r-sep"></div>
        <div class="r-line r-total"><span>${esc(t('total'))}</span><span>${cartTotal().toLocaleString('ja-JP')}</span></div>
        ${S.usedPoints > 0 ? `<div class="r-line"><span>${esc(t('pay_point'))}</span><span>-${S.usedPoints.toLocaleString('ja-JP')}</span></div>` : ''}
        <div class="r-line"><span>${esc(payLabel(S.payMethod))}</span><span>${(S.payMethod === 'cash' ? S.inserted : dueAfterPoints()).toLocaleString('ja-JP')}</span></div>
        ${S.change > 0 ? `<div class="r-line"><span>${esc(t('change'))}</span><span>${S.change.toLocaleString('ja-JP')}</span></div>` : ''}
        ${S.hasMajica ? `<div class="r-sep"></div>
          <div class="r-line"><span>majica${esc(t('money'))}</span><span>${S.majicaMoney.toLocaleString('ja-JP')}</span></div>
          <div class="r-line"><span>${esc(t('points'))}</span><span>${S.majicaPoints} P</span></div>` : ''}
      </div>
      <div class="scr-foot"><button class="btn btn-or" data-act="restart">${esc(t('again'))}</button></div>`
  })
};

function payLabel(m) {
  return ({ cash: t('pay_cash'), credit: t('pay_credit'), majica: t('pay_majica'), point: t('pay_point') })[m] || '';
}

/* ================= 描画 ================= */
function render() {
  const v = (VIEWS[S.screen] || VIEWS.idle)();
  const showBal = v.balance && S.hasMajica;

  screenEl.innerHTML = `
    <div class="msgwrap">
      ${v.regno ? `<div class="regno"><span class="lb">${esc(S.kana ? 'かいけいき' : '会計機No')}</span><span class="nu">${S.regNo}</span></div>` : ''}
      <div class="msgbar${v.center ? ' center' : ''}">${esc(v.msg)}</div>
    </div>
    <div class="rule"></div>
    <div class="scr-body">${v.body}</div>
    <div class="botbar">
      <button class="sysbtn call" data-act="call">${esc(t('call_staff'))}</button>
      ${v.english ? `<button class="sysbtn en" data-act="english">${esc(t('english'))}</button>` : ''}
      ${showBal ? `<div class="right">
        <div><b>${esc(t('majica_rest'))}</b> <span class="v">${esc(yen(S.majicaMoney))}</span></div>
        <div><b>${esc(t('point_rest'))}</b> <span class="v">${S.majicaPoints} P</span></div>
      </div>` : ''}
    </div>`;

  /* 本文が4:3に収まらないときは本文側だけスクロールさせ、
     操作ボタンの帯は本文の外に出して必ず見えるようにする */
  const bodyEl = screenEl.querySelector('.scr-body');
  const foots = bodyEl.querySelectorAll('.scr-foot');
  if (foots.length) bodyEl.after(foots[foots.length - 1]);

  screenEl.className = (v.theme === 'pink' ? 'pink' : '') + (v.fit ? ' fit' : '');
  document.body.classList.toggle('kana', S.kana);
  const cur = STEP_OF[S.screen];
  $('#steps').innerHTML = (S.screen === 'idle') ? '' : STEPS.map((_, i) => `<div class="st${i <= cur ? ' on' : ''}"></div>`).join('');
  screenEl.scrollTop = 0;
}

/* ================= スタート画面・設定画面 ================= */
function setMode(mode) {
  if (CAM.stream) closeCamera();
  S.mode = mode;
  document.body.classList.toggle('app-mode', mode !== 'register');
  appEl.classList.toggle('on', mode !== 'register');
  $('#homeBtn').hidden = (mode === 'home');
  $('#cardsLink').hidden = (mode === 'home');
  $('#kanaToggle').hidden = (mode === 'settings');
  $('#soundToggle').hidden = (mode === 'settings');
  if (mode === 'register') { render(); }
  else { $('#steps').innerHTML = ''; renderApp(); }
}

function renderApp() {
  appEl.innerHTML = (S.mode === 'settings') ? viewSettings() : viewHome();
  appEl.scrollTop = 0;
  if (S.mode === 'settings') setDirty(draftDirty);
}

function viewHome() {
  return `<div class="app-wrap">
    <div class="app-title">${esc(t('home_title'))}</div>
    <div class="app-sub">${esc(t('home_sub'))}</div>
    <div class="home-tiles">
      <button class="home-tile" data-app="play">
        <span class="ico">🛒</span>
        <span class="lab">${esc(t('home_play'))}</span>
        <span class="sub">${esc(t('home_play_s'))}</span>
      </button>
      <button class="home-tile gear" data-app="settings">
        <span class="ico">⚙️</span>
        <span class="lab">${esc(t('home_setting'))}</span>
        <span class="sub">${esc(t('home_set_s'))}</span>
      </button>
    </div>
  </div>`;
}

function viewSettings() {
  return `<div class="app-wrap">
    <div class="set-bar">
      <button class="btn btn-or" data-app="save">${esc(t('set_save'))}</button>
      <button class="btn btn-gray" data-app="add">＋ ${esc(t('set_add'))}</button>
      <button class="btn btn-gray" data-app="reset">${esc(t('set_reset'))}</button>
      <a class="btn btn-gray" href="cards.html" target="_blank" rel="noopener">🖨 ${esc(t('set_cards'))}</a>
      <span class="grow"></span>
      <span class="set-state" id="setState"></span>
    </div>
    <div class="app-title" style="text-align:left;font-size:1.3rem">${esc(t('set_title'))}</div>
    <div class="set-lead">${esc(t('set_lead'))}</div>
    <div class="set-list">
      ${draft.map((it, i) => `
        <div class="set-row" data-i="${i}">
          <div class="qrno">QR${i + 1}<small>カードの番号</small></div>
          <div class="set-f">
            <label for="nm${i}">${esc(t('set_name'))}</label>
            <input id="nm${i}" data-f="k" value="${esc(it.k)}" maxlength="30">
          </div>
          <div class="set-f">
            <label for="kn${i}">${esc(t('set_kana'))}</label>
            <input id="kn${i}" data-f="h" value="${esc(it.h)}" maxlength="30">
            <span class="hint">${esc(t('set_kana_ph'))}</span>
          </div>
          <div class="set-f">
            <label for="pr${i}">${esc(t('set_price'))}</label>
            <input id="pr${i}" data-f="price" class="num" type="number" inputmode="numeric" min="0" max="99999" value="${it.price}">
          </div>
          <div class="set-f">
            <label for="bc${i}">${esc(t('set_barcode'))}</label>
            <input id="bc${i}" data-f="barcode" class="num" inputmode="numeric" value="${esc(it.barcode)}" maxlength="14">
          </div>
          <div class="set-f">
            <label for="ic${i}">${esc(t('set_icon'))}</label>
            <input id="ic${i}" data-f="icon" class="icon" value="${esc(it.icon)}" maxlength="4">
          </div>
          <div class="set-f set-img">
            <label>${esc(t('set_img'))}</label>
            <div class="img-row">
              <span class="img-prev">${pic(it)}</span>
              <span class="img-btns">
                <label class="img-pick">${esc(t('set_img_pick'))}
                  <input type="file" accept="image/*" data-app="img" data-i="${i}" hidden>
                </label>
                ${it.img ? `<button class="img-clear" data-app="imgdel" data-i="${i}">${esc(t('set_img_del'))}</button>` : ''}
              </span>
            </div>
            <span class="hint">${esc(t('set_img_hint'))}</span>
          </div>
          <button class="set-del" data-app="del" data-i="${i}" title="${esc(t('set_del'))}">✕</button>
        </div>`).join('')}
    </div>
  </div>`;
}

function setDirty(on) {
  draftDirty = on;
  const el = $('#setState');
  if (!el) return;
  el.textContent = on ? t('set_unsaved') : '';
  el.className = 'set-state';
}

function readDraftFromInputs() {
  appEl.querySelectorAll('.set-row').forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelectorAll('[data-f]').forEach((inp) => {
      draft[i][inp.dataset.f] = (inp.dataset.f === 'price') ? Number(inp.value) : inp.value;
    });
  });
}

function saveSettings() {
  readDraftFromInputs();
  const saved = saveItems(draft);
  if (!saved) {
    const hasImg = draft.some((x) => x.img);
    toast(hasImg ? t('set_full') : t('set_nostore'));   // 写真があるなら容量超過の可能性が高い
    return;
  }
  PRODUCTS = saved;
  draft = saved.map((x) => Object.assign({}, x));
  renderApp();
  setDirty(false);
  const el = $('#setState');
  if (el) { el.textContent = t('set_saved'); el.className = 'set-state ok'; }
  sfxOk();
}

/* 設定画面の操作 */
appEl.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-app]');
  if (!el) return;
  switch (el.dataset.app) {
    case 'play':
      sfxTap(); resetAll(true); S.screen = 'idle'; setMode('register'); break;
    case 'settings':
      sfxTap();
      draft = PRODUCTS.map((x) => Object.assign({}, x));
      draftDirty = false;
      setMode('settings');
      break;
    case 'save': sfxTap(); saveSettings(); break;
    case 'add':
      sfxTap();
      readDraftFromInputs();
      if (draft.length >= ITEM_COUNT_MAX) { toast(t('set_max')); break; }
      draft.push({ id: `QR${draft.length + 1}`, k: '', h: '', price: 100, icon: '📦', img: '', barcode: '' });
      renderApp(); setDirty(true);
      break;
    case 'del': {
      sfxTap();
      readDraftFromInputs();
      if (draft.length <= 1) { toast(t('set_min')); break; }
      draft.splice(Number(el.dataset.i), 1);
      renderApp(); setDirty(true);
      break;
    }
    case 'imgdel':
      sfxTap();
      readDraftFromInputs();
      draft[Number(el.dataset.i)].img = '';
      renderApp(); setDirty(true);
      break;

    case 'reset':
      sfxTap();
      if (!window.confirm(t('set_reset_q'))) break;
      PRODUCTS = resetItems();
      draft = PRODUCTS.map((x) => Object.assign({}, x));
      renderApp(); setDirty(false);
      break;
  }
});
appEl.addEventListener('input', (ev) => { if (ev.target.matches('[data-f]')) setDirty(true); });

/* ローカル画像の取り込み */
appEl.addEventListener('change', async (ev) => {
  const inp = ev.target.closest('input[type="file"][data-app="img"]');
  if (!inp || !inp.files || !inp.files[0]) return;
  const i = Number(inp.dataset.i);
  const file = inp.files[0];
  inp.value = '';                                  // 同じ画像をもう一度選べるようにする
  readDraftFromInputs();                           // 先に入力中の文字を取り込んでおく
  try {
    draft[i].img = await imageFileToDataUrl(file);
    sfxOk();
    renderApp(); setDirty(true);
  } catch (e) {
    sfxNg();
    toast(e && e.message === 'TOO_BIG' ? t('set_img_big') : t('set_img_ng'));
  }
});

$('#homeBtn').addEventListener('click', () => {
  sfxTap();
  if (S.mode === 'settings' && draftDirty && !window.confirm(t('set_unsaved') + '\n' + t('home_back') + ' ?')) return;
  setMode('home');
});

/* ================= 会計の確定 ================= */
function finish(method) {
  S.payMethod = method;
  const due = dueAfterPoints();
  if (method === 'cash') {
    S.change = S.inserted - due;
    S.changeBreak = breakChange(S.change);
  } else {
    S.change = 0; S.changeBreak = [];
  }
  if (method === 'majica') S.majicaMoney -= due;
  if (S.hasMajica) {
    S.majicaPoints -= S.usedPoints;
    S.majicaPoints += Math.floor(due / 100);   // 100円で1ポイント（練習用の簡略ルール）
  }
  sfxOk();
  go('done');
}

/* ================= 入力 ================= */
screenEl.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act, v = el.dataset.v;

  switch (act) {
    case 'go': sfxTap(); go(v); break;

    case 'noop':
      sfxTap();
      toast(v === 'charge'
        ? (S.kana ? 'チャージは かいけいの ときに れんしゅう します' : 'チャージはお会計のときに練習します')
        : (S.kana ? 'のこりを しらべる きのうは れんしゅうでは つかいません' : '残高照会は練習では使いません'));
      break;

    case 'bag':
      sfxTap();
      S.bagChoice = v;
      go(v === 'paid' ? 'bagsize' : v === 'my' ? 'mybag' : 'majicaAsk');
      break;

    case 'addbag': {
      const b = BAGS.find((x) => x.id === v);
      addToCart(b); sfxScan(); toast(`${nm(b)} ＋1`); render();
      break;
    }

    case 'majica':
      sfxTap();
      S.hasMajica = v === '1';
      go(S.hasMajica ? 'majicaScan' : 'scan');
      break;

    case 'majicaScan': scannerFx('ピッ', () => go('majicaBalance')); break;

    case 'nb': {
      const n = NO_BARCODE.find((x) => x.id === v);
      addToCart(n); sfxTap(); toast(`${nm(n)} ＋1`); render();
      break;
    }

    case 'del': sfxTap(); removeFromCart(v); render(); break;
    case 'abort': sfxNg(); resetAll(true); go('idle'); break;

    case 'pay':
      sfxTap();
      if (v === 'cash') { S.inserted = 0; S.insCount = {}; S.coinsIn = 0; go('cash'); }
      else if (v === 'credit') go('card');
      else if (v === 'point') { S.pointInput = ''; go('point'); }
      else if (v === 'majica') go(S.majicaMoney >= dueAfterPoints() ? 'majicaPay' : 'majicaShort');
      break;

    case 'ins': {
      const amt = parseInt(v, 10);
      if (amt < 1000) {
        if (S.coinsIn >= 20) { sfxNg(); toast(S.kana ? 'こぜには 20まいまで です' : '硬貨は一度に20枚までです'); break; }
        S.coinsIn += 1;
      }
      S.inserted += amt;
      S.insCount[amt] = (S.insCount[amt] || 0) + 1;
      sfxCoin(); render();
      break;
    }

    case 'cashClear': sfxNg(); S.inserted = 0; S.insCount = {}; S.coinsIn = 0; render(); break;
    case 'cashPay': finish('cash'); break;
    case 'finish': finish(v); break;

    case 'charge': {
      const amt = parseInt(v, 10);
      S.majicaMoney += amt;
      sfxCoin();
      toast(`${yen(amt)} ${S.kana ? 'チャージ しました' : 'チャージしました'}`);
      go(S.majicaMoney >= dueAfterPoints() ? 'majicaPay' : 'majicaShort');
      break;
    }

    case 'pk': {
      sfxTap();
      const max = Math.min(S.majicaPoints, cartTotal());
      if (v === 'clear') S.pointInput = '';
      else if (v === 'back') S.pointInput = S.pointInput.slice(0, -1);
      else if (v === 'all') S.pointInput = String(max);
      else if (S.pointInput.length < 6) S.pointInput = (S.pointInput + v).replace(/^0+(?=\d)/, '');
      render();
      break;
    }

    case 'pointApply':
      S.usedPoints = parseInt(S.pointInput || '0', 10);
      sfxTap();
      if (dueAfterPoints() === 0) finish('point');
      else { toast(`${S.kana ? 'のこり' : '残り'} ${yen(dueAfterPoints())}`); go('payMethod'); }
      break;

    case 'call':
      sfxTap();
      toast(S.kana ? 'てんいんさんを よびました。まって いて ください' : '店員を呼びました。少しお待ちください');
      break;

    case 'english':
      sfxTap();
      toast(S.kana ? 'この れんしゅうアプリは にほんごだけ です' : 'この練習アプリは日本語のみです');
      break;

    case 'cam': sfxTap(); openCamera(v); break;

    case 'restart': sfxTap(); resetAll(true); go('idle'); break;
  }
});

/* カメラ画面を閉じる */
$('#camClose').addEventListener('click', () => { sfxTap(); closeCamera(); });
$('#cam').addEventListener('click', (e) => { if (e.target.id === 'cam') closeCamera(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && CAM.stream) closeCamera(); });

/* トグル */
$('#kanaToggle').addEventListener('click', (e) => {
  S.kana = !S.kana;
  e.currentTarget.setAttribute('aria-pressed', String(S.kana));
  e.currentTarget.textContent = S.kana ? '漢 かんじ' : 'あ ひらがな';
  sfxTap(); render();
});
$('#soundToggle').addEventListener('click', (e) => {
  S.sound = !S.sound;
  e.currentTarget.setAttribute('aria-pressed', String(S.sound));
  e.currentTarget.textContent = S.sound ? '🔊 おと' : '🔇 おと';
  if (S.sound) sfxTap();
});

setMode('home');   /* 最初はスタート画面から */
