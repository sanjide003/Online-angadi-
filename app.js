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
        renderAccountPageExtras(infoContent);
        if ($accountCopyright) $accountCopyright.textContent = infoContent.copyrightText || '';
    });
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

// --- HOME & PRODUCT RENDERING (Original Logic) ---
function renderHomeProductList(list) {
    const container = document.getElementById('home-product-list-container');
    if (!container) return;
    container.innerHTML = '';
    
    list.forEach(p => {
        const img = p.imageUrl || 'https://placehold.co/600x400';
        const price = p.retailPrice || p.price;
        const discount = p.discountPercentage || 0;
        const inCart = cartProductIds.has(p.id);
        const isLiked = p.likes?.includes(currentUserId);
        
        container.innerHTML += `
            <div class="bg-white rounded-lg shadow-md overflow-hidden mb-6 transition duration-300">
                <div class="flex items-center p-3">
                    <div class="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center mr-3 bg-gray-50">
                         <i class="fas fa-tag text-indigo-500"></i>
                    </div>
                    <div class="flex-grow font-semibold text-gray-800">${p.categoryName || 'Product'}</div>
                    <button class="text-gray-400" onclick="openShareModal('${p.id}')"><i class="fas fa-share-alt"></i></button>
                </div>
                <div onclick="showProductDetail('${p.id}')" class="relative">
                    <img src="${img}" class="w-full object-cover max-h-[400px]" onerror="this.src='https://placehold.co/600x400'">
                </div>
                <div class="p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex gap-4">
                            <button onclick="toggleLike('${p.id}')"><i class="${isLiked ? 'fas text-red-500' : 'far text-gray-400'} fa-heart text-2xl"></i></button>
                            <button onclick="showCommentsOverlay('${p.id}', '${p.name}')"><i class="far fa-comment text-2xl text-gray-600"></i></button>
                        </div>
                        <button onclick="addToCart('${p.id}')">
                            <i class="${inCart ? 'fas text-indigo-600' : 'far text-gray-600'} fa-bookmark text-2xl"></i>
                        </button>
                    </div>
                    <h3 class="text-lg font-bold text-gray-800 mb-1">${p.name}</h3>
                    <div class="text-xl font-bold mb-2">
                        <span class="text-green-600 mr-2">₹${price}</span>
                        ${discount > 0 ? `<span class="text-gray-400 line-through text-sm">₹${p.price}</span> <span class="text-red-500 text-sm">(${discount}% Off)</span>` : ''}
                    </div>
                    ${p.description ? `<p class="text-gray-600 text-sm line-clamp-2">${p.description}</p>` : ''}
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

function renderProductPage() {
    const container = document.getElementById('category-filters');
    if(!container) return;
    container.innerHTML = `<div class="category-chip active" data-id="all"><i class="fas fa-border-all mr-2"></i> All</div>`;
    categoriesCache.forEach(c => {
        container.innerHTML += `<div class="category-chip" data-id="${c.id}"><i class="${c.iconClass || 'fas fa-tag'} mr-2"></i> ${c.name}</div>`;
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
            <div class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition duration-300" onclick="showProductDetail('${p.id}')">
                <div class="relative">
                    <img src="${img}" class="w-full h-48 object-cover">
                    ${p.brand ? `<span class="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">${p.brand}</span>` : ''}
                </div>
                <div class="p-3">
                    <h3 class="font-bold text-gray-800 mb-1 truncate">${p.name}</h3>
                    <div class="flex items-baseline">
                        <span class="text-lg font-bold text-gray-900 mr-2">₹${price}</span>
                        ${p.discountPercentage > 0 ? `<span class="text-green-600 text-xs font-semibold">${p.discountPercentage}% Off</span>` : ''}
                    </div>
                    <div class="flex gap-2 mt-3">
                        <button class="flex-1 bg-green-500 text-white text-sm font-bold py-2 rounded" onclick="event.stopPropagation(); openWhatsAppChat('${p.name}', '${p.id}')">Chat</button>
                        <button class="flex-1 bg-indigo-600 text-white text-sm font-bold py-2 rounded" onclick="event.stopPropagation(); addToCart('${p.id}')">Add</button>
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
    const isLiked = p.likes?.includes(currentUserId);
    
    let imgHtml = `<img src="${imgs[0]}" class="w-full h-full object-contain">`;
    if (imgs.length > 1) {
        // Basic swipe container structure
        imgHtml = `<div class="swipe-container h-full"><div class="swipe-track flex h-full">${imgs.map(u => `<div class="swipe-slide h-full flex items-center justify-center"><img src="${u}" class="max-h-full max-w-full"></div>`).join('')}</div></div>`;
    }

    container.innerHTML = `
        <div class="bg-white min-h-screen pb-20">
            <div class="sticky top-0 z-20 bg-white shadow-sm p-3 flex justify-between items-center">
                <button onclick="goBack()" class="text-gray-600"><i class="fas fa-arrow-left text-xl"></i></button>
                <div class="flex gap-4">
                    <button onclick="openShareModal('${p.id}')"><i class="fas fa-share-alt text-xl text-gray-600"></i></button>
                </div>
            </div>
            
            <div class="h-[60vh] bg-gray-100 relative">
                ${imgHtml}
            </div>
            
            <div class="p-5 bg-white -mt-4 rounded-t-3xl relative z-10 shadow-up">
                <div class="flex justify-between items-start mb-2">
                    <h1 class="text-2xl font-bold text-gray-800 flex-1 mr-2">${p.name}</h1>
                    <button onclick="toggleLike('${p.id}')"><i class="${isLiked ? 'fas text-red-500' : 'far text-gray-400'} fa-heart text-2xl"></i></button>
                </div>
                
                <div class="flex items-baseline mb-4">
                    <span class="text-3xl font-bold text-green-600 mr-3">₹${price}</span>
                    ${p.discountPercentage > 0 ? `<span class="text-xl text-gray-400 line-through mr-2">₹${p.price}</span><span class="text-red-500 font-bold">(${p.discountPercentage}% OFF)</span>` : ''}
                </div>
                
                ${p.freeDelivery ? '<div class="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded mb-4">Free Delivery</div>' : ''}
                
                <div class="border-t pt-4">
                    <h3 class="font-bold text-gray-800 mb-2">Description</h3>
                    <p class="text-gray-600 leading-relaxed whitespace-pre-wrap">${p.description || 'No description available.'}</p>
                </div>
                
                ${p.specifications ? `<div class="mt-4 bg-gray-50 p-3 rounded">
                    <h3 class="font-bold text-gray-800 mb-2">Specifications</h3>
                    <p class="text-sm text-gray-600 whitespace-pre-wrap">${p.specifications}</p>
                </div>` : ''}
            </div>
        </div>
        
        <div class="fixed bottom-0 left-0 right-0 p-3 bg-white border-t flex gap-3 z-30">
            <button class="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg" onclick="addToCart('${p.id}')">ADD TO CART</button>
            <button class="flex-1 bg-green-500 text-white font-bold py-3 rounded-xl shadow-lg" onclick="openWhatsAppChat('${p.name}', '${p.id}')">CHAT NOW</button>
        </div>`;
        
    showPage('product-detail');
}

// ========= CART FUNCTIONS (New Flipkart Style) =========

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
                <div class="cart-item-img" onclick="showProductDetail('${item.id}')" style="background-image: url('${img}'); background-size: contain; background-repeat: no-repeat; background-position: center;"></div>
                
                <div class="cart-item-details">
                     <div class="flex justify-between">
                        <h3 class="cart-item-title">${item.name}</h3>
                     </div>
                     <p class="cart-item-price">₹${item.price}</p>
                </div>

                <div class="cart-actions-row">
                    <div class="quantity-control">
                        <button class="qty-btn" onclick="updateCartQuantity('${item.id}', -1)">-</button>
                        <span class="qty-val">${item.quantity}</span>
                        <button class="qty-btn" onclick="updateCartQuantity('${item.id}', 1)">+</button>
                    </div>
                    
                    <div class="action-btn-container">
                        <button class="cart-action-btn btn-remove" onclick="removeFromCart('${item.id}')">Remove</button>
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

window.buySingleProduct = (pid) => {
    const item = cart.find(i => i.id === pid);
    if (!item) return;
    
    if (!whatsappNumber) { showMessage("WhatsApp number not set!", 'error'); return; }
    
    const msg = `Hi, I want to buy this item from my cart:\n\n*${item.name}*\nPrice: ₹${item.price}\nQuantity: ${item.quantity}\nProduct ID: ${item.id}\n\nPlease confirm order.`;
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

// ========= GENERAL INTERACTION =========

window.openWhatsAppChat = (name, pid) => {
    if (!whatsappNumber) { showMessage("WhatsApp number not set!", 'error'); return; }
    
    // Original Message Format
    const product = allProducts.find(p => p.id === pid);
    const price = product?.retailPrice || product?.price || 0;
    const productLink = `${APP_BASE_URL}?product=${pid}`;
    
    const message = `🛍️ *${name}*\n\n💰 Price: ₹${price}\n🆔 Product ID: ${pid}\n\n📱 View Product: ${productLink}\n\nHello, I'm interested in this product. Could you provide more details?`;
    
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

window.openWhatsAppChatForCart = () => {
    if (!whatsappNumber || cart.length === 0) return;
    let msg = "🛒 *My Shopping Cart*\n\n";
    let total = 0;
    cart.forEach((i, idx) => {
        msg += `${idx+1}. *${i.name}*\n   Qty: ${i.quantity} × ₹${i.price} = ₹${i.price * i.quantity}\n\n`;
        total += i.price * i.quantity;
    });
    msg += `━━━━━━━━━━━━━━━\n💵 *Total: ₹${total}*\n\nI would like to place this order.`;
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank');
}

window.toggleLike = async (pid) => {
    if (!currentUserId) { showMessage("Login required", 'error'); return; }
    const p = allProducts.find(x => x.id === pid);
    if (!p) return;
    
    const liked = p.likes?.includes(currentUserId);
    const ref = doc(productsCollectionRef, pid);
    
    if (liked) await updateDoc(ref, { likes: arrayRemove(currentUserId) });
    else await updateDoc(ref, { likes: arrayUnion(currentUserId) });
}

window.showCommentsOverlay = (pid, name) => {
    if(!commentsModal) return;
    document.getElementById('comment-product-name').textContent = name;
    document.getElementById('comment-product-id').value = pid;
    
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
                    <div class="flex items-center gap-2">
                        <div class="bg-gray-200 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">${(c.userName||'U')[0]}</div>
                        <div class="font-bold text-sm">${c.userName || 'Guest'}</div>
                    </div>
                    <div class="text-gray-700 mt-1 ml-8">${c.feedback}</div>
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
    
    const p = allProducts.find(x => x.id === pid);
    await updateDoc(doc(productsCollectionRef, pid), { commentCount: (p.commentCount || 0) + 1 });
    document.getElementById('comment-feedback').value = '';
}

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
    
    if(platform === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(txt + '\n' + url)}`, '_blank');
    else if(platform === 'copy') {
        navigator.clipboard.writeText(txt + '\n' + url);
        showMessage("Link Copied!", 'success');
    }
    closeShareModal();
}

// Account & Info
function renderAccountPageExtras(data) {
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
    document.getElementById('contact-us-section')?.classList.remove('hidden');
    document.getElementById('follow-us-section')?.classList.remove('hidden');
}

// Utils
function showLoading(show) { if (loadingSpinner) loadingSpinner.classList.toggle('hidden', !show); }
function showMessage(msg, type='info') {
    if(messageModalText) {
        messageModalText.textContent = msg;
        messageModalText.className = type === 'error' ? 'text-red-500' : 'text-green-600';
        messageModal.classList.remove('hidden');
    } else alert(msg);
}
window.closeModal = () => messageModal.classList.add('hidden');