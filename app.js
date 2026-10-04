/* Holo — scanner et cote de cartes. Application personnelle, 100 % côté navigateur.
 * Données cartes et cotes : API TCGdex (cotes Cardmarket et TCGplayer).
 * Reconnaissance : API Gemini (clé personnelle stockée sur l'appareil).
 */
'use strict';

/* ================= Constantes ================= */
const TCGDEX = 'https://api.tcgdex.net/v2';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-flash-latest';

// Langues : code TCGdex, drapeau, si la carte partage l'identifiant et la cote internationale
const LANGS = {
  fr: { label: 'Français', flag: '🇫🇷', tcg: 'fr', intl: true },
  en: { label: 'Anglais', flag: '🇬🇧', tcg: 'en', intl: true },
  de: { label: 'Allemand', flag: '🇩🇪', tcg: 'de', intl: true },
  it: { label: 'Italien', flag: '🇮🇹', tcg: 'it', intl: true },
  es: { label: 'Espagnol', flag: '🇪🇸', tcg: 'es', intl: true },
  pt: { label: 'Portugais', flag: '🇵🇹', tcg: 'pt-br', intl: true },
  nl: { label: 'Néerlandais', flag: '🇳🇱', tcg: 'nl', intl: true },
  pl: { label: 'Polonais', flag: '🇵🇱', tcg: 'pl', intl: true },
  ru: { label: 'Russe', flag: '🇷🇺', tcg: 'ru', intl: true },
  ja: { label: 'Japonais', flag: '🇯🇵', tcg: 'ja', intl: false },
  ko: { label: 'Coréen', flag: '🇰🇷', tcg: 'ko', intl: false },
  'zh-tw': { label: 'Chinois trad.', flag: '🇹🇼', tcg: 'zh-tw', intl: false },
  'zh-cn': { label: 'Chinois simpl.', flag: '🇨🇳', tcg: 'zh-cn', intl: false },
  id: { label: 'Indonésien', flag: '🇮🇩', tcg: 'id', intl: false },
  th: { label: 'Thaï', flag: '🇹🇭', tcg: 'th', intl: false },
};
const VARIANTS = { normal: 'Normale', holo: 'Holo', reverse: 'Reverse', first_edition: '1ʳᵉ édition', unknown: 'Non précisée' };
const CONDITIONS = { MT: 'Mint', NM: 'Near Mint', EX: 'Excellent', GD: 'Good', LP: 'Light Played', PL: 'Played', PO: 'Poor' };
const GRADERS = ['PSA', 'CollectGrade', 'PCA', 'CGC', 'BGS', 'SGC', 'Autre'];

/* ================= Utilitaires ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const usdFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' });
const eur = v => (v == null || isNaN(v)) ? '–' : eurFmt.format(v);
const usd = v => (v == null || isNaN(v)) ? '–' : usdFmt.format(v);
const pct = v => (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
const signedEur = v => (v >= 0 ? '+' : '−') + eurFmt.format(Math.abs(v));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const todayISO = () => new Date().toLocaleDateString('sv-SE');
const isoToMs = iso => new Date(iso + 'T12:00:00').getTime();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
const normNum = s => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '').split('/')[0].replace(/^([A-Z-]*)0+(\d)/, '$1$2');
const uniq = a => [...new Set(a.filter(Boolean))];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtDate = (d, opts = { day: 'numeric', month: 'short' }) => new Date(d).toLocaleDateString('fr-FR', opts);
const flag = l => LANGS[l]?.flag || '🏳️';
const langLabel = l => LANGS[l]?.label || 'Langue ?';
const imgUrl = (base, q = 'low') => base ? `${base}/${q}.webp` : '';
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 63 88"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#c084fc"/></linearGradient></defs><rect width="63" height="88" rx="4" fill="url(#g)" opacity=".35"/><rect x="6" y="6" width="51" height="76" rx="3" fill="none" stroke="#fff" stroke-opacity=".5"/><text x="31.5" y="50" font-size="14" text-anchor="middle" fill="#fff" fill-opacity=".8" font-family="sans-serif">?</text></svg>');

function baseName(n) {
  if (!n) return '';
  return n.replace(/[-\s]*(ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|LV\.?X|δ|☆|Prime|LEGEND|TAG TEAM)\b.*$/u, '').replace(/^(Dark|Light|Obscur|Lumineux|Shining|Radiant|Radieux|Galarian|Alolan|Hisuian|Paldean)\s+/i, '').trim();
}

let toastTimer;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (type ? ' ' + type : ''); t.hidden = true; void t.offsetWidth; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3200);
}

async function fetchJSON(url, opts = {}, timeout = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; try { e.body = await r.text(); } catch { } throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}

/* ================= Réglages ================= */
const SETTINGS_KEY = 'holo.settings';
const settings = Object.assign({
  apiKey: '', model: DEFAULT_MODEL, priceRef: 'trend', usdRate: 0.86, usdRateDate: '', usdRateManual: false,
  autoRefresh: true, lastRefresh: 0,
}, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })());
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { } }

/* ================= Base locale (IndexedDB) ================= */
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const req = indexedDB.open('holo', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('items', { keyPath: 'id' });
        d.createObjectStore('scans', { keyPath: 'id' });
        d.createObjectStore('snapshots', { keyPath: 'date' });
        d.createObjectStore('cache', { keyPath: 'key' });
      };
      req.onsuccess = () => { this.db = req.result; res(this.db); };
      req.onerror = () => rej(req.error);
    });
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then(v => out = v);
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
    });
  },
  all(store) { return this.tx(store, 'readonly', s => new Promise(r => { const q = s.getAll(); q.onsuccess = () => r(q.result); })); },
  get(store, key) { return this.tx(store, 'readonly', s => new Promise(r => { const q = s.get(key); q.onsuccess = () => r(q.result); })); },
  put(store, val) { return this.tx(store, 'readwrite', s => { s.put(val); }); },
  putMany(store, vals) { return this.tx(store, 'readwrite', s => { vals.forEach(v => s.put(v)); }); },
  del(store, key) { return this.tx(store, 'readwrite', s => { s.delete(key); }); },
  clear(store) { return this.tx(store, 'readwrite', s => { s.clear(); }); },
};

/* ================= TCGdex ================= */
const memCache = new Map();
async function cached(key, ttlMs, loader, force = false) {
  if (!force) {
    const m = memCache.get(key);
    if (m && Date.now() - m.t < ttlMs) return m.data;
    try {
      const c = await DB.get('cache', key);
      if (c && Date.now() - c.t < ttlMs) { memCache.set(key, c); return c.data; }
    } catch { }
  }
  try {
    const data = await loader();
    const rec = { key, t: Date.now(), data };
    memCache.set(key, rec);
    DB.put('cache', rec).catch(() => { });
    return data;
  } catch (e) {
    // hors ligne : on ressert la dernière version connue, même périmée
    const c = memCache.get(key) || await DB.get('cache', key).catch(() => null);
    if (c) return c.data;
    throw e;
  }
}
const H = 3600e3;
function tcgList(lang, name) {
  return cached(`l:${lang}:${name.toLowerCase()}`, 72 * H, () => fetchJSON(`${TCGDEX}/${lang}/cards?name=${encodeURIComponent(name)}`));
}
function tcgCard(lang, id, force = false) {
  return cached(`c:${lang}:${id}`, 12 * H, () => fetchJSON(`${TCGDEX}/${lang}/cards/${encodeURIComponent(id)}`), force);
}

/* ================= Cotes ================= */
function hasHolo(cm) { return ['trend-holo', 'avg-holo', 'avg30-holo', 'low-holo'].some(k => num(cm[k])); }
function extractPrices(card, variant) {
  if (!card?.pricing) return { cm: null, tp: null };
  const raw = card.pricing.cardmarket;
  let cm = null;
  if (raw) {
    const build = sfx => {
      const g = k => num(raw[k + sfx]);
      return { trend: g('trend'), avg: g('avg'), low: g('low'), avg1: g('avg1'), avg7: g('avg7'), avg30: g('avg30'), foil: !!sfx, updated: raw.updated || null };
    };
    // Sur Cardmarket, la version "holo/foil" d'une carte correspond le plus souvent au reverse.
    cm = (variant === 'reverse' && hasHolo(raw)) ? build('-holo') : build('');
    if (!cm.trend && !cm.avg && !cm.avg30 && hasHolo(raw)) cm = build('-holo');
    if (!cm.trend && !cm.avg && !cm.avg30 && !cm.low) cm = null;
  }
  let tp = null;
  const rawTp = card.pricing.tcgplayer;
  if (rawTp) {
    const keys = Object.keys(rawTp).filter(k => rawTp[k] && typeof rawTp[k] === 'object');
    const prefs = {
      reverse: [/reverse/i], holo: [/^holo/i, /holofoil/i], first_edition: [/1st/i, /first/i],
      normal: [/^normal$/i], unknown: [/^normal$/i, /^holo/i],
    }[variant || 'unknown'] || [/^normal$/i];
    let key = null;
    for (const re of prefs) { key = keys.find(k => re.test(k) && num(rawTp[k].marketPrice ?? rawTp[k].midPrice)); if (key) break; }
    if (!key) key = keys.find(k => num(rawTp[k].marketPrice ?? rawTp[k].midPrice));
    if (key) {
      const o = rawTp[key];
      tp = { variant: key, market: num(o.marketPrice), low: num(o.lowPrice), mid: num(o.midPrice), high: num(o.highPrice), updated: rawTp.updated || null };
    }
  }
  return { cm, tp };
}
function priceValue(prices, ref = settings.priceRef) {
  if (!prices) return { v: null, src: null };
  const { cm, tp } = prices;
  const r = settings.usdRate || 0.86;
  if (ref === 'tcgplayer' && tp && (tp.market || tp.mid)) return { v: (tp.market || tp.mid) * r, src: 'TCGplayer' };
  if (cm) {
    const v = cm[ref] ?? cm.trend ?? cm.avg ?? cm.avg30 ?? cm.avg7 ?? cm.low;
    if (v) return { v, src: 'Cardmarket' };
  }
  if (tp && (tp.market || tp.mid)) return { v: (tp.market || tp.mid) * r, src: 'TCGplayer' };
  return { v: null, src: null };
}
function itemValue(it) {
  if (num(it.manualPrice)) return { v: it.manualPrice, src: 'Ta cote', each: it.manualPrice, total: it.manualPrice * (it.qty || 1) };
  const p = priceValue(it.prices);
  return { ...p, each: p.v, total: p.v == null ? null : p.v * (it.qty || 1), raw: !!it.graded };
}

