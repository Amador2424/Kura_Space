(() => {
  "use strict";

  const esc = (value) => Kura.escapeHtml(value);

  function formatPrice(price) {
    if (price === null || price === undefined || price === "") return "";
    const num = Number(price);
    return Number.isNaN(num) ? "" : `$${num.toFixed(2)}`;
  }

  function renderCard(product) {
    const price = formatPrice(product.price);
    const media = product.image_path
      ? `<img src="${esc(product.image_path)}" alt="${esc(product.name)}">`
      : "";
    const action = product.stripe_link
      ? `<a class="hero-cta shop-buy" href="${esc(product.stripe_link)}" target="_blank" rel="noopener">BUY NOW &rarr;</a>`
      : `<span class="shop-unavailable">Coming soon</span>`;

    return `
      <article class="home-service-card shop-card">
        <div class="shop-card-media">${media}</div>
        <h3>${esc(product.name)}</h3>
        ${product.description ? `<p>${esc(product.description)}</p>` : ""}
        ${price ? `<div class="shop-price">${esc(price)}</div>` : ""}
        ${action}
      </article>`;
  }

  async function loadShop() {
    const grid = document.getElementById("shopGrid");
    if (!grid) return;

    try {
      const db = Kura.requireClient();
      const { data, error } = await db
        .from("products")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: false });
      if (error) throw error;

      const products = data || [];
      grid.innerHTML = products.length
        ? products.map(renderCard).join("")
        : '<div class="empty-state">New products are on the way — check back soon.</div>';
    } catch (error) {
      console.error(error);
      grid.innerHTML = '<div class="empty-state">Products could not be loaded right now. Please try again shortly.</div>';
    }
  }

  document.addEventListener("DOMContentLoaded", loadShop);
})();
