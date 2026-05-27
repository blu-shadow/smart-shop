// ======================================================
// DXW E-COMMERCE CORE LOGIC - v24.0
// FIXES v24 (index.html + admin.js অনুযায়ী):
//
//   ✅ BUG 1 FIX — Trending grid stuck "Loading products..."
//      index.html এ id="popular-products"
//      এটাই সবার আগে check, তারপর fallback list
//
//   ✅ BUG 2 FIX — Category filter active button কাজ করে না
//      index.html এ onclick="filterByCategory('all')" — this পাস নেই
//      btn parameter ছাড়াই onclick attribute match করে active set করা হয়
//
//   ✅ BUG 3 FIX — Logo load হয় না
//      index.html এ id="site-logo", আগে 'site-logo-display' খুঁজত
//      এখন দুটোই try করা হয়
//
//   ✅ Trending logic: admin থেকে category="popular" বা "trending"
//      set করা products trending-এ দেখাবে।
//      কোনো popular product না থাকলে প্রথম ৫টি দেখাবে।
// ======================================================

const BASE_URL     = 'https://dadaxwear.com';
const API_BASE_URL = `${BASE_URL}/api`;

let allProducts = [];

// Cart — corrupt data থেকে crash বাঁচাতে try-catch
let cart = [];
try {
    const raw = localStorage.getItem('dxw_cart');
    if (raw) cart = JSON.parse(raw) || [];
    if (!Array.isArray(cart)) cart = [];
} catch (e) {
    cart = [];
    localStorage.removeItem('dxw_cart');
}

document.addEventListener('DOMContentLoaded', () => { initApp(); });

function getFullImageUrl(imgPath) {
    if (!imgPath) return 'https://via.placeholder.com/300?text=No+Image';
    if (imgPath.startsWith('http')) return imgPath;
    return BASE_URL + (imgPath.startsWith('/') ? imgPath : '/' + imgPath);
}

// ─────────────────────────────────────────────────────
// ১. APP INITIALIZATION
// ─────────────────────────────────────────────────────
async function initApp() {
    updateCartUI();

    const pageName   = window.location.pathname.split('/').pop().toLowerCase() || 'index.html';
    const isIndex    = pageName === '' || pageName === 'index.html' || pageName === 'index.php';
    const isCheckout = pageName.includes('checkout');

    if (isIndex) {
        await fetchProducts();
        await loadLogo();
    } else if (isCheckout) {
        if (cart.length === 0) {
            window.location.href = 'index.html';
            return;
        }
        renderCheckoutSummary();
        const areaEl = document.getElementById('delivery-area');
        if (areaEl) areaEl.addEventListener('change', renderCheckoutSummary);
    }
}

// ─────────────────────────────────────────────────────
// ২. PRODUCT FETCH & RENDER
// ─────────────────────────────────────────────────────
async function fetchProducts() {
    try {
        const res = await fetch(`${API_BASE_URL}/products`);
        if (!res.ok) throw new Error('Server error');
        allProducts = await res.json();
        if (!Array.isArray(allProducts)) allProducts = [];
        renderGrids();
    } catch (err) {
        console.warn('Product fetch failed, retrying in 5s', err);
        setTimeout(fetchProducts, 5000);
    }
}

// ✅ BUG 1 FIX: index.html এ exact ID 'popular-products' — এটাই প্রথমে check
function getTrendingGrid() {
    // index.html এ যে exact ID আছে সেটা সবার আগে
    const primary = document.getElementById('popular-products');
    if (primary) return primary;

    // fallback — অন্য possible IDs
    const fallbackIds = [
        'popular-products-grid',
        'trending-grid',
        'popular-grid',
        'trending-products-grid',
        'trending-products',
        'hot-products-grid',
    ];
    for (const id of fallbackIds) {
        const el = document.getElementById(id);
        if (el) return el;
    }
    return (
        document.querySelector('.trending-grid') ||
        document.querySelector('.popular-grid')  ||
        null
    );
}

// Trending check — admin.js এ category field দিয়ে set করা হয়
// Admin "popular" বা "trending" লিখলে এটা trending-এ দেখাবে
function isPopularProduct(p) {
    const cat = (p.category || '').toLowerCase().trim();
    return (
        p.isPopular  === true ||
        p.isTrending === true ||
        p.trending   === true ||
        p.popular    === true ||
        p.featured   === true ||
        cat === 'popular'    ||
        cat === 'trending'   ||
        cat === 'featured'   ||
        cat.includes('popular')  ||
        cat.includes('trending') ||
        cat.includes('featured')
    );
}