/* ================= Gemini ================= */
const DETECT_PROMPT = `You are an expert Pokémon Trading Card Game card identifier.
The image may contain one or many Pokémon cards: loose on a table, in a binder page, sleeved, or inside a graded slab.
Detect EVERY card whose front side is visible. For each card return:
- name: the card name exactly as printed, in the card's printed language (e.g. "Dracaufeu ex", "Glurak", "リザードン"). Keep suffixes like ex, V, VMAX, VSTAR, GX as printed.
- name_en: the official English name of this exact card.
- number: the collector number printed at the bottom, only the part before the slash (e.g. "136" from "136/189", or "TG05", "GG12", "SWSH050", "SV049").
- set_total: the number after the slash if present (e.g. "189"), else "".
- set_code: the set abbreviation printed near the number if visible (e.g. "PAR", "SVI", "MEW", "sv2a"), else "".
- language: printed language of the card text, one of: fr, en, de, it, es, pt, nl, pl, ru, ja, ko, zh-tw, zh-cn, id, th, unknown. Clues: "HP" English, "PV" French, "KP" German, "PS" Italian/Spanish/Portuguese (decide from the words), kana/kanji Japanese, Hangul Korean, traditional vs simplified Chinese.
- variant: "holo" (the artwork itself is holographic), "reverse" (the frame/background is holographic but not the artwork), "first_edition" (1st edition stamp), "normal", or "unknown".
- graded: true if the card is inside a grading slab; then grading_company (PSA, CGC, BGS, SGC, CollectGrade, PCA...) and grade as printed on the label (e.g. "10", "9.5"); otherwise empty strings.
- box: bounding box of the card as [ymin, xmin, ymax, xmax] normalized to 0-1000.
- confidence: 0 to 1, how sure you are of name AND number together.
If a number is hard to read, give your best guess and lower the confidence. Never invent cards that are not in the image. Answer with JSON only.`;

const DETECT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' }, name_en: { type: 'STRING' }, number: { type: 'STRING' },
          set_total: { type: 'STRING' }, set_code: { type: 'STRING' },
          language: { type: 'STRING', enum: ['fr', 'en', 'de', 'it', 'es', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh-tw', 'zh-cn', 'id', 'th', 'unknown'] },
          variant: { type: 'STRING', enum: ['normal', 'holo', 'reverse', 'first_edition', 'unknown'] },
          graded: { type: 'BOOLEAN' }, grading_company: { type: 'STRING' }, grade: { type: 'STRING' },
          box: { type: 'ARRAY', items: { type: 'INTEGER' } },
          confidence: { type: 'NUMBER' },
        },
        required: ['name', 'number', 'language', 'box'],
      },
    },
  },
  required: ['cards'],
};

