/* =====================================================================================
   Trending Arrivals: landing page interactions
   Vanilla ES2020, no dependencies. Everything is wrapped in one IIFE; the only global is
   `window.TA` (a small debug / integration API). Every feature checks that its elements
   exist, so removing a section from the HTML never breaks the rest of the page.
   ===================================================================================== */
(() => {
  'use strict';

  /* ===================================================================================
     CONFIG: all store + product data. Swap values here; the HTML carries the same
     defaults so the page still renders real content without JavaScript.
     =================================================================================== */
  const CONFIG = {
    brand: 'Trending Arrivals',
    locale: 'en-US',
    currency: 'USD',
    supportEmail: 'support@trendingarrivals.com',
    storageKey: 'ta_cart_v1',
    maxQty: 10,
    demoProcessingMs: 1200,
    product: {
      id: 'cloud-sherpa-hoodie',
      name: 'The Cloud Sherpa Hoodie',
      price: 37.99,
      compareAtPrice: null, // set a number (e.g. 59.99) only if it is a genuine former price
      colors: [
        { id: 'onyx', name: 'Onyx', swatch: '#000000', image: 'assets/images/product-onyx.svg' },
        { id: 'charcoal', name: 'Charcoal', swatch: '#3A3A3A', image: 'assets/images/product-charcoal.svg' },
        { id: 'bone', name: 'Bone', swatch: '#F5F5F5', image: 'assets/images/product-bone.svg' },
      ],
      sizes: [
        { id: 'standard', name: 'Standard (fits S–L)' },
        { id: 'oversized', name: 'Oversized (fits XL–3XL)' },
      ],
      variants: [
        { id: 'onyx-standard', color: 'onyx', size: 'standard', shopifyVariantId: '' },
        { id: 'onyx-oversized', color: 'onyx', size: 'oversized', shopifyVariantId: '' },
        { id: 'charcoal-standard', color: 'charcoal', size: 'standard', shopifyVariantId: '' },
        { id: 'charcoal-oversized', color: 'charcoal', size: 'oversized', shopifyVariantId: '' },
        { id: 'bone-standard', color: 'bone', size: 'standard', shopifyVariantId: '' },
        { id: 'bone-oversized', color: 'bone', size: 'oversized', shopifyVariantId: '' },
      ],
    },
    // mode: 'demo' runs the in-page demo checkout. Set mode: 'shopify', your myshopify domain and
    // every variant's shopifyVariantId to send shoppers to a real Shopify cart permalink instead.
    checkout: { mode: 'demo', shopifyDomain: '' },
  };

  /* ===================================================================================
     Helpers
     =================================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const toCents = (n) => Math.round(Number(n) * 100);
  const product = CONFIG.product;
  const priceCents = toCents(product.price);

  const money = (() => {
    let fmt;
    try {
      fmt = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency });
    } catch (_) {
      fmt = { format: (n) => '$' + Number(n).toFixed(2) };
    }
    return (cents) => fmt.format(cents / 100);
  })();

  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => Boolean(motionQuery && motionQuery.matches);

  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const setText = (sel, text, root = document) => { for (const el of $$(sel, root)) el.textContent = text; };

  // localStorage that never throws (private mode, blocked storage, quota, sandboxed iframes)
  const store = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch (_) { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; }
    },
  };

  // Lookups
  const variantById = new Map(product.variants.map((v) => [v.id, v]));
  const colorById = new Map(product.colors.map((c) => [c.id, c]));
  const sizeById = new Map(product.sizes.map((s) => [s.id, s]));
  const findVariant = (color, size) => product.variants.find((v) => v.color === color && v.size === size) || product.variants[0];
  const variantLabel = (v) => `${colorById.get(v.color)?.name || v.color} / ${sizeById.get(v.size)?.name || v.size}`;
  const clampQty = (n) => {
    const q = parseInt(n, 10);
    return Number.isFinite(q) ? clamp(q, 1, CONFIG.maxQty) : 1;
  };

  /* ===================================================================================
     Analytics: GA4-style dataLayer + optional TikTok / Meta pixels. Never throws.
     =================================================================================== */
  const PIXEL_EVENTS = {
    view_item: { tt: 'ViewContent', fb: 'ViewContent' },
    add_to_cart: { tt: 'AddToCart', fb: 'AddToCart' },
    begin_checkout: { tt: 'InitiateCheckout', fb: 'InitiateCheckout' },
    add_payment_info: { tt: 'AddPaymentInfo', fb: 'AddPaymentInfo' },
    purchase: { tt: 'CompletePayment', fb: 'Purchase' },
  };

  function gaItem(variantId, qty) {
    const v = variantById.get(variantId) || product.variants[0];
    return {
      item_id: v.id,
      item_name: product.name,
      item_brand: CONFIG.brand,
      item_variant: variantLabel(v),
      price: priceCents / 100,
      quantity: qty,
    };
  }

  function track(eventName, data = {}) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ ecommerce: null });
      window.dataLayer.push({ event: eventName, ecommerce: data });

      const map = PIXEL_EVENTS[eventName];
      const items = Array.isArray(data.items) ? data.items : [];
      const payload = {
        value: data.value,
        currency: data.currency,
        content_type: 'product',
        contents: items.map((i) => ({ content_id: i.item_id, content_name: i.item_name, quantity: i.quantity, price: i.price })),
      };
      if (window.ttq && typeof window.ttq.track === 'function' && map) window.ttq.track(map.tt, payload);
      if (typeof window.fbq === 'function') {
        if (map) window.fbq('track', map.fb, payload);
        else window.fbq('trackCustom', eventName, payload);
      }
    } catch (_) {
      /* analytics must never break the shopping flow */
    }
  }

  /* ===================================================================================
     Screen-reader announcements + toast
     =================================================================================== */
  const modalStack = [];

  function announce(message) {
    // Content outside an open modal dialog is inert, so announce inside the top-most one.
    const top = modalStack[modalStack.length - 1];
    const region = (top && $('[data-live]', top)) || $('#page-live');
    if (!region) return;
    region.textContent = '';
    window.setTimeout(() => { region.textContent = message; }, 50);
  }

  const toastEl = $('#toast');
  let toastTimer = 0;
  function hideToast() {
    if (!toastEl) return;
    toastEl.classList.remove('is-open');
    try { if (toastEl.matches(':popover-open')) toastEl.hidePopover(); } catch (_) { /* no popover support */ }
  }
  function showToast(message) {
    if (!toastEl) return;
    const text = $('[data-toast-text]', toastEl);
    if (text) text.textContent = message;
    window.clearTimeout(toastTimer);
    hideToast();
    void toastEl.offsetWidth; // restart the entrance animation
    toastEl.classList.add('is-open');
    try { if (typeof toastEl.showPopover === 'function') toastEl.showPopover(); } catch (_) { /* fall back to fixed positioning */ }
    toastTimer = window.setTimeout(hideToast, 2800);
  }

  /* ===================================================================================
     Prices (rendered from CONFIG so the owner only edits one place)
     =================================================================================== */
  function renderPrices() {
    setText('[data-price]', money(priceCents));
    const compareWrap = $('[data-compare]');
    const compare = product.compareAtPrice;
    if (compareWrap && typeof compare === 'number' && compare > product.price) {
      const save = Math.round((1 - product.price / compare) * 100);
      setText('[data-compare-price]', money(toCents(compare)));
      setText('[data-save]', `Save ${save}%`);
      compareWrap.hidden = false;
    } else if (compareWrap) {
      compareWrap.hidden = true;
    }
  }

  /* ===================================================================================
     Dialog manager: native <dialog>.showModal() gives top-layer rendering and an inert
     background; on top of that we add a Tab trap, animated close, backdrop click,
     body scroll lock and focus return to whatever opened the dialog.
     =================================================================================== */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  function focusables(root) {
    return $$(FOCUSABLE, root).filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden], [inert]') && getComputedStyle(el).visibility !== 'hidden');
  }

  const modalHooks = new Map(); // dialog -> { onClose }

  function syncModalState() {
    document.documentElement.classList.toggle('is-locked', modalStack.length > 0);
    updateStickyBar();
  }

  function openModal(dlg, opener) {
    if (!dlg || dlg.open) return;
    dlg._opener = opener instanceof HTMLElement ? opener : document.activeElement;
    dlg._returnFocus = true;
    delete dlg.dataset.state;
    try {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    } catch (_) {
      dlg.setAttribute('open', '');
    }
    modalStack.push(dlg);
    syncModalState();
    const target = $('[autofocus]', dlg) || focusables(dlg)[0];
    if (target) target.focus({ preventScroll: true });
  }

  function closeModal(dlg, { returnFocus = true } = {}) {
    return new Promise((resolve) => {
      if (!dlg || !dlg.open) return resolve();
      dlg._returnFocus = returnFocus;
      dlg._resolveClose = resolve;
      if (dlg.dataset.state === 'closing') return;
      let timer = 0;
      const finish = () => {
        dlg.removeEventListener('animationend', onEnd);
        window.clearTimeout(timer);
        if (dlg.open) dlg.close();
        else resolve();
      };
      const onEnd = (e) => { if (e.target === dlg && !e.pseudoElement) finish(); };
      if (reducedMotion()) return finish();
      dlg.dataset.state = 'closing';
      dlg.addEventListener('animationend', onEnd);
      timer = window.setTimeout(finish, 420);
    });
  }

  // Runs however the dialog closed (our animation, ESC force-close, form method=dialog...)
  function handleModalClosed(dlg) {
    delete dlg.dataset.state;
    const i = modalStack.indexOf(dlg);
    if (i > -1) modalStack.splice(i, 1);
    syncModalState();
    const hooks = modalHooks.get(dlg);
    if (hooks && hooks.onClose) hooks.onClose();
    if (dlg._returnFocus !== false) {
      const opener = dlg._opener;
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    }
    dlg._returnFocus = true;
    if (typeof dlg._resolveClose === 'function') { dlg._resolveClose(); dlg._resolveClose = null; }
  }

  function initModal(dlg, hooks = {}) {
    if (!dlg) return;
    modalHooks.set(dlg, hooks);

    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (!dlg.dataset.locked) closeModal(dlg);
    });
    dlg.addEventListener('close', () => handleModalClosed(dlg));

    // Backdrop click (pointer must start and end outside the panel)
    const outside = (e) => {
      const r = dlg.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let downOutside = false;
    dlg.addEventListener('pointerdown', (e) => { downOutside = e.target === dlg && outside(e); });
    dlg.addEventListener('click', (e) => {
      if (downOutside && e.target === dlg && outside(e) && !dlg.dataset.locked) closeModal(dlg);
      downOutside = false;
    });

    // Tab trap
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = focusables(dlg);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dlg.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !dlg.contains(active))) { e.preventDefault(); first.focus(); }
    });

    for (const btn of $$('[data-modal-close]', dlg)) {
      btn.addEventListener('click', () => { if (!dlg.dataset.locked) closeModal(dlg); });
    }
  }

  /* ===================================================================================
     Header: scrolled state + live header height (used for scroll-margin-top)
     =================================================================================== */
  function initHeader() {
    const header = $('#site-header');
    if (!header) return;
    let scrolled = null;
    let ticking = false;
    const update = () => {
      ticking = false;
      const next = window.scrollY > 8;
      if (next !== scrolled) {
        scrolled = next;
        header.dataset.scrolled = String(next);
      }
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();

    const setHeight = () => document.documentElement.style.setProperty('--header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
    setHeight();
    if ('ResizeObserver' in window) new ResizeObserver(setHeight).observe(header);
    else window.addEventListener('resize', setHeight, { passive: true });
  }

  /* ===================================================================================
     Trust marquee pause control (WCAG 2.2.2)
     =================================================================================== */
  function initMarquee() {
    const band = $('[data-marquee]');
    const toggle = $('[data-marquee-toggle]');
    if (!band || !toggle) return;
    toggle.addEventListener('click', () => {
      const paused = band.dataset.paused !== 'true';
      band.dataset.paused = String(paused);
      toggle.setAttribute('aria-pressed', String(paused));
    });
  }

  /* ===================================================================================
     Free-shipping countdown to the visitor's local midnight (genuine, resets daily)
     =================================================================================== */
  function initCountdown() {
    const blocks = $$('[data-countdown]');
    if (!blocks.length) return;
    for (const block of blocks) {
      const fallback = $('[data-countdown-fallback]', block);
      const live = $('[data-countdown-live]', block);
      if (fallback) fallback.hidden = true;
      if (live) live.hidden = false;
    }
    const times = $$('[data-countdown-time]');
    let timer = 0;
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const secs = Math.max(0, Math.floor((midnight - now) / 1000));
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      const text = `${pad(h)}:${pad(m)}:${pad(s)}`;
      for (const t of times) t.textContent = text;
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 15);
    };
    document.addEventListener('visibilitychange', () => {
      window.clearTimeout(timer);
      if (!document.hidden) tick();
    });
    tick();
  }

  /* ===================================================================================
     Product selection: colour, size, quantity, gallery, live total
     =================================================================================== */
  const selection = { color: 'onyx', size: 'standard', qty: 1 };
  const currentVariant = () => findVariant(selection.color, selection.size);

  const gallery = {
    main: $('#gallery-main'),
    thumbs: $$('[data-thumb]'),
    index: $('[data-gallery-index]'),
    show(thumb) {
      if (!thumb) return;
      for (const t of this.thumbs) t.setAttribute('aria-current', String(t === thumb));
      if (this.index) this.index.textContent = String(this.thumbs.indexOf(thumb) + 1).padStart(2, '0');
      const main = this.main;
      if (!main) return;
      const src = thumb.dataset.src;
      main.alt = thumb.dataset.alt || '';
      if (!src || main.getAttribute('src') === src) return;
      main.classList.add('is-swapping');
      const done = () => main.classList.remove('is-swapping');
      main.addEventListener('load', done, { once: true });
      main.addEventListener('error', done, { once: true });
      main.setAttribute('src', src);
    },
  };

  function applyColor(colorId, { fromThumb = null, silent = false } = {}) {
    const color = colorById.get(colorId);
    if (!color) return;
    selection.color = colorId;
    setText('[data-color-name]', color.name);
    const radio = $(`input[name="color"][value="${colorId}"]`);
    if (radio && !radio.checked) radio.checked = true;
    gallery.show(fromThumb || gallery.thumbs.find((t) => t.dataset.color === colorId));
    for (const img of $$('[data-sticky-thumb]')) img.setAttribute('src', color.image);
    if (!silent) {
      const v = currentVariant();
      track('select_item', { currency: CONFIG.currency, value: priceCents / 100, items: [gaItem(v.id, 1)] });
    }
  }

  const qtyInput = $('#qty');
  const qtyDec = $('[data-qty-dec]');
  const qtyInc = $('[data-qty-inc]');

  function renderBuyTotal() {
    setText('[data-buy-total]', money(priceCents * selection.qty));
    if (qtyDec) qtyDec.setAttribute('aria-disabled', String(selection.qty <= 1));
    if (qtyInc) qtyInc.setAttribute('aria-disabled', String(selection.qty >= CONFIG.maxQty));
  }

  function setQty(value) {
    const raw = parseInt(value, 10);
    const q = clampQty(value);
    selection.qty = q;
    if (qtyInput) qtyInput.value = String(q);
    renderBuyTotal();
    if (Number.isFinite(raw) && raw > CONFIG.maxQty) announce(`Maximum ${CONFIG.maxQty} per order. Quantity set to ${CONFIG.maxQty}.`);
  }

  function initProductForm() {
    const form = $('#product-form');
    // Sync with whatever the browser restored (back/forward cache, form restoration)
    const checked = $('input[name="color"]:checked');
    const sizeSelect = $('#size');
    if (sizeSelect && sizeById.has(sizeSelect.value)) selection.size = sizeSelect.value;
    applyColor(checked && colorById.has(checked.value) ? checked.value : selection.color, { silent: true });
    setQty(qtyInput ? qtyInput.value : 1);

    for (const radio of $$('input[name="color"]')) {
      radio.addEventListener('change', () => { if (radio.checked) applyColor(radio.value); });
    }
    if (sizeSelect) {
      sizeSelect.addEventListener('change', () => {
        if (!sizeById.has(sizeSelect.value)) return;
        selection.size = sizeSelect.value;
        track('select_item', { currency: CONFIG.currency, value: priceCents / 100, items: [gaItem(currentVariant().id, 1)] });
      });
    }
    for (const thumb of gallery.thumbs) {
      thumb.addEventListener('click', () => {
        if (thumb.dataset.color) applyColor(thumb.dataset.color, { fromThumb: thumb });
        else gallery.show(thumb);
      });
    }
    if (qtyDec) qtyDec.addEventListener('click', () => { if (selection.qty > 1) setQty(selection.qty - 1); });
    if (qtyInc) qtyInc.addEventListener('click', () => { if (selection.qty < CONFIG.maxQty) setQty(selection.qty + 1); });
    if (qtyInput) {
      qtyInput.addEventListener('input', () => {
        const q = parseInt(qtyInput.value, 10);
        if (Number.isFinite(q) && q >= 1 && q <= CONFIG.maxQty) { selection.qty = q; renderBuyTotal(); }
      });
      qtyInput.addEventListener('change', () => setQty(qtyInput.value));
      qtyInput.addEventListener('blur', () => setQty(qtyInput.value));
    }
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (qtyInput) setQty(qtyInput.value);
      });
    }

    const addBtn = $('[data-add-to-cart]');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (qtyInput) setQty(qtyInput.value);
        const v = currentVariant();
        const result = addToCart(v.id, selection.qty);
        openCart(addBtn);
        const label = `${variantLabel(v)}`;
        if (result.added === 0) {
          showToast(`Max ${CONFIG.maxQty} per item: already in your cart`);
          announce(`You already have the maximum of ${CONFIG.maxQty} ${label} in your cart.`);
        } else {
          showToast(`Added to cart: ${colorById.get(v.color).name} × ${result.added}`);
          announce(`Added ${result.added} ${product.name}, ${label}, to your cart.${result.capped ? ` Limited to ${CONFIG.maxQty} per item.` : ''} Cart total ${money(cart.subtotalCents())}.`);
        }
      });
    }
    const buyBtn = $('[data-buy-now]');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        if (qtyInput) setQty(qtyInput.value);
        addToCart(currentVariant().id, selection.qty);
        beginCheckout(buyBtn);
      });
    }
  }

  /* ===================================================================================
     Cart: [{ variantId, qty }], merged per variant, max 10 per line, persisted safely
     =================================================================================== */
  function sanitizeLines(data) {
    if (!Array.isArray(data)) return [];
    const out = [];
    for (const raw of data) {
      if (!raw || typeof raw !== 'object' || !variantById.has(raw.variantId)) continue;
      const qty = clampQty(raw.qty);
      const existing = out.find((l) => l.variantId === raw.variantId);
      if (existing) existing.qty = clamp(existing.qty + qty, 1, CONFIG.maxQty);
      else out.push({ variantId: raw.variantId, qty });
    }
    return out;
  }

  const cart = {
    lines: [],
    load() {
      let data = [];
      try { data = JSON.parse(store.get(CONFIG.storageKey) || '[]'); } catch (_) { data = []; }
      this.lines = sanitizeLines(data);
    },
    save() { store.set(CONFIG.storageKey, JSON.stringify(this.lines)); },
    find(id) { return this.lines.find((l) => l.variantId === id); },
    count() { return this.lines.reduce((n, l) => n + l.qty, 0); },
    subtotalCents() { return this.lines.reduce((n, l) => n + l.qty * priceCents, 0); },
    add(id, qty) {
      if (!variantById.has(id)) return { added: 0, capped: false };
      const line = this.find(id);
      const before = line ? line.qty : 0;
      const wanted = before + clampQty(qty);
      const next = clamp(wanted, 1, CONFIG.maxQty);
      if (line) line.qty = next;
      else this.lines.push({ variantId: id, qty: next });
      this.commit();
      return { added: next - before, capped: wanted > CONFIG.maxQty };
    },
    setQty(id, qty) {
      const line = this.find(id);
      if (!line) return;
      line.qty = clampQty(qty);
      this.commit();
    },
    remove(id) {
      this.lines = this.lines.filter((l) => l.variantId !== id);
      this.commit();
    },
    clear() {
      this.lines = [];
      this.commit();
    },
    commit() {
      this.save();
      renderCart();
    },
  };

  function addToCart(variantId, qty) {
    const result = cart.add(variantId, qty);
    if (result.added > 0) {
      track('add_to_cart', { currency: CONFIG.currency, value: (priceCents * result.added) / 100, items: [gaItem(variantId, result.added)] });
      const badge = $('[data-cart-count]');
      if (badge && !reducedMotion()) {
        badge.classList.remove('is-bumped');
        void badge.offsetWidth;
        badge.classList.add('is-bumped');
      }
    }
    return result;
  }

  const drawer = $('#cart-drawer');
  const linesEl = $('[data-cart-lines]');
  const lineTpl = $('#tpl-cart-line');

  function renderLines() {
    if (!linesEl || !lineTpl) return;
    const existing = new Map($$('[data-line]', linesEl).map((li) => [li.dataset.variantId, li]));
    cart.lines.forEach((line, i) => {
      const v = variantById.get(line.variantId);
      const label = variantLabel(v);
      let li = existing.get(line.variantId);
      if (!li) {
        li = lineTpl.content.firstElementChild.cloneNode(true);
        li.dataset.variantId = line.variantId;
        const img = $('[data-line-img]', li);
        if (img) img.setAttribute('src', colorById.get(v.color).image);
        setText('[data-line-name]', product.name, li);
        setText('[data-line-variant]', label, li);
        $('[data-line-group]', li)?.setAttribute('aria-label', `Quantity for ${label}`);
        $('[data-line-dec]', li)?.setAttribute('aria-label', `Decrease quantity of ${label}`);
        $('[data-line-inc]', li)?.setAttribute('aria-label', `Increase quantity of ${label}`);
        $('[data-line-qty]', li)?.setAttribute('aria-label', `Quantity, ${label}`);
        $('[data-line-remove]', li)?.setAttribute('aria-label', `Remove ${label} from cart`);
      }
      existing.delete(line.variantId);
      const input = $('[data-line-qty]', li);
      if (input && document.activeElement !== input) input.value = String(line.qty);
      $('[data-line-dec]', li)?.setAttribute('aria-disabled', String(line.qty <= 1));
      $('[data-line-inc]', li)?.setAttribute('aria-disabled', String(line.qty >= CONFIG.maxQty));
      setText('[data-line-total]', money(line.qty * priceCents), li);
      if (linesEl.children[i] !== li) linesEl.insertBefore(li, linesEl.children[i] || null);
    });
    existing.forEach((li) => li.remove());
  }

  function renderCart() {
    const count = cart.count();
    const subtotal = cart.subtotalCents();
    for (const badge of $$('[data-cart-count]')) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    for (const btn of $$('[data-cart-open]')) btn.setAttribute('aria-label', `Open cart, ${count} ${count === 1 ? 'item' : 'items'}`);
    setText('[data-cart-count-text]', `(${count})`);
    setText('[data-cart-subtotal]', money(subtotal));
    setText('[data-cart-total]', money(subtotal));
    renderLines();
    const empty = count === 0;
    const emptyEl = $('[data-cart-empty]');
    const footer = $('[data-cart-footer]');
    if (emptyEl) emptyEl.hidden = !empty;
    if (footer) footer.hidden = empty;
    if (linesEl) linesEl.hidden = empty;
    if (checkoutState.step !== 3) renderSummary();
  }

  function openCart(opener) {
    if (!drawer) return;
    renderCart();
    openModal(drawer, opener);
  }

  function initCart() {
    cart.load();
    renderCart();
    for (const btn of $$('[data-cart-open]')) btn.addEventListener('click', () => openCart(btn));

    if (linesEl) {
      linesEl.addEventListener('click', (e) => {
        const li = e.target.closest('[data-line]');
        if (!li) return;
        const id = li.dataset.variantId;
        const line = cart.find(id);
        if (!line) return;
        const label = variantLabel(variantById.get(id));
        if (e.target.closest('[data-line-dec]')) {
          if (line.qty > 1) { cart.setQty(id, line.qty - 1); announce(`${label} quantity ${line.qty}. Subtotal ${money(cart.subtotalCents())}.`); }
        } else if (e.target.closest('[data-line-inc]')) {
          if (line.qty < CONFIG.maxQty) { cart.setQty(id, line.qty + 1); announce(`${label} quantity ${line.qty}. Subtotal ${money(cart.subtotalCents())}.`); }
          else announce(`Maximum ${CONFIG.maxQty} per item.`);
        } else if (e.target.closest('[data-line-remove]')) {
          const items = $$('[data-line]', linesEl);
          const idx = items.indexOf(li);
          cart.remove(id);
          announce(`Removed ${label} from your cart.`);
          const remaining = $$('[data-line]', linesEl);
          const next = remaining[Math.min(idx, remaining.length - 1)];
          const focusTarget = next ? $('[data-line-remove]', next) : $('[data-shop-now]');
          if (focusTarget) focusTarget.focus();
        }
      });
      linesEl.addEventListener('change', (e) => {
        const input = e.target.closest('[data-line-qty]');
        if (!input) return;
        const id = input.closest('[data-line]')?.dataset.variantId;
        const raw = parseInt(input.value, 10);
        cart.setQty(id, input.value);
        const line = cart.find(id);
        if (line) input.value = String(line.qty);
        if (Number.isFinite(raw) && raw > CONFIG.maxQty) announce(`Maximum ${CONFIG.maxQty} per item.`);
      });
    }

    const shopNow = $('[data-shop-now]');
    if (shopNow) {
      shopNow.addEventListener('click', () => {
        closeModal(drawer, { returnFocus: false }).then(() => goToBuy());
      });
    }
    const checkoutBtn = $('[data-checkout]');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        const opener = drawer && drawer._opener;
        closeModal(drawer, { returnFocus: false });
        beginCheckout(opener && opener.isConnected ? opener : $('[data-cart-open]'));
      });
    }

    // Keep tabs in sync
    window.addEventListener('storage', (e) => {
      if (e.key !== CONFIG.storageKey) return;
      cart.load();
      renderCart();
    });
  }

  function goToBuy() {
    const buy = $('#buy');
    const title = $('#buy-title');
    if (!buy) return;
    buy.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    if (title) {
      if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
      title.focus({ preventScroll: true });
    }
  }

  /* ===================================================================================
     Checkout: Shopify cart permalink when configured, otherwise the demo flow
     =================================================================================== */
  const checkoutDlg = $('#checkout');
  const checkoutState = { step: 1, completed: false, info: null, opener: null };

  function shopifyCartUrl() {
    const { mode, shopifyDomain } = CONFIG.checkout;
    if (mode !== 'shopify' || !shopifyDomain || !cart.lines.length) return null;
    const parts = [];
    for (const line of cart.lines) {
      const v = variantById.get(line.variantId);
      if (!v || !v.shopifyVariantId) return null;
      parts.push(`${encodeURIComponent(v.shopifyVariantId)}:${line.qty}`);
    }
    const domain = String(shopifyDomain).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${domain}/cart/${parts.join(',')}`;
  }

  function cartItems() { return cart.lines.map((l) => gaItem(l.variantId, l.qty)); }

  function beginCheckout(opener) {
    if (!cart.lines.length) { openCart(opener); return; }
    track('begin_checkout', { currency: CONFIG.currency, value: cart.subtotalCents() / 100, items: cartItems() });
    const url = shopifyCartUrl();
    if (url) { window.location.assign(url); return; }
    if (!checkoutDlg || checkoutDlg.open) return;
    if (checkoutState.completed) resetCheckout();
    renderSummary();
    showStep(checkoutState.step, { focus: false });
    openModal(checkoutDlg, opener);
    const heading = $(`[data-step="${checkoutState.step}"] [data-step-heading]`, checkoutDlg);
    if (heading) heading.focus({ preventScroll: true });
  }

  function renderSummary() {
    const targets = $$('[data-summary]');
    const total = money(cart.subtotalCents());
    setText('[data-co-total]', total);
    if (!targets.length) return;
    const lines = cart.lines.map((l) => {
      const v = variantById.get(l.variantId);
      const c = colorById.get(v.color);
      return `<li class="sum-line">
          <span class="sum-line__img"><img src="${escapeHTML(c.image)}" width="1200" height="1200" alt="" loading="lazy" decoding="async"><span class="sum-line__qty">${l.qty}</span></span>
          <span><span class="sum-line__name">${escapeHTML(product.name)}</span><br><span class="sum-line__variant">${escapeHTML(variantLabel(v))} &middot; Qty ${l.qty}</span></span>
          <span class="font-semibold">${escapeHTML(money(l.qty * priceCents))}</span>
        </li>`;
    }).join('');
    const html = `<ul class="sum-lines">${lines}</ul>
      <dl class="sum-totals">
        <div><dt>Subtotal</dt><dd>${escapeHTML(total)}</dd></div>
        <div><dt>Shipping</dt><dd>Free</dd></div>
        <div class="is-total"><dt>Total</dt><dd>${escapeHTML(total)} <span class="text-[0.75rem] font-normal text-gray-400">${escapeHTML(CONFIG.currency)}</span></dd></div>
      </dl>`;
    for (const t of targets) t.innerHTML = html;
  }

  function showStep(step, { focus = true } = {}) {
    if (!checkoutDlg) return;
    checkoutState.step = step;
    for (const panel of $$('[data-step]', checkoutDlg)) panel.hidden = Number(panel.dataset.step) !== step;
    for (const ind of $$('[data-step-ind]', checkoutDlg)) {
      const n = Number(ind.dataset.stepInd);
      if (n === step) ind.setAttribute('aria-current', 'step');
      else ind.removeAttribute('aria-current');
      ind.classList.toggle('is-done', n < step);
    }
    if (focus) {
      const heading = $(`[data-step="${step}"] [data-step-heading]`, checkoutDlg);
      if (heading) heading.focus({ preventScroll: false });
    }
  }

  function resetCheckout() {
    checkoutState.completed = false;
    checkoutState.info = null;
    checkoutState.step = 1;
    const info = $('#co-info');
    if (info) {
      info.reset();
      info.dataset.attempted = '';
      for (const f of $$('.field', info)) f.removeAttribute('aria-invalid');
      for (const err of $$('[data-error-for]', info)) { err.hidden = true; err.textContent = ''; }
    }
    showStep(1, { focus: false });
  }

  const VALIDATORS = {
    email: (v) => (!v ? 'Enter your email address.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Enter a valid email, like name@example.com.'),
    name: (v) => (v.length >= 2 ? '' : 'Enter your full name.'),
    address: (v) => (v.length >= 4 ? '' : 'Enter your street address.'),
    city: (v) => (v.length >= 2 ? '' : 'Enter your city.'),
    zip: (v, form) => {
      if (!v) return 'Enter your ZIP or postal code.';
      const country = form.elements.country ? form.elements.country.value : 'US';
      if (country === 'US') return /^\d{5}(-\d{4})?$/.test(v) ? '' : 'Enter a 5-digit ZIP code, like 10001.';
      return /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(v) ? '' : 'Enter a valid postal code.';
    },
  };

  function validateField(form, name) {
    const field = form.elements[name];
    const err = $(`[data-error-for="${name}"]`, form);
    if (!field || !VALIDATORS[name]) return true;
    const message = VALIDATORS[name](field.value.trim(), form);
    field.setAttribute('aria-invalid', String(Boolean(message)));
    if (!message) field.removeAttribute('aria-invalid');
    if (err) { err.textContent = message; err.hidden = !message; }
    return !message;
  }

  function initCheckout() {
    if (!checkoutDlg) return;
    const infoForm = $('#co-info');
    const payForm = $('#co-pay');
    const payBtn = $('[data-pay]', checkoutDlg);
    const payLabel = $('[data-pay-label]', checkoutDlg);

    if (infoForm) {
      infoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        infoForm.dataset.attempted = 'true';
        const names = Object.keys(VALIDATORS);
        const invalid = names.filter((n) => !validateField(infoForm, n));
        if (invalid.length) {
          const first = infoForm.elements[invalid[0]];
          if (first) first.focus();
          announce(`Please fix ${invalid.length} ${invalid.length === 1 ? 'field' : 'fields'} to continue.`);
          return;
        }
        const data = Object.fromEntries(new FormData(infoForm).entries());
        checkoutState.info = data;
        const countryName = infoForm.elements.country?.selectedOptions?.[0]?.textContent || data.country;
        setText('[data-ship-to]', `Shipping to ${data.name}, ${data.address}, ${data.city} ${data.zip}, ${countryName}. Free shipping.`, checkoutDlg);
        showStep(2);
        track('add_payment_info', { currency: CONFIG.currency, value: cart.subtotalCents() / 100, payment_type: 'demo_card', items: cartItems() });
      });
      // Live re-validation once the shopper has tried to submit
      const revalidate = (e) => {
        const name = e.target && e.target.name;
        if (infoForm.dataset.attempted === 'true' && VALIDATORS[name]) validateField(infoForm, name);
        if (name === 'country' && infoForm.dataset.attempted === 'true') validateField(infoForm, 'zip');
      };
      infoForm.addEventListener('input', revalidate);
      infoForm.addEventListener('change', revalidate);
      infoForm.addEventListener('focusout', (e) => {
        const name = e.target && e.target.name;
        if (VALIDATORS[name] && e.target.value.trim()) validateField(infoForm, name);
      });
    }

    const back = $('[data-co-back]', checkoutDlg);
    if (back) back.addEventListener('click', () => showStep(1));

    if (payForm && payBtn) {
      payForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (payBtn.disabled || !cart.lines.length) return;
        payBtn.disabled = true;
        payBtn.setAttribute('aria-busy', 'true');
        if (payLabel) payLabel.textContent = 'Processing…';
        checkoutDlg.dataset.locked = 'true';
        announce('Processing demo payment.');
        window.setTimeout(() => {
          const orderId = `TA-${randomDigits(6)}`;
          const value = cart.subtotalCents() / 100;
          track('purchase', { transaction_id: orderId, currency: CONFIG.currency, value, shipping: 0, tax: 0, items: cartItems() });
          const info = checkoutState.info || {};
          setText('[data-order-id]', orderId, checkoutDlg);
          setText('[data-order-email]', info.email || '', checkoutDlg);
          const first = String(info.name || '').trim().split(/\s+/)[0];
          setText('[data-co-firstname]', first ? `, ${first}` : '', checkoutDlg);
          checkoutState.completed = true;
          checkoutState.step = 3;
          cart.clear();
          payBtn.disabled = false;
          payBtn.removeAttribute('aria-busy');
          if (payLabel) payLabel.innerHTML = 'Pay <span data-co-total></span>';
          delete checkoutDlg.dataset.locked;
          showStep(3);
          announce(`Demo order ${orderId} confirmed.`);
        }, CONFIG.demoProcessingMs);
      });
    }

    const cont = $('[data-continue]', checkoutDlg);
    if (cont) cont.addEventListener('click', () => closeModal(checkoutDlg));
  }

  function randomDigits(n) {
    let out = '';
    try {
      const buf = new Uint32Array(n);
      window.crypto.getRandomValues(buf);
      for (const x of buf) out += String(x % 10);
    } catch (_) {
      for (let i = 0; i < n; i += 1) out += String(Math.floor(Math.random() * 10));
    }
    if (out[0] === '0') out = String(1 + (Number(out[0]) % 9)) + out.slice(1);
    return out;
  }

  /* ===================================================================================
     Policy dialogs: deep-linkable via #privacy / #terms / #shipping
     =================================================================================== */
  const policyDialogs = $$('dialog.policy');
  let policyOpener = null;

  function policyFromHash() {
    const id = decodeURIComponent(window.location.hash.slice(1));
    return id ? policyDialogs.find((d) => d.id === id) || null : null;
  }

  function syncPolicyWithHash() {
    const target = policyFromHash();
    if (target && !target.open) {
      openModal(target, policyOpener || document.activeElement);
      policyOpener = null;
    } else if (!target) {
      for (const d of policyDialogs) if (d.open) closeModal(d);
    }
  }

  function initPolicies() {
    if (!policyDialogs.length) return;
    for (const d of policyDialogs) {
      initModal(d, {
        onClose: () => {
          if (window.location.hash === `#${d.id}`) {
            try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) { /* file:// etc. */ }
          }
        },
      });
    }
    document.addEventListener('click', (e) => {
      const link = e.target.closest && e.target.closest('a[href^="#"]');
      if (!link) return;
      const d = policyDialogs.find((x) => `#${x.id}` === link.getAttribute('href'));
      if (!d) return;
      e.preventDefault();
      if (window.location.hash !== `#${d.id}`) {
        try { window.history.pushState(null, '', `#${d.id}`); } catch (_) { /* ignore */ }
      }
      openModal(d, link);
    });
    window.addEventListener('hashchange', syncPolicyWithHash);
    syncPolicyWithHash();
  }

  /* ===================================================================================
     Mobile sticky buy bar: after the hero CTA scrolls away, hidden over #buy and dialogs
     =================================================================================== */
  const stickyBar = $('#sticky-buy');
  const stickyState = { pastHero: false, buyInView: false };

  function updateStickyBar() {
    if (!stickyBar) return;
    const show = stickyState.pastHero && !stickyState.buyInView && modalStack.length === 0;
    if (stickyBar.dataset.visible === String(show)) return;
    stickyBar.dataset.visible = String(show);
    if (show) {
      stickyBar.removeAttribute('inert');
      stickyBar.removeAttribute('aria-hidden');
    } else {
      if (stickyBar.contains(document.activeElement)) document.activeElement.blur();
      stickyBar.setAttribute('inert', '');
      stickyBar.setAttribute('aria-hidden', 'true');
    }
  }

  function initStickyBar() {
    const heroCta = $('[data-hero-cta]');
    const buy = $('#buy');
    if (!stickyBar || !heroCta || !buy || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === heroCta) {
          const top = e.rootBounds ? e.rootBounds.top : 0;
          stickyState.pastHero = !e.isIntersecting && e.boundingClientRect.bottom <= top + 1;
        } else if (e.target === buy) {
          stickyState.buyInView = e.isIntersecting;
        }
      }
      updateStickyBar();
    });
    io.observe(heroCta);
    io.observe(buy);
    const cta = $('a[href="#buy"]', stickyBar);
    if (cta) {
      cta.addEventListener('click', (e) => {
        e.preventDefault();
        goToBuy();
      });
    }
  }

  /* ===================================================================================
     Boot
     =================================================================================== */
  function init() {
    renderPrices();
    initHeader();
    initMarquee();
    initCountdown();
    initModal(drawer);
    initModal(checkoutDlg, {
      onClose: () => {
        delete checkoutDlg.dataset.locked;
        if (checkoutState.completed) resetCheckout();
      },
    });
    initCheckout();
    initCart();
    initProductForm();
    initPolicies();
    initStickyBar();
    for (const el of $$('[data-year]')) el.textContent = String(new Date().getFullYear());

    // Warm the cache for gallery swaps once the page is idle
    const preload = () => { for (const t of gallery.thumbs) { const img = new Image(); img.decoding = 'async'; img.src = t.dataset.src; } };
    if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 2500 });
    else window.setTimeout(preload, 1200);

    const v = currentVariant();
    track('view_item', { currency: CONFIG.currency, value: priceCents / 100, items: [gaItem(v.id, 1)] });
  }

  // Small public API for debugging and future integrations (e.g. a real Shopify cart)
  window.TA = Object.freeze({
    CONFIG,
    track,
    cart: {
      get lines() { return cart.lines.map((l) => ({ ...l })); },
      add: (variantId, qty = 1) => addToCart(variantId, qty),
      clear: () => cart.clear(),
      open: () => openCart(document.activeElement),
    },
    checkout: () => beginCheckout(document.activeElement),
  });

  try {
    init();
  } catch (err) {
    // Fail soft: the static page (links, anchors, content) keeps working without JS features.
    if (window.console && typeof window.console.error === 'function') window.console.error('[TA] init failed', err);
  }
})();
