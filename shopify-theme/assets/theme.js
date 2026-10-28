/* =====================================================================================
   Trending Arrivals Shopify theme: interactions
   Vanilla ES2020, no dependencies. Cart uses Shopify's Ajax Cart API; checkout is Shopify's.
   Every feature checks that its elements exist, so removing a section never breaks the rest.
   ===================================================================================== */
(() => {
  'use strict';

  const THEME = window.TA_THEME || {};
  const ROUTES = Object.assign({ root: '/', cart: '/cart', cartAdd: '/cart/add', cartChange: '/cart/change' }, THEME.routes);

  /* ===================================================================================
     Helpers
     =================================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const setText = (sel, text, root = document) => { for (const el of $$(sel, root)) el.textContent = text; };

  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => Boolean(motionQuery && motionQuery.matches);

  // Shopify money format, e.g. "${{amount}}" or "{{amount_with_comma_separator}} €"
  function formatMoney(cents, format = THEME.moneyFormat || '${{amount}}') {
    const placeholder = /\{\{\s*(\w+)\s*\}\}/;
    const n = Number(cents) || 0;
    const delimit = (precision, thousands = ',', decimal = '.') => {
      const [whole, frac] = (n / 100).toFixed(precision).split('.');
      return whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands) + (frac ? decimal + frac : '');
    };
    const match = String(format).match(placeholder);
    let value;
    switch (match && match[1]) {
      case 'amount_no_decimals': value = delimit(0); break;
      case 'amount_with_comma_separator': value = delimit(2, '.', ','); break;
      case 'amount_no_decimals_with_comma_separator': value = delimit(0, '.', ','); break;
      case 'amount_with_apostrophe_separator': value = delimit(2, "'", '.'); break;
      case 'amount_no_decimals_with_space_separator': value = delimit(0, ' ', ','); break;
      case 'amount_with_space_separator': value = delimit(2, ' ', ','); break;
      case 'amount_with_period_and_space_separator': value = delimit(2, ' ', '.'); break;
      default: value = delimit(2);
    }
    return String(format).replace(placeholder, value).replace(/<[^>]*>/g, '');
  }

  // The store's money format without decimals, e.g. "${{amount}}" -> "${{amount_no_decimals}}"
  function wholeMoneyFormat() {
    return String(THEME.moneyFormat || '${{amount}}')
      .replace(/\{\{\s*amount\s*\}\}/, '{{amount_no_decimals}}')
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, '{{amount_no_decimals_with_comma_separator}}')
      .replace(/\{\{\s*amount_with_space_separator\s*\}\}/, '{{amount_no_decimals_with_space_separator}}');
  }

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.description || data.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
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
     Dialog manager: native <dialog>.showModal() gives top-layer rendering and an inert
     background; on top of that: Tab trap, animated close, backdrop click, scroll lock and
     focus return to whatever opened the dialog.
     =================================================================================== */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  function focusables(root) {
    return $$(FOCUSABLE, root).filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden], [inert]') && getComputedStyle(el).visibility !== 'hidden');
  }

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

  function handleModalClosed(dlg) {
    delete dlg.dataset.state;
    const i = modalStack.indexOf(dlg);
    if (i > -1) modalStack.splice(i, 1);
    syncModalState();
    if (dlg._returnFocus !== false) {
      const opener = dlg._opener;
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    }
    dlg._returnFocus = true;
    if (typeof dlg._resolveClose === 'function') { dlg._resolveClose(); dlg._resolveClose = null; }
  }

  function initModal(dlg) {
    if (!dlg) return;
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(dlg); });
    dlg.addEventListener('close', () => handleModalClosed(dlg));

    // Backdrop click (pointer must start and end outside the panel)
    const outside = (e) => {
      const r = dlg.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let downOutside = false;
    dlg.addEventListener('pointerdown', (e) => { downOutside = e.target === dlg && outside(e); });
    dlg.addEventListener('click', (e) => {
      if (downOutside && e.target === dlg && outside(e)) closeModal(dlg);
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

    for (const btn of $$('[data-modal-close]', dlg)) btn.addEventListener('click', () => closeModal(dlg));
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
  function initMarquee(root = document) {
    for (const band of $$('[data-marquee]', root)) {
      const toggle = $('[data-marquee-toggle]', band);
      if (!toggle || toggle.dataset.bound) continue;
      toggle.dataset.bound = 'true';
      toggle.addEventListener('click', () => {
        const paused = band.dataset.paused !== 'true';
        band.dataset.paused = String(paused);
        toggle.setAttribute('aria-pressed', String(paused));
      });
    }
  }

  /* ===================================================================================
     Free-shipping countdown to the visitor's local midnight (genuine, resets daily)
     =================================================================================== */
  let countdownTimer = 0;
  function initCountdown() {
    const blocks = $$('[data-countdown]');
    window.clearTimeout(countdownTimer);
    if (!blocks.length) return;
    for (const block of blocks) {
      const fallback = $('[data-countdown-fallback]', block);
      const live = $('[data-countdown-live]', block);
      if (fallback) fallback.hidden = true;
      if (live) live.hidden = false;
    }
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const secs = Math.max(0, Math.floor((midnight - now) / 1000));
      const text = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
      for (const t of $$('[data-countdown-time]')) t.textContent = text;
      countdownTimer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 15);
    };
    tick();
  }
  document.addEventListener('visibilitychange', () => {
    window.clearTimeout(countdownTimer);
    if (!document.hidden) initCountdown();
  });

  /* ===================================================================================
     Cart: Shopify Ajax Cart API + slide-over drawer
     =================================================================================== */
  const drawer = $('#cart-drawer');
  const lineTpl = $('#tpl-cart-line');
  let cartState = null;
  try { cartState = JSON.parse(($('#cart-json') || {}).textContent || 'null'); } catch (_) { cartState = null; }

  function renderCart(cart = cartState) {
    if (!cart) return;
    cartState = cart;
    const count = cart.item_count || 0;
    for (const badge of $$('[data-cart-count]')) { badge.textContent = String(count); badge.hidden = count === 0; }
    for (const btn of $$('[data-cart-open]')) btn.setAttribute('aria-label', `Open cart, ${count} item${count === 1 ? '' : 's'}`);
    setText('[data-cart-count-text]', `(${count})`);
    setText('[data-cart-subtotal]', formatMoney(cart.total_price));
    if (!drawer || !lineTpl) return;

    const list = $('[data-cart-lines]', drawer);
    const empty = $('[data-cart-empty]', drawer);
    const footer = $('[data-cart-footer]', drawer);
    if (empty) empty.hidden = count > 0;
    if (footer) footer.hidden = count === 0;
    if (!list) return;
    list.replaceChildren();
    for (const item of cart.items || []) {
      const li = lineTpl.content.firstElementChild.cloneNode(true);
      li.dataset.key = item.key;
      const img = $('[data-line-img]', li);
      if (img) {
        if (item.image) img.src = item.image + (item.image.includes('?') ? '&' : '?') + 'width=200';
        else img.remove();
      }
      const link = $('[data-line-link]', li);
      if (link) link.href = item.url || '#';
      setText('[data-line-name]', item.product_title, li);
      setText('[data-line-variant]', item.product_has_only_default_variant ? '' : (item.variant_title || ''), li);
      setText('[data-line-total]', formatMoney(item.final_line_price), li);
      const qty = $('[data-line-qty]', li);
      const label = `${item.product_title}${item.variant_title && !item.product_has_only_default_variant ? `, ${item.variant_title}` : ''}`;
      if (qty) { qty.value = String(item.quantity); qty.setAttribute('aria-label', `Quantity, ${label}`); }
      $('[data-line-dec]', li)?.setAttribute('aria-label', `Decrease quantity, ${label}`);
      $('[data-line-inc]', li)?.setAttribute('aria-label', `Increase quantity, ${label}`);
      $('[data-line-remove]', li)?.setAttribute('aria-label', `Remove ${label}`);
      list.append(li);
    }
  }

  async function refreshCart() {
    try { renderCart(await fetchJSON(`${ROUTES.cart}.js`)); } catch (_) { /* keep last known state */ }
  }

  async function changeLine(key, quantity) {
    if (drawer) drawer.setAttribute('aria-busy', 'true');
    try {
      renderCart(await fetchJSON(`${ROUTES.cartChange}.js`, { method: 'POST', body: JSON.stringify({ id: key, quantity }) }));
      announce(quantity === 0 ? 'Item removed from your cart.' : `Quantity updated. Subtotal ${formatMoney(cartState.total_price)}.`);
    } catch (err) {
      showToast(err.message || 'Could not update your cart.');
      refreshCart();
    } finally {
      if (drawer) drawer.removeAttribute('aria-busy');
    }
  }

  function openCart(opener) {
    renderCart();
    openModal(drawer, opener);
  }

  function initCart() {
    renderCart();
    for (const btn of $$('[data-cart-open]')) {
      btn.addEventListener('click', (e) => {
        if (!drawer) return; // falls back to the /cart page link
        e.preventDefault();
        openCart(btn);
        refreshCart();
      });
    }
    if (!drawer) return;
    initModal(drawer);
    const list = $('[data-cart-lines]', drawer);
    if (list) {
      list.addEventListener('click', (e) => {
        const li = e.target.closest('[data-line]');
        if (!li) return;
        const item = (cartState?.items || []).find((i) => i.key === li.dataset.key);
        if (!item) return;
        if (e.target.closest('[data-line-dec]')) changeLine(item.key, Math.max(0, item.quantity - 1));
        else if (e.target.closest('[data-line-inc]')) changeLine(item.key, item.quantity + 1);
        else if (e.target.closest('[data-line-remove]')) changeLine(item.key, 0);
      });
      list.addEventListener('change', (e) => {
        const input = e.target.closest('[data-line-qty]');
        const li = e.target.closest('[data-line]');
        if (!input || !li) return;
        const q = Math.max(0, parseInt(input.value, 10) || 0);
        changeLine(li.dataset.key, q);
      });
    }
    const shop = $('[data-shop-now]', drawer);
    if (shop) {
      shop.addEventListener('click', (e) => {
        if (!$('#buy')) return; // let the link navigate to the home page
        e.preventDefault();
        closeModal(drawer, { returnFocus: false }).then(goToBuy);
      });
    }
  }

  function goToBuy() {
    const buy = $('#buy');
    if (!buy) return;
    buy.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    const first = $('.swatch__input:checked, select.field, [data-qty]', buy);
    if (first) window.setTimeout(() => first.focus({ preventScroll: true }), reducedMotion() ? 0 : 450);
  }

  /* ===================================================================================
     Product section: variant picker, gallery, quantity, add to cart / buy now
     =================================================================================== */
  function initProductSection(section) {
    if (!section || section.dataset.bound) return;
    const jsonEl = $('[data-product-json]', section);
    const form = $('form[data-product-form]', section);
    if (!jsonEl || !form) return;
    let product;
    try { product = JSON.parse(jsonEl.textContent); } catch (_) { return; }
    section.dataset.bound = 'true';

    const idInput = $('[data-variant-id]', form);
    const qtyInput = $('[data-qty]', form);
    const dec = $('[data-qty-dec]', form);
    const inc = $('[data-qty-inc]', form);
    const buyNow = $('[data-buy-now]', form);
    const addBtn = $('[data-add-to-cart]', form);
    const errorEl = $('[data-form-error]', form);
    const maxQty = parseInt(qtyInput?.max, 10) || 10;
    const updateUrl = section.dataset.updateUrl === 'true';
    const optionGroups = $$('[data-option-index]', form);

    let variant = product.variants.find((v) => String(v.id) === String(idInput?.value)) || product.variants[0];

    // Gallery
    const mainImg = $('.gallery__main', section);
    const thumbs = $$('[data-thumb]', section);
    const stickyThumb = $('.sticky-buy__thumb', section);
    function showMedia(thumb) {
      if (!thumb || !mainImg) return;
      mainImg.src = thumb.dataset.src;
      if (thumb.dataset.srcset) mainImg.srcset = thumb.dataset.srcset;
      mainImg.alt = thumb.dataset.alt || '';
      thumbs.forEach((t, i) => {
        const on = t === thumb;
        t.setAttribute('aria-current', String(on));
        if (on) setText('[data-gallery-index]', String(i + 1).padStart(2, '0'), section);
      });
    }
    for (const t of thumbs) t.addEventListener('click', () => showMedia(t));

    function selectedOptions() {
      return optionGroups.map((g) => {
        if (g.dataset.optionType === 'swatch') return $('input:checked', g)?.value;
        return $('select', g)?.value;
      });
    }

    function qty() { return clamp(parseInt(qtyInput?.value, 10) || 1, 1, maxQty); }

    function renderTotal() {
      const total = formatMoney(variant ? variant.price * qty() : 0);
      setText('[data-buy-total]', total, section);
    }

    function renderVariant() {
      const available = Boolean(variant && variant.available);
      if (idInput && variant) idInput.value = String(variant.id);
      setText('[data-price]', formatMoney(variant ? variant.price : product.price), section);
      const compare = $('[data-compare]', section);
      if (compare) {
        const show = variant && variant.compare_at_price > variant.price;
        compare.hidden = !show;
        if (show) {
          setText('[data-compare-price]', formatMoney(variant.compare_at_price), section);
          // Savings in dollars, rounded to the nearest whole dollar ($9.98 -> $10)
          const savedWhole = Math.round((variant.compare_at_price - variant.price) / 100) * 100;
          setText('[data-save]', `Save ${formatMoney(savedWhole, wholeMoneyFormat())}`, section);
        }
      }
      for (const g of optionGroups) {
        const label = $('[data-option-selected]', g);
        const input = $('input:checked', g);
        if (label && input) label.textContent = input.value;
      }
      if (addBtn) { addBtn.disabled = !available; addBtn.textContent = !variant ? 'Unavailable' : available ? addBtn.dataset.label : 'Sold out'; }
      if (buyNow) {
        buyNow.disabled = !available;
        const label = $('[data-buy-now-label]', buyNow);
        if (label) {
          if (available) {
            label.textContent = `${buyNow.dataset.label} — `;
            const total = document.createElement('span');
            total.dataset.buyTotal = '';
            label.append(total);
          } else {
            label.textContent = variant ? 'Sold out' : 'Unavailable';
          }
        }
      }
      renderTotal();
      if (variant && variant.featured_media) {
        const t = thumbs.find((th) => th.dataset.mediaId === String(variant.featured_media.id));
        if (t) showMedia(t);
        if (stickyThumb && variant.featured_media.preview_image) stickyThumb.src = `${variant.featured_media.preview_image.src}${variant.featured_media.preview_image.src.includes('?') ? '&' : '?'}width=120`;
      }
      if (updateUrl && variant) {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url);
      }
    }

    if (addBtn && !addBtn.dataset.label) addBtn.dataset.label = 'Add to Cart';
    if (buyNow && !buyNow.dataset.label) buyNow.dataset.label = 'Buy Now';

    form.addEventListener('change', (e) => {
      if (!e.target.closest('[data-option-index]')) return;
      const opts = selectedOptions();
      variant = product.variants.find((v) => v.options.every((o, i) => opts[i] === undefined || o === opts[i])) || null;
      renderVariant();
    });

    // Quantity stepper
    function setQty(n) {
      const q = clamp(n, 1, maxQty);
      if (qtyInput) qtyInput.value = String(q);
      dec?.setAttribute('aria-disabled', String(q <= 1));
      inc?.setAttribute('aria-disabled', String(q >= maxQty));
      renderTotal();
    }
    dec?.addEventListener('click', () => setQty(qty() - 1));
    inc?.addEventListener('click', () => setQty(qty() + 1));
    qtyInput?.addEventListener('input', () => {
      const raw = parseInt(qtyInput.value, 10);
      if (Number.isFinite(raw) && raw >= 1 && raw <= maxQty) setQty(raw);
    });
    qtyInput?.addEventListener('change', () => setQty(qty()));
    qtyInput?.addEventListener('blur', () => setQty(qty()));

    // Add to cart / buy now
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy || !variant || !variant.available) return;
      const isBuyNow = e.submitter ? e.submitter.hasAttribute('data-buy-now') : false;
      const btn = e.submitter || addBtn;
      busy = true;
      btn?.classList.add('is-loading');
      btn?.setAttribute('aria-busy', 'true');
      if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
      try {
        await fetchJSON(`${ROUTES.cartAdd}.js`, { method: 'POST', body: JSON.stringify({ items: [{ id: variant.id, quantity: qty() }] }) });
        if (isBuyNow) {
          window.location.href = `${ROUTES.root.replace(/\/$/, '')}/checkout`;
          return;
        }
        await refreshCart();
        showToast(`Added to cart: ${product.title}${variant.title && variant.title !== 'Default Title' ? ` (${variant.title})` : ''}`);
        announce(`Added ${qty()} ${product.title} to your cart.`);
        openCart(btn);
      } catch (err) {
        if (errorEl) { errorEl.textContent = err.message || 'Could not add to cart. Please try again.'; errorEl.classList.remove('hidden'); }
      } finally {
        busy = false;
        btn?.classList.remove('is-loading');
        btn?.removeAttribute('aria-busy');
      }
    });

    setQty(qty());
    renderVariant();
  }

  /* ===================================================================================
     Mobile sticky buy bar: after the hero CTA scrolls away, hidden over #buy and dialogs
     =================================================================================== */
  const stickyState = { pastHero: false, buyInView: false };
  let stickyObserver = null;

  function updateStickyBar() {
    const stickyBar = $('#sticky-buy');
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
    const stickyBar = $('#sticky-buy');
    const buy = $('#buy');
    const heroCta = $('[data-hero-cta]') || $('form[data-product-form]');
    if (stickyObserver) stickyObserver.disconnect();
    if (!stickyBar || !heroCta || !buy || !('IntersectionObserver' in window)) return;
    stickyObserver = new IntersectionObserver((entries) => {
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
    stickyObserver.observe(heroCta);
    if (heroCta !== buy) stickyObserver.observe(buy);
    const cta = $('[data-sticky-cta]', stickyBar);
    if (cta && !cta.dataset.bound) {
      cta.dataset.bound = 'true';
      cta.addEventListener('click', (e) => { e.preventDefault(); goToBuy(); });
    }
  }

  /* ===================================================================================
     Phone header: menu + search pop-up windows
     =================================================================================== */
  function initPopups() {
    const toggles = $$('[data-pop-toggle]');
    if (!toggles.length) return;
    const popFor = (btn) => document.getElementById(btn.getAttribute('aria-controls'));
    const setMenuLabel = (btn, isOpen) => { if (btn.dataset.popToggle === 'site-menu') btn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu'); };

    function closeAll(except) {
      for (const btn of toggles) {
        const pop = popFor(btn);
        if (!pop || pop === except) continue;
        pop.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        setMenuLabel(btn, false);
      }
    }
    function open(btn) {
      const pop = popFor(btn);
      if (!pop) return;
      closeAll(pop);
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      setMenuLabel(btn, true);
      const first = $('input:not([type="hidden"]), a[href], button', pop);
      if (first) first.focus({ preventScroll: true });
    }

    for (const btn of toggles) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.getAttribute('aria-expanded') === 'true') closeAll();
        else open(btn);
      });
    }
    // Close on outside click, on choosing a link, and on Escape
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-pop]') && !e.target.closest('[data-pop-link], .search-hit')) return;
      closeAll();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const openBtn = toggles.find((b) => b.getAttribute('aria-expanded') === 'true');
      if (openBtn) { closeAll(); openBtn.focus(); }
    });

    initQuickSearch(closeAll);
  }

  // Search that jumps straight to a page or section ("cart", "faqs", "home") or a product by name;
  // anything else falls through to Shopify's search results page.
  function initQuickSearch(closeAll) {
    const form = $('[data-quick-search]');
    const input = $('[data-quick-search-input]');
    const list = $('[data-quick-search-results]');
    const status = $('[data-quick-search-status]');
    if (!form || !input || !list) return;
    let index = [];
    try { index = JSON.parse(($('#quick-search-index') || {}).textContent || '[]'); } catch (_) { index = []; }

    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    function score(item, q) {
      const title = norm(item.title);
      const terms = [title, norm(item.type), norm(item.vendor), ...(item.keywords || []).map(norm)].filter(Boolean);
      let best = 0;
      for (const t of terms) {
        if (t === q) best = Math.max(best, 4);
        else if (t.startsWith(q)) best = Math.max(best, 3);
        else if (t.includes(q)) best = Math.max(best, 2);
        else if (t.length > 2 && q.split(' ').includes(t)) best = Math.max(best, 1); // "my cart" -> cart
      }
      if (!best && q.split(' ').every((w) => title.includes(w))) best = 2;
      return best;
    }
    function matches(raw) {
      const q = norm(raw);
      if (!q) return [];
      return index
        .map((item) => ({ item, s: score(item, q) }))
        .filter((m) => m.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((m) => m.item);
    }
    function go(url) {
      closeAll();
      input.blur();
      const target = new URL(url, window.location.href);
      const el = target.hash && target.pathname === window.location.pathname ? document.getElementById(target.hash.slice(1)) : null;
      if (el) {
        el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
        window.history.replaceState(null, '', target.hash);
      } else {
        window.location.href = target.href;
      }
    }
    function render() {
      const hits = matches(input.value).slice(0, 6);
      list.replaceChildren(...hits.map((hit) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'search-hit';
        a.href = hit.url;
        const name = document.createElement('span');
        name.textContent = hit.title;
        const kind = document.createElement('span');
        kind.textContent = hit.product ? 'Product' : 'Page';
        a.append(name, kind);
        a.addEventListener('click', (e) => { e.preventDefault(); go(hit.url); });
        li.append(a);
        return li;
      }));
      if (status) status.textContent = input.value.trim() ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : '';
    }
    input.addEventListener('input', render);
    form.addEventListener('submit', (e) => {
      const hit = matches(input.value)[0];
      if (!hit) return; // no direct match: let Shopify's search page handle it
      e.preventDefault();
      go(hit.url);
    });
  }

  /* ===================================================================================
     Boot (+ re-init when sections change in the theme editor)
     =================================================================================== */
  function initSections() {
    $$('[data-product-section]').forEach(initProductSection);
    initMarquee();
    initCountdown();
    initStickyBar();
  }

  function init() {
    initHeader();
    initPopups();
    initCart();
    initSections();
  }

  document.addEventListener('shopify:section:load', initSections);
  window.addEventListener('pageshow', (e) => { if (e.persisted) refreshCart(); }); // back/forward cache

  try {
    init();
  } catch (err) {
    // Fail soft: links, anchors, forms and the /cart page keep working without these features.
    if (window.console && typeof window.console.error === 'function') window.console.error('[TA] init failed', err);
  }
})();
