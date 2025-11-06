// [സൂചന] ഫയർബേസിൽ നിന്നും മറ്റ് ഫംഗ്ഷനുകളിൽ നിന്നും ഇംപോർട്ട് ചെയ്യുന്നു
import { db, auth, setupAuthListener, APP_ID } from './firebase-config.js';
import { 
    doc, setDoc, onSnapshot, collection, query, addDoc, 
    updateDoc, deleteDoc, arrayRemove, arrayUnion, serverTimestamp, getDocs 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global Caches & State ---
let allProducts = [];
let categoriesCache = [];
let cart = []; // കാർട്ട്
let currentUserId = null;
let activeProduct = null;
let currentSlideIndex = 0; // പ്രൊഡക്റ്റ് ഡീറ്റെയിൽ കറൗസലിന് വേണ്ടി
let whatsappNumber = '';
let infoContent = {};
let headerSettings = { shopName: 'SocialShop', iconClass: 'fas fa-camera-retro' };

// --- Firestore References ---
let productsCollectionRef;
let categoriesCollectionRef;
let settingsDocRef;
let infoDocRef;

// --- Snapshot Unsubscribe Functions ---
let unsubscribeProducts = null;
let unsubscribeCategories = null;
let unsubscribeSettings = null;
let unsubscribeComments = null;
let unsubscribeInfo = null;
let confirmCallback = null;

// --- DOM Elements Cache ---
let $pages, $loadingSpinner, $messageModal, $messageModalText, $confirmModal, $confirmModalText, $confirmModalButton;
let $commentsModal, $commentsBackdrop, $cartCountDesktop, $cartCountMobile, $shopHeaderName;
let $searchContainer, $categoryStoriesScroll, $homeProductListContainer; // Home
let $categoryFilters, $productListContainer; // Products
let $productDetailContainer; // Product Detail
let $cartItemListContainer, $cartSummaryContainer, $cartSubtotal, $cartDelivery, $cartTotal; // Cart
let $accountUID, $accountCopyright, $infoTitle, $infoContent; // Account
let $followSection, $contactSection; // Account Extras

// ========= App Initialization =========

document.addEventListener('DOMContentLoaded', () => {
    // DOM ഘടകങ്ങൾ ക്യാഷ് ചെയ്യുന്നു
    cacheDOMElements();
    
    // ഫയർബേസ് സജ്ജമാക്കുന്നു
    if (!db || !auth) {
        console.error("Firebase is not initialized. Check firebase-config.js");
        showMessage("Application failed to start.", 'error');
        return;
    }
    
    // Auth ലിസണർ സജ്ജമാക്കുന്നു
    setupAuthListener(onAuthSuccess, onAuthLoading);

    // മറ്റ് ഇവന്റ് ലിസണറുകൾ
    document.getElementById('search-input').addEventListener('input', (e) => filterAndRenderHomeProducts(e.target.value));
    document.getElementById('add-comment-form').addEventListener('submit', handleAddComment);
    $categoryFilters.addEventListener('click', (e) => {
        if (e.target.classList.contains('category-chip')) {
            filterProductsByCategory(e.target.dataset.id);
        }
    });
});

function cacheDOMElements() {
    $pages = document.querySelectorAll('.page');
    $loadingSpinner = document.getElementById('loading-spinner');
    $messageModal = document.getElementById('message-modal');
    $messageModalText = document.getElementById('message-modal-text');
    $confirmModal = document.getElementById('confirm-modal');
    $confirmModalText = document.getElementById('confirm-modal-text');
    $confirmModalButton = document.getElementById('confirm-modal-button');
    $commentsModal = document.getElementById('comments-modal');
    $commentsBackdrop = document.getElementById('comments-backdrop');
    $cartCountDesktop = document.getElementById('cart-item-count-desktop');
    $cartCountMobile = document.getElementById('cart-item-count-mobile');
    $shopHeaderName = document.getElementById('shop-header-name');
    
    // Home Page
    $searchContainer = document.querySelector('.search-container');
    $categoryStoriesScroll = document.getElementById('category-stories-scroll');
    $homeProductListContainer = document.getElementById('home-product-list-container');
    
    // Products Page
    $categoryFilters = document.getElementById('category-filters');
    $productListContainer = document.getElementById('product-list-container');
    
    // Product Detail Page
    $productDetailContainer = document.getElementById('product-detail-content-wrapper');
    
    // Cart Page
    $cartItemListContainer = document.getElementById('cart-item-list-container');
    $cartSummaryContainer = document.getElementById('cart-summary-container');
    $cartSubtotal = document.getElementById('cart-subtotal');
    $cartDelivery = document.getElementById('cart-delivery');
    $cartTotal = document.getElementById('cart-total');

    // Account Page
    $accountUID = document.getElementById('current-auth-uid');
    $accountCopyright = document.getElementById('account-copyright-display');
    $infoTitle = document.getElementById('info-title');
    $infoContent = document.getElementById('info-content');
    $followSection = document.getElementById('follow-us-section');
    $contactSection = document.getElementById('contact-us-section');
}

// --- Auth Callbacks ---
function onAuthLoading() {
    showLoading(true);
}

function onAuthSuccess(uid) {
    currentUserId = uid;
    if ($accountUID) $accountUID.textContent = currentUserId;
    
    // Firestore റഫറൻസുകൾ സജ്ജമാക്കുന്നു
    productsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/products`);
    categoriesCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/categories`);
    settingsDocRef = doc(db, `artifacts/${APP_ID}/public/data/settings/admin`);
    infoDocRef = doc(db, `artifacts/${APP_ID}/public/data/content/info`);
    
    // കാർട്ട് ലോഡ് ചെയ്യുന്നു
    loadCart();
    
    // പ്രാരംഭ ഡാറ്റ ലോഡ് ചെയ്യുന്നു
    loadInitialData();
}