function renderGrids() {
    const trendingGrid = getTrendingGrid();
    const allGrid      = document.getElementById('all-products');
    const popCount     = document.getElementById('pop-count');

    // All Collection
    if (allGrid) allGrid.innerHTML = allProducts.map(createCard).join('');

    // Trending / Popular
    if (trendingGrid) {
        const populars = allProducts.filter(isPopularProduct);
        // popular না থাকলে প্রথম ৫টি দেখাও (user requirement)
        const toRender = populars.length > 0 ? populars : allProducts.slice(0, 5);
        trendingGrid.innerHTML = toRender.map(createCard).join('');
        if (popCount) popCount.innerText = toRender.length;
    }
}

function createCard(p) {
    const imgUrl = getFullImageUrl(p.image);
    return `
        <div class="product-card" onclick="goToDetails('${p._id}')">
            <div class="img-wrapper">
                <img src="${imgUrl}" alt="${p.name}" loading="lazy">
                <div class="card-badge">${p.category || 'Premium'}</div>
            </div>
            <div class="product-info">
                <h3>${p.name}</h3>
                <div class="card-bottom">
                    <span class="product-price">${Number(p.price).toLocaleString()} TK</span>
                    <button class="add-btn-small" onclick="event.stopPropagation(); quickAdd('${p._id}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        </div>`;
}

// ─────────────────────────────────────────────────────
// ৩. CART SYSTEM
// ─────────────────────────────────────────────────────
window.quickAdd = function (id) {
    const product = allProducts.find(p => p._id === id);
    if (!product) return;

    const idx = cart.findIndex(item => item.id === id);
    if (idx !== -1) {
        cart[idx].quantity++;
    } else {
        cart.push({
            id:       product._id,
            name:     product.name,
            price:    Number(product.price),
            image:    getFullImageUrl(product.image),
            quantity: 1
        });
    }
    saveCart();
    showToast('🛍️ ব্যাগ-এ যোগ হয়েছে!');
};

window.updateQty = function (id, delta) {
    const idx = cart.findIndex(i => i.id === id);
    if (idx === -1) return;
    cart[idx].quantity += delta;
    if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    saveCart();
};

function saveCart() {
    localStorage.setItem('dxw_cart', JSON.stringify(cart));
    updateCartUI();
    if (typeof window.renderCheckoutSummary === 'function') {
        window.renderCheckoutSummary();
    }
}

window.clearCartMemory = function () {
    cart = [];
};

