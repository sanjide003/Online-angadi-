// firebase-config.js-ൽ നിന്ന് ആവശ്യമായവ ഇമ്പോർട്ട് ചെയ്യുന്നു
import { 
    db, auth, APP_ID, 
    doc, onSnapshot, collection, query, 
    updateDoc, deleteDoc, arrayRemove, arrayUnion, serverTimestamp, addDoc,
    signInAnonymously 
} from './firebase-config.js';

let currentUserId = null;
let allProducts = [];
let categoriesCache = []; 
let whatsappNumber = '';
let infoContent = {}; 
let headerSettings = { shopName: 'SocialShop', iconClass: 'fas fa-camera-retro' };
let cart = [];
let pageHistory = [];

let productsCollectionRef, categoriesCollectionRef, settingsDocRef, infoDocRef; 
let unsubscribeProducts, unsubscribeCategories, unsubscribeSettings, unsubscribeComments, unsubscribeInfo; 
let confirmCallback = null; 
let activeProduct = null;
let cartProductIds = new Set();
let searchDebounceTimer = null;
let imageObserver = null;

// DOM Elements
let pages, loadingSpinner, messageModal, messageModalText, confirmModal, confirmModalText, confirmModalButton, commentsModal, commentsBackdrop;
let $shopHeaderIcon, $shopHeaderName, $accountUID, $accountCopyright, $infoTitle, $infoContent;
let $cartBadgeBottomNav, $cartItemsContainer, $cartEmptyMsg, $cartSummarySection, $cartSubtotal, $cartTotal;
let $scrollToTopBtn, $shareModal;

const APP_BASE_URL = window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
    pages = document.querySelectorAll('.page');
    loadingSpinner = document.getElementById('loading-spinner');
    messageModal = document.getElementById('message-modal');
    messageModalText = document.getElementById('message-modal-text');
    confirmModal = document.getElementById('confirm-modal');
    confirmModalText = document.getElementById('confirm-modal-text');
    confirmModalButton = document.getElementById('confirm-modal-button');
    commentsModal = document.getElementById('comments-modal'); 
    commentsBackdrop = document.getElementById('comments-backdrop');
    $shareModal = document.getElementById('share-modal');
    
    $shopHeaderIcon = document.getElementById('shop-header-icon');
    $shopHeaderName = document.getElementById('shop-header-name');
    $accountUID = document.getElementById('current-auth-uid');
    $accountCopyright = document.getElementById('account-copyright-display');
    $infoTitle = document.getElementById('info-title');
    $infoContent = document.getElementById('info-content');
    
    $cartBadgeBottomNav = document.getElementById('cart-item-count-bottom-nav');
    $cartItemsContainer = document.getElementById('cart-items-container');
    $cartEmptyMsg = document.getElementById('cart-empty-msg');
    $cartSummarySection = document.getElementById('cart-summary-section');
    $cartSubtotal = document.getElementById('cart-subtotal');
    $cartTotal = document.getElementById('cart-total');
    $scrollToTopBtn = document.getElementById('scroll-to-top-btn');
    
    if (!db || !auth) {
        console.error("Firebase Config Error");
        return;
    }

    try {
        setupAuthListener();
        initializeImageObserver();

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    filterAndRenderHomeProducts(event.target.value.toLowerCase());
                }, 300);
            });
        }

        const commentForm = document.getElementById('add-comment-form');
        if (commentForm) commentForm.addEventListener('submit', handleAddComment);
        
        const categoryFilters = document.getElementById('category-filters');
        if (categoryFilters) {
            categoryFilters.addEventListener('click', (e) => {
                const chip = e.target.closest('.category-chip');
                if (chip) filterProductsByCategory(chip.dataset.id);
            });
        }
        
        loadCartFromStorage();
        updateCartUI();
        
        window.addEventListener('scroll', () => {
             if ($scrollToTopBtn) $scrollToTopBtn.classList.toggle('hidden', window.pageYOffset <= 300);
        });

        const urlParams = new URLSearchParams(window.location.search);
        const pid = urlParams.get('product');
        if (pid) setTimeout(() => { if (allProducts.length) showProductDetail(pid); }, 1000);

    } catch (error) {
        console.error("Init failed:", error);
    }
});

function initializeImageObserver() {
    if ('IntersectionObserver' in window) {
        imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        imageObserver.unobserve(img);
                    }
                }
            });
        }, { rootMargin: '50px' });
    }
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            if ($accountUID) $accountUID.textContent = currentUserId;
            
            productsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/products`);
            categoriesCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/categories`); 
            settingsDocRef = doc(db, `artifacts/${APP_ID}/public/data/settings/admin`);
            infoDocRef = doc(db, `artifacts/${APP_ID}/public/data/content/info`); 
            
            loadInitialData();
        } else {
            await signInAnonymously(auth);
        }
    });
}

