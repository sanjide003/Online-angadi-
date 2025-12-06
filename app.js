// firebase-config.js-ൽ നിന്ന് ആവശ്യമായവ ഇമ്പോർട്ട് ചെയ്യുന്നു
import { 
    db, auth, APP_ID, 
    doc, onSnapshot, collection, query, 
    updateDoc, deleteDoc, arrayRemove, arrayUnion, serverTimestamp, addDoc,
    signInAnonymously 
} from './firebase-config.js';

// --- Global Variables ---
let currentUserId = null;
let allProducts = [];
let categoriesCache = []; 
let whatsappNumber = '';
let infoContent = {}; 
let headerSettings = { shopName: 'SocialShop', iconClass: 'fas fa-camera-retro' };
let cart = [];
let pageHistory = [];

// Firestore References
let productsCollectionRef, categoriesCollectionRef, settingsDocRef, infoDocRef; 
let unsubscribeProducts, unsubscribeCategories, unsubscribeSettings, unsubscribeComments, unsubscribeInfo; 

// UI State
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

// ========= Initialization =========

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements Selection
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

        // Search Listener
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    filterAndRenderHomeProducts(event.target.value.toLowerCase());
                }, 300);
            });
        }

        // Comment Form Listener
        const commentForm = document.getElementById('add-comment-form');
        if (commentForm) commentForm.addEventListener('submit', handleAddComment);
        
        // Category Filter Listener
        const categoryFilters = document.getElementById('category-filters');
        if (categoryFilters) {
            categoryFilters.addEventListener('click', (e) => {
                const chip = e.target.closest('.category-chip');
                if (chip) filterProductsByCategory(chip.dataset.id);
            });
        }
        
        loadCartFromStorage();
        updateCartUI();
        
        // Scroll Listener
        window.addEventListener('scroll', () => {
             if ($scrollToTopBtn) $scrollToTopBtn.classList.toggle('hidden', window.pageYOffset <= 300);
        });

        // URL Parameter Check (Deep Linking)
        const urlParams = new URLSearchParams(window.location.search);
        const pid = urlParams.get('product');
        if (pid) {
            const checkInterval = setInterval(() => {
                if (allProducts.length > 0) {
                    clearInterval(checkInterval);
                    showProductDetail(pid);
                }
            }, 500);
        }

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

// ========= Auth & Data Loading =========