// --- Data Loading ---
function loadInitialData() {
    if (!currentUserId || !db) return;
    showLoading(true);

    // 1. Load Categories
    if (unsubscribeCategories) unsubscribeCategories();
    unsubscribeCategories = onSnapshot(categoriesCollectionRef, (snapshot) => {
        categoriesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCategoriesAsStories(categoriesCache); // [പുതിയത്] ഹോം പേജിലെ സ്റ്റോറികൾ
        renderProductCategoryChips(categoriesCache); // [പുതിയത്] പ്രൊഡക്റ്റ്സ് പേജിലെ ചിപ്പുകൾ
    }, handleError("categories"));

    // 2. Load Settings (Header, WhatsApp)
    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
        const settings = docSnap.exists() ? docSnap.data() : {};
        updateAppHeader(settings);
    }, handleError("settings"));

    // 3. Load Products
    if (unsubscribeProducts) unsubscribeProducts();
    unsubscribeProducts = onSnapshot(productsCollectionRef, (snapshot) => {
        allProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        allProducts.forEach(p => {
            p.likes = p.likes || [];
            p.commentCount = p.commentCount || 0;
        });
        filterAndRenderHomeProducts(''); // ഹോം ഫീഡ് റെൻഡർ ചെയ്യുന്നു
        filterProductsByCategory('all'); // പ്രൊഡക്റ്റ് ഗ്രിഡ് റെൻഡർ ചെയ്യുന്നു
        
        showLoading(false);
    }, handleError("products"));
    
    // 4. Load Info Content (Account)
    if (unsubscribeInfo) unsubscribeInfo();
    unsubscribeInfo = onSnapshot(infoDocRef, (docSnap) => {
        infoContent = docSnap.exists() ? docSnap.data() : {};
        renderAccountPageExtras(infoContent);
        showInfoSection('about'); // ഡിഫോൾട്ട് ആയി 'About' കാണിക്കുന്നു
        if ($accountCopyright) $accountCopyright.textContent = infoContent.copyrightText || '© 2024 SocialShop.';
    }, handleError("info"));
}

function handleError(source) {
    return (error) => {
        console.error(`Error fetching ${source}:`, error);
        showMessage(`Failed to load ${source}. Check permissions.`, 'error');
        showLoading(false);
    };
}

// --- Header & Account Page Updates ---
function updateAppHeader(settings) {
    headerSettings = {
        shopName: settings.shopName || 'SocialShop',
        iconClass: settings.iconClass || 'fas fa-camera-retro',
        whatsappNumber: settings.whatsappNumber || ''
    };
    
    if ($shopHeaderName) $shopHeaderName.textContent = headerSettings.shopName;
    whatsappNumber = headerSettings.whatsappNumber;
}

function renderAccountPageExtras(data) {
    // സോഷ്യൽ ലിങ്കുകൾ
    toggleLink('follow-whatsapp-link', data.followWhatsapp);
    toggleLink('follow-instagram-link', data.followInstagram);
    toggleLink('follow-facebook-link', data.followFacebook);
    toggleLink('follow-youtube-link', data.followYoutube);
    $followSection.classList.toggle('hidden', !data.followWhatsapp && !data.followInstagram && !data.followFacebook && !data.followYoutube);

    // കോൺടാക്റ്റ് ലിങ്കുകൾ
    toggleLink('contact-phone-link', 'tel:' + data.contactPhone, 'contact-phone-text', data.contactPhone);
    toggleLink('contact-email-link', 'mailto:' + data.contactEmail, 'contact-email-text', data.contactEmail);
    $contactSection.classList.toggle('hidden', !data.contactPhone && !data.contactEmail);
}

