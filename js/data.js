/* 商品データと文言。かなモードは h: に「わかちがき」で入れる */

/* ===== QRカードの中身 =====
   QRに入っているのは「QR1」「QR2」…という番号だけ。
   商品名・値段はこちら側（設定）で持つので、
   カードを刷り直さなくても中身だけ入れ替えられる。
   barcode を入れておくと、本物のJANバーコードでも同じ商品が引ける
   （ブラウザ標準のBarcodeDetectorが使える端末のみ）。 */
const ITEM_COUNT_MAX = 24;
const IMG_SIZE = 160;          // 取り込んだ画像を縮める一辺の大きさ(px)
const IMG_MAX_CHARS = 60000;   // 1枚あたりのデータURLの上限。localStorageを圧迫しないため

const DEFAULT_ITEMS = [
  { id: 'QR1',  k: 'おにぎり ツナマヨ', h: 'おにぎり ツナマヨ',      price: 150, icon: '🍙', barcode: '4901234567890' },
  { id: 'QR2',  k: 'メロンパン',        h: 'メロンパン',             price: 128, icon: '🍞', barcode: '4902345678901' },
  { id: 'QR3',  k: '牛乳 1L',           h: 'ぎゅうにゅう 1リットル', price: 238, icon: '🥛', barcode: '4903456789012' },
  { id: 'QR4',  k: 'たまご 10個',       h: 'たまご 10こ',            price: 268, icon: '🥚', barcode: '4904567890123' },
  { id: 'QR5',  k: 'オレンジジュース',  h: 'オレンジジュース',       price: 198, icon: '🧃', barcode: '4905678901234' },
  { id: 'QR6',  k: 'ポテトチップス',    h: 'ポテトチップス',         price: 108, icon: '🥔', barcode: '4906789012345' },
  { id: 'QR7',  k: 'チョコレート',      h: 'チョコレート',           price: 158, icon: '🍫', barcode: '4907890123456' },
  { id: 'QR8',  k: 'プリン 3個',        h: 'プリン 3こ',             price: 178, icon: '🍮', barcode: '4908901234567' },
  { id: 'QR9',  k: 'カップラーメン',    h: 'カップラーメン',         price: 138, icon: '🍜', barcode: '4909012345678' },
  { id: 'QR10', k: 'はみがき粉',        h: 'はみがきこ',             price: 298, icon: '🪥', barcode: '4900123456789' },
  { id: 'QR11', k: 'えんぴつ 5本',      h: 'えんぴつ 5ほん',         price: 220, icon: '✏️', barcode: '4911234567890' },
  { id: 'QR12', k: 'ティッシュ 5箱',    h: 'ティッシュ 5はこ',       price: 358, icon: '🧻', barcode: '4912345678901' }
];

const STORE_KEY = 'donkireji.items.v1';

/* 1件ぶんを安全な形に整える。設定画面からの入力も、保存済みの値もここを通す */
function normalizeItem(raw, index) {
  const src = raw || {};
  const price = Math.max(0, Math.min(99999, Math.round(Number(src.price)) || 0));
  const k = String(src.k == null ? '' : src.k).trim().slice(0, 30) || `しょうひん${index + 1}`;
  /* img はローカル画像を取り込んだときのデータURL。
     容量を食うので、取り込み時に小さく作り直したものだけを入れる。
     不正な値が紛れ込んでも描画しないよう、ここで形を確かめる */
  const rawImg = String(src.img == null ? '' : src.img);
  const img = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(rawImg) && rawImg.length <= IMG_MAX_CHARS
    ? rawImg : '';
  return {
    id: `QR${index + 1}`,                        // 番号は並び順から必ず振り直す
    k,
    h: String(src.h == null ? '' : src.h).trim().slice(0, 30) || k,   // よみが空なら商品名をそのまま使う
    price,
    icon: String(src.icon == null ? '' : src.icon).trim().slice(0, 4) || '📦',
    img,
    barcode: String(src.barcode == null ? '' : src.barcode).replace(/[^0-9]/g, '').slice(0, 14)
  };
}

const cloneDefaults = () => DEFAULT_ITEMS.map((it, i) => normalizeItem(it, i));

function loadItems() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return cloneDefaults();
    return parsed.slice(0, ITEM_COUNT_MAX).map(normalizeItem);
  } catch (e) {
    return cloneDefaults();                       // 壊れていたら初期値で動かす
  }
}

function saveItems(items) {
  const clean = items.slice(0, ITEM_COUNT_MAX).map(normalizeItem);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(clean));
  } catch (e) {
    return null;                                  // 保存できない設定のブラウザでも落とさない
  }
  return clean;
}