function geminiError(e) {
  const b = (e.body || '').toString();
  if (e.name === 'AbortError') return 'Gemini met trop de temps à répondre. Réessaie.';
  if (e.status === 400 && /API_KEY|api key/i.test(b)) return 'Clé Gemini invalide. Vérifie-la dans Réglages.';
  if (e.status === 403) return 'Clé Gemini refusée (droits ou API non activée).';
  if (e.status === 404) return `Modèle « ${settings.model} » introuvable. Change de modèle dans Réglages.`;
  if (e.status === 429) return 'Quota Gemini atteint. Attends une minute ou demain (offre gratuite).';
  if (e.status >= 500) return 'Gemini est indisponible pour le moment. Réessaie.';
  if (!navigator.onLine) return 'Pas de connexion internet.';
  return 'Erreur Gemini : ' + (e.message || 'inconnue');
}
async function geminiCall(parts, withSchema) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };
  if (withSchema) body.generationConfig.responseSchema = DETECT_SCHEMA;
  const data = await fetchJSON(`${GEMINI}/${encodeURIComponent(settings.model || DEFAULT_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
    body: JSON.stringify(body),
  }, 90000);
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  return text;
}
function parseLooseJSON(text) {
  const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(clean); } catch { }
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Réponse illisible');
}
async function geminiDetect(b64) {
  if (!settings.apiKey) { const e = new Error('nokey'); e.nokey = true; throw e; }
  const parts = [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: DETECT_PROMPT }];
  let text;
  try { text = await geminiCall(parts, true); }
  catch (e) {
    // certains modèles refusent le schéma : on retente sans
    if (e.status === 400 && !/API_KEY|api key/i.test(e.body || '')) text = await geminiCall(parts, false);
    else throw e;
  }
  const json = parseLooseJSON(text);
  const cards = Array.isArray(json) ? json : (json.cards || []);
  return cards.filter(c => c && (c.name || c.name_en)).map(c => ({
    name: String(c.name || c.name_en || '').trim(),
    name_en: String(c.name_en || '').trim(),
    number: String(c.number || '').trim(),
    set_total: String(c.set_total || '').trim(),
    set_code: String(c.set_code || '').trim(),
    language: LANGS[c.language] ? c.language : 'unknown',
    variant: VARIANTS[c.variant] ? c.variant : 'unknown',
    graded: !!c.graded,
    grading_company: String(c.grading_company || '').trim(),
    grade: String(c.grade || '').trim(),
    box: Array.isArray(c.box) && c.box.length === 4 ? c.box.map(Number) : null,
    confidence: typeof c.confidence === 'number' ? c.confidence : null,
  }));
}

/* ================= Identification ================= */
function summarize(card, tcgLang) {
  const set = card.set || {};
  return {
    cardId: card.id, tcgLang, name: card.name, localId: card.localId,
    setId: set.id || '', setName: set.name || '', total: set.cardCount?.official ?? set.cardCount?.total ?? '',
    rarity: card.rarity || '', image: card.image || null, illustrator: card.illustrator || '',
  };
}
async function resolveCard(cardId, lang, srcLang, srcCard, variant) {
  const L = LANGS[lang] || LANGS.en;
  let local = srcLang === L.tcg ? srcCard : await tcgCard(L.tcg, cardId).catch(() => null);
  let priceCard = local?.pricing ? local : null;
  let enCard = srcLang === 'en' ? srcCard : null;
  if (L.intl && (!priceCard || !local?.image)) {
    enCard = enCard || await tcgCard('en', cardId).catch(() => null);
    if (!priceCard && enCard?.pricing) priceCard = enCard;
  }
  if (!priceCard && srcCard?.pricing) priceCard = srcCard;
  const base = local || srcCard;
  const match = summarize(base, local ? L.tcg : srcLang);
  if (!match.image) match.image = enCard?.image || srcCard?.image || null;
  match.nameEn = enCard?.name || (srcLang === 'en' ? srcCard.name : '') || '';
  // carte asiatique retrouvée via la version anglaise : la cote n'est pas celle de la carte
  match.crossMatched = !L.intl && srcLang !== L.tcg;
  return { match, prices: extractPrices(priceCard, variant), pricesUpdated: Date.now() };
}

async function identify(det) {
  const lang = LANGS[det.language] ? det.language : (det.name_en ? 'en' : 'fr');
  const tl = LANGS[lang].tcg;
  const n = normNum(det.number);
  const tries = uniq([det.name, baseName(det.name)]).map(x => [tl, x]);
  if (det.name_en) uniq([det.name_en, baseName(det.name_en)]).forEach(x => tries.push(['en', x]));
  if (tl !== 'fr' && det.language === 'unknown') tries.push(['fr', det.name]);

  let found = null;
  for (const [l, q] of tries) {
    if (!q || q.length < 2) continue;
    let list;
    try { list = await tcgList(l, q); } catch (e) { if (!navigator.onLine) throw e; continue; }
    if (!Array.isArray(list)) continue;
    const c = n ? list.filter(b => normNum(b.localId) === n) : list.slice(0, 12);
    if (c.length) { found = { l, c }; break; }
  }
  if (!found) return { status: 'notfound', lang, det };

  const fulls = (await Promise.all(found.c.slice(0, 10).map(b => tcgCard(found.l, b.id).catch(() => null)))).filter(Boolean);
  if (!fulls.length) return { status: 'notfound', lang, det };
  const total = normNum(det.set_total);
  const code = det.set_code.toLowerCase();
  const scored = fulls.map(card => {
    let s = 0;
    const off = String(card.set?.cardCount?.official ?? ''), tot = String(card.set?.cardCount?.total ?? '');
    if (total && (normNum(off) === total || normNum(tot) === total)) s += 4;
    if (code && card.set?.id && card.set.id.toLowerCase().replace(/[^a-z0-9]/g, '') === code.replace(/[^a-z0-9]/g, '')) s += 3;
    if ((card.name || '').toLowerCase() === (found.l === 'en' ? det.name_en : det.name).toLowerCase()) s += 1;
    if (card.pricing) s += 0.5;
    return { card, s };
  }).sort((a, b) => b.s - a.s);
  const ambiguous = scored.length > 1 && scored[0].s === scored[1].s;
  const best = scored[0].card;
  const r = await resolveCard(best.id, lang, found.l, best, det.variant);
  return {
    status: ambiguous ? 'ambiguous' : 'ok', lang, det, ...r,
    candidates: scored.slice(0, 10).map(x => ({ id: x.card.id, srcLang: found.l, name: x.card.name, localId: x.card.localId, setName: x.card.set?.name || '', total: x.card.set?.cardCount?.official ?? '', image: x.card.image || null })),
  };
}

/* ================= Images ================= */
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function toCanvas(source, maxSide) {
  const w = source.videoWidth || source.naturalWidth || source.width, h = source.videoHeight || source.naturalHeight || source.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}
function cropBox(canvas, box, maxSide = 220) {
  if (!box) return null;
  let [y0, x0, y1, x1] = box.map(v => Math.max(0, Math.min(1000, v)) / 1000);
  if (y1 <= y0 || x1 <= x0) return null;
  const W = canvas.width, H2 = canvas.height;
  const sx = x0 * W, sy = y0 * H2, sw = (x1 - x0) * W, sh = (y1 - y0) * H2;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

/* ================= Scanner ================= */
const scan = { stream: null, wantCamera: false, current: null, busy: false };

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Caméra indisponible ici. Choisis une photo à la place.', 'error'); return; }
  try {
    scan.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false,
    });
    const v = $('#video');
    v.srcObject = scan.stream;
    await v.play().catch(() => { });
    scan.wantCamera = true;
    $('#stageEmpty').hidden = true; $('#guide').hidden = false; v.hidden = false; $('#frozen').hidden = true;
    $('#shutter').disabled = false;
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Chrome bloque la caméra. Autorise-la dans les réglages du site.' : 'Impossible d\'ouvrir la caméra.', 'error');
  }
}
function stopCamera() {
  if (scan.stream) scan.stream.getTracks().forEach(t => t.stop());
  scan.stream = null;
}
function resetStage() {
  $('#frozen').hidden = true; $('#boxes').innerHTML = ''; $('#scanning').hidden = true;
  if (scan.wantCamera) startCamera();
  else { $('#stageEmpty').hidden = false; $('#video').hidden = true; $('#guide').hidden = true; }
}

async function captureFromVideo() {
  const v = $('#video');
  if (!v.videoWidth) return;
  const c = toCanvas(v, 2048);
  stopCamera();
  await processCanvas(c);
}
async function processFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try { await processCanvas(toCanvas(await loadImage(url), 2048)); }
  catch { toast('Cette image ne s\'ouvre pas. Essaie un JPEG ou un PNG.', 'error'); }
  finally { URL.revokeObjectURL(url); }
}

async function processCanvas(canvas) {
  if (scan.busy) return;
  if (!settings.apiKey) {
    toast('Ajoute ta clé Gemini pour scanner. En attendant, cherche à la main.', 'error');
    showView('settings'); $('#apiKey').focus(); return;
  }
  scan.busy = true;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
  const frozen = $('#frozen');
  frozen.src = dataUrl; frozen.hidden = false;
  $('#video').hidden = true; $('#stageEmpty').hidden = true; $('#guide').hidden = true;
  $('#boxes').innerHTML = '';
  $('#scanning').hidden = false; $('#scanMsg').textContent = 'Lecture des cartes…';
  $('#shutter').disabled = true;
  $('#results').innerHTML = '';
  try {
    const dets = await geminiDetect(dataUrl.split(',')[1]);
    if (!dets.length) { $('#scanning').hidden = true; toast('Aucune carte repérée. Rapproche-toi et évite les reflets.', 'error'); return; }
    drawBoxes(dets, canvas.width, canvas.height);
    $('#scanMsg').textContent = dets.length > 1 ? `${dets.length} cartes, recherche des cotes…` : 'Recherche de la cote…';
    const record = {
      id: uid(), at: Date.now(),
      thumb: toCanvas(canvas, 480).toDataURL('image/jpeg', 0.7),
      results: dets.map(det => ({ det, crop: cropBox(canvas, det.box), status: 'pending' })),
    };
    scan.current = record;
    renderResults(record);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(3, dets.length) }, async () => {
      while (i < record.results.length) {
        const r = record.results[i++];
        try { Object.assign(r, await identify(r.det)); } catch { r.status = 'error'; }
        renderResults(record);
      }
    }));
    await DB.put('scans', record);
    $('#scanning').hidden = true;
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    $('#scanning').hidden = true;
    toast(e.nokey ? 'Ajoute ta clé Gemini dans les réglages.' : geminiError(e), 'error');
  } finally {
    scan.busy = false;
    $('#shutter').disabled = !scan.stream;
  }
}

function drawBoxes(dets, w, h) {
  const stage = $('#stage');
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const k = Math.min(sw / w, sh / h);
  const dw = w * k, dh = h * k, ox = (sw - dw) / 2, oy = (sh - dh) / 2;
  $('#boxes').innerHTML = dets.map((d, i) => {
    if (!d.box) return '';
    const [y0, x0, y1, x1] = d.box.map(v => v / 1000);
    return `<div class="bx" style="left:${ox + x0 * dw}px;top:${oy + y0 * dh}px;width:${(x1 - x0) * dw}px;height:${(y1 - y0) * dh}px;animation-delay:${i * 70}ms"><b>${i + 1}</b></div>`;
  }).join('');
}

function resultPrice(r) {
  if (r.status !== 'ok' && r.status !== 'ambiguous') return { v: null };
  return priceValue(r.prices);
}
const cardNo = m => `<span class="cardno">${esc(m.localId)}${m.total ? '/' + esc(m.total) : ''}</span>`;

function renderResults(record) {
  const box = $('#results');
  if (!record) { box.innerHTML = ''; return; }
  const n = record.results.length;
  const pending = record.results.some(r => r.status === 'pending');
  const total = record.results.reduce((s, r) => s + (resultPrice(r).v || 0), 0);
  const addable = record.results.filter(r => r.match).length;
  let html = `<div class="results-head">
      <div><h2>${n} carte${n > 1 ? 's' : ''}</h2><p>${pending ? 'Recherche des cotes…' : 'Valeur estimée ' + eur(total)}</p></div>
      ${addable > 1 && !pending ? '<button class="btn-frame small" id="addAll">Tout ajouter</button>' : ''}
    </div>`;
  html += record.results.map((r, i) => {
    const d = r.det;
    const m = r.match;
    const p = resultPrice(r);
    const lang = r.lang || d.language;
    const notes = [];
    if (d.graded) notes.push(`<span class="note grade">${esc(d.grading_company || 'Gradée')} ${esc(d.grade)}</span>`);
    if (r.status === 'ambiguous') notes.push('<span class="note warn">Plusieurs versions</span>');
    if (r.status === 'notfound') notes.push('<span class="note bad">Introuvable</span>');
    if (r.status === 'error') notes.push('<span class="note bad">Connexion</span>');
    if (m && p.v == null) notes.push('<span class="note warn">Sans cote</span>');
    if (d.confidence != null && d.confidence < 0.6) notes.push('<span class="note warn">À vérifier</span>');
    if (m?.crossMatched) notes.push('<span class="note warn">Cote anglaise</span>');
    const meta = m ? `${cardNo(m)}<span class="s">${esc(m.setName)}</span>` : `<span class="s">Numéro lu ${esc(d.number || '?')}${d.set_total ? '/' + esc(d.set_total) : ''}</span>`;
    return `<button class="res" data-i="${i}">
      <img class="crop" src="${r.crop || PLACEHOLDER}" alt="">
      <img class="art" src="${m?.image ? imgUrl(m.image) : PLACEHOLDER}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER}'">
      <div class="info">
        <div class="nm"><i>${i + 1}</i>${esc(m?.name || d.name)}</div>
        <div class="meta">${meta}</div>
        <div class="bottom">
          <span class="val">${r.status === 'pending' ? '<span class="spinner"></span>' : eur(p.v)}</span>
          <span class="flagtag">${flag(lang)}</span>${notes.join('')}
        </div>
      </div>
    </button>`;
  }).join('');
  box.innerHTML = html;
  $$('.res', box).forEach(el => el.onclick = () => openResult(record, +el.dataset.i));
  const addAll = $('#addAll');
  if (addAll) addAll.onclick = async () => {
    addAll.disabled = true;
    const list = record.results.filter(r => r.match);
    for (const r of list) await addFromResult(r, {});
    await snapshot();
    toast(`${list.length} cartes ajoutées`);
    showView('collection');
  };
}

/* ================= Collection ================= */
let items = [];
const view = { range: 30, graded: false, lang: '', opened: false };

async function loadItems() { items = await DB.all('items'); }

function normalizeGrader(s) {
  if (!s) return 'PSA';
  const f = GRADERS.find(g => g.toLowerCase() === s.toLowerCase());
  return f || (/collect/i.test(s) ? 'CollectGrade' : s);
}
function newItemFromResult(r, form) {
  const d = r.det || {};
  return {
    id: uid(), addedAt: Date.now(),
    ...r.match,
    lang: form.lang || r.lang || (LANGS[d.language] ? d.language : 'fr'),
    variant: form.variant || (d.variant && d.variant !== 'unknown' ? d.variant : 'normal'),
    condition: form.condition || 'NM',
    qty: Math.max(1, parseInt(form.qty) || 1),
    graded: form.graded !== undefined ? form.graded : (d.graded ? { company: normalizeGrader(d.grading_company), grade: d.grade } : null),
    purchasePrice: num(parseFloat(form.purchasePrice)) || null,
    manualPrice: num(parseFloat(form.manualPrice)) || null,
    notes: form.notes || '',
    prices: r.prices || { cm: null, tp: null },
    pricesUpdated: r.pricesUpdated || Date.now(),
    priceHistory: [],
  };
}
async function addFromResult(r, form) {
  if (!r.match) return null;
  const it = newItemFromResult(r, form);
  if (form.variant && form.variant !== r.det?.variant) await refreshItemPrices(it).catch(() => { });
  pushHistory(it);
  await DB.put('items', it);
  items.push(it);
  return it;
}
function pushHistory(it) {
  const v = priceValue(it.prices).v;
  if (v == null) return;
  it.priceHistory = (it.priceHistory || []).filter(p => p.d !== todayISO());
  it.priceHistory.push({ d: todayISO(), v: Math.round(v * 100) / 100 });
  if (it.priceHistory.length > 800) it.priceHistory = it.priceHistory.slice(-800);
}

function totals() {
  let total = 0, count = 0, invested = 0, investedCovered = 0, valueCovered = 0;
  for (const it of items) {
    const v = itemValue(it);
    const q = it.qty || 1;
    count += q;
    if (v.total != null) total += v.total;
    if (num(it.purchasePrice)) {
      invested += it.purchasePrice * q;
      if (v.total != null) { investedCovered += it.purchasePrice * q; valueCovered += v.total; }
    }
  }
  return { total, count, invested, gain: valueCovered - investedCovered, hasInvested: invested > 0 };
}
async function snapshot() {
  const t = totals();
  await DB.put('snapshots', { date: todayISO(), total: Math.round(t.total * 100) / 100, count: t.count, invested: Math.round(t.invested * 100) / 100, at: Date.now() });
}
async function afterCollectionChange() {
  await snapshot();
  if ($('#view-collection').classList.contains('active')) await renderCollection({ duration: 700 });
}

async function refreshItemPrices(it, force = false) {
  const L = LANGS[it.lang] || LANGS.en;
  let card = null;
  if (L.intl && !it.crossMatched) card = await tcgCard('en', it.cardId, force).catch(() => null);
  if (!card?.pricing) card = await tcgCard(it.tcgLang || L.tcg, it.cardId, force).catch(() => null);
  if (!card) throw new Error('introuvable');
  it.prices = extractPrices(card, it.variant);
  it.pricesUpdated = Date.now();
}

let refreshing = false;
async function refreshAll(force = true) {
  if (refreshing) return;
  if (!items.length) { await snapshot(); return; }
  if (!navigator.onLine) { toast('Hors ligne, cotes non mises à jour.', 'error'); return; }
  refreshing = true;
  const btn = $('#refreshAll'), info = $('#refreshInfo');
  btn.classList.add('spin');
  let done = 0, fail = 0, i = 0;
  const list = [...items];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < list.length) {
      const it = list[i++];
      try { await refreshItemPrices(it, force); pushHistory(it); await DB.put('items', it); } catch { fail++; }
      done++;
      info.innerHTML = `Mise à jour des cotes ${done}/${list.length}<span class="progress"><i style="width:${done / list.length * 100}%"></i></span>`;
    }
  }));
  settings.lastRefresh = Date.now(); saveSettings();
  await snapshot();
  refreshing = false;
  btn.classList.remove('spin');
  if ($('#view-collection').classList.contains('active')) await renderCollection({ duration: 900 });
  toast(fail ? `Cotes mises à jour, ${fail} carte${fail > 1 ? 's' : ''} sans réponse` : 'Cotes mises à jour');
}

function refLabel() { return { trend: 'Cardmarket, tendance', avg30: 'Cardmarket, moyenne 30 jours', avg7: 'Cardmarket, moyenne 7 jours', low: 'Cardmarket, prix le plus bas', tcgplayer: 'TCGplayer, market' }[settings.priceRef] || 'Cardmarket'; }
function rangeLabel(r) { return { 7: 'en 7 jours', 30: 'en 30 jours', 90: 'en 3 mois', 365: 'en 1 an' }[r] || 'depuis le début'; }
function relTime(ms) {
  const d = (Date.now() - ms) / 1000;
  if (d < 90) return 'à l\'instant';
  if (d < 3600) return `il y a ${Math.round(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.round(d / 3600)} h`;
  return 'le ' + fmtDate(ms);
}

async function renderCollection({ duration } = {}) {
  const t = totals();
  $('#statCards').textContent = t.count.toLocaleString('fr-FR');
  $('#statInvested').textContent = t.hasInvested ? eur(t.invested) : '–';
  const g = $('#statGain');
  g.textContent = t.hasInvested ? signedEur(t.gain) : '–';
  g.className = t.hasInvested ? (t.gain >= 0 ? 'up' : 'down') : '';
  if (!refreshing) $('#refreshInfo').textContent = settings.lastRefresh ? `Cotes mises à jour ${relTime(settings.lastRefresh)}` : 'Mettre à jour les cotes';

  const snaps = (await DB.all('snapshots')).sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = view.range ? Date.now() - view.range * 864e5 : 0;
  const pts = snaps.filter(s => isoToMs(s.date) >= cutoff - 864e5 / 2).map(s => ({ x: isoToMs(s.date), y: s.total, count: s.count }));
  // le dernier point reflète toujours la valeur actuelle
  const today = isoToMs(todayISO());
  const last = pts.find(p => p.x === today);
  if (last) { last.y = t.total; last.count = t.count; } else if (items.length) pts.push({ x: today, y: t.total, count: t.count });

  $('#chartEmpty').hidden = items.length > 0;
  $('#rangeSeg').hidden = !items.length;
  $('#refreshAll').hidden = !items.length;
  if (duration == null) duration = view.opened ? 900 : 1700;
  view.opened = true;
  heroChart.render(items.length ? pts : [], t.total, duration);

  renderTop();
  renderChips();
  renderGrid();
}

/* ---------- Courbe principale animée ---------- */
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeInOut = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

function smoothPath(P) {
  const n = P.length;
  if (!n) return '';
  if (n === 1) return `M${P[0].X},${P[0].Y}`;
  const f = v => v.toFixed(1);
  if (n === 2) return `M${f(P[0].X)},${f(P[0].Y)} L${f(P[1].X)},${f(P[1].Y)}`;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1].X - P[i].X || 1e-6; m[i] = (P[i + 1].Y - P[i].Y) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${f(P[0].X)},${f(P[0].Y)}`;
  for (let i = 0; i < n - 1; i++) {
    d += ` C${f(P[i].X + dx[i] / 3)},${f(P[i].Y + t[i] * dx[i] / 3)} ${f(P[i + 1].X - dx[i] / 3)},${f(P[i + 1].Y - t[i + 1] * dx[i] / 3)} ${f(P[i + 1].X)},${f(P[i + 1].Y)}`;
  }
  return d;
}
function holoStops() {
  return `<stop offset="0" stop-color="var(--frame)"/><stop offset=".3" stop-color="var(--f2)"/><stop offset=".55" stop-color="var(--f3)"/><stop offset=".8" stop-color="var(--f4)"/><stop offset="1" stop-color="var(--f5)"/>`;
}

const heroChart = {
  raf: 0,
  setNumber(v) { $('#totalValue').textContent = eur(v); },
  setDelta(pts, upTo) {
    const el = $('#totalDelta');
    if (!pts || pts.length < 2) {
      el.className = 'hc-strip note-only';
      el.innerHTML = items.length ? '<span class="when">La courbe s\'allonge chaque jour où tu ouvres Holo.</span>' : '<span class="when">Ajoute ta première carte pour lancer la courbe.</span>';
      return;
    }
    const end = upTo || pts[pts.length - 1];
    const d = end.y - pts[0].y;
    const p = pts[0].y ? d / pts[0].y * 100 : 0;
    el.className = 'hc-strip ' + (d >= 0 ? 'up' : 'down');
    el.innerHTML = `<span class="tri"></span>${signedEur(d)} (${pct(p)}) <span class="when">${upTo ? 'depuis le ' + fmtDate(pts[0].x) : rangeLabel(view.range)}</span>`;
  },
  burst(svg, x, y) {
    if (reduceMotion()) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const star = 'M0,-7 C1,-1.5 1.5,-1 7,0 C1.5,1 1,1.5 0,7 C-1,1.5 -1.5,1 -7,0 C-1.5,-1 -1,-1.5 0,-7Z';
    g.innerHTML = Array.from({ length: 7 }, (_, i) => {
      const a = i / 7 * Math.PI * 2 + .3, r = 20 + (i % 3) * 9, s = .55 + (i % 2) * .5;
      return `<path d="${star}" fill="#fff" transform="translate(${x},${y}) scale(0)">
        <animateTransform attributeName="transform" type="translate" from="${x} ${y}" to="${x + Math.cos(a) * r} ${y + Math.sin(a) * r}" dur=".75s" fill="freeze" additive="replace"/>
        <animateTransform attributeName="transform" type="scale" values="0;${s};0" dur=".75s" fill="freeze" additive="sum"/>
      </path>`;
    }).join('');
    svg.appendChild(g);
    setTimeout(() => g.remove(), 900);
  },
  render(pts, total, duration) {
    cancelAnimationFrame(this.raf);
    const svg = $('#totalChart');
    const W = Math.round(svg.getBoundingClientRect().width) || 360;
    const H2 = Math.round(svg.getBoundingClientRect().height) || 230;
    svg.setAttribute('viewBox', `0 0 ${W} ${H2}`);
    if (!pts.length) { svg.innerHTML = ''; this.setNumber(0); this.setDelta(null); return; }
    let data = [...pts].sort((a, b) => a.x - b.x);
    if (data.length === 1) data = [{ ...data[0], x: data[0].x - 864e5, ghost: true }, data[0]];
    const pad = { t: 26, b: 30, l: 14, r: 20 };
    const x0 = data[0].x, x1 = data[data.length - 1].x;
    let y0 = Math.min(...data.map(p => p.y)), y1 = Math.max(...data.map(p => p.y));
    if (y1 - y0 < Math.max(1, y1 * 0.04)) { const k = Math.max(1, y1 * 0.06); y0 -= k; y1 += k; }
    const X = x => pad.l + (x - x0) / (x1 - x0 || 1) * (W - pad.l - pad.r);
    const Y = y => pad.t + (1 - (y - y0) / (y1 - y0)) * (H2 - pad.t - pad.b);
    const P = data.map(p => ({ X: X(p.x), Y: Y(p.y), p }));
    const line = smoothPath(P);
    const area = `${line} L${P[P.length - 1].X.toFixed(1)},${H2} L${P[0].X.toFixed(1)},${H2} Z`;
    const startY = P[0].Y;
    svg.innerHTML = `
      <defs>
        <linearGradient id="hshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1238" stop-opacity=".06"/><stop offset="1" stop-color="#1b1238" stop-opacity=".3"/></linearGradient>
        <clipPath id="hclip"><rect id="hclipRect" x="0" y="0" width="0" height="${H2}"/></clipPath>
      </defs>
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${startY}" y2="${startY}" stroke="#1b1238" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 5"/>
      <g clip-path="url(#hclip)"><path d="${area}" fill="url(#hshade)"/></g>
      <path id="hunder" d="${line}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path id="hline" d="${line}" fill="none" stroke="#1b1238" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${pad.l}" y="${H2 - 9}" font-size="12" font-weight="800" fill="#1b1238" fill-opacity=".7">${esc(fmtDate(data[0].x))}</text>
      <text x="${W - pad.r}" y="${H2 - 9}" font-size="12" font-weight="800" fill="#1b1238" fill-opacity=".7" text-anchor="end">Aujourd'hui</text>
      <line id="hcur" x1="0" x2="0" y1="6" y2="${H2 - 26}" stroke="#1b1238" stroke-opacity=".6" stroke-width="1.2" visibility="hidden"/>
      <circle id="hhalo" r="12" fill="#fff" opacity=".55"/>
      <circle id="htip" r="6" fill="#1b1238" stroke="#fff" stroke-width="2.5"/>
    `;
    const path = svg.querySelector('#hline'), under = svg.querySelector('#hunder');
    const clip = svg.querySelector('#hclipRect'), tip = svg.querySelector('#htip'), halo = svg.querySelector('#hhalo');
    const len = path.getTotalLength();
    [path, under].forEach(el => { el.style.strokeDasharray = `${len} ${len}`; });
    const valueAtX = px => {
      if (px <= P[0].X) return P[0].p.y;
      for (let i = 0; i < P.length - 1; i++) if (px <= P[i + 1].X) { const k = (px - P[i].X) / (P[i + 1].X - P[i].X); return P[i].p.y + (P[i + 1].p.y - P[i].p.y) * k; }
      return P[P.length - 1].p.y;
    };
    const realPts = data.filter(p => !p.ghost);
    const card = $('#heroCard');
    const draw = p => {
      const L = len * p;
      [path, under].forEach(el => { el.style.strokeDashoffset = len - L; });
      const pt = path.getPointAtLength(L);
      clip.setAttribute('width', pt.x);
      tip.setAttribute('cx', pt.x); tip.setAttribute('cy', pt.y);
      halo.setAttribute('cx', pt.x); halo.setAttribute('cy', pt.y);
      this.setNumber(p >= 1 ? total : valueAtX(pt.x));
      return pt;
    };
    const finish = burst => {
      const pt = draw(1);
      this.setDelta(realPts);
      halo.innerHTML = '<animate attributeName="r" values="9;16;9" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;.15;.7" dur="2.4s" repeatCount="indefinite"/>';
      if (burst) this.burst(svg, pt.x, pt.y);
    };
    if (reduceMotion() || duration <= 0) finish(false);
    else {
      $('#totalDelta').innerHTML = '&nbsp;'; $('#totalDelta').className = 'hc-strip';
      const t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / duration);
        const e = easeInOut(p);
        draw(e);
        // la lumière du foil suit la pointe du tracé
        card.style.setProperty('--fx', (15 + e * 70) + '%'); card.style.setProperty('--fy', (20 + Math.sin(e * Math.PI) * 30) + '%');
        if (p < 1) this.raf = requestAnimationFrame(step); else finish(duration > 1000);
      };
      draw(0);
      this.raf = requestAnimationFrame(step);
    }
    const cur = svg.querySelector('#hcur');
    const label = $('#heroLabel');
    const scrub = ev => {
      if (!realPts.length) return;
      const r = svg.getBoundingClientRect();
      const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
      let best = P.find(q => !q.p.ghost);
      for (const q of P) if (!q.p.ghost && Math.abs(q.X - cx) < Math.abs(best.X - cx)) best = q;
      cancelAnimationFrame(this.raf); draw(1);
      cur.setAttribute('x1', best.X); cur.setAttribute('x2', best.X); cur.setAttribute('visibility', 'visible');
      tip.setAttribute('cx', best.X); tip.setAttribute('cy', best.Y); halo.setAttribute('cx', best.X); halo.setAttribute('cy', best.Y);
      label.textContent = best.p.x === isoToMs(todayISO()) ? 'Aujourd\'hui' : 'Le ' + fmtDate(best.p.x, { weekday: 'long', day: 'numeric', month: 'long' });
      this.setNumber(best.p.y);
      this.setDelta(realPts, best.p);
    };
    const end = () => { cur.setAttribute('visibility', 'hidden'); label.textContent = 'Ma collection'; draw(1); this.setDelta(realPts); };
    svg.onpointerdown = scrub; svg.onpointermove = e => { if (e.pointerType === 'mouse' || e.buttons) scrub(e); };
    svg.onpointerleave = end; svg.onpointerup = e => { if (e.pointerType !== 'mouse') end(); };
    svg.ontouchmove = scrub; svg.ontouchend = end;
  },
};