function toggleLink(linkId, href, textId = null, text = null) {
    const link = document.getElementById(linkId);
    if (!link) return;
    if (href && href.length > 10) { // 'tel:' 'mailto:' എന്നിവ ഒഴിവാക്കാൻ
        link.href = href;
        if (textId && text) document.getElementById(textId).textContent = text;
        link.classList.remove('hidden');
    } else {
        link.classList.add('hidden');
    }
}

// ========= UI Navigation =========

window.showPage = function(pageId) {
    if (!$pages) return;
    
    $pages.forEach(page => page.classList.remove('active'));
    
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) targetPage.classList.add('active');

    // മൊബൈൽ നാവിഗേഷൻ ബാർ
    const mainMobileNav = document.getElementById('main-mobile-nav');
    if (mainMobileNav) {
        if (pageId === 'product-detail') {
            mainMobileNav.style.display = 'none'; // ഡീറ്റെയിൽ പേജിൽ ബാർ മറയ്ക്കുന്നു
        } else {
            mainMobileNav.style.display = 'flex';
        }
        
        mainMobileNav.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active-mobile-link');
            if (link.getAttribute('onclick').includes(`'${pageId}'`)) {
                link.classList.add('active-mobile-link');
            }
        });
    }

    // ഡെസ്ക്ടോപ്പ് നാവിഗേഷൻ
    document.querySelectorAll('header .nav-link').forEach(link => {
        link.classList.remove('font-bold'); // ഉദാഹരണത്തിന്, ആക്ടീവ് സ്റ്റൈൽ
        if (link.getAttribute('onclick').includes(`'${pageId}'`)) {
            link.classList.add('font-bold');
        }
    });

    // പേജ് ലോഡ് ചെയ്യുമ്പോൾ പ്രത്യേക ഫംഗ്ഷനുകൾ വിളിക്കുന്നു
    if (pageId === 'home') {
        renderCategoriesAsStories(categoriesCache);
    }
    if (pageId === 'products') {
        renderProductCategoryChips(categoriesCache);
        filterProductsByCategory('all');
    }
    if (pageId === 'cart') {
        renderCartPage();
    }
    if (pageId === 'account') {
        showInfoSection('about');
    }

    if (pageId !== 'product-detail') {
        closeCommentsModal();
    }

    window.scrollTo(0, 0);
}

// ========= Home Page (Feed & Stories) =========

// [പുതിയത്] കാറ്റഗറികൾ സ്റ്റോറികളായി കാണിക്കുന്നു
function renderCategoriesAsStories(categories) {
    if (!$categoryStoriesScroll) return;
    $categoryStoriesScroll.innerHTML = '';
    
    // 'All Products' എന്നതിന് ഒരു സ്റ്റോറി
    const allChip = `
        <a href="#" class="story-item" onclick="event.preventDefault(); showPage('products');">
            <div class="story-circle">
                <div class="story-circle-inner">
                    <i class="fas fa-border-all"></i>
                </div>
            </div>
            <span class="story-username">All Products</span>
        </a>
    `;
    $categoryStoriesScroll.innerHTML += allChip;

    // മറ്റ് കാറ്റഗറികൾ
    categories.forEach(cat => {
        const iconClass = cat.iconClass || 'fas fa-tag';
        const storyHtml = `
            <a href="#" class="story-item" onclick="event.preventDefault(); navigateToCategory('${cat.id}');">
                <div class="story-circle">
                    <div class="story-circle-inner">
                        <i class="${iconClass}"></i>
                    </div>
                </div>
                <span class="story-username">${cat.name}</span>
            </a>
        `;
        $categoryStoriesScroll.innerHTML += storyHtml;
    });
}

