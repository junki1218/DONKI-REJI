'use strict';

/* ================= 状態 ================= */
const S = {
  screen: 'idle',
  kana: false,
  sound: true,
  bagChoice: null,          // 'paid' | 'my' | 'none'
  hasMajica: false,
  majicaMoney: 3000,
  majicaPoints: 230,
  cart: [],                 // { id, k, h, icon, price, qty }
  scanned: {},              // 棚の見た目用
  payMethod: null,
  usedPoints: 0,
  inserted: 0,
  insCount: {},             // 投入した金種の枚数
  coinsIn: 0,               // 一度に入れた硬貨の枚数（20枚まで）
  pointInput: '',
  change: 0,
  changeBreak: []
};

const STEPS = ['bag', 'majica', 'scan', 'pay', 'done'];
const STEP_OF = {
  bag: 0, bagsize: 0, mybag: 0,
  majicaAsk: 1, majicaScan: 1, majicaBalance: 1,
  scan: 2, confirm: 2,
  payMethod: 3, cash: 3, card: 3, emoney: 3, gift: 3, point: 3, majicaPay: 3, majicaShort: 3,
  done: 4
};

/* ================= 小道具 ================= */
const $ = (sel) => document.querySelector(sel);
const screenEl = $('#screen');

const t = (key) => (S.kana ? T[key].h : T[key].k);
const nm = (o) => (S.kana ? o.h : o.k);
const yen = (n) => n.toLocaleString('ja-JP') + (S.kana ? 'えん' : '円');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const cartTotal = () => S.cart.reduce((a, i) => a + i.price * i.qty, 0);
const cartCount = () => S.cart.reduce((a, i) => a + i.qty, 0);
const dueAfterPoints = () => Math.max(0, cartTotal() - S.usedPoints);

