# Trending Arrivals: single-product landing page

A mobile-first, high-converting one-product store page with a white theme (black text, buttons and accents), built for traffic from short-form video.
Plain HTML + Tailwind CSS (CDN) + vanilla JavaScript. No build step.

```
index.html      the whole page (header, hero, trust badges, highlights, buy box, FAQ, footer, cart, checkout)
styles.css      custom CSS that complements Tailwind (animations, drawer/dialogs, marquee, reduced motion)
script.js       all interactivity; product, price, variants and checkout settings live in CONFIG at the top
assets/images/  logo, product images, icons and the social share image
```

## Run it

Open `index.html` in a browser, or serve the folder (recommended, so storage and fonts behave like production):

```sh
python3 -m http.server 8080   # then visit http://localhost:8080
```

To deploy, upload the folder as-is to any static host (Netlify drop, Vercel, GitHub Pages, Cloudflare Pages, S3).

## What's on the page

- Sticky header with the logo, the `🔥 Holiday Demand Peak - Free Shipping Today` bar, a **Shop Now** link that scrolls to the buy box, and a cart button with a live count.
- Landing banner at the top ("What's trending. Delivered.") introducing the store, with the **latest arrival** spotlighted directly underneath: product image, price, headline and the `Claim Yours Now - $37.99` button. On a phone the product image and price show on the first screen.
- Trust badges: Secure Checkout, 24/7 Support and Fast Holiday Fulfillment.
- Three value cards: High-Grade Materials, Zero-Return Risk and Premium Stitching.
- Buy box:
  - gallery that switches with the color, plus thumbnails
  - color swatches, size dropdown and quantity stepper (1–10)
  - live total, **Buy Now** and **Add to Cart** buttons
  - free-shipping countdown to local midnight
  - guarantee and secure-checkout notes, and expandable details sections
- FAQ, a final call-to-action band, and a footer with Privacy Policy, Terms of Service, Shipping & Returns and Support. The policies open in pop-ups that can be linked to directly, e.g. `index.html#privacy`.
- On phones, a buy bar sticks to the bottom of the screen after the hero scrolls away. It hides while the buy box is on screen.
- Slide-out cart, saved in the browser's local storage. It still works when storage is blocked.
- Checkout, demo or Shopify (see below).

## Customize

| What | Where |
|---|---|
| Product name, price, colors, sizes, max quantity | `CONFIG` at the top of `script.js` **and** the matching text in `index.html` (the HTML holds the same defaults so the page renders without JavaScript) |
| Compare-at ("was") price | `CONFIG.product.compareAtPrice` (default `null`). Only set it if the product was genuinely sold at that price |
| Support email | `CONFIG.supportEmail` and the `mailto:` links in `index.html` |
| Domain for share links | Replace `https://www.trendingarrivals.com/` in the `<head>` of `index.html` (canonical, Open Graph, Twitter, JSON-LD) |
| Policy text | The `#privacy`, `#terms` and `#shipping` dialogs near the end of `index.html` are placeholders. Have them reviewed before launch |

### Images

The product images in `assets/images/` are SVG placeholders. To use real photos, add them (for example `product-onyx.jpg`) and update:

- the paths in `index.html`, including the `width` and `height` attributes
- the paths in `CONFIG.product.colors[].image`

| File | Size | Used for |
|---|---|---|
| `hero.svg` | 1080×1350 | hero image |
| `product-onyx.svg`, `product-charcoal.svg`, `product-bone.svg` | 1200×1200 | buy-box gallery; switches with the color |
| `detail-sherpa.svg`, `detail-stitching.svg`, `detail-lifestyle.svg` | 1200×1200 | value cards and gallery |
| `og-image.jpg` | 1200×630 | social share preview |
| `logo.svg`, `logo-mark.svg` | – | brand logo, black (vector, traced from the supplied artwork) |
| `favicon.svg`, `apple-touch-icon.png` | – | browser and home-screen icons |

The header logo is inlined in `index.html` so it loads instantly.

### Checkout: demo vs. Shopify

Out of the box, `CONFIG.checkout.mode` is `'demo'`. That runs a three-step in-page checkout (contact & shipping → payment → confirmation). It is clearly labelled "Demo checkout", sends nothing anywhere, and uses read-only test card details. **Don't launch in demo mode.**

To take real orders through Shopify:

1. In Shopify admin, open the product. For each variant, copy its numeric variant ID from the variant URL (`.../variants/<ID>`).
2. In `script.js`, fill in every `shopifyVariantId` in `CONFIG.product.variants`.
3. In the same file, set:

   ```js
   checkout: { mode: 'shopify', shopifyDomain: 'your-store.myshopify.com' }
   ```

Checkout then sends shoppers straight to Shopify's secure checkout through a cart permalink: `https://your-store.myshopify.com/cart/<variantId>:<qty>,...`.

### Analytics / pixels

`script.js` reports standard shopping events: `view_item`, `select_item`, `add_to_cart`, `begin_checkout`, `add_payment_info` and `purchase`.

- They go to `window.dataLayer`, in Google Analytics 4 format (works with Google Tag Manager).
- They are also forwarded to the TikTok pixel (`ttq`) and the Meta pixel (`fbq`) if those are installed on the page.

To use them, paste your pixel or Google Tag Manager snippet into the `<head>`.

## Tech notes

- Tailwind CSS v4 loads from the official browser CDN build, pinned to an exact version: `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3`. Theme tokens are in the inline `<style type="text/tailwindcss">` block in `index.html`.
- **Optional, for faster loads in production:** Tailwind's docs recommend compiling the CSS instead of using the CDN build. Run:

  ```sh
  npx @tailwindcss/cli@4.3.3 -i input.css -o tailwind.css --minify
  ```

  Here `input.css` contains `@import "tailwindcss";` plus the `@theme` block from `index.html`. Then link `tailwind.css` and remove the CDN `<script>`.
- Accessibility:
  - semantic landmarks and a skip link
  - keyboard focus is trapped inside the cart and checkout pop-ups, which close with Esc
  - cart and total changes are announced to screen readers
  - visible focus outlines
  - animations stop when the device is set to reduce motion
- Honest by design: no fake reviews, star ratings, stock counters or "was" prices. The only countdown is the genuine free-shipping cutoff at local midnight.

## Package as a ZIP

```sh
./build-zip.sh   # creates dist/trending-arrivals.zip
```