// [പുതിയത്] ഹോം പേജിൽ നിന്ന് കാറ്റഗറി പേജിലേക്ക് പോകുന്നു
window.navigateToCategory = function(categoryId) {
    if (!categoryId) return;
    showPage('products');
    filterProductsByCategory(categoryId);
    
    setTimeout(() => {
        const chip = document.querySelector(`#category-filters .category-chip[data-id="${categoryId}"]`);
        if (chip) {
            chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, 100);
}

// [മാറ്റിയെഴുതി] ഹോം പേജ് ഫീഡ് റെൻഡർ ചെയ്യുന്നു
function renderHomeProductList(productsToRender) {
    if (!$homeProductListContainer) return;
    $homeProductListContainer.innerHTML = '';
    
    if (productsToRender.length === 0) {
        $homeProductListContainer.innerHTML = '<p class="text-gray-500 text-center py-8">No products found.</p>';
        return;
    }

    productsToRender.forEach(product => {
        const imageUrl = product.imageUrl || `https://placehold.co/600x600/efefef/262626?text=${encodeURIComponent(product.name)}`;
        const category = categoriesCache.find(c => c.id === product.categoryId);
        const categoryName = category ? category.name : 'Uncategorized';
        const categoryIcon = category ? (category.iconClass || 'fas fa-tag') : 'fas fa-tag';
        
        const isLiked = product.likes.includes(currentUserId);
        const likeIconClass = isLiked ? 'fas fa-heart action-btn liked' : 'far fa-heart action-btn';
        const likeCount = product.likes.length || 0;
        
        const originalPrice = product.price || 0;
        const retailPrice = product.retailPrice || originalPrice;
        const discount = product.discountPercentage || 0;

        const postHtml = `
            <div class="feed-post">
                <!-- പോസ്റ്റ് ഹെഡർ -->
                <div class="post-header">
                    <div class="post-avatar"><i class="${categoryIcon}"></i></div>
                    <div class="post-user-info">
                        <span class="post-username">${product.brand || headerSettings.shopName}</span>
                        <span class="post-category">${categoryName}</span>
                    </div>
                    <button class="post-menu-btn"><i class="fas fa-ellipsis-h"></i></button>
                </div>
                
                <!-- പോസ്റ്റ് ഇമേജ് -->
                <div class="post-image-container" ondblclick="toggleLike('${product.id}')">
                    <img src="${imageUrl}" alt="${product.name}" class="post-image" onclick="showProductDetail('${product.id}')" onerror="this.src='https://placehold.co/600x600/efefef/262626?text=Image+Error'">
                </div>
                
                <!-- പോസ്റ്റ് ആക്ഷനുകൾ -->
                <div class="post-actions">
                    <button class="${likeIconClass}" onclick="toggleLike('${product.id}')">
                        <i class="fa-heart"></i>
                    </button>
                    <button class="action-btn" onclick="showCommentsOverlay('${product.id}')">
                        <i class="far fa-comment"></i>
                    </button>
                    <button class="action-btn" onclick="openWhatsAppChat('${product.name}', '${product.id}')">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                    <button class="action-btn action-btn-bookmark" onclick="addToCart('${product.id}')">
                        <i class="far fa-bookmark"></i>
                    </button>
                </div>
                
                <!-- ലൈക്കുകൾ -->
                <div class="post-likes">${likeCount} likes</div>
                
                <!-- വിലവിവരം -->
                <div class="post-price-info">
                    <div class="price-row">
                        <span class="original-price">₹${retailPrice.toFixed(0)}</span>
                        ${discount > 0 ? `<span class="retail-price">₹${originalPrice.toFixed(0)}</span>` : ''}
                        ${discount > 0 ? `<span class="discount-badge">${discount}% OFF</span>` : ''}
                    </div>
                </div>

                <!-- ക്യാപ്ഷൻ (പേരും വിവരണവും) -->
                <div class="post-caption">
                    <span class="username" onclick="showProductDetail('${product.id}')">${product.name}</span>
                    <span class="line-clamp-2">${product.description || ''}</span>
                </div>
                
                <!-- കമന്റുകൾ -->
                <div class="view-comments" onclick="showCommentsOverlay('${product.id}')">
                    View all ${product.commentCount || 0} comments
                </div>
                
                <!-- ടൈംസ്റ്റാമ്പ് (താൽക്കാലികം) -->
                <div class="post-timestamp">1 DAY AGO</div>
            </div>
        `;
        $homeProductListContainer.innerHTML += postHtml;
    });
}

function filterAndRenderHomeProducts(searchTerm) {
    const term = searchTerm.toLowerCase();
    const filteredProducts = allProducts.filter(product => 
        product.name.toLowerCase().includes(term) ||
        (product.brand && product.brand.toLowerCase().includes(term)) ||
        (product.description && product.description.toLowerCase().includes(term))
    );
    renderHomeProductList(filteredProducts);
}

// ========= 'All Products' Page (Grid) =========

// [പുതിയത്] പ്രൊഡക്റ്റ്സ് പേജിലെ കാറ്റഗറി ചിപ്പുകൾ
function renderProductCategoryChips(categories) {
    if (!$categoryFilters) return;
    $categoryFilters.innerHTML = '';
    
    const allChip = `
        <div class="category-chip active" data-id="all">
            <i class="fas fa-border-all"></i> All Products
        </div>`;
    $categoryFilters.innerHTML += allChip;

    categories.forEach(cat => {
        const iconClass = cat.iconClass || 'fas fa-tag';
        const chipHtml = `
            <div class="category-chip" data-id="${cat.id}">
                <i class="${iconClass}"></i> ${cat.name}
            </div>`;
        $categoryFilters.innerHTML += chipHtml;
    });
}

// [മാറ്റിയെഴുതി] പ്രൊഡക്റ്റ്സ് പേജ് ഗ്രിഡ് റെൻഡർ ചെയ്യുന്നു
function renderProductList(productsToRender) {
    if (!$productListContainer) return;
    $productListContainer.innerHTML = '';

    if (productsToRender.length === 0) {
        $productListContainer.innerHTML = '<p class="text-gray-500 text-center py-8 col-span-3">No products found in this category.</p>';
        return;
    }
    
    productsToRender.forEach(product => {
        const imageUrl = product.imageUrl || `https://placehold.co/400x400/efefef/262626?text=${encodeURIComponent(product.name)}`;
        const retailPrice = product.retailPrice || product.price || 0;

        const gridItemHtml = `
            <div class="grid-product-item" onclick="showProductDetail('${product.id}')">
                <img src="${imageUrl}" alt="${product.name}" onerror="this.src='https://placehold.co/400x400/efefef/262626?text=Image+Error'">
                <div class="grid-product-overlay">
                    <span><i class="fas fa-shopping-bag mr-2"></i> ₹${retailPrice.toFixed(0)}</span>
                </div>
            </div>
        `;
        $productListContainer.innerHTML += gridItemHtml;
    });
}

window.filterProductsByCategory = function(categoryId) {
    document.querySelectorAll('#category-filters .category-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.id === categoryId);
    });
    
    let filteredProducts;
    if (categoryId === 'all') {
        filteredProducts = allProducts;
    } else {
        filteredProducts = allProducts.filter(p => p.categoryId === categoryId);
    }
    renderProductList(filteredProducts);
}

// ========= Product Detail Page =========

// [മാറ്റിയെഴുതി] പ്രൊഡക്റ്റ് ഡീറ്റെയിൽ പേജ് കാണിക്കുന്നു
window.showProductDetail = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) { showMessage("Product not found.", 'error'); return; }

    activeProduct = product;
    currentSlideIndex = 0;
    
    const category = categoriesCache.find(c => c.id === product.categoryId);
    const categoryName = category ? category.name : 'Uncategorized';
    const categoryIcon = category ? (category.iconClass || 'fas fa-tag') : 'fas fa-tag';
    
    const isLiked = product.likes.includes(currentUserId);
    const likeIconClass = isLiked ? 'fas fa-heart action-btn liked' : 'far fa-heart action-btn';
    const likeCount = product.likes.length || 0;
    
    const originalPrice = product.price || 0;
    const retailPrice = product.retailPrice || originalPrice;
    const discount = product.discountPercentage || 0;

    const mainImageUrl = product.imageUrl || `https://placehold.co/600x600/efefef/262626?text=${encodeURIComponent(product.name)}`;
    const allImages = [mainImageUrl, ...(product.otherImages || [])].filter(url => url.length > 0);
    
    const specificationsList = (product.specifications || '')
        .split('\n')
        .filter(s => s.trim().length > 0)
        .map(s => `<li>${s.trim()}</li>`).join('');

    const detailHtml = `
        <!-- [സൂചന] ഫീഡ് പോസ്റ്റിന്റെ അതേ സ്റ്റൈൽ ഉപയോഗിക്കുന്നു -->
        <div class="feed-post">
            <!-- ഹെഡർ -->
            <div class="post-header">
                <div class="post-avatar"><i class="${categoryIcon}"></i></div>
                <div class="post-user-info">
                    <span class="post-username">${product.brand || headerSettings.shopName}</span>
                    <span class="post-category">${categoryName}</span>
                </div>
                <button class="post-menu-btn"><i class="fas fa-ellipsis-h"></i></button>
            </div>
            
            <!-- [പുതിയത്] പ്രൊഡക്റ്റ് ഡീറ്റെയിൽ കറൗസൽ -->
            <div class="detail-image-carousel">
                <div class="detail-carousel-track" style="width: ${allImages.length * 100}%">
                    ${allImages.map(imgUrl => `
                        <div class="detail-carousel-slide">
                            <img src="${imgUrl}" alt="${product.name}" onerror="this.src='https://placehold.co/600x600/efefef/262626?text=Image+Error'">
                        </div>
                    `).join('')}
                </div>
                ${allImages.length > 1 ? `
                    <button class="detail-nav-btn left" onclick="prevSlide(${allImages.length})"><i class="fas fa-chevron-left"></i></button>
                    <button class="detail-nav-btn right" onclick="nextSlide(${allImages.length})"><i class="fas fa-chevron-right"></i></button>
                    <div class="detail-carousel-dots">
                        ${allImages.map((_, index) => `<div class="detail-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`).join('')}
                    </div>
                ` : ''}
            </div>
            
            <!-- ആക്ഷനുകൾ -->
            <div class="product-detail-actions">
                <button class="${likeIconClass}" onclick="toggleLike('${product.id}')">
                    <i class="fa-heart"></i>
                </button>
                <button class="action-btn" onclick="showCommentsOverlay('${product.id}')">
                    <i class="far fa-comment"></i>
                </button>
                <button class="action-btn action-btn-bookmark" onclick="addToCart('${product.id}')">
                    <i class="far fa-bookmark"></i>
                </button>
            </div>
            <div class="post-likes">${likeCount} likes</div>

            <!-- വിവരങ്ങൾ -->
            <div class="product-detail-info">
                <div class="price-row">
                    <span class="original-price">₹${retailPrice.toFixed(0)}</span>
                    ${discount > 0 ? `<span class="retail-price">₹${originalPrice.toFixed(0)}</span>` : ''}
                    ${discount > 0 ? `<span class="discount-badge">${discount}% OFF</span>` : ''}
                </div>
            </div>
            
            <!-- വിവരണം -->
            <div class="product-detail-description">
                <span class="username">${product.name}</span>
                <p>${product.description || 'No description available.'}</p>
            </div>

            <!-- സ്പെസിഫിക്കേഷൻസ് -->
            ${specificationsList.length > 0 ? `
                <div class="product-detail-specs">
                    <h3>Specifications</h3>
                    <ul>${specificationsList}</ul>
                </div>
            ` : ''}
            
            <!-- ബട്ടണുകൾ -->
            <div class="product-detail-buttons">
                <button class="post-cart-btn" onclick="addToCart('${product.id}')">
                    <i class="fas fa-shopping-bag mr-2"></i> Add to Cart
                </button>
                <button class="post-whatsapp-btn" onclick="openWhatsAppChat('${product.name}', '${product.id}')">
                    <i class="fab fa-whatsapp mr-2"></i> Chat on WhatsApp
                </button>
            </div>
        </div>
    `;
    
    $productDetailContainer.innerHTML = detailHtml;
    showPage('product-detail');
}