function updateAppHeader(settings) {
    headerSettings = {
        shopName: settings.shopName || 'SocialShop',
        iconClass: settings.iconClass || 'fas fa-camera-retro',
        whatsappNumber: settings.whatsappNumber || ''
    };
    if ($shopHeaderName) $shopHeaderName.textContent = headerSettings.shopName;
    if ($shopHeaderIcon) $shopHeaderIcon.className = `${headerSettings.iconClass} mr-2`;
    const hero = document.getElementById('hero-shop-name');
    if (hero) hero.textContent = headerSettings.shopName;
    whatsappNumber = headerSettings.whatsappNumber;
}

function loadInitialData() {
    if (unsubscribeCategories) unsubscribeCategories();
    unsubscribeCategories = onSnapshot(categoriesCollectionRef, (snap) => {
        categoriesCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProductPage();
    });

    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeSettings = onSnapshot(settingsDocRef, (snap) => updateAppHeader(snap.exists() ? snap.data() : {}));
    
    if (unsubscribeProducts) unsubscribeProducts();
    unsubscribeProducts = onSnapshot(productsCollectionRef, (snap) => {
        allProducts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        filterAndRenderHomeProducts('');
        renderProductList(allProducts);
        showLoading(false);
    });
    
    if (unsubscribeInfo) unsubscribeInfo();
    unsubscribeInfo = onSnapshot(infoDocRef, (snap) => {
        infoContent = snap.exists() ? snap.data() : {};
        showInfoSection('about');
        if ($accountCopyright) $accountCopyright.textContent = infoContent.copyrightText || '';
    });
}

window.showInfoSection = function(section) {
    const data = {
        'about': { t: infoContent.aboutTitle, c: infoContent.aboutContent },
        'conditions': { t: infoContent.conditionsTitle, c: infoContent.conditionsContent },
        'copyright': { t: 'Copyright', c: infoContent.copyrightText }
    }[section] || {};
    if ($infoTitle) $infoTitle.textContent = data.t || 'Information';
    if ($infoContent) $infoContent.innerText = data.c || 'No information available.'; 
}

window.showPage = function(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(`${pageId}-page`)?.classList.add('active');
    
    document.getElementById('main-mobile-nav')?.classList.toggle('hidden', pageId === 'product-detail');
    if (pageId === 'cart') renderCartPage();
    
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.remove('text-indigo-600', 'active-mobile-link');
        if (l.getAttribute('onclick')?.includes(pageId)) l.classList.add('text-indigo-600', 'active-mobile-link');
    });
    window.scrollTo(0,0);
}

window.goBack = () => showPage('home');

window.navigateToCategory = (cid) => {
    showPage('products');
    filterProductsByCategory(cid);
}

function renderHomeProductList(list) {
    const container = document.getElementById('home-product-list-container');
    if (!container) return;
    container.innerHTML = '';
    
    list.forEach(p => {
        const img = p.imageUrl || 'https://placehold.co/600x400';
        const price = p.retailPrice || p.price;
        const discount = p.discountPercentage || 0;
        const inCart = cartProductIds.has(p.id);
        
        container.innerHTML += `
            <div class="bg-white rounded-lg shadow-sm mb-4 overflow-hidden">
                <div class="flex items-center p-3 border-b border-gray-100">
                    <span class="font-semibold text-gray-700 text-sm">${p.categoryName || 'Product'}</span>
                </div>
                <div onclick="showProductDetail('${p.id}')">
                    <img src="${img}" class="w-full h-64 object-cover" onerror="this.src='https://placehold.co/600x400'">
                </div>
                <div class="p-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="font-bold text-gray-800">${p.name}</h3>
                            <div class="text-sm text-gray-500">${p.brand || ''}</div>
                        </div>
                        <button onclick="toggleLike('${p.id}')"><i class="${p.likes?.includes(currentUserId) ? 'fas text-red-500' : 'far text-gray-400'} fa-heart text-xl"></i></button>
                    </div>
                    <div class="mt-2 flex items-baseline gap-2">
                        <span class="text-lg font-bold">₹${price}</span>
                        ${discount > 0 ? `<span class="text-sm text-gray-400 line-through">₹${p.price}</span><span class="text-xs text-green-600 font-bold">${discount}% OFF</span>` : ''}
                    </div>
                    <div class="mt-3 flex gap-2">
                        <button class="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm" onclick="addToCart('${p.id}')">
                            ${inCart ? 'ADD MORE' : 'ADD TO CART'}
                        </button>
                        <button class="flex-1 border border-gray-300 py-2 rounded-lg font-bold text-sm text-gray-700" onclick="openWhatsAppChat('${p.name}', '${p.id}')">
                            CHAT
                        </button>
                    </div>
                </div>
            </div>`;
    });
}