function resetItems() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 消せなくても初期値で続行 */ }
  return cloneDefaults();
}

/* ローカル画像を読み込んで、正方形に切り出し・縮小したデータURLを返す。
   そのまま保存すると localStorage がすぐ一杯になるので必ず小さくする。 */
function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('NOT_IMAGE')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);   // 中央を正方形に切り出す
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const cv = document.createElement('canvas');
        cv.width = IMG_SIZE; cv.height = IMG_SIZE;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, IMG_SIZE, IMG_SIZE);
        let out = cv.toDataURL('image/jpeg', 0.8);
        if (out.length > IMG_MAX_CHARS) out = cv.toDataURL('image/jpeg', 0.6);
        if (out.length > IMG_MAX_CHARS) { reject(new Error('TOO_BIG')); return; }
        resolve(out);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('DECODE')); };
    img.src = url;
  });
}

/* 読み取ったコードから商品を引く。QR番号でも本物のJANでも引ける */
function findItemByCode(items, code) {
  const c = String(code).trim();
  const upper = c.toUpperCase();
  return items.find((it) => it.id === upper) || items.find((it) => it.barcode && it.barcode === c) || null;
}

let PRODUCTS = loadItems();

/* バーコードのない商品（画面左のボタンから選ぶ） */
const NO_BARCODE = [
  { id: 'yasai',    k: 'やさい',   h: 'やさい',   price: 128, icon: '🥬' },
  { id: 'kudamono', k: 'くだもの', h: 'くだもの', price: 198, icon: '🍎' },
  { id: 'osakana',  k: 'おさかな', h: 'おさかな', price: 398, icon: '🐟' },
  { id: 'sonota',   k: 'その他',   h: 'そのほか', price: 100, icon: '📦' }
];

const BAGS = [
  { id: 'bagS', k: '有料レジ袋 S', h: 'レジぶくろ S', price: 4, icon: '🛍️' },
  { id: 'bagL', k: '有料レジ袋 L', h: 'レジぶくろ L', price: 6, icon: '🛍️' }
];

/* 現金（紙幣・硬貨） */
const BILLS = [
  { v: 10000, label: '一万円', h: 'いちまんえん' },
  { v: 5000,  label: '五千円', h: 'ごせんえん' },
  { v: 1000,  label: '千円',   h: 'せんえん' }
];
const COINS = [
  { v: 500, label: '500円', h: '500えん' },
  { v: 100, label: '100円', h: '100えん' },
  { v: 50,  label: '50円',  h: '50えん' },
  { v: 10,  label: '10円',  h: '10えん' },
  { v: 5,   label: '5円',   h: '5えん' },
  { v: 1,   label: '1円',   h: '1えん' }
];