// [പുതിയത്] ഡീറ്റെയിൽ കറൗസൽ ഫംഗ്ഷനുകൾ
function updateDetailCarousel(slideCount) {
    const track = document.querySelector('.detail-carousel-track');
    const dots = document.querySelectorAll('.detail-dot');
    if (!track) return;
    
    track.style.transform = `translateX(-${currentSlideIndex * (100 / slideCount)}%)`;
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlideIndex);
    });
}
window.nextSlide = function(slideCount) {
    currentSlideIndex = (currentSlideIndex + 1) % slideCount;
    updateDetailCarousel(slideCount);
}
window.prevSlide = function(slideCount) {
    currentSlideIndex = (currentSlideIndex - 1 + slideCount) % slideCount;
    updateDetailCarousel(slideCount);
}


// ========= Cart Page =========

// [മാറ്റിയെഴുതി] കാർട്ട് പേജ് റെൻഡർ ചെയ്യുന്നു
function renderCartPage() {
    if (!$cartItemListContainer || !$cartSummaryContainer) return;
    
    if (cart.length === 0) {
        $cartItemListContainer.innerHTML = '<p class="cart-empty-msg">Your cart is empty.</p>';
        $cartSummaryContainer.classList.add('hidden');
        return;
    }
    
    $cartItemListContainer.innerHTML = '';
    let subtotal = 0;
    let delivery = 0; // ഭാവിയിൽ ഡെലിവറി ചാർജ് കണക്കാക്കാം

    cart.forEach(item => {
        subtotal += item.price * item.quantity;
        const itemHtml = `
            <div class="cart-item-new">
                <img src="${item.imageUrl}" alt="${item.name}" class="cart-item-img-new" onerror="this.src='https://placehold.co/60x60/efefef/262626?text=Img'">
                <div class="cart-item-details-new">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price">₹${item.price.toFixed(0)} x ${item.quantity}</span>
                    <div class="cart-item-controls">
                        <button class="cart-quantity-btn-new" onclick="updateCartQuantity('${item.id}', -1)">-</button>
                        <span class="cart-quantity-display-new">${item.quantity}</span>
                        <button class="cart-quantity-btn-new" onclick="updateCartQuantity('${item.id}', 1)">+</button>
                        <button class="cart-remove-btn-new" onclick="removeFromCart('${item.id}')">Remove</button>
                    </div>
                </div>
            </div>
        `;
        $cartItemListContainer.innerHTML += itemHtml;
    });

    $cartSubtotal.textContent = `₹${subtotal.toFixed(0)}`;
    $cartDelivery.textContent = `₹${delivery.toFixed(0)}`;
    $cartTotal.textContent = `₹${(subtotal + delivery).toFixed(0)}`;
    $cartSummaryContainer.classList.remove('hidden');
}