/* 音（Web Audio のみ。外部ファイルなし） */
let actx = null;
function beep(freq = 1760, dur = 0.09, type = 'square', vol = 0.12) {
  if (!S.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
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

function toast(msg, ms = 2200) {
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

function go(screen) {
  S.screen = screen;
  render();
}

/* ================= カート操作 ================= */
function addToCart(src, qty = 1) {
  const found = S.cart.find((i) => i.id === src.id);
  if (found) found.qty += qty;
  else S.cart.push({ id: src.id, k: src.k, h: src.h, icon: src.icon, price: src.price, qty });
}
function removeFromCart(id) {
  const idx = S.cart.findIndex((i) => i.id === id);
  if (idx < 0) return;
  if (S.cart[idx].qty > 1) S.cart[idx].qty -= 1;
  else S.cart.splice(idx, 1);
  delete S.scanned[id];
}

/* ================= おつりの内訳 ================= */
function breakChange(amount) {
  const units = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];
  const out = [];
  let rest = amount;
  for (const u of units) {
    const n = Math.floor(rest / u);
    if (n > 0) { out.push({ v: u, n }); rest -= u * n; }
  }
  return out;
}

/* ================= リセット ================= */
function resetAll(keepMajica) {
  const money = S.majicaMoney, pts = S.majicaPoints;
  S.bagChoice = null;
  S.hasMajica = false;
  S.cart = [];
  S.scanned = {};
  S.payMethod = null;
  S.usedPoints = 0;
  S.inserted = 0;
  S.insCount = {};
  S.coinsIn = 0;
  S.pointInput = '';
  S.change = 0;
  S.changeBreak = [];
  if (keepMajica) { S.majicaMoney = money; S.majicaPoints = pts; }
  else { S.majicaMoney = 3000; S.majicaPoints = 230; }
}

/* ================= 画面テンプレ ================= */
function head(title, sub) {
  return `<div class="scr-head">
    <div class="scr-title">${esc(title)}</div>
    ${sub ? `<div class="scr-sub">${esc(sub)}</div>` : ''}
  </div>`;
}

function renderSteps() {
  const cur = STEP_OF[S.screen];
  $('#steps').innerHTML = (S.screen === 'idle')
    ? ''
    : STEPS.map((_, i) => `<div class="st${i <= cur ? ' on' : ''}"></div>`).join('');
}

/* ---- 各画面 ---- */
const VIEWS = {

  idle: () => `
    ${head(t('idle_title'), t('idle_sub'))}
    <div class="scr-body" style="justify-content:center;align-items:center;gap:18px">
      <div style="font-size:5rem">🛒</div>
      <button class="btn btn-primary btn-lg" data-act="start">${esc(t('idle_btn'))}</button>
    </div>`,

  bag: () => `
    ${head(t('bag_title'))}
    <div class="scr-body"><div class="tiles">
      <button class="tile" data-act="bag" data-v="paid">
        <span class="ico">🛍️</span><span class="lab">${esc(t('bag_paid'))}</span>
        <span class="sub">S 4円 / L 6円</span></button>
      <button class="tile" data-act="bag" data-v="my">
        <span class="ico">🎒</span><span class="lab">${esc(t('bag_my'))}</span></button>
      <button class="tile" data-act="bag" data-v="none">
        <span class="ico">🏷️</span><span class="lab">${esc(t('bag_none'))}</span></button>
    </div></div>`,

  bagsize: () => `
    ${head(t('bagsize_title'))}
    <div class="scr-body"><div class="tiles">
      ${BAGS.map((b) => {
        const cur = S.cart.find((i) => i.id === b.id);
        return `<button class="tile" data-act="addbag" data-v="${b.id}">
          <span class="ico">${b.icon}</span>
          <span class="lab">${esc(nm(b))}</span>
          <span class="sub">${esc(yen(b.price))}${cur ? ` ／ ${cur.qty}${esc(t('sheets'))}` : ''}</span>
        </button>`;
      }).join('')}
    </div></div>
    <div class="scr-foot">
      <button class="btn btn-ghost" data-act="go" data-v="bag">${esc(t('back'))}</button>
      <button class="btn btn-primary" data-act="go" data-v="majicaAsk">${esc(t('next'))}</button>
    </div>`,

  mybag: () => `
    ${head(t('mybag_title'))}
    <div class="scr-body" style="justify-content:center;align-items:center">
      <div style="font-size:5rem">🎒</div>
    </div>
    <div class="scr-foot">
      <button class="btn btn-ghost" data-act="go" data-v="bag">${esc(t('back'))}</button>
      <button class="btn btn-primary btn-lg" data-act="go" data-v="majicaAsk">${esc(t('next'))}</button>
    </div>`,

  majicaAsk: () => `
    ${head(t('majica_title'))}
    <div class="scr-body" style="justify-content:center;align-items:center;gap:20px">
      <div style="font-size:4.4rem">💳</div>
      <div class="tiles" style="width:min(560px,100%)">
        <button class="tile" data-act="majica" data-v="1">
          <span class="ico">⭕</span><span class="lab">${esc(t('yes'))}</span></button>
        <button class="tile" data-act="majica" data-v="0">
          <span class="ico">❌</span><span class="lab">${esc(t('no'))}</span></button>
      </div>
    </div>`,

  majicaScan: () => `
    ${head(t('mscan_title'), t('mscan_sub'))}
    <div class="scr-body" style="justify-content:center;align-items:center;gap:18px">
      <div style="font-size:4.4rem">💳 ➡️ 📡</div>
      <button class="btn btn-primary btn-lg" data-act="majicaScan">${esc(t('mscan_btn'))}</button>
    </div>`,

  majicaBalance: () => `
    ${head(t('mbal_title'))}
    <div class="scr-body">
      <div class="meter-row">
        <div class="meter"><div class="lab">${esc(t('money'))}</div><div class="val">${esc(yen(S.majicaMoney))}</div></div>
        <div class="meter"><div class="lab">${esc(t('points'))}</div><div class="val">${S.majicaPoints} pt</div></div>
      </div>
    </div>
    <div class="scr-foot">
      <button class="btn btn-primary btn-lg" data-act="go" data-v="scan">${esc(t('confirm'))}</button>
    </div>`,

  scan: () => `
    ${head(t('scan_title'), t('scan_sub'))}
    <div class="scr-body"><div class="scan-wrap">
      <div class="shelf-box">
        <div class="box-title">${esc(t('scan_sub'))}</div>
        <div class="shelf">
          ${PRODUCTS.map((p) => `
            <button class="item${S.scanned[p.id] ? ' scanned' : ''}" data-act="scan" data-v="${p.id}">
              <span class="ico">${p.icon}</span>
              <span class="nm">${esc(nm(p))}</span>
              <span class="pr">${esc(yen(p.price))}</span>
              <span class="bc">${p.barcode}</span>
            </button>`).join('')}
        </div>
      </div>
      <div class="list-box">
        <div class="box-title">${esc(t('nobarcode'))}</div>
        <div class="nb-row">
          ${NO_BARCODE.map((n) => `<button class="nb-btn" data-act="nb" data-v="${n.id}">${n.icon} ${esc(nm(n))}</button>`).join('')}
          <button class="nb-btn" data-act="go" data-v="bagsize">🛍️ ${esc(t('addbag'))}</button>
        </div>
        <div class="box-title">${esc(t('cart'))}（${cartCount()}${esc(t('pieces'))}）</div>
        <div class="lines">
          ${S.cart.length === 0
            ? `<div class="empty">${esc(t('scan_title'))}</div>`
            : S.cart.map((i) => `
              <div class="line">
                <span class="l-ico">${i.icon}</span>
                <span class="l-nm">${esc(nm(i))}</span>
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
    </div></div>
    <div class="scr-foot">
      <button class="btn btn-ghost" data-act="abort">${esc(t('cancel'))}</button>
      <button class="btn btn-primary btn-lg" data-act="go" data-v="confirm" ${S.cart.length ? '' : 'disabled'}>
        ${esc(t('checkout'))}
      </button>
    </div>`,

  confirm: () => `
    ${head(t('conf_title'))}
    <div class="scr-body">
      <div class="big-amount">
        <div class="lab">${esc(t('total'))}（${cartCount()}${esc(t('pieces'))}）</div>
        <div class="val">${esc(yen(cartTotal()))}</div>
      </div>
      ${S.hasMajica ? `<div class="meter-row">
        <div class="meter"><div class="lab">${esc(t('money'))}</div><div class="val">${esc(yen(S.majicaMoney))}</div></div>
        <div class="meter"><div class="lab">${esc(t('points'))}</div><div class="val">${S.majicaPoints} pt</div></div>
      </div>` : ''}
    </div>
    <div class="scr-foot">
      <button class="btn btn-ghost" data-act="go" data-v="scan">${esc(t('back_scan'))}</button>
      <button class="btn btn-primary btn-lg" data-act="go" data-v="payMethod">${esc(t('topay'))}</button>
    </div>`,

  payMethod: () => {
    const opts = [
      { v: 'cash',   ico: '💵', lab: t('pay_cash') },
      { v: 'credit', ico: '💳', lab: t('pay_credit'), sub: S.kana ? '1かいばらい だけ' : '1回払いのみ' },
      { v: 'majica', ico: '🐧', lab: t('pay_majica'), need: true },
      { v: 'point',  ico: '⭐', lab: t('pay_point'),  need: true, sub: S.kana ? '1ポイント = 1えん' : '1ポイント＝1円' },
      { v: 'emoney', ico: '📶', lab: t('pay_emoney'), sub: S.kana ? 'こうつうIC・Edy・iD・QUICPay' : '交通系IC・Edy・iD・QUICPay' },
      { v: 'gift',   ico: '🎟️', lab: t('pay_gift') }
    ];
    return `
    ${head(t('pay_title'), `${t('total')} ${yen(dueAfterPoints())}`)}
    <div class="scr-body"><div class="tiles">
      ${opts.map((o) => {
        const off = o.need && !S.hasMajica;
        return `<button class="tile" data-act="pay" data-v="${o.v}" ${off ? 'disabled style="opacity:.4"' : ''}>
          <span class="ico">${o.ico}</span><span class="lab">${esc(o.lab)}</span>
          ${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}
        </button>`;
      }).join('')}
    </div></div>
    <div class="scr-foot">
      <button class="btn btn-ghost" data-act="go" data-v="confirm">${esc(t('back'))}</button>
    </div>`;
  },

  cash: () => {
    const due = dueAfterPoints();
    const short = Math.max(0, due - S.inserted);
    return `
    ${head(t('cash_title'))}
    <div class="scr-body">
      <div class="meter-row">
        <div class="meter"><div class="lab">${esc(t('total'))}</div><div class="val">${esc(yen(due))}</div></div>
        <div class="meter ${short > 0 ? 'short' : 'done'}">
          <div class="lab">${short > 0 ? esc(t('shortage')) : esc(t('change'))}</div>
          <div class="val">${esc(yen(short > 0 ? short : S.inserted - due))}</div>
        </div>
      </div>
      <div class="big-amount">
        <div class="lab">${esc(t('inserted'))}</div>
        <div class="val ${short > 0 ? '' : 'ok'}">${esc(yen(S.inserted))}</div>
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
          ${COINS.map((c) => `<button class="coin${c.v <= 10 ? ' copper' : ''}" data-act="ins" data-v="${c.v}">${esc(S.kana ? c.h : c.label)}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="scr-foot">
      <button class="btn btn-ghost" data-act="go" data-v="payMethod">${esc(t('back'))}</button>
      <button class="btn btn-ghost" data-act="cashClear">${esc(t('clear'))}</button>
      <button class="btn btn-ok btn-lg" data-act="cashPay" ${short > 0 ? 'disabled' : ''}>${esc(t('pay_now'))}</button>
    </div>`;
  },

  card: () => `
    ${head(t('card_title'), S.kana ? 'クレジットカードは 1かいばらい だけ です' : 'クレジットカードは1回払いのみです')}
    <div class="scr-body" style="justify-content:center;align-items:center;gap:18px">
      <div class="big-amount" style="width:min(420px,100%)">
        <div class="lab">${esc(t('total'))}</div>
        <div class="val">${esc(yen(dueAfterPoints()))}</div>
      </div>
      <div style="font-size:4rem">💳 ➡️ 🏧</div>
      <button class="btn btn-primary btn-lg" data-act="finish" data-v="credit">${esc(t('card_btn'))}</button>
    </div>
    <div class="scr-foot"><button class="btn btn-ghost" data-act="go" data-v="payMethod">${esc(t('back'))}</button></div>`,

  emoney: () => `
    ${head(t('emoney_title'))}
    <div class="scr-body" style="justify-content:center;align-items:center;gap:18px">
      <div class="big-amount" style="width:min(420px,100%)">
        <div class="lab">${esc(t('total'))}</div>
        <div class="val">${esc(yen(dueAfterPoints()))}</div>
      </div>
      <div style="font-size:4rem">📶</div>
      <button class="btn btn-primary btn-lg" data-act="finish" data-v="emoney">${esc(t('emoney_btn'))}</button>
    </div>
    <div class="scr-foot"><button class="btn btn-ghost" data-act="go" data-v="payMethod">${esc(t('back'))}</button></div>`,

  gift: () => `
    ${head(t('gift_title'), t('gift_sub'))}
    <div class="scr-body" style="justify-content:center;align-items:center;gap:18px">
      <div style="font-size:4.4rem">🙋 🎟️</div>
      <button class="btn btn-primary btn-lg" data-act="finish" data-v="gift">${esc(t('call_staff'))}</button>
    </div>
    <div class="scr-foot"><button class="btn btn-ghost" data-act="go" data-v="payMethod">${esc(t('back'))}</button></div>`,

  point: () => {
    const max = Math.min(S.majicaPoints, cartTotal());
    const val = parseInt(S.pointInput || '0', 10);
    const bad = val > max;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00'];
    return `
    ${head(t('point_title'), `${S.kana ? 'つかえる ポイント' : '使えるポイント'} ${max} pt`)}
    <div class="scr-body">
      <div class="big-amount">
        <div class="lab">${esc(t('points'))}</div>
        <div class="val ${bad ? '' : 'ok'}">${val} pt</div>
      </div>
      <div class="keypad">
        ${keys.map((k) => `<button class="btn btn-ghost" data-act="pk" data-v="${k}">${k}</button>`).join('')}
        <button class="btn btn-ghost" data-act="pk" data-v="back">⌫</button>
      </div>
      <div class="scr-foot">
        <button class="btn btn-navy" data-act="pk" data-v="all">${esc(t('use_all'))}</button>
        <button class="btn btn-ghost" data-act="pk" data-v="clear">${esc(t('clear'))}</button>
      </div>
      ${bad ? `<div class="scr-sub" style="color:var(--red);font-weight:800">${esc(S.kana ? 'ポイントが たりません' : 'ポイントが足りません')}</div>` : ''}
    </div>
    <div class="scr-foot">
      <button class="btn btn-ghost" data-act="go" data-v="payMethod">${esc(t('back'))}</button>
      <button class="btn btn-ok btn-lg" data-act="pointApply" ${bad || val <= 0 ? 'disabled' : ''}>${esc(t('confirm'))}</button>
    </div>`;
  },

  majicaPay: () => `
    ${head(t('mpay_title'))}
    <div class="scr-body">
      <div class="meter-row">
        <div class="meter"><div class="lab">${esc(t('total'))}</div><div class="val">${esc(yen(dueAfterPoints()))}</div></div>
        <div class="meter"><div class="lab">${esc(t('money'))}</div><div class="val">${esc(yen(S.majicaMoney))}</div></div>
      </div>
      <div class="scr-sub">${esc(S.kana ? '※ マジカと げんきんの あわせばらいは できません' : '※ majicaマネーと現金の併用はできません')}</div>
    </div>
    <div class="scr-foot">
      <button class="btn btn-ghost" data-act="go" data-v="payMethod">${esc(t('back'))}</button>
      <button class="btn btn-ok btn-lg" data-act="finish" data-v="majica">${esc(t('pay_now'))}</button>
    </div>`,

  majicaShort: () => `
    ${head(t('mpay_short'), t('mpay_short_sub'))}
    <div class="scr-body">
      <div class="meter-row">
        <div class="meter short"><div class="lab">${esc(t('shortage'))}</div><div class="val">${esc(yen(dueAfterPoints() - S.majicaMoney))}</div></div>
        <div class="meter"><div class="lab">${esc(t('money'))}</div><div class="val">${esc(yen(S.majicaMoney))}</div></div>
      </div>
      <div class="tiles">
        <button class="tile" data-act="charge"><span class="ico">⬆️</span><span class="lab">${esc(t('charge'))}</span><span class="sub">1,000円</span></button>
        <button class="tile" data-act="go" data-v="payMethod"><span class="ico">↩️</span><span class="lab">${esc(t('other_pay'))}</span></button>
      </div>
    </div>`,

  done: () => {
    const cb = S.changeBreak;
    return `
    ${head(t('done_title'), S.change > 0 ? t('take_change') : t('receipt'))}
    <div class="scr-body">
      ${S.change > 0 ? `<div class="big-amount">
        <div class="lab">${esc(t('change'))}</div>
        <div class="val ok">${esc(yen(S.change))}</div>
        <div class="sub" style="color:var(--gray);font-size:.9rem;margin-top:6px">
          ${cb.map((c) => `${c.v.toLocaleString('ja-JP')}${S.kana ? 'えん' : '円'}×${c.n}`).join(' ／ ')}
        </div>
      </div>` : ''}
      <div class="receipt">
        <h4>${esc(S.kana ? 'レシート' : 'レ シ ー ト')}</h4>
        ${S.cart.map((i) => `<div class="r-line"><span>${esc(nm(i))} ×${i.qty}</span><span>${(i.price * i.qty).toLocaleString('ja-JP')}</span></div>`).join('')}
        <div class="r-sep"></div>
        <div class="r-line r-total"><span>${esc(t('total'))}</span><span>${cartTotal().toLocaleString('ja-JP')}</span></div>
        ${S.usedPoints > 0 ? `<div class="r-line"><span>${esc(t('pay_point'))}</span><span>-${S.usedPoints.toLocaleString('ja-JP')}</span></div>` : ''}
        <div class="r-line"><span>${esc(payLabel(S.payMethod))}</span><span>${(S.payMethod === 'cash' ? S.inserted : dueAfterPoints()).toLocaleString('ja-JP')}</span></div>
        ${S.change > 0 ? `<div class="r-line"><span>${esc(t('change'))}</span><span>${S.change.toLocaleString('ja-JP')}</span></div>` : ''}
        ${S.hasMajica ? `<div class="r-sep"></div>
          <div class="r-line"><span>majica ${esc(t('money'))}</span><span>${S.majicaMoney.toLocaleString('ja-JP')}</span></div>
          <div class="r-line"><span>majica ${esc(t('points'))}</span><span>${S.majicaPoints} pt</span></div>` : ''}
      </div>
    </div>
    <div class="scr-foot">
      <button class="btn btn-primary btn-lg" data-act="restart">${esc(t('again'))}</button>
    </div>`;
  }
};

function payLabel(m) {
  return ({ cash: t('pay_cash'), credit: t('pay_credit'), majica: t('pay_majica'),
            emoney: t('pay_emoney'), gift: t('pay_gift'), point: t('pay_point') })[m] || '';
}

/* ================= 描画 ================= */
function render() {
  document.body.classList.toggle('kana', S.kana);
  screenEl.innerHTML = (VIEWS[S.screen] || VIEWS.idle)();
  renderSteps();
  screenEl.scrollTop = 0;
}

/* ================= 会計の確定 ================= */
function finish(method) {
  S.payMethod = method;
  const due = dueAfterPoints();

  if (method === 'cash') {
    S.change = S.inserted - due;
    S.changeBreak = breakChange(S.change);
  } else {
    S.change = 0;
    S.changeBreak = [];
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
  const act = el.dataset.act;
  const v = el.dataset.v;

  switch (act) {
    case 'start':
      sfxTap(); go('bag'); break;

    case 'go':
      sfxTap(); go(v); break;

    case 'bag':
      sfxTap();
      S.bagChoice = v;
      if (v === 'paid') go('bagsize');
      else if (v === 'my') go('mybag');
      else go('majicaAsk');
      break;

    case 'addbag': {
      const b = BAGS.find((x) => x.id === v);
      addToCart(b);
      sfxScan();
      toast(`${nm(b)} ＋1`);
      render();
      break;
    }

    case 'majica':
      sfxTap();
      S.hasMajica = v === '1';
      go(S.hasMajica ? 'majicaScan' : 'scan');
      break;

    case 'majicaScan':
      scannerFx('ピッ', () => go('majicaBalance'));
      break;

    case 'scan': {
      const p = PRODUCTS.find((x) => x.id === v);
      scannerFx('ピッ', () => {
        addToCart(p);
        S.scanned[p.id] = true;
        render();
      });
      break;
    }

    case 'nb': {
      const n = NO_BARCODE.find((x) => x.id === v);
      addToCart(n);
      sfxTap();
      toast(`${nm(n)} ＋1`);
      render();
      break;
    }

    case 'del':
      sfxTap(); removeFromCart(v); render(); break;

    case 'abort':
      sfxNg(); resetAll(true); go('idle'); break;

    case 'pay':
      sfxTap();
      if (v === 'cash')   { S.inserted = 0; S.insCount = {}; S.coinsIn = 0; go('cash'); }
      else if (v === 'credit') go('card');
      else if (v === 'emoney') go('emoney');
      else if (v === 'gift')   go('gift');
      else if (v === 'point')  { S.pointInput = ''; go('point'); }
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
      sfxCoin();
      render();
      break;
    }

    case 'cashClear':
      sfxNg(); S.inserted = 0; S.insCount = {}; S.coinsIn = 0; render(); break;

    case 'cashPay':
      finish('cash'); break;

    case 'finish':
      finish(v); break;

    case 'charge':
      S.majicaMoney += 1000;
      sfxCoin();
      toast(S.kana ? '1000えん チャージしました' : '1,000円チャージしました');
      go(S.majicaMoney >= dueAfterPoints() ? 'majicaPay' : 'majicaShort');
      break;

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

    case 'pointApply': {
      S.usedPoints = parseInt(S.pointInput || '0', 10);
      sfxTap();
      if (dueAfterPoints() === 0) finish('point');
      else { toast(`${S.kana ? 'のこり' : '残り'} ${yen(dueAfterPoints())}`); go('payMethod'); }
      break;
    }

    case 'restart':
      sfxTap(); resetAll(true); go('idle'); break;
  }
});

/* トグル */
$('#kanaToggle').addEventListener('click', (e) => {
  S.kana = !S.kana;
  e.currentTarget.setAttribute('aria-pressed', String(S.kana));
  e.currentTarget.textContent = S.kana ? 'あ ひらがな' : '漢 かんじ';
  sfxTap();
  render();
});
$('#soundToggle').addEventListener('click', (e) => {
  S.sound = !S.sound;
  e.currentTarget.setAttribute('aria-pressed', String(S.sound));
  e.currentTarget.textContent = S.sound ? '🔊 おと' : '🔇 おと';
  if (S.sound) sfxTap();
});

render();