/* ---------- Reflets de la carte : souris ou inclinaison du téléphone ---------- */
function initCardTilt() {
  const card = $('#heroCard');
  if (!card || reduceMotion()) return;
  const apply = (x, y) => {
    card.style.setProperty('--fx', (x * 100) + '%'); card.style.setProperty('--fy', (y * 100) + '%');
    card.style.setProperty('--ty', ((x - .5) * 7) + 'deg'); card.style.setProperty('--tx', ((.5 - y) * 7) + 'deg');
  };
  card.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const r = card.getBoundingClientRect();
    apply((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  card.addEventListener('pointerleave', () => { card.style.setProperty('--tx', '0deg'); card.style.setProperty('--ty', '0deg'); });
  let last = 0;
  window.addEventListener('deviceorientation', e => {
    if (e.gamma == null || !$('#view-collection').classList.contains('active')) return;
    const now = performance.now(); if (now - last < 50) return; last = now;
    const x = Math.max(0, Math.min(1, .5 + e.gamma / 50)), y = Math.max(0, Math.min(1, .5 + (e.beta - 45) / 60));
    apply(x, y);
  });
}

/* ---------- Plus précieuses, filtres, grille ---------- */
function renderTop() {
  const list = items.map(it => ({ it, v: itemValue(it).each ?? -1 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
  $('#topWrap').hidden = items.length < 4 || list.length < 3;
  $('#topRow').innerHTML = list.map(({ it, v }, i) => `
    <button class="top-card" data-id="${it.id}">
      <div class="sleeve"><img src="${it.image ? imgUrl(it.image) : PLACEHOLDER}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER}'"></div>
      <span class="rank">${i + 1}</span>
      <span class="val">${eur(v)}</span>
      <span class="nm">${esc(it.name)}</span>
    </button>`).join('');
  $$('.top-card').forEach(el => el.onclick = () => openItem(el.dataset.id));
}
function renderChips() {
  const langs = uniq(items.map(i => i.lang));
  if (view.lang && !langs.includes(view.lang)) view.lang = '';
  const hasGraded = items.some(i => i.graded);
  if (!hasGraded) view.graded = false;
  const show = items.length > 0 && (langs.length > 1 || hasGraded);
  $('#langChips').hidden = !show;
  $('#filters').hidden = !items.length;
  $('#colHead').hidden = !items.length;
  if (!show) { $('#langChips').innerHTML = ''; return; }
  $('#langChips').innerHTML =
    `<button class="chip ${!view.lang && !view.graded ? 'on' : ''}" data-lang="">Toutes</button>` +
    langs.map(l => `<button class="chip ${view.lang === l ? 'on' : ''}" data-lang="${l}">${flag(l)} ${esc(langLabel(l))}</button>`).join('') +
    (hasGraded ? `<button class="chip ${view.graded ? 'on' : ''}" data-graded="1">Gradées</button>` : '');
  $$('#langChips .chip').forEach(c => c.onclick = () => {
    if (c.dataset.graded) view.graded = !view.graded;
    else { view.lang = c.dataset.lang; if (!view.lang) view.graded = false; }
    renderChips(); renderGrid();
  });
}
function renderGrid() {
  const q = $('#colSearch').value.trim().toLowerCase();
  const sort = $('#colSort').value;
  const list = items.filter(it =>
    (!q || [it.name, it.nameEn, it.setName, it.localId, it.notes].join(' ').toLowerCase().includes(q)) &&
    (!view.lang || it.lang === view.lang) && (!view.graded || it.graded));
  const val = it => itemValue(it).total ?? -1;
  const gain = it => num(it.purchasePrice) && itemValue(it).total != null ? itemValue(it).total - it.purchasePrice * (it.qty || 1) : -Infinity;
  const sorters = {
    value: (a, b) => val(b) - val(a), added: (a, b) => b.addedAt - a.addedAt, gain: (a, b) => gain(b) - gain(a),
    name: (a, b) => (a.name || '').localeCompare(b.name || '', 'fr'),
    set: (a, b) => (a.setName || '').localeCompare(b.setName || '', 'fr') || String(a.localId).localeCompare(String(b.localId), 'fr', { numeric: true }),
  };
  list.sort(sorters[sort] || sorters.value);
  $('#colCount').textContent = items.length ? items.reduce((s, i) => s + (i.qty || 1), 0) : '';
  $('#grid').innerHTML = list.length ? list.map(it => {
    const v = itemValue(it);
    const g = gain(it);
    return `<button class="tile" data-id="${it.id}">
      <div class="sleeve">
        <img src="${it.image ? imgUrl(it.image) : PLACEHOLDER}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER}'">
        <div class="corner"><span>${flag(it.lang)}</span>${it.graded ? `<span>${esc(it.graded.company)} ${esc(it.graded.grade)}</span>` : ''}</div>
        ${(it.qty || 1) > 1 ? `<span class="qty">×${it.qty}</span>` : ''}
      </div>
      <span class="nm">${esc(it.name)}</span>
      <span class="foot"><span class="val">${eur(v.total)}</span>${isFinite(g) ? `<span class="gain ${g >= 0 ? 'up' : 'down'}">${signedEur(g)}</span>` : ''}</span>
      <span class="set">${esc(it.setName)}</span>
    </button>`;
  }).join('') : (items.length ? '<p class="no-match">Aucune carte ne correspond.</p>' : '');
  $$('.tile').forEach(el => el.onclick = () => openItem(el.dataset.id));
}

/* ---------- Petite courbe de la fiche ---------- */
function drawMini(prices, history) {
  const svg = $('#miniChart');
  if (!svg) return;
  const W = Math.round(svg.getBoundingClientRect().width) || 320, H2 = 130;
  svg.setAttribute('viewBox', `0 0 ${W} ${H2}`);
  const series = [];
  const cm = prices?.cm;
  if (cm) {
    const now = Date.now(), dd = 864e5;
    const pts = [[30, cm.avg30], [7, cm.avg7], [1, cm.avg1], [0, cm.trend]].filter(([, v]) => v != null).map(([k, v]) => ({ x: now - k * dd, y: v }));
    if (pts.length > 1) series.push({ pts, kind: 'cm' });
  }
  if (history?.length > 1) series.push({ pts: history.map(h => ({ x: isoToMs(h.d), y: h.v })), kind: 'own' });
  const all = series.flatMap(s => s.pts);
  if (!all.length) { svg.innerHTML = `<text x="${W / 2}" y="${H2 / 2}" text-anchor="middle" font-size="13" fill="var(--faint)">Pas encore assez de données</text>`; $('#miniLegend').innerHTML = ''; return; }
  const pad = { t: 16, b: 22, l: 4, r: 4 };
  const x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x));
  let y0 = Math.min(...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y));
  if (y1 - y0 < y1 * 0.04) { const k = Math.max(.2, y1 * .06); y0 -= k; y1 += k; }
  const X = x => pad.l + (x - x0) / (x1 - x0 || 1) * (W - pad.l - pad.r);
  const Y = y => pad.t + (1 - (y - y0) / (y1 - y0)) * (H2 - pad.t - pad.b);
  let out = `<defs><linearGradient id="mg" gradientUnits="userSpaceOnUse" x1="0" x2="${W}" y1="0" y2="0">${holoStops()}</linearGradient></defs>`;
  series.forEach(s => {
    const P = s.pts.sort((a, b) => a.x - b.x).map(p => ({ X: X(p.x), Y: Y(p.y) }));
    const d = smoothPath(P);
    if (s.kind === 'cm') out += `<path d="${d}" fill="none" stroke="var(--mute)" stroke-width="2" stroke-dasharray="4 5" stroke-linecap="round"/>` + P.map(p => `<circle cx="${p.X}" cy="${p.Y}" r="3" fill="var(--mute)"/>`).join('');
    else out += `<path d="${d}" fill="none" stroke="url(#mg)" stroke-width="3" stroke-linecap="round"/>`;
  });
  out += `<text x="${pad.l}" y="${H2 - 4}" font-size="11" fill="var(--faint)">${esc(fmtDate(x0))}</text><text x="${W - pad.r}" y="${H2 - 4}" font-size="11" fill="var(--faint)" text-anchor="end">${esc(eur(Math.max(...all.map(p => p.y))))} max</text>`;
  svg.innerHTML = out;
  $('#miniLegend').innerHTML = (series.some(s => s.kind === 'cm') ? '<span><i style="background:var(--mute)"></i>Moyennes Cardmarket, de 30 jours à aujourd\'hui</span>' : '') +
    (series.some(s => s.kind === 'own') ? '<span><i style="background:linear-gradient(90deg,var(--frame),var(--f2),var(--f5))"></i>Relevés de Holo</span>' : '');
}

/* ================= Fiche carte ================= */
const sheet = { ctx: null };
function openSheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false; $('#sheetBackdrop').hidden = false;
  $('#sheetBody').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  const hc = $('.holo-card', $('#sheetBody'));
  if (hc) {
    hc.onpointermove = e => {
      const r = hc.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      hc.style.setProperty('--mx', x * 100 + '%'); hc.style.setProperty('--my', y * 100 + '%');
      hc.style.setProperty('--ry', (x - 0.5) * 16 + 'deg'); hc.style.setProperty('--rx', (0.5 - y) * 16 + 'deg');
    };
    hc.onpointerleave = () => { hc.style.setProperty('--rx', '0deg'); hc.style.setProperty('--ry', '0deg'); };
  }
}
function closeSheet() {
  $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = ''; sheet.ctx = null;
}

function linksFor(m, lang, graded) {
  const nEn = m.nameEn || m.name;
  const numStr = `${m.localId}${m.total ? '/' + m.total : ''}`;
  const langWord = { de: 'deutsch', it: 'italiano', es: 'español', ja: 'japanese', ko: 'korean', pt: 'português' }[lang] || '';
  const ebayQ = [m.name, numStr, graded ? `${graded.company} ${graded.grade}` : '', langWord].filter(Boolean).join(' ');
  const pcQ = [nEn, m.localId, lang === 'ja' ? 'japanese' : ''].filter(Boolean).join(' ');
  return [
    ['Cardmarket', `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(nEn)}`],
    ['Ventes eBay', `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(ebayQ)}&LH_Sold=1&LH_Complete=1`],
    ['PriceCharting', `https://www.pricecharting.com/search-products?q=${encodeURIComponent(pcQ)}&type=prices`],
    ['TCGplayer', `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(nEn)}`],
  ];
}

function warningsFor(lang, graded, prices, extra = {}) {
  const w = [];
  const L = LANGS[lang];
  const v = priceValue(prices).v;
  const ll = esc(langLabel(lang).toLowerCase());
  if (extra.crossMatched) w.push(`Retrouvée via sa version anglaise : le prix affiché est celui de la carte <b>internationale</b>, pas de la carte en ${ll}.`);
  else if (L && !L.intl && v == null) w.push(`Pas de cote pour la carte en ${ll}. Regarde les ventes eBay ou PriceCharting, puis saisis ta cote.`);
  else if (L?.intl && lang !== 'en' && v != null) w.push(`Cette cote vaut pour <b>toutes les langues</b>. Si la version en ${ll} se vend plus cher, vérifie les ventes eBay.`);
  if (graded) w.push(`Carte gradée ${esc(graded.company)} ${esc(graded.grade)} : le prix affiché est celui de la carte <b>brute</b>. Saisis ta cote d'après les ventes de gradées.`);
  if (extra.lowConf) w.push('Le nom ou le numéro était difficile à lire. Vérifie que c\'est bien ta carte.');
  return w;
}

function priceBlock(v, qty, graded, extraHtml = '') {
  const src = v.src === 'Ta cote' ? 'Ta cote' : v.src ? refLabel() + (graded ? ', carte brute' : '') : 'Pas de cote disponible';
  return `<div class="d-price">${eur(v.v)}</div>
    <div class="d-src">${src}${qty > 1 && v.v != null ? `, ×${qty} soit ${eur(v.v * qty)}` : ''}</div>${extraHtml}`;
}

function detailHTML({ m, prices, lang, variant, graded, priceHtml, warnings = [], candidates = null, currentId = null }) {
  const r = settings.usdRate || 0.86;
  const cm = prices?.cm, tp = prices?.tp;
  const tags = [];
  if (variant && variant !== 'unknown') tags.push(`<span class="note">${esc(VARIANTS[variant])}</span>`);
  if (m.rarity) tags.push(`<span class="note">${esc(m.rarity)}</span>`);
  if (graded) tags.push(`<span class="note grade">${esc(graded.company)} ${esc(graded.grade)}</span>`);
  const sub = (label, v) => v == null ? '' : `<span>${label} <b>${eur(v)}</b></span>`;
  return `
    <div class="d-top">
      <div class="holo-card"><img src="${m.image ? imgUrl(m.image, 'high') : PLACEHOLDER}" alt="" onerror="this.src='${PLACEHOLDER}'"></div>
      <div>
        <div class="d-name">${esc(m.name)}</div>
        <div class="d-set">${cardNo(m)}<span>${esc(m.setName)}</span><span>${flag(lang)} ${esc(langLabel(lang))}</span></div>
        <div class="d-tags">${tags.join('')}</div>
        ${priceHtml}
      </div>
    </div>
    ${warnings.slice(0, 2).map(w => `<p class="callout">${w}</p>`).join('')}
    ${candidates && candidates.length > 1 ? `
      <h3 class="d-sec">Plusieurs cartes portent ce numéro. Laquelle est la tienne ?</h3>
      <div class="cands">${candidates.map(c => `<button class="cand ${c.id === currentId ? 'on' : ''}" data-cand="${esc(c.id)}" data-src="${esc(c.srcLang)}">
        <img src="${c.image ? imgUrl(c.image) : PLACEHOLDER}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER}'">
        <b>${esc(c.setName)}</b>${esc(c.localId)}${c.total ? '/' + esc(c.total) : ''}</button>`).join('')}</div>` : ''}
    <h3 class="d-sec">Cotes</h3>
    <div class="src-row">
      <div class="src-top"><span class="src-name"><i style="background:#4d8dff"></i>Cardmarket${cm?.foil ? ' <span class="note">reverse</span>' : ''}</span>
        ${cm ? `<span class="src-main">${eur(cm.trend ?? cm.avg)}</span>` : ''}</div>
      ${cm ? `<div class="src-sub">${sub('1 jour', cm.avg1)}${sub('7 jours', cm.avg7)}${sub('30 jours', cm.avg30)}${sub('plus bas', cm.low)}${cm.updated ? `<span>relevé du ${fmtDate(cm.updated)}</span>` : ''}</div>` : '<div class="src-none">Pas de cote Cardmarket pour cette carte.</div>'}
    </div>
    <div class="src-row">
      <div class="src-top"><span class="src-name"><i style="background:var(--f2)"></i>TCGplayer, États-Unis</span>
        ${tp?.market ? `<span class="src-main">${eur(tp.market * r)}</span>` : ''}</div>
      ${tp ? `<div class="src-sub">${sub('bas', tp.low && tp.low * r)}${sub('moyen', tp.mid && tp.mid * r)}${sub('haut', tp.high && tp.high * r)}<span>soit <b>${usd(tp.market ?? tp.mid)}</b> à ${r.toLocaleString('fr-FR')} €/$</span></div>` : '<div class="src-none">Pas de cote TCGplayer pour cette carte.</div>'}
    </div>
    <h3 class="d-sec">Évolution du prix</h3>
    <svg class="mini" id="miniChart"></svg>
    <div class="legend" id="miniLegend"></div>
    <h3 class="d-sec">Vérifier ailleurs</h3>
    <div class="links">${linksFor(m, lang, graded).map(([l, u]) => `<a class="btn-quiet" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>`).join('')}</div>
  `;
}

function formHTML(it, isNew) {
  const langOpts = Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === it.lang ? 'selected' : ''}>${v.flag} ${v.label}</option>`).join('');
  const varOpts = Object.entries(VARIANTS).filter(([k]) => k !== 'unknown').map(([k, v]) => `<option value="${k}" ${k === it.variant ? 'selected' : ''}>${v}</option>`).join('');
  const condOpts = Object.entries(CONDITIONS).map(([k, v]) => `<option value="${k}" ${k === it.condition ? 'selected' : ''}>${v}</option>`).join('');
  const g = it.graded;
  return `
    <h3 class="d-sec">${isNew ? 'Ajouter à ma collection' : 'Ma carte'}</h3>
    <form id="itemForm" class="form">
      <div class="form-grid">
        <div><label class="lbl">Langue</label><select class="field" name="lang">${langOpts}</select></div>
        <div><label class="lbl">Version</label><select class="field" name="variant">${varOpts}</select></div>
        <div><label class="lbl">État</label><select class="field" name="condition">${condOpts}</select></div>
        <div><label class="lbl">Quantité</label><input class="field" name="qty" type="number" min="1" step="1" value="${it.qty || 1}"></div>
        <div><label class="lbl">Payée (€ l'unité)</label><input class="field" name="purchasePrice" type="number" min="0" step="0.01" inputmode="decimal" value="${it.purchasePrice ?? ''}" placeholder="Facultatif"></div>
        <div><label class="lbl">Ma cote (€ l'unité)</label><input class="field" name="manualPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${it.manualPrice ?? ''}" placeholder="Remplace la cote"></div>
        <div class="full"><label class="switch"><input type="checkbox" name="isGraded" ${g ? 'checked' : ''}><span></span>Carte gradée</label></div>
        <div class="grade-fields" ${g ? '' : 'hidden'}><label class="lbl">Société</label><select class="field" name="company">${GRADERS.map(x => `<option ${g?.company === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="grade-fields" ${g ? '' : 'hidden'}><label class="lbl">Note</label><input class="field" name="grade" value="${esc(g?.grade || '')}" placeholder="10"></div>
        <div class="full"><label class="lbl">Où elle est rangée, remarques</label><input class="field" name="notes" value="${esc(it.notes || '')}" placeholder="Classeur 2, page 4"></div>
      </div>
      <div class="actions">
        ${isNew ? '<button class="btn-frame" type="submit">Ajouter à ma collection</button>'
      : '<button class="btn-frame" type="submit">Enregistrer</button><button class="link-btn danger" type="button" id="delItem">Retirer</button>'}
      </div>
    </form>`;
}
function readForm(form) {
  const f = new FormData(form);
  const isGraded = f.get('isGraded') === 'on';
  return {
    lang: f.get('lang'), variant: f.get('variant'), condition: f.get('condition'),
    qty: f.get('qty'), purchasePrice: f.get('purchasePrice'), manualPrice: f.get('manualPrice'),
    graded: isGraded ? { company: f.get('company'), grade: String(f.get('grade') || '').trim() || '?' } : null,
    notes: String(f.get('notes') || '').trim(),
  };
}
function wireForm(onSubmit) {
  const form = $('#itemForm');
  form.isGraded.onchange = () => $$('.grade-fields', form).forEach(e => e.hidden = !form.isGraded.checked);
  form.onsubmit = async e => { e.preventDefault(); form.querySelector('[type=submit]').disabled = true; await onSubmit(readForm(form)); };
}
function wireCandidates(onPick) {
  $$('.cand', $('#sheetBody')).forEach(el => el.onclick = async () => {
    el.style.opacity = .5;
    try { await onPick(el.dataset.cand, el.dataset.src); } catch { el.style.opacity = 1; toast('Cette version ne se charge pas. Réessaie.', 'error'); }
  });
}

function openResult(record, i) {
  const r = record.results[i];
  if (r.status === 'pending') return;
  sheet.ctx = { type: 'result', record, i };
  if (!r.match) {
    const d = r.det;
    openSheet(`
      <div class="d-name">${esc(d.name)}</div>
      <div class="d-set"><span>Numéro lu ${esc(d.number || '?')}${d.set_total ? '/' + esc(d.set_total) : ''}</span><span>${flag(d.language)} ${esc(langLabel(d.language))}</span></div>
      <p class="callout">${r.status === 'error' ? 'La connexion a coupé pendant la recherche.' : 'Aucune carte ne porte ce nom avec ce numéro.'} Corrige ce qui a été mal lu, puis relance.</p>
      <form id="fixForm" class="form">
        <div class="form-grid">
          <div class="full"><label class="lbl">Nom imprimé</label><input class="field" name="name" value="${esc(d.name)}"></div>
          <div><label class="lbl">Numéro</label><input class="field" name="number" value="${esc(d.number)}"></div>
          <div><label class="lbl">Langue</label><select class="field" name="language">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === d.language ? 'selected' : ''}>${v.flag} ${v.label}</option>`).join('')}</select></div>
          <div class="full"><label class="lbl">Nom anglais, si tu le connais</label><input class="field" name="name_en" value="${esc(d.name_en)}"></div>
        </div>
        <div class="actions"><button class="btn-frame" type="submit">Relancer la recherche</button></div>
      </form>`);
    $('#fixForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      Object.assign(d, { name: f.get('name').trim(), number: f.get('number').trim(), language: f.get('language'), name_en: f.get('name_en').trim() });
      e.target.querySelector('button').disabled = true;
      try { Object.assign(r, await identify(d)); } catch { r.status = 'error'; }
      await DB.put('scans', record).catch(() => { });
      renderResults(record);
      if (r.match) openResult(record, i); else { closeSheet(); toast('Toujours introuvable. Essaie la recherche à la main.', 'error'); }
    };
    return;
  }
  const d = r.det || {};
  const draft = {
    lang: r.lang, variant: d.variant && d.variant !== 'unknown' ? d.variant : 'normal', condition: 'NM', qty: 1,
    graded: d.graded ? { company: normalizeGrader(d.grading_company), grade: d.grade } : null,
  };
  const v = priceValue(r.prices);
  openSheet(detailHTML({
    m: r.match, prices: r.prices, lang: r.lang, variant: draft.variant, graded: draft.graded,
    priceHtml: priceBlock(v, 1, !!draft.graded),
    warnings: warningsFor(r.lang, draft.graded, r.prices, { crossMatched: r.match.crossMatched, lowConf: d.confidence != null && d.confidence < 0.6 }),
    candidates: r.candidates, currentId: r.match.cardId,
  }) + formHTML(draft, true));
  drawMini(r.prices, []);
  wireCandidates(async (id, src) => {
    Object.assign(r, await resolveCard(id, r.lang, src, await tcgCard(src, id), d.variant));
    r.status = 'ok';
    await DB.put('scans', record).catch(() => { });
    renderResults(record); openResult(record, i);
  });
  wireForm(async form => {
    await addFromResult(r, form);
    closeSheet();
    toast(`${r.match.name} ajoutée à ta collection`);
    await afterCollectionChange();
  });
}

function openItem(id) {
  const it = items.find(x => x.id === id);
  if (!it) return;
  sheet.ctx = { type: 'item', id };
  const v = itemValue(it);
  let extra = '';
  if (num(it.purchasePrice) && v.total != null) {
    const g = v.total - it.purchasePrice * (it.qty || 1);
    extra = `<div class="d-gain gain ${g >= 0 ? 'up' : 'down'}">${signedEur(g)} par rapport aux ${eur(it.purchasePrice * (it.qty || 1))} payés</div>`;
  }
  extra += `<button class="link-btn" id="refreshOne" style="margin-top:8px">Mettre à jour la cote</button>`;
  openSheet(detailHTML({
    m: it, prices: it.prices, lang: it.lang, variant: it.variant, graded: it.graded,
    priceHtml: priceBlock(v, it.qty || 1, !!it.graded, extra),
    warnings: num(it.manualPrice) ? [] : warningsFor(it.lang, it.graded, it.prices, { crossMatched: it.crossMatched }),
  }) + formHTML(it, false));
  drawMini(it.prices, it.priceHistory);
  $('#refreshOne').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Mise à jour…';
    try { await refreshItemPrices(it, true); pushHistory(it); await DB.put('items', it); await afterCollectionChange(); openItem(it.id); toast('Cote à jour'); }
    catch { toast('La cote ne répond pas. Réessaie plus tard.', 'error'); e.target.disabled = false; e.target.textContent = 'Mettre à jour la cote'; }
  };
  wireForm(async form => {
    const variantChanged = form.variant !== it.variant;
    Object.assign(it, {
      lang: form.lang, variant: form.variant, condition: form.condition, qty: Math.max(1, parseInt(form.qty) || 1),
      purchasePrice: num(parseFloat(form.purchasePrice)) || null, manualPrice: num(parseFloat(form.manualPrice)) || null,
      graded: form.graded, notes: form.notes,
    });
    if (variantChanged) { await refreshItemPrices(it).catch(() => { }); pushHistory(it); }
    await DB.put('items', it);
    closeSheet(); toast('Enregistré');
    await afterCollectionChange();
  });
  $('#delItem').onclick = async () => {
    if (!confirm(`Retirer ${it.name} de ta collection ?`)) return;
    await DB.del('items', it.id);
    items = items.filter(x => x.id !== it.id);
    closeSheet(); toast('Carte retirée');
    await afterCollectionChange();
  };
}

/* ================= Recherche à la main ================= */
async function showManualResult(r, language) {
  const record = { id: uid(), at: Date.now(), manual: true, thumb: null, results: [r] };
  scan.current = record; renderResults(record);
  await DB.put('scans', record);
  openResult(record, 0);
}
async function manualSearch(e) {
  e.preventDefault();
  const name = $('#manualName').value.trim();
  const number = $('#manualNum').value.trim();
  const language = $('#manualLang').value;
  if (!name) return;
  const btn = $('#manualForm button');
  btn.disabled = true;
  const blank = { set_total: '', set_code: '', variant: 'unknown', graded: false, grading_company: '', grade: '', box: null, confidence: 1 };
  try {
    const L = LANGS[language];
    if (number) {
      const det = { ...blank, name, name_en: language === 'en' ? name : '', number, language };
      const r = await identify(det);
      if (!r.match) { toast('Aucune carte avec ce nom et ce numéro.', 'error'); return; }
      await showManualResult({ det, crop: null, ...r }, language);
    } else {
      const list = await tcgList(L.tcg, name);
      if (!list?.length) { toast(`Aucune carte « ${name} » en ${langLabel(language).toLowerCase()}.`, 'error'); return; }
      const top = list.slice(0, 40);
      sheet.ctx = { type: 'pick' };
      openSheet(`<div class="d-name">${esc(name)}</div><div class="d-set"><span>${list.length} carte${list.length > 1 ? 's' : ''} trouvée${list.length > 1 ? 's' : ''}${list.length > 40 ? ', ajoute le numéro pour affiner' : ''}. Touche la tienne.</span></div>
        <div class="cands">${top.map(c => `<button class="cand" data-cand="${esc(c.id)}" data-src="${L.tcg}"><img src="${c.image ? imgUrl(c.image) : PLACEHOLDER}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER}'"><b>${esc(c.name)}</b>${esc(c.id)}</button>`).join('')}</div>`);
      wireCandidates(async (id, src) => {
        const card = await tcgCard(src, id);
        const det = { ...blank, name: card.name, name_en: '', number: card.localId, language };
        await showManualResult({ det, crop: null, status: 'ok', lang: language, ...(await resolveCard(id, language, src, card, 'unknown')) }, language);
      });
    }
  } catch { toast('La recherche ne répond pas. Vérifie ta connexion.', 'error'); }
  finally { btn.disabled = false; }
}

/* ================= Historique ================= */
async function renderHistory() {
  const scans = (await DB.all('scans')).sort((a, b) => b.at - a.at);
  $('#emptyHist').hidden = scans.length > 0;
  $('#clearHistory').hidden = !scans.length;
  let lastDay = '';
  $('#historyList').innerHTML = scans.map(s => {
    const day = fmtDate(s.at, { weekday: 'long', day: 'numeric', month: 'long' });
    const head = day !== lastDay ? `<div class="day">${esc(day.charAt(0).toUpperCase() + day.slice(1))}</div>` : '';
    lastDay = day;
    const names = s.results.map(r => r.match?.name || r.det?.name).filter(Boolean);
    const total = s.results.reduce((t, r) => t + (resultPrice(r).v || 0), 0);
    const firstImg = s.results.find(r => r.match?.image)?.match?.image;
    const thumb = s.thumb || (firstImg ? imgUrl(firstImg) : PLACEHOLDER);
    const n = s.results.length;
    return `${head}<div class="hist" role="button" tabindex="0" data-id="${s.id}">
      <img src="${thumb}" alt="" onerror="this.src='${PLACEHOLDER}'">
      <div style="min-width:0"><div class="t">${eur(total)}</div>
      <div class="s">${n} carte${n > 1 ? 's' : ''} : ${esc(names.join(', '))}</div>
      <div class="s">${new Date(s.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${s.manual ? ', recherche à la main' : ''}</div></div>
      <button class="x" data-del="${s.id}" aria-label="Supprimer ce scan">✕</button>
    </div>`;
  }).join('');
  $$('.hist').forEach(el => {
    const open = async ev => {
      if (ev.target.dataset.del) {
        ev.stopPropagation();
        await DB.del('scans', ev.target.dataset.del); renderHistory(); return;
      }
      const rec = scans.find(s => s.id === el.dataset.id);
      scan.current = rec;
      showView('scan');
      if (rec.thumb) { $('#frozen').src = rec.thumb; $('#frozen').hidden = false; $('#video').hidden = true; $('#stageEmpty').hidden = true; $('#guide').hidden = true; $('#boxes').innerHTML = ''; }
      renderResults(rec);
      $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    el.onclick = open;
    el.onkeydown = ev => { if (ev.key === 'Enter') open(ev); };
  });
}

/* ================= Navigation ================= */
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  window.scrollTo(0, 0);
  if (name !== 'scan') stopCamera();
  else if (scan.wantCamera && !scan.stream && $('#frozen').hidden) startCamera();
  if (name === 'collection') renderCollection();
  if (name === 'history') renderHistory();
  try { history.replaceState(null, '', '#' + name); } catch { }
}

/* ================= Réglages ================= */
function initSettings() {
  $('#apiKey').value = settings.apiKey;
  $('#model').value = settings.model || DEFAULT_MODEL;
  $('#priceRef').value = settings.priceRef;
  $('#usdRate').value = settings.usdRate;
  $('#autoRefresh').checked = !!settings.autoRefresh;
  updateRateInfo();
  $('#apiKey').onchange = () => { settings.apiKey = $('#apiKey').value.trim(); saveSettings(); toast('Clé enregistrée sur ce téléphone'); };
  $('#toggleKey').onclick = () => { const i = $('#apiKey'); i.type = i.type === 'password' ? 'text' : 'password'; $('#toggleKey').textContent = i.type === 'password' ? 'Voir' : 'Cacher'; };
  $('#model').onchange = () => { settings.model = $('#model').value.trim() || DEFAULT_MODEL; saveSettings(); };
  $('#testKey').onclick = async () => {
    settings.apiKey = $('#apiKey').value.trim(); settings.model = $('#model').value.trim() || DEFAULT_MODEL; saveSettings();
    const st = $('#keyStatus');
    if (!settings.apiKey) { st.textContent = 'Colle d\'abord ta clé.'; st.style.color = 'var(--down)'; return; }
    st.textContent = 'Test en cours…'; st.style.color = 'var(--mute)';
    try {
      await geminiCall([{ text: 'Reply with {"cards":[]}' }], false);
      st.textContent = `La clé fonctionne avec ${settings.model}.`; st.style.color = 'var(--up)';
    } catch (e) { st.textContent = geminiError(e); st.style.color = 'var(--down)'; }
  };
  $('#priceRef').onchange = async () => { settings.priceRef = $('#priceRef').value; saveSettings(); await snapshot(); };
  $('#usdRate').onchange = async () => {
    const v = parseFloat($('#usdRate').value);
    if (num(v)) { settings.usdRate = v; settings.usdRateManual = true; settings.usdRateDate = todayISO(); saveSettings(); updateRateInfo(); await snapshot(); }
  };
  $('#autoRefresh').onchange = () => { settings.autoRefresh = $('#autoRefresh').checked; saveSettings(); };
  $('#exportJson').onclick = exportJson;
  $('#importJson').onchange = e => importJson(e.target.files[0]);
  $('#exportCsv').onclick = exportCsv;
  $('#wipeAll').onclick = async () => {
    if (!confirm('Effacer la collection, l\'historique et la courbe ? Ta clé et tes réglages restent.')) return;
    if (!confirm('Dernière vérification : as-tu exporté une sauvegarde ?')) return;
    await Promise.all(['items', 'scans', 'snapshots', 'cache'].map(s => DB.clear(s)));
    items = []; memCache.clear(); scan.current = null; renderResults(null);
    await renderHistory(); toast('Collection effacée');
  };
}
function updateRateInfo() {
  $('#rateInfo').textContent = settings.usdRateManual ? 'Saisi à la main' : (settings.usdRateDate ? `Taux BCE du ${fmtDate(settings.usdRateDate)}` : 'Valeur par défaut');
}
async function updateUsdRate() {
  if (settings.usdRateManual || settings.usdRateDate === todayISO() || !navigator.onLine) return;
  try {
    const d = await fetchJSON('https://api.frankfurter.app/latest?from=USD&to=EUR', {}, 8000);
    if (num(d?.rates?.EUR)) {
      settings.usdRate = d.rates.EUR; settings.usdRateDate = d.date || todayISO(); saveSettings();
      $('#usdRate').value = settings.usdRate; updateRateInfo();
    }
  } catch { }
}

/* ================= Sauvegarde ================= */
function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function exportJson() {
  const data = { app: 'holo', version: 1, exportedAt: new Date().toISOString(), items: await DB.all('items'), scans: await DB.all('scans'), snapshots: await DB.all('snapshots') };
  download(`holo-sauvegarde-${todayISO()}.json`, JSON.stringify(data), 'application/json');
}
async function importJson(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'holo' || !Array.isArray(data.items)) throw new Error();
    if (!confirm(`Restaurer ${data.items.length} cartes, ${data.scans?.length || 0} scans et ${data.snapshots?.length || 0} jours de courbe ? Ce qui existe déjà est conservé.`)) return;
    await DB.putMany('items', data.items);
    if (data.scans) await DB.putMany('scans', data.scans);
    if (data.snapshots) await DB.putMany('snapshots', data.snapshots);
    await loadItems(); await renderHistory();
    toast('Sauvegarde restaurée');
  } catch { toast('Ce fichier n\'est pas une sauvegarde Holo.', 'error'); }
  finally { $('#importJson').value = ''; }
}
function exportCsv() {
  const head = ['Nom', 'Nom anglais', 'Série', 'Numéro', 'Langue', 'Version', 'État', 'Quantité', 'Gradée', 'Prix payé unitaire', 'Cote unitaire', 'Source de la cote', 'Valeur totale', 'Cardmarket tendance', 'Cardmarket moyenne 30 j', 'TCGplayer market (USD)', 'Remarques', 'Ajoutée le', 'Identifiant TCGdex'];
  const cell = v => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n2 = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
  const rows = items.map(it => {
    const v = itemValue(it);
    return [it.name, it.nameEn, it.setName, `${it.localId}${it.total ? '/' + it.total : ''}`, langLabel(it.lang), VARIANTS[it.variant] || '', CONDITIONS[it.condition] || it.condition, it.qty || 1,
      it.graded ? `${it.graded.company} ${it.graded.grade}` : '', n2(it.purchasePrice), n2(v.each), v.src || '', n2(v.total),
      n2(it.prices?.cm?.trend), n2(it.prices?.cm?.avg30), n2(it.prices?.tp?.market), it.notes, fmtDate(it.addedAt, { day: '2-digit', month: '2-digit', year: 'numeric' }), it.cardId].map(cell).join(';');
  });
  download(`holo-collection-${todayISO()}.csv`, '﻿' + [head.join(';'), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
}

/* ================= Démarrage ================= */
async function init() {
  $('#manualLang').innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v.flag} ${k.toUpperCase()}</option>`).join('');
  $('#manualLang').value = 'fr';

  $$('.tabbar button').forEach(b => b.onclick = () => showView(b.dataset.view));
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) showView(g.dataset.go); });
  $('#startCam').onclick = startCamera;
  $('#shutter').onclick = captureFromVideo;
  $('#retake').onclick = () => { scan.current = null; renderResults(null); resetStage(); };
  $('#fileInput').onchange = e => { const f = e.target.files[0]; e.target.value = ''; stopCamera(); processFile(f); };
  $('#manualForm').onsubmit = manualSearch;
  $('#sheetClose').onclick = closeSheet;
  $('#sheetBackdrop').onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
  $('#refreshAll').onclick = () => refreshAll(true);
  $$('#rangeSeg button').forEach(b => b.onclick = () => {
    $$('#rangeSeg button').forEach(x => x.classList.toggle('on', x === b));
    view.range = +b.dataset.range; renderCollection({ duration: 750 });
  });
  $('#colSearch').oninput = renderGrid;
  $('#colSort').onchange = renderGrid;
  $('#clearHistory').onclick = async () => { if (confirm('Effacer tout l\'historique des scans ?')) { await DB.clear('scans'); renderHistory(); } };
  let rz, lastW = innerWidth;
  window.addEventListener('resize', () => {
    if (innerWidth === lastW) return; lastW = innerWidth;
    clearTimeout(rz); rz = setTimeout(() => { if ($('#view-collection').classList.contains('active')) renderCollection({ duration: 0 }); }, 200);
  });

  const net = () => { $('#netStatus').hidden = navigator.onLine; };
  window.addEventListener('online', () => { net(); updateUsdRate(); });
  window.addEventListener('offline', net); net();

  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Holo est installée'); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });

  initSettings();
  initCardTilt();
  await DB.open();
  await loadItems();
  await snapshot();
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, sleep(800)]);
  const start = (location.hash || '').slice(1);
  showView(['scan', 'collection', 'history', 'settings'].includes(start) ? start : 'collection');
  updateUsdRate();
  if (settings.autoRefresh && items.length && Date.now() - (settings.lastRefresh || 0) > 20 * H) setTimeout(() => refreshAll(false), 2000);
  if (!settings.apiKey && !items.length) setTimeout(() => toast('Pour scanner, ajoute ta clé Gemini dans les réglages'), 2200);
}
document.addEventListener('DOMContentLoaded', init);