// ========= Cart Logic (localStorage) =========

function loadCart() {
    cart = JSON.parse(localStorage.getItem('socialShopCart')) || [];
    updateCartUI();
}

function saveCart() {
    localStorage.setItem('socialShopCart', JSON.stringify(cart));
    updateCartUI();
}

function updateCartUI() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    [$cartCountDesktop, $cartCountMobile].forEach(el => {
        if (el) {
            if (totalItems > 0) {
                el.textContent = totalItems;
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }
    });
}

window.addToCart = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.retailPrice || product.price,
            imageUrl: product.imageUrl,
            quantity: 1
        });
    }
    
    saveCart();
    showMessage(`${product.name} added to cart!`, 'success');
}

window.updateCartQuantity = function(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;
    
    if (change === 1) {
        item.quantity += 1;
    } else if (change === -1) {
        item.quantity -= 1;
        if (item.quantity <= 0) {
            removeFromCart(productId);
            return;
        }
    }
    
    saveCart();
    renderCartPage(); // കാർട്ട് പേജ് റീഫ്രഷ് ചെയ്യുന്നു
}

window.removeFromCart = function(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    renderCartPage();
}

window.checkout = function() {
    if (!whatsappNumber) {
        showMessage("Checkout is not available. Admin has not set a WhatsApp number.", 'error');
        return;
    }
    
    let message = "Hello, I'd like to place an order for the following items:\n\n";
    let total = 0;
    cart.forEach(item => {
        message += `* ${item.name} (₹${item.price.toFixed(0)}) x ${item.quantity}\n`;
        total += item.price * item.quantity;
    });
    message += `\n*Total: ₹${total.toFixed(0)}*`;
    
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    
    // വേണമെങ്കിൽ ഓർഡർ ചെയ്ത ശേഷം കാർട്ട് ക്ലിയർ ചെയ്യാം
    // cart = [];
    // saveCart();
    // renderCartPage();
}