window.filterAndRenderHomeProducts = (term) => {
    const list = allProducts.filter(p => p.name.toLowerCase().includes(term));
    renderHomeProductList(list);
}

window.filterProductsByCategory = (cid) => {
    document.querySelectorAll('.category-chip').forEach(c => c.classList.toggle('active', c.dataset.id === cid));
    renderProductList(cid === 'all' ? allProducts : allProducts.filter(p => p.categoryId === cid));
}

function renderProductList(list) {
    const container = document.getElementById('product-list-container');
    if (!container) return;
    container.innerHTML = '';
    
    list.forEach(p => {
        const img = p.imageUrl || 'https://placehold.co/300x300';
        const price = p.retailPrice || p.price;
        
        container.innerHTML += `
            <div class="bg-white rounded-lg shadow-sm overflow-hidden" onclick="showProductDetail('${p.id}')">
                <img src="${img}" class="w-full h-40 object-cover">
                <div class="p-2">
                    <h3 class="text-sm font-semibold truncate">${p.name}</h3>
                    <div class="flex items-baseline gap-1 mt-1">
                        <span class="font-bold text-sm">₹${price}</span>
                        ${p.discountPercentage > 0 ? `<span class="text-xs text-green-600">${p.discountPercentage}% off</span>` : ''}
                    </div>
                </div>
            </div>`;
    });
}

window.showProductDetail = (pid) => {
    const p = allProducts.find(x => x.id === pid);
    if (!p) return;
    activeProduct = p;
    
    const container = document.getElementById('product-detail-container');
    const imgs = [p.imageUrl, ...(p.otherImages || [])].filter(u => u);
    const price = p.retailPrice || p.price;
    
    let imgHtml = `<img src="${imgs[0]}" class="w-full h-80 object-contain bg-white">`;
    if (imgs.length > 1) {
        // Simple swipe logic can be added here, currently just showing main image
        // For simplicity in this edit, sticking to main image or scroll
        imgHtml = `<div class="flex overflow-x-auto snap-x">
            ${imgs.map(u => `<img src="${u}" class="w-full h-80 object-contain bg-white flex-shrink-0 snap-center">`).join('')}
        </div>`;
    }

    container.innerHTML = `
        <div class="bg-white pb-4">
            <div class="p-2 flex items-center bg-white sticky top-0 z-10">
                <button onclick="goBack()" class="mr-4 text-xl"><i class="fas fa-arrow-left"></i></button>
                <span class="font-bold text-gray-700 truncate">${p.name}</span>
            </div>
            ${imgHtml}
            <div class="p-4">
                <h1 class="text-xl font-bold text-gray-800">${p.name}</h1>
                <div class="mt-2 flex items-baseline gap-2">
                    <span class="text-2xl font-bold">₹${price}</span>
                    ${p.discountPercentage > 0 ? `<span class="text-gray-500 line-through">₹${p.price}</span><span class="text-green-600 font-bold">${p.discountPercentage}% OFF</span>` : ''}
                </div>
                
                <div class="mt-6 border-t pt-4">
                    <h3 class="font-bold text-gray-700">Description</h3>
                    <p class="text-gray-600 mt-2 text-sm whitespace-pre-wrap">${p.description || 'No description.'}</p>
                </div>
            </div>
        </div>
        <div class="fixed bottom-0 left-0 right-0 bg-white p-2 border-t flex gap-2 z-20">
            <button class="flex-1 bg-white border border-gray-300 text-gray-800 py-3 font-bold" onclick="addToCart('${p.id}')">ADD TO CART</button>
            <button class="flex-1 bg-indigo-600 text-white py-3 font-bold" onclick="openWhatsAppChat('${p.name}', '${p.id}')">BUY NOW</button>
        </div>
        <div class="h-16"></div>`; // Spacer
        
    showPage('product-detail');
}

// --- CART FUNCTIONS (UPDATED) ---

function loadCartFromStorage() {
    cart = JSON.parse(localStorage.getItem('socialShopCart')) || [];
    cartProductIds = new Set(cart.map(i => i.id));
}
function saveCartToStorage() {
    localStorage.setItem('socialShopCart', JSON.stringify(cart));
    cartProductIds = new Set(cart.map(i => i.id));
}
function updateCartUI() {
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    if ($cartBadgeBottomNav) {
        $cartBadgeBottomNav.textContent = count;
        $cartBadgeBottomNav.classList.toggle('hidden', count === 0);
    }
}