/* 画面文言。t() で参照する */
const T = {
  /* --- 上部メッセージバー（実機の文言そのまま） --- */
  msg_idle:   { k: 'いらっしゃいませ\nレジ袋(有料)、マイバッグ、袋不要の\nいずれかを選んでください',
                h: 'いらっしゃいませ\nレジぶくろ（ゆうりょう）、マイバッグ、ふくろいらない の\nどれかを えらんで ください' },
  msg_bagsize:{ k: 'レジ袋のサイズと枚数を選んでください',
                h: 'レジぶくろの おおきさと まいすうを えらんで ください' },
  msg_mybag:  { k: '空のマイバッグを袋台の上に置いて\n［次へ］ボタンを押してください',
                h: 'からの マイバッグを ふくろだいの うえに おいて\n［つぎへ］ボタンを おして ください' },
  msg_majica: { k: 'majicaをお持ちですか\nお持ちであればカード裏面をスキャン\nお持ちでなければ［いいえ］を選んでください',
                h: 'マジカを もって いますか\nもって いれば カードの うらを スキャン\nもって いなければ［いいえ］を えらんで ください' },
  msg_mscan:  { k: 'majicaカードの裏面を\n左横のスキャナで読み取ってください',
                h: 'マジカカードの うらを\nひだりよこの スキャナで よみとって ください' },
  msg_mbal:   { k: 'majica残高を確認して\n［確認］ボタンを押してください',
                h: 'マジカの のこりを みて\n［かくにん］ボタンを おして ください' },
  msg_scan:   { k: '商品のバーコードをスキャナに\nかざしてください',
                h: 'しょうひんの バーコードを スキャナに\nかざして ください' },
  msg_confirm:{ k: '商品の登録内容を確認して\n［お支払いへ］ボタンを押してください',
                h: 'かった ものを みて\n［おしはらいへ］ボタンを おして ください' },
  msg_pay:    { k: 'お支払方法を選択してください',
                h: 'はらいかたを えらんで ください' },
  msg_cash:   { k: '紙幣・硬貨を投入してください',
                h: 'おさつ・こぜにを いれて ください' },
  msg_card:   { k: 'クレジットカードをご用意ください\nお支払いは1回払いのみです',
                h: 'クレジットカードを ようい して ください\n1かいばらい だけ です' },
  msg_point:  { k: '利用するポイント数を入力して\n［確認］ボタンを押してください',
                h: 'つかう ポイントを いれて\n［かくにん］ボタンを おして ください' },
  msg_mpay:   { k: 'majicaマネーでお支払いします\nよろしければ［支払う］を押してください',
                h: 'マジカマネーで はらいます\nよければ［はらう］を おして ください' },
  msg_mshort: { k: 'majica残高が不足しています\nチャージするか別のお支払方法を選んでください',
                h: 'マジカの のこりが たりません\nチャージするか ほかの はらいかたを えらんで ください' },
  msg_charge: { k: 'チャージ金額を選択して\n紙幣を投入してください',
                h: 'チャージする きんがくを えらんで\nおさつを いれて ください' },
  msg_done:   { k: 'ありがとうございました\nおつりとレシートをお取りください',
                h: 'ありがとう ございました\nおつりと レシートを とって ください' },
  msg_done_nc:{ k: 'ありがとうございました\nレシートをお取りください',
                h: 'ありがとう ございました\nレシートを とって ください' },

  /* --- トップ画面 --- */
  bag_notice:      { k: 'レジ袋は有料です',        h: 'レジぶくろは ゆうりょうです' },
  bag_paid:        { k: '有料レジ袋',             h: 'ゆうりょう レジぶくろ' },
  bag_my:          { k: 'マイバッグ',             h: 'マイバッグ' },
  bag_none:        { k: '袋不要\nお買上シール',    h: 'ふくろ いらない\nおかいあげシール' },
  top_charge:      { k: 'チャージ',               h: 'チャージ' },
  top_balance:     { k: 'majica\n交通系IC\n楽天Edy\n残高照会', h: 'マジカ\nこうつうけいIC\nらくてんEdy\nのこり しらべ' },

  /* --- 支払方法（実機は4つ） --- */
  pay_majica:  { k: 'マジカ払/チャージ', h: 'マジカで はらう', en: 'majica / Charge' },
  pay_point:   { k: 'ポイント払',        h: 'ポイントで はらう', en: 'majica Point' },
  pay_cash:    { k: '現金',              h: 'げんきん',        en: 'Cash' },
  pay_credit:  { k: 'クレジットカード',   h: 'クレジットカード', en: 'Credit Card' },

  /* --- 下部バー --- */
  call_staff:  { k: '店員呼出',    h: 'てんいんさん を よぶ' },
  english:     { k: 'English',    h: 'English' },
  majica_rest: { k: 'majica残',   h: 'マジカ のこり' },
  point_rest:  { k: 'ポイント残',  h: 'ポイント のこり' },

  /* --- 共通ラベル --- */
  yes:        { k: 'はい',       h: 'はい' },
  no:         { k: 'いいえ',     h: 'いいえ' },
  next:       { k: '次へ',       h: 'つぎへ' },
  back:       { k: 'もどる',     h: 'もどる' },
  confirm:    { k: '確認',       h: 'かくにん' },
  checkout:   { k: 'お会計',     h: 'おかいけい' },
  topay:      { k: 'お支払いへ',  h: 'おしはらいへ' },
  pay_now:    { k: '支払う',     h: 'はらう' },
  clear:      { k: '訂正',       h: 'なおす' },
  cancel:     { k: '最初から',    h: 'さいしょから' },
  again:      { k: 'もういちど',  h: 'もういちど' },
  charge:     { k: 'チャージする', h: 'チャージする' },
  other_pay:  { k: '別のお支払方法', h: 'ほかの はらいかた' },
  use_all:    { k: '全ポイント',  h: 'ぜんぶ つかう' },
  total:      { k: '合計',       h: 'ごうけい' },
  money:      { k: 'majicaマネー', h: 'マジカマネー' },
  points:     { k: 'ポイント',    h: 'ポイント' },
  change:     { k: 'おつり',      h: 'おつり' },
  inserted:   { k: '投入金額',    h: 'いれた おかね' },
  shortage:   { k: '不足',       h: 'たりない' },
  bills:      { k: '紙幣',       h: 'おさつ' },
  coins:      { k: '硬貨',       h: 'こぜに' },
  nobarcode:  { k: 'バーコードのない商品', h: 'バーコードが ない しょうひん' },
  cart:       { k: '登録済み商品', h: 'かった しょうひん' },
  addbag:     { k: 'レジ袋追加',  h: 'レジぶくろを たす' },
  receipt:    { k: 'レシート',    h: 'レシート' },
  cam_scan:   { k: 'カメラでスキャン', h: 'カメラで よみとる' },
  cam_majica: { k: 'カメラで読み取る', h: 'カメラで よみとる' },
  cam_close:  { k: 'とじる',       h: 'とじる' },

  /* --- スタート画面・設定画面（実機にはない、アプリ側の画面） --- */
  home_title:   { k: 'レジの れんしゅう',       h: 'レジの れんしゅう' },
  home_sub:     { k: 'どちらかを えらんでください', h: 'どちらかを えらんで ください' },
  home_play:    { k: 'レジ練習',               h: 'レジ れんしゅう' },
  home_play_s:  { k: 'セルフレジを つかってみる', h: 'セルフレジを つかって みる' },
  home_setting: { k: '設定',                   h: 'せってい' },
  home_set_s:   { k: 'QRの 商品名と 値段を かえる', h: 'QRの なまえと ねだんを かえる' },
  home_back:    { k: 'さいしょの画面へ',        h: 'さいしょの がめんへ' },

  set_title:    { k: '商品の設定',             h: 'しょうひんの せってい' },
  set_lead:     { k: 'QRカードの 番号ごとに、商品名と 値段を 決められます。印刷したカードは そのまま使えます。',
                  h: 'QRカードの ばんごうごとに、なまえと ねだんを きめられます。いんさつした カードは そのまま つかえます。' },
  set_name:     { k: '商品名',                 h: 'なまえ' },
  set_kana:     { k: 'よみ（ひらがな）',        h: 'よみ（ひらがな）' },
  set_kana_ph:  { k: '空なら商品名をそのまま使います', h: 'からなら なまえを そのまま つかいます' },
  set_price:    { k: '値段',                   h: 'ねだん' },
  set_icon:     { k: '絵文字',                 h: 'えもじ' },
  set_img:      { k: '写真',                   h: 'しゃしん' },
  set_img_pick: { k: '画像をえらぶ',            h: 'がぞうを えらぶ' },
  set_img_del:  { k: '写真をけす',              h: 'しゃしんを けす' },
  set_img_hint: { k: '写真を入れると絵文字より優先されます', h: 'しゃしんを いれると えもじより さきに でます' },
  set_img_ng:   { k: '画像を読み込めませんでした', h: 'がぞうを よみこめませんでした' },
  set_img_big:  { k: 'この画像は大きすぎます。別の画像を試してください', h: 'この がぞうは おおきすぎます' },
  set_full:     { k: '保存できる容量を超えました。写真を減らしてください', h: 'ほぞんできる りょうを こえました。しゃしんを へらして ください' },
  set_barcode:  { k: 'バーコード番号（任意）',   h: 'バーコードばんごう（なくてもよい）' },
  set_save:     { k: '保存する',               h: 'ほぞん する' },
  set_saved:    { k: '保存しました',           h: 'ほぞん しました' },
  set_unsaved:  { k: '保存されていない変更があります', h: 'ほぞんして いない へんこうが あります' },
  set_add:      { k: 'QRを ふやす',            h: 'QRを ふやす' },
  set_del:      { k: 'けす',                   h: 'けす' },
  set_reset:    { k: '最初の内容にもどす',      h: 'さいしょの ないように もどす' },
  set_reset_q:  { k: '全部の商品を最初の内容にもどします。よろしいですか？', h: 'ぜんぶ さいしょに もどします。いいですか？' },
  set_cards:    { k: 'QRカードを印刷',          h: 'QRカードを いんさつ' },
  set_max:      { k: 'QRは24個までです',        h: 'QRは 24こ までです' },
  set_min:      { k: 'QRは1個以上 必要です',    h: 'QRは 1こ いじょう ひつようです' },
  set_nostore:  { k: 'このブラウザでは設定を保存できません（開き直すと元に戻ります）',
                  h: 'この ブラウザでは せっていを ほぞん できません' },
  sheets:     { k: '枚',         h: 'まい' },
  pieces:     { k: '点',         h: 'こ' },
  yen:        { k: '円',         h: 'えん' }
};