// ========= Account Page =========

window.showInfoSection = function(section) {
    const contentMap = {
        'about': { title: infoContent.aboutTitle || 'About Us', content: infoContent.aboutContent || 'N/A' },
        'conditions': { title: infoContent.conditionsTitle || 'Terms & Conditions', content: infoContent.conditionsContent || 'N/A' },
        'copyright': { title: infoContent.copyrightTitle || 'Copyright', content: infoContent.copyrightText || 'N/A' }
    };
    const data = contentMap[section];
    
    if ($infoTitle) $infoTitle.textContent = data.title;
    if ($infoContent) $infoContent.textContent = data.content;
}

// ========= Social Actions (Like, Comment, WhatsApp) =========

window.toggleLike = async function(productId) {
    if (!currentUserId) { showMessage("Please sign in to like products.", 'error'); return; }
    
    const productRef = doc(db, productsCollectionRef.path, productId);
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const isLiked = product.likes.includes(currentUserId);
    
    try {
        if (isLiked) {
            await updateDoc(productRef, { likes: arrayRemove(currentUserId) });
        } else {
            await updateDoc(productRef, { likes: arrayUnion(currentUserId) });
        }
    } catch (error) {
        console.error("Error toggling like:", error);
        showMessage("Failed to update like status.", 'error');
    }
}