window.addToCart = (pid) => {
    const p = allProducts.find(x => x.id === pid);
    if (!p) return;
    const item = cart.find(x => x.id === pid);
    if (item) item.quantity++;
    else cart.push({ id: pid, name: p.name, price: p.retailPrice || p.price, imageUrl: p.imageUrl, quantity: 1 });
    
    saveCartToStorage();
    updateCartUI();
    showMessage(`${p.name} added to cart!`, 'success');
}

window.renderCartPage = () => {
    if (!$cartItemsContainer) return;
    
    if (cart.length === 0) {
        $cartEmptyMsg.classList.remove('hidden');
        $cartItemsContainer.classList.add('hidden');
        $cartSummarySection.classList.add('hidden');
        return;
    }
    
    $cartEmptyMsg.classList.add('hidden');
    $cartItemsContainer.classList.remove('hidden');
    $cartSummarySection.classList.remove('hidden');
    $cartItemsContainer.innerHTML = '';
    
    let total = 0;
    cart.forEach(item => {
        total += item.price * item.quantity;
        const img = item.imageUrl || 'https://placehold.co/100x100';
        
        $cartItemsContainer.innerHTML += `
            <div class="cart-item">
                <div class="cart-item-top">
                    <img src="${img}" class="cart-item-img" onclick="showProductDetail('${item.id}')">
                    <div class="cart-item-details">
                        <h3 class="cart-item-title">${item.name}</h3>
                        <p class="cart-item-price">₹${item.price}</p>
                    </div>
                </div>
                
                <div class="cart-actions-row">
                    <div class="quantity-control">
                        <button class="qty-btn" onclick="updateCartQuantity('${item.id}', -1)">-</button>
                        <span class="qty-val">${item.quantity}</span>
                        <button class="qty-btn" onclick="updateCartQuantity('${item.id}', 1)">+</button>
                    </div>
                    
                    <div class="action-btn-container">
                        <button class="cart-action-btn btn-remove" onclick="removeFromCart('${item.id}')">
                            Remove
                        </button>
                        <button class="cart-action-btn btn-buy-now" onclick="buySingleProduct('${item.id}')">
                            <i class="fab fa-whatsapp"></i> Buy this now
                        </button>
                    </div>
                </div>
            </div>`;
    });
    
    if ($cartSubtotal) $cartSubtotal.textContent = `₹${total}`;
    if ($cartTotal) $cartTotal.textContent = `₹${total}`;
}

window.updateCartQuantity = (pid, change) => {
    const item = cart.find(i => i.id === pid);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) removeFromCart(pid);
        else { saveCartToStorage(); renderCartPage(); updateCartUI(); }
    }
}

window.removeFromCart = (pid) => {
    cart = cart.filter(i => i.id !== pid);
    saveCartToStorage(); renderCartPage(); updateCartUI();
}

// New Function: Buy Single Product from Cart
window.buySingleProduct = (pid) => {
    const item = cart.find(i => i.id === pid);
    if (item) openWhatsAppChat(item.name, item.id);
}

// --- WHATSAPP & SHARE ---
window.openWhatsAppChat = (name, pid) => {
    if (!whatsappNumber) { showMessage("WhatsApp number not set!", 'error'); return; }
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi, I want to buy:\n*${name}*\nID: ${pid}`)}`;
    window.open(url, '_blank');
}
window.openWhatsAppChatForCart = () => {
    if (!whatsappNumber || cart.length === 0) return;
    let msg = "Order:\n";
    cart.forEach(i => msg += `${i.name} (x${i.quantity})\n`);
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

window.toggleLike = async (pid) => {
    if (!currentUserId) { showMessage("Login required", 'error'); return; }
    const p = allProducts.find(x => x.id === pid);
    if (!p) return;
    
    const liked = p.likes?.includes(currentUserId);
    if (liked) await updateDoc(doc(productsCollectionRef, pid), { likes: arrayRemove(currentUserId) });
    else await updateDoc(doc(productsCollectionRef, pid), { likes: arrayUnion(currentUserId) });
}

window.showCommentsOverlay = (pid, name) => {
    // Implementation simplified for this response
    showMessage("Comments loading...");
}

// Utils
function showLoading(show) { loadingSpinner.classList.toggle('hidden', !show); }
function showMessage(msg, type='info') {
    messageModalText.textContent = msg;
    messageModal.classList.remove('hidden');
}
window.closeModal = () => messageModal.classList.add('hidden');