// ─────────────────────────────────────────────────────
// ৪. CHECKOUT SUMMARY
// ─────────────────────────────────────────────────────
window.renderCheckoutSummary = function () {
    let currentCart = [];
    try {
        currentCart = JSON.parse(localStorage.getItem('dxw_cart')) || [];
        if (!Array.isArray(currentCart)) currentCart = [];
    } catch (e) { currentCart = []; }

    const summaryEl  = document.getElementById('checkout-items-list');
    const subtotalEl = document.getElementById('summary-subtotal');
    const totalEl    = document.getElementById('summary-total');
    const areaEl     = document.getElementById('delivery-area');

    if (!summaryEl) return;

    const shippingCharge = areaEl ? (parseInt(areaEl.value) || 60) : 60;
    const subtotal = currentCart.reduce((s, i) => s + (Number(i.price) * Number(i.quantity || 1)), 0);
    const total    = subtotal + shippingCharge;

    summaryEl.innerHTML = currentCart.length === 0
        ? `<p style="color:#9090a0;text-align:center;padding:20px 0;">ব্যাগ খালি</p>`
        : currentCart.map(item => {
            const imgUrl = getFullImageUrl(item.image);
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 0;
                        border-bottom:1px solid rgba(255,255,255,0.07);">
                <img src="${imgUrl}" loading="lazy"
                     style="width:54px;height:54px;border-radius:10px;
                            object-fit:cover;background:#1c1d21;flex-shrink:0;"
                     onerror="this.style.visibility='hidden'">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:0.9rem;
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${item.name}
                    </div>
                    <div style="color:#9090a0;font-size:0.78rem;margin-top:3px;">
                        ${item.quantity} × ${Number(item.price).toLocaleString()} TK
                    </div>
                </div>
                <div style="font-weight:800;color:#e8491d;font-size:0.95rem;flex-shrink:0;">
                    ${(Number(item.price) * Number(item.quantity || 1)).toLocaleString()} TK
                </div>
            </div>`;
        }).join('');

    if (subtotalEl) subtotalEl.textContent = subtotal.toLocaleString() + ' TK';
    if (totalEl)    totalEl.textContent    = total.toLocaleString() + ' TK';
};

// ─────────────────────────────────────────────────────
// ৫. CART UI
// ─────────────────────────────────────────────────────
function updateCartUI() {
    const list       = document.getElementById('cart-items-list');
    const badge      = document.getElementById('cart-count-badge');
    const subtotalEl = document.getElementById('cart-subtotal');
    const footer     = document.getElementById('cart-footer');

    const totalItems = cart.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const subtotal   = cart.reduce((s, i) => s + (Number(i.price) * (Number(i.quantity) || 0)), 0);

    if (badge) {
        badge.innerText     = totalItems;
        badge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
    if (subtotalEl) subtotalEl.innerText = subtotal.toLocaleString() + ' TK';
    if (footer)     footer.style.display = cart.length > 0 ? 'block' : 'none';

    if (list) {
        list.innerHTML = cart.length === 0
            ? `<div style="text-align:center;padding:40px;color:#888;">ব্যাগ খালি!</div>`
            : cart.map(item => `
                <div class="cart-item">
                    <img src="${getFullImageUrl(item.image)}"
                         style="width:50px;height:50px;border-radius:8px;object-fit:cover;"
                         onerror="this.style.visibility='hidden'">
                    <div style="flex:1;margin-left:12px;">
                        <h4 style="font-size:0.85rem;margin:0;color:#fff;">${item.name}</h4>
                        <p style="color:#ff6b00;font-weight:700;margin:4px 0;">
                            ${Number(item.price).toLocaleString()} TK
                        </p>
                        <div class="qty-control">
                            <button class="qty-btn" onclick="updateQty('${item.id}',-1)">-</button>
                            <span style="color:#fff;min-width:20px;text-align:center;">${item.quantity}</span>
                            <button class="qty-btn" onclick="updateQty('${item.id}',1)">+</button>
                        </div>
                    </div>
                </div>`).join('');
    }
}

// ─────────────────────────────────────────────────────
// ৬. NAVIGATION & FILTER
// ─────────────────────────────────────────────────────
window.goToDetails = function (id) {
    if (id) window.location.href = `product-details.html?id=${id}`;
};

// ✅ BUG 2 FIX: index.html এ this পাস নেই — onclick attribute দিয়ে active button খোঁজা
window.filterByCategory = function (category, btn) {
    const allPills = document.querySelectorAll('.cat-pill');

    // সব থেকে active সরাও
    allPills.forEach(b => b.classList.remove('active'));

    // btn থাকলে সেটায় active দাও
    // না থাকলে onclick attribute match করে খোঁজো
    if (btn) {
        btn.classList.add('active');
    } else {
        allPills.forEach(b => {
            const onclickVal = (b.getAttribute('onclick') || '');
            // onclick="filterByCategory('football')" থেকে category বের করা
            const match = onclickVal.match(/filterByCategory\(['"]([^'"]+)['"]/);
            if (match && match[1].toLowerCase() === category.toLowerCase()) {
                b.classList.add('active');
            }
        });
    }

    const allGrid        = document.getElementById('all-products');
    const popularSection = document.getElementById('trending-section');
    if (!allGrid) return;

    if (category === 'all') {
        if (popularSection) popularSection.style.display = 'block';
        allGrid.innerHTML = allProducts.map(createCard).join('');
    } else {
        if (popularSection) popularSection.style.display = 'none';

        // Smart match: exact / includes / word-level
        const filtered = allProducts.filter(p => categoryMatches(p.category, category));

        allGrid.innerHTML = filtered.length > 0
            ? filtered.map(createCard).join('')
            : `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#666;">
                 এই ক্যাটাগরিতে কোনো প্রোডাক্ট নেই
               </div>`;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Smart category matching — case/space insensitive
function categoryMatches(productCategory, filterCategory) {
    if (!productCategory) return false;
    const pCat = productCategory.toLowerCase().trim().replace(/[-_]/g, ' ');
    const fCat = filterCategory.toLowerCase().trim().replace(/[-_]/g, ' ');

    // exact match
    if (pCat === fCat) return true;

    // product category contains filter keyword
    // ✅ ONLY pCat.includes(fCat) — fCat.includes(pCat) বাদ:
    //    কারণ: pCat="all", fCat="football jersey"
    //    'football jersey'.includes('all') → TRUE ← এটাই bug ছিল!
    if (pCat.includes(fCat)) return true;

    // word-level: filter শব্দগুলো সবই product category তে থাকলে match
    // min 4 char — 'all' (3 char) যেন false match না করে
    const words = fCat.split(/\s+/).filter(w => w.length > 3);
    return words.length > 0 && words.every(w => pCat.includes(w));
}

// ─────────────────────────────────────────────────────
// ৭. LOGO & TOAST
// ─────────────────────────────────────────────────────
async function loadLogo() {
    try {
        const res  = await fetch(`${API_BASE_URL}/settings/logo`);
        const data = await res.json();
        if (!data.logo) return;

        const logoUrl = getFullImageUrl(data.logo);

        // ✅ BUG 3 FIX: index.html এ id="site-logo", আগে 'site-logo-display' খুঁজত
        // এখন দুটো ID-ই try করা হচ্ছে
        const el = document.getElementById('site-logo') ||
                   document.getElementById('site-logo-display');
        if (el) el.src = logoUrl;
    } catch (e) {}
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerHTML = msg;
    document.body.classList.add('show-toast');
    setTimeout(() => document.body.classList.remove('show-toast'), 2000);
}