window.openWhatsAppChat = function(productName, productId) {
    if (!whatsappNumber) {
        showMessage("Admin WhatsApp number is not set.", 'error');
        return;
    }
    const message = `Hello, I am interested in: ${productName} (ID: ${productId})`;
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// --- Comments Modal ---
window.showCommentsOverlay = function(productId) {
    const prod = allProducts.find(p => p.id === productId);
    if (!prod) { showMessage("Product not found.", 'error'); return; }

    activeProduct = prod;
    document.getElementById('comment-product-id').value = productId;
    
    setupCommentsListener(productId);

    $commentsModal.classList.add('show');
    $commentsBackdrop.classList.remove('hidden');
}

window.closeCommentsModal = function() {
    if (unsubscribeComments) {
        unsubscribeComments();
        unsubscribeComments = null;
    }
    $commentsModal.classList.remove('show');
    $commentsBackdrop.classList.add('hidden');
}

function setupCommentsListener(productId) {
    if (unsubscribeComments) unsubscribeComments();
    const commentsCollection = collection(productsCollectionRef, productId, 'comments');
    
    unsubscribeComments = onSnapshot(query(commentsCollection), (snapshot) => {
        let comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        comments.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        renderComments(comments);
    }, handleError("comments"));
}

function renderComments(comments) {
    const container = document.getElementById('comments-list');
    const noCommentsMsg = document.getElementById('no-comments-msg');
    if (!container || !noCommentsMsg) return;

    container.innerHTML = '';
    
    if (comments.length === 0) {
        container.appendChild(noCommentsMsg);
        noCommentsMsg.classList.remove('hidden');
        return;
    }

    noCommentsMsg.classList.add('hidden');
    
    comments.forEach(comment => {
        const date = comment.createdAt ? comment.createdAt.toDate().toLocaleDateString() : 'Just now';
        const userInitial = (comment.userName || 'G').charAt(0).toUpperCase();

        const commentHtml = `
            <div class="comment-item">
                <div class="comment-avatar">${userInitial}</div>
                <div class="comment-content">
                    <p class="comment-text">
                        <span class="comment-username">${comment.userName || 'Guest'}</span>
                        ${comment.feedback}
                    </p>
                    <div class="comment-time">${date}</div>
                </div>
            </div>
        `;
        container.innerHTML += commentHtml;
    });
}

async function handleAddComment(e) {
    e.preventDefault();
    const productId = document.getElementById('comment-product-id').value;
    let userName = document.getElementById('comment-user-name').value.trim();
    const feedback = document.getElementById('comment-feedback').value.trim();

    if (!feedback) { showMessage("Please share your feedback.", 'error'); return; }
    if (!userName) userName = "Guest";
    if (!currentUserId) { showMessage("Authentication required.", 'error'); return; }

    try {
        const commentsCollection = collection(productsCollectionRef, productId, 'comments');
        await addDoc(commentsCollection, {
            productId, userName, feedback,
            userId: currentUserId,
            createdAt: serverTimestamp()
        });
        
        // കമന്റ് കൗണ്ട് അപ്ഡേറ്റ് ചെയ്യുന്നു
        const productRef = doc(db, productsCollectionRef.path, productId);
        const product = allProducts.find(p => p.id === productId);
        if (product) {
            await updateDoc(productRef, {
                commentCount: (product.commentCount || 0) + 1
            });
        }
        
        document.getElementById('comment-feedback').value = '';
        document.getElementById('comment-user-name').value = '';
    } catch (error) {
        console.error("Error adding comment:", error);
        showMessage("Failed to post comment.", 'error');
    }
}


// --- Utility Functions ---
function showLoading(show) {
    if ($loadingSpinner) $loadingSpinner.classList.toggle('hidden', !show);
}

function showMessage(message, type = 'info') {
    if (!$messageModal || !$messageModalText) return;
    
    $messageModalText.textContent = message;
    // (നിങ്ങളുടെ പുതിയ CSS-ൽ ഈ കളർ ക്ലാസുകൾ ഇല്ല, പക്ഷെ മോഡൽ സ്റ്റൈൽ ചെയ്തിട്ടുണ്ട്)
    $messageModal.classList.remove('hidden');
}

window.closeModal = function() {
    if ($messageModal) $messageModal.classList.add('hidden');
}

function showConfirmModal(message, callback, buttonText = 'Confirm') {
    if (!$confirmModal || !$confirmModalText || !$confirmModalButton) return;
    
    $confirmModalText.textContent = message;
    $confirmModalButton.textContent = buttonText;
    confirmCallback = callback;
    $confirmModal.classList.remove('hidden');
}

window.closeConfirmModal = function(isConfirmed) {
    if ($confirmModal) $confirmModal.classList.add('hidden');
    if (confirmCallback) {
        confirmCallback(isConfirmed);
        confirmCallback = null;
    }
}