function setupAuthListener() {
    auth.onAuthStateChanged(async (user) => {
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
    showLoading(true);

    // Load Categories
    if (unsubscribeCategories) unsubscribeCategories();
    unsubscribeCategories = onSnapshot(categoriesCollectionRef, (snap) => {
        categoriesCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProductPage();
    });

    // Load Settings
    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeSettings = onSnapshot(settingsDocRef, (snap) => updateAppHeader(snap.exists() ? snap.data() : {}));
    
    // Load Products
    if (unsubscribeProducts) unsubscribeProducts();
    unsubscribeProducts = onSnapshot(productsCollectionRef, (snap) => {
        allProducts = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        filterAndRenderHomeProducts('');
        renderProductList(allProducts);
        showLoading(false);
    });
    
    // Load Info
    if (unsubscribeInfo) unsubscribeInfo();
    unsubscribeInfo = onSnapshot(infoDocRef, (snap) => {
        infoContent = snap.exists() ? snap.data() : {};
        showInfoSection('about');
        renderAccountPageExtras(infoContent);
        if ($accountCopyright) $accountCopyright.textContent = infoContent.copyrightText || '';
    });
}

// ========= Navigation =========

window.showPage = function(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`${pageId}-page`);
    if(target) target.classList.add('active');
    
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
    setTimeout(() => {
        const chip = document.querySelector(`.category-chip[data-id="${cid}"]`);
        if(chip) chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 100);
}

// ========= Home Page Logic =========

function renderHomeProductList(list) {
    const container = document.getElementById('home-product-list-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (list.length === 0) {
        container.innerHTML = '<p class="text-center p-4 text-gray-500">No products found.</p>';
        return;
    }

    list.forEach(p => {
        const img = p.imageUrl || 'https://placehold.co/600x400';
        const price = p.retailPrice || p.price;
        const discount = p.discountPercentage || 0;
        const inCart = cartProductIds.has(p.id);
        const isLiked = p.likes?.includes(currentUserId);
        
        container.innerHTML += `
            <div class="bg-white rounded-lg shadow-sm mb-4 overflow-hidden">
                <div class="flex items-center p-3 border-b border-gray-100 justify-between">
                    <span class="font-semibold text-gray-700 text-sm">${p.categoryName || 'Product'}</span>
                    <button class="text-gray-400" onclick="openShareModal('${p.id}')"><i class="fas fa-share-alt"></i></button>
                </div>
                <div onclick="showProductDetail('${p.id}')" class="relative">
                    <img src="${img}" class="w-full h-64 object-cover" onerror="this.src='https://placehold.co/600x400'">
                    ${p.brand ? `<span class="absolute top-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">${p.brand}</span>` : ''}
                </div>
                <div class="p-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="font-bold text-gray-800 line-clamp-1">${p.name}</h3>
                        </div>
                        <button onclick="toggleLike('${p.id}')"><i class="${isLiked ? 'fas text-red-500' : 'far text-gray-400'} fa-heart text-xl"></i></button>
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

// ========= Products Page Logic =========

window.filterProductsByCategory = (cid) => {
    document.querySelectorAll('.category-chip').forEach(c => c.classList.toggle('active', c.dataset.id === cid));
    renderProductList(cid === 'all' ? allProducts : allProducts.filter(p => p.categoryId === cid));
}

function renderProductPage() {
    const container = document.getElementById('category-filters');
    if(!container) return;
    container.innerHTML = `<div class="category-chip active" data-id="all">All</div>`;
    categoriesCache.forEach(c => {
        container.innerHTML += `<div class="category-chip" data-id="${c.id}">${c.name}</div>`;
    });
    filterProductsByCategory('all');
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

// ========= Product Detail =========

window.showProductDetail = (pid) => {
    const p = allProducts.find(x => x.id === pid);
    if (!p) return;
    activeProduct = p;
    
    const container = document.getElementById('product-detail-container');
    const imgs = [p.imageUrl, ...(p.otherImages || [])].filter(u => u);
    const price = p.retailPrice || p.price;
    const isLiked = p.likes?.includes(currentUserId);
    
    // Image Carousel Logic
    let imgHtml;
    if (imgs.length > 1) {
         imgHtml = `<div class="flex overflow-x-auto snap-x h-80 bg-white">
            ${imgs.map(u => `<img src="${u}" class="w-full h-full object-contain flex-shrink-0 snap-center">`).join('')}
        </div>`;
    } else {
        imgHtml = `<img src="${imgs[0]}" class="w-full h-80 object-contain bg-white">`;
    }

    container.innerHTML = `
        <div class="bg-white pb-4">
            <div class="p-2 flex items-center bg-white sticky top-0 z-10 border-b">
                <button onclick="goBack()" class="mr-4 text-xl p-2"><i class="fas fa-arrow-left"></i></button>
                <span class="font-bold text-gray-700 truncate flex-1">${p.name}</span>
                <button onclick="openShareModal('${p.id}')" class="p-2"><i class="fas fa-share-alt"></i></button>
            </div>
            ${imgHtml}
            <div class="p-4">
                <div class="flex justify-between items-start">
                     <h1 class="text-xl font-bold text-gray-800 flex-1">${p.name}</h1>
                     <button onclick="toggleLike('${p.id}')" class="ml-2"><i class="${isLiked ? 'fas text-red-500' : 'far text-gray-400'} fa-heart text-2xl"></i></button>
                </div>
                
                <div class="mt-2 flex items-baseline gap-2">
                    <span class="text-2xl font-bold">₹${price}</span>
                    ${p.discountPercentage > 0 ? `<span class="text-gray-500 line-through">₹${p.price}</span><span class="text-green-600 font-bold">${p.discountPercentage}% OFF</span>` : ''}
                </div>
                
                ${p.freeDelivery ? '<div class="mt-2 text-green-600 text-sm font-bold"><i class="fas fa-truck"></i> Free Delivery</div>' : ''}
                
                <div class="mt-6 border-t pt-4">
                    <h3 class="font-bold text-gray-700">Description</h3>
                    <p class="text-gray-600 mt-2 text-sm whitespace-pre-wrap leading-relaxed">${p.description || 'No description available.'}</p>
                </div>

                 <div class="mt-4 border-t pt-4">
                    <button class="text-indigo-600 font-semibold" onclick="showCommentsOverlay('${p.id}', '${p.name}')">
                        View Comments (${p.commentCount || 0})
                    </button>
                </div>
            </div>
        </div>
        
        <div class="fixed bottom-0 left-0 right-0 bg-white p-2 border-t flex gap-2 z-20 shadow-lg">
            <button class="flex-1 bg-white border border-gray-300 text-gray-800 py-3 font-bold rounded" onclick="addToCart('${p.id}')">ADD TO CART</button>
            <button class="flex-1 bg-indigo-600 text-white py-3 font-bold rounded" onclick="openWhatsAppChat('${p.name}', '${p.id}')">BUY NOW</button>
        </div>
        <div class="h-16"></div>`;
        
    showPage('product-detail');
}

// ========= CART FUNCTIONS (Flipkart Style) =========

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
                        <!-- Updated Button: Buy This Now -->
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

// === NEW: Buy Single Product Function ===
window.buySingleProduct = (pid) => {
    const item = cart.find(i => i.id === pid);
    if (!item) return;
    
    if (!whatsappNumber) { showMessage("WhatsApp number not set!", 'error'); return; }
    
    const msg = `Hi, I want to buy this item from my cart:\n\n*${item.name}*\nPrice: ₹${item.price}\nQuantity: ${item.quantity}\nProduct ID: ${item.id}\n\nPlease confirm order.`;
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

// ========= Interaction Functions =========

window.openWhatsAppChat = (name, pid) => {
    if (!whatsappNumber) { showMessage("WhatsApp number not set!", 'error'); return; }
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi, I want to buy:\n*${name}*\nID: ${pid}`)}`;
    window.open(url, '_blank');
}

window.openWhatsAppChatForCart = () => {
    if (!whatsappNumber || cart.length === 0) return;
    let msg = "Order Summary:\n";
    let total = 0;
    cart.forEach(i => {
        msg += `${i.name} (x${i.quantity}) - ₹${i.price * i.quantity}\n`;
        total += i.price * i.quantity;
    });
    msg += `\nTotal: ₹${total}`;
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

window.toggleLike = async (pid) => {
    if (!currentUserId) { showMessage("Please login to like", 'error'); return; }
    const p = allProducts.find(x => x.id === pid);
    if (!p) return;
    
    const liked = p.likes?.includes(currentUserId);
    const ref = doc(productsCollectionRef, pid);
    
    if (liked) await updateDoc(ref, { likes: arrayRemove(currentUserId) });
    else await updateDoc(ref, { likes: arrayUnion(currentUserId) });
}

// Account & Info
function renderAccountPageExtras(data) {
    const followSec = document.getElementById('follow-us-section');
    if(!followSec) return;
    
    const setLink = (id, url) => {
        const el = document.getElementById(id);
        if(el) {
            if(url) { el.href = url; el.classList.remove('hidden'); }
            else el.classList.add('hidden');
        }
    };
    
    setLink('follow-whatsapp-link', data.followWhatsapp);
    setLink('follow-instagram-link', data.followInstagram);
    setLink('follow-facebook-link', data.followFacebook);
    
    const phoneEl = document.getElementById('contact-phone-link');
    if(phoneEl && data.contactPhone) {
        document.getElementById('contact-phone-text').textContent = data.contactPhone;
        phoneEl.href = `tel:${data.contactPhone}`;
        phoneEl.classList.remove('hidden');
    }
    
    followSec.classList.remove('hidden');
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

// Comments Overlay (Simple Version)
window.showCommentsOverlay = (pid, name) => {
    if(!commentsModal) return;
    const title = document.getElementById('comment-product-name');
    const input = document.getElementById('comment-product-id');
    if(title) title.textContent = name;
    if(input) input.value = pid;
    
    const list = document.getElementById('comments-list');
    list.innerHTML = '<p class="text-center p-4">Loading...</p>';
    
    if(unsubscribeComments) unsubscribeComments();
    const q = query(collection(db, `artifacts/${APP_ID}/public/data/products/${pid}/comments`));
    
    unsubscribeComments = onSnapshot(q, (snap) => {
        list.innerHTML = '';
        if(snap.empty) { list.innerHTML = '<p class="text-center p-4 text-gray-500">No comments yet.</p>'; return; }
        
        snap.forEach(d => {
            const c = d.data();
            list.innerHTML += `
                <div class="border-b p-3">
                    <div class="font-bold text-sm">${c.userName || 'User'}</div>
                    <div class="text-gray-700">${c.feedback}</div>
                </div>`;
        });
    });
    
    commentsModal.classList.add('show');
    if(commentsBackdrop) commentsBackdrop.classList.remove('hidden');
}

window.closeCommentsModal = () => {
    if(commentsModal) commentsModal.classList.remove('show');
    if(commentsBackdrop) commentsBackdrop.classList.add('hidden');
    if(unsubscribeComments) unsubscribeComments();
}

async function handleAddComment(e) {
    e.preventDefault();
    const pid = document.getElementById('comment-product-id').value;
    const txt = document.getElementById('comment-feedback').value;
    const name = document.getElementById('comment-user-name').value || 'Guest';
    
    if(!txt.trim()) return;
    
    await addDoc(collection(db, `artifacts/${APP_ID}/public/data/products/${pid}/comments`), {
        feedback: txt, userName: name, userId: currentUserId, createdAt: serverTimestamp()
    });
    
    // Update count on product
    const p = allProducts.find(x => x.id === pid);
    await updateDoc(doc(productsCollectionRef, pid), { commentCount: (p.commentCount || 0) + 1 });
    
    document.getElementById('comment-feedback').value = '';
}

// Share Modal
window.openShareModal = (pid) => {
    const p = allProducts.find(x => x.id === pid);
    activeProduct = p;
    if($shareModal) $shareModal.classList.remove('hidden');
}
window.closeShareModal = () => $shareModal.classList.add('hidden');

window.shareVia = (platform) => {
    if(!activeProduct) return;
    const url = `${APP_BASE_URL}?product=${activeProduct.id}`;
    const txt = `Check this out: ${activeProduct.name}\nPrice: ₹${activeProduct.retailPrice}`;
    
    let link = '';
    if(platform === 'whatsapp') link = `https://wa.me/?text=${encodeURIComponent(txt + '\n' + url)}`;
    else if(platform === 'copy') {
        navigator.clipboard.writeText(txt + '\n' + url);
        showMessage("Link Copied!", 'success');
        return;
    }
    if(link) window.open(link, '_blank');
}

// Utilities
function showLoading(show) { if (loadingSpinner) loadingSpinner.classList.toggle('hidden', !show); }
function showMessage(msg, type='info') {
    if(messageModalText) {
        messageModalText.textContent = msg;
        messageModalText.className = type === 'error' ? 'text-red-500' : 'text-green-600';
        messageModal.classList.remove('hidden');
    } else alert(msg);
}
window.closeModal = () => messageModal.classList.add('hidden');