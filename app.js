// firebase-config.js-ൽ നിന്ന് ആവശ്യമായവ ഇമ്പോർട്ട് ചെയ്യുന്നു
import { 
    db, auth, APP_ID, 
    doc, onSnapshot, collection, query, 
    updateDoc, deleteDoc, arrayRemove, arrayUnion, serverTimestamp, addDoc,
    signInAnonymously 
} from './firebase-config.js';

// --- Global Instances & Caches ---
let currentUserId = null;
let allProducts = [];
let categoriesCache = []; 
let whatsappNumber = '';
let infoContent = {}; 
let headerSettings = { shopName: 'SocialShop', iconClass: 'fas fa-camera-retro' };
let cart = [];

// Firestore References
let productsCollectionRef;
let categoriesCollectionRef;
let settingsDocRef;
let infoDocRef; 

// Snapshot Unsubscribe Functions
let unsubscribeProducts = null;
let unsubscribeCategories = null; 
let unsubscribeSettings = null; 
let unsubscribeComments = null;
let unsubscribeInfo = null; 

let confirmCallback = null; 

// Current product being viewed
let activeProduct = null;

// UI State
let currentSlideIndex = 0;
let activeCategoryId = 'all'; 

// --- DOM Elements (Public Page) ---
let pages, loadingSpinner, messageModal, messageModalText, confirmModal, confirmModalText, confirmModalButton, commentsModal, commentsBackdrop;
let $shopHeaderIcon, $shopHeaderName;
let $accountUID, $accountCopyright, $infoTitle, $infoContent;
let $cartBadgeBottomNav; 
let $cartItemsContainer, $cartEmptyMsg, $cartSummarySection, $cartSubtotal, $cartTotal;
let $scrollToTopBtn;

// ========= App Initialization & Setup =========

document.addEventListener('DOMContentLoaded', () => {
    
    // DOM ഘടകങ്ങൾ എടുക്കുന്നു (Public)
    pages = document.querySelectorAll('.page');
    loadingSpinner = document.getElementById('loading-spinner');
    messageModal = document.getElementById('message-modal');
    messageModalText = document.getElementById('message-modal-text');
    confirmModal = document.getElementById('confirm-modal');
    confirmModalText = document.getElementById('confirm-modal-text');
    confirmModalButton = document.getElementById('confirm-modal-button');
    commentsModal = document.getElementById('comments-modal'); 
    commentsBackdrop = document.getElementById('comments-backdrop');
    
    $shopHeaderIcon = document.getElementById('shop-header-icon');
    $shopHeaderName = document.getElementById('shop-header-name');

    $accountUID = document.getElementById('current-auth-uid');
    $accountCopyright = document.getElementById('account-copyright-display');
    $infoTitle = document.getElementById('info-title');
    $infoContent = document.getElementById('info-content');
    
    // കാർട്ട് DOM ഘടകങ്ങൾ
    $cartBadgeBottomNav = document.getElementById('cart-item-count-bottom-nav');
    $cartItemsContainer = document.getElementById('cart-items-container');
    $cartEmptyMsg = document.getElementById('cart-empty-msg');
    $cartSummarySection = document.getElementById('cart-summary-section');
    $cartSubtotal = document.getElementById('cart-subtotal');
    $cartTotal = document.getElementById('cart-total');
    
    // Scroll to Top Button
    $scrollToTopBtn = document.getElementById('scroll-to-top-btn');
    
    if (!db || !auth) {
        console.error("Firebase is not initialized. Check firebase-config.js");
        showMessage("Application cannot start. Firebase config error.", "error");
        return;
    }

    try {
        setupAuthListener();

        // സെർച്ച് ഇൻപുട്ട് ലിസ്‌നർ
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                const searchTerm = event.target.value.toLowerCase();
                filterAndRenderHomeProducts(searchTerm);
            });
        }

        // കമന്റ് ഫോം ലിസ്‌നർ
        const commentForm = document.getElementById('add-comment-form');
        if (commentForm) {
            commentForm.addEventListener('submit', handleAddComment);
        }
        
        // കാറ്റഗറി ഫിൽറ്റർ ലിസ്‌നർ
        const categoryFilters = document.getElementById('category-filters');
        if (categoryFilters) {
            categoryFilters.addEventListener('click', (e) => {
                const chip = e.target.closest('.category-chip');
                if (chip) {
                    const categoryId = chip.dataset.id;
                    filterProductsByCategory(categoryId);
                }
            });
        }
        
        // കാർട്ട് ലോക്കൽ സ്റ്റോറേജിൽ നിന്ന് ലോഡ് ചെയ്യുന്നു
        loadCartFromStorage();
        updateCartUI();
        
        // Scroll Event Listener for Scroll-to-Top Button
        window.addEventListener('scroll', handleScroll);

    } catch (error) {
        console.error("Application initialization failed:", error);
        showMessage("Application initialization failed: " + error.message, 'error');
    }
});

// --- SCROLL TO TOP FUNCTIONALITY ---
function handleScroll() {
    if ($scrollToTopBtn) {
        if (window.pageYOffset > 300) {
            $scrollToTopBtn.classList.remove('hidden');
        } else {
            $scrollToTopBtn.classList.add('hidden');
        }
    }
}

window.scrollToTop = function() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// --- AUTH ---
function setupAuthListener() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUserId = user.uid;
            if ($accountUID) $accountUID.textContent = currentUserId;
            
            // Firestore റഫറൻസുകൾ ഇവിടെ സെറ്റ് ചെയ്യുന്നു
            productsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/products`);
            categoriesCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/categories`); 
            settingsDocRef = doc(db, `artifacts/${APP_ID}/public/data/settings/admin`);
            infoDocRef = doc(db, `artifacts/${APP_ID}/public/data/content/info`); 
            
            loadInitialData();
        } else {
            currentUserId = null;
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Anonymous authentication failed:", error);
                showMessage("Failed to connect to service. Please refresh.", "error");
            }
        }
    });
}

// --- Data Header Updater ---
function updateAppHeader(settings) {
    headerSettings = {
        shopName: settings.shopName || 'SocialShop',
        iconClass: settings.iconClass || 'fas fa-camera-retro',
        whatsappNumber: settings.whatsappNumber || ''
    };
    
    if ($shopHeaderName) $shopHeaderName.textContent = headerSettings.shopName;
    
    if ($shopHeaderIcon) {
        $shopHeaderIcon.className = '';
        $shopHeaderIcon.classList.add(...headerSettings.iconClass.split(' '));
        $shopHeaderIcon.classList.add('mr-2');
    }
    
    // Hero section shop name update
    const heroShopName = document.getElementById('hero-shop-name');
    if (heroShopName) heroShopName.textContent = headerSettings.shopName;
    
    whatsappNumber = headerSettings.whatsappNumber;
}

// --- DATA LOADING ---
function loadInitialData() {
    if (!currentUserId || !db) return;
    
    showLoading(true);
    
    // 1. Load Categories (Public)
    if (unsubscribeCategories) unsubscribeCategories();
    unsubscribeCategories = onSnapshot(categoriesCollectionRef, (snapshot) => {
        categoriesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProductPage();
    }, (error) => {
        console.error("Error fetching categories:", error);
        showMessage("Failed to load categories.", 'error');
        showLoading(false);
    });

    // 2. Load Settings (Public) - WhatsApp, Header
    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
        const settings = docSnap.exists() ? docSnap.data() : {};
        updateAppHeader(settings);
    }, (error) => {
        console.error("Error fetching settings:", error);
    });
    
    // 3. Load Products (Public)
    if (unsubscribeProducts) unsubscribeProducts();
    unsubscribeProducts = onSnapshot(productsCollectionRef, (snapshot) => {
        allProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        allProducts.forEach(p => {
            p.likes = p.likes || [];
            p.commentCount = p.commentCount || 0;
        });
        
        filterAndRenderHomeProducts('');
        renderProductList(allProducts);
        
        const productsPageEl = document.getElementById('products-page');
        if (productsPageEl && productsPageEl.classList.contains('active')) {
            filterProductsByCategory(activeCategoryId);
        }
        
        showLoading(false);
    }, (error) => {
        console.error("Error fetching products:", error);
        showMessage("Failed to load products.", 'error');
        showLoading(false);
    });
    
    // 4. Load Info Content (Public)
    if (unsubscribeInfo) unsubscribeInfo();
    unsubscribeInfo = onSnapshot(infoDocRef, (docSnap) => {
        infoContent = docSnap.exists() ? docSnap.data() : {};
        
        renderAccountPageExtras(infoContent); 
        
        showInfoSection('about');
        if ($accountCopyright) $accountCopyright.textContent = infoContent.copyrightText || '© 2024 SocialShop. All rights reserved.';

    }, (error) => {
        console.error("Error fetching info content:", error);
    });
}
    
// --- Account Page Content Handlers ---
    
window.showInfoSection = function(section) {
    const contentMap = {
        'about': {
            title: infoContent.aboutTitle || 'About Us',
            content: infoContent.aboutContent || 'Information not available. Admin needs to update this section.'
        },
        'conditions': {
            title: infoContent.conditionsTitle || 'Terms & Conditions',
            content: infoContent.conditionsContent || 'Terms not available. Admin needs to update this section.'
        },
        'copyright': {
            title: infoContent.copyrightTitle || 'Copyright Notice',
            content: infoContent.copyrightText || 'Copyright notice not found.'
        }
    };
    
    const data = contentMap[section];
    if ($infoTitle) $infoTitle.textContent = data.title;
    if ($infoContent) $infoContent.innerText = data.content; 
}

// Render Follow/Contact Links on Account Page
function renderAccountPageExtras(data) {
    const $followSection = document.getElementById('follow-us-section');
    const $contactSection = document.getElementById('contact-us-section');
    
    const $whatsappLink = document.getElementById('follow-whatsapp-link');
    const $instagramLink = document.getElementById('follow-instagram-link');
    const $facebookLink = document.getElementById('follow-facebook-link');
    const $youtubeLink = document.getElementById('follow-youtube-link');
    
    const $phoneLink = document.getElementById('contact-phone-link');
    const $phoneText = document.getElementById('contact-phone-text');
    const $emailLink = document.getElementById('contact-email-link');
    const $emailText = document.getElementById('contact-email-text');
    
    if (!$followSection || !$contactSection || !$whatsappLink || !$instagramLink || !$facebookLink || !$youtubeLink || !$phoneLink || !$phoneText || !$emailLink || !$emailText) {
        console.warn('Follow/Contact UI elements missing from DOM.');
        return;
    }
    
    let hasFollowLinks = false;
    let hasContactInfo = false;
    
    if (data.followWhatsapp) {
        $whatsappLink.href = data.followWhatsapp;
        $whatsappLink.classList.remove('hidden');
        hasFollowLinks = true;
    } else { $whatsappLink.classList.add('hidden'); }
    
    if (data.followInstagram) {
        $instagramLink.href = data.followInstagram;
        $instagramLink.classList.remove('hidden');
        hasFollowLinks = true;
    } else { $instagramLink.classList.add('hidden'); }
    
    if (data.followFacebook) {
        $facebookLink.href = data.followFacebook;
        $facebookLink.classList.remove('hidden');
        hasFollowLinks = true;
    } else { $facebookLink.classList.add('hidden'); }
    
    if (data.followYoutube) {
        $youtubeLink.href = data.followYoutube;
        $youtubeLink.classList.remove('hidden');
        hasFollowLinks = true;
    } else { $youtubeLink.classList.add('hidden'); }
    
    if (data.contactPhone) {
        $phoneText.textContent = data.contactPhone;
        $phoneLink.href = 'tel:' + data.contactPhone.replace(/[^0-9+]/g, '');
        $phoneLink.classList.remove('hidden');
        hasContactInfo = true;
    } else { $phoneLink.classList.add('hidden'); }
    
    if (data.contactEmail) {
        $emailText.textContent = data.contactEmail;
        $emailLink.href = 'mailto:' + data.contactEmail;
        $emailLink.classList.remove('hidden');
        hasContactInfo = true;
    } else { $emailLink.classList.add('hidden'); }
    
    $followSection.classList.toggle('hidden', !hasFollowLinks);
    $contactSection.classList.toggle('hidden', !hasContactInfo);
}


// ========= UI NAVIGATION & RENDERING =========

// --- Main Page Navigation ---
window.showPage = function(pageId) {
    if (!pages) return; 
    
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    // പ്രൊഡക്റ്റ് ഡീറ്റെയിൽ പേജിൽ മാത്രം താഴത്തെ നാവിഗേഷൻ ബാർ മറയ്ക്കുന്നു
    const mainMobileNav = document.getElementById('main-mobile-nav');
    if (mainMobileNav) {
        if (pageId === 'product-detail') {
            mainMobileNav.classList.add('hidden');
        } else {
            mainMobileNav.classList.remove('hidden');
        }
    }

    if (pageId === 'products') {
        renderProductPage(); 
    }
    if (pageId === 'account') {
        showInfoSection('about');
    }
    if (pageId === 'cart') {
        renderCartPage();
    }

    if (pageId !== 'product-detail') {
        closeCommentsModal();
    }

    // നാവിഗേഷൻ ലിങ്കുകളുടെ ആക്റ്റീവ് സ്റ്റേറ്റ് അപ്‌ഡേറ്റ് ചെയ്യുന്നു
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('text-indigo-600', 'font-semibold', 'active-mobile-link');
        link.classList.add('text-gray-500');
        
        const onclickAttr = link.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${pageId}'`)) {
            link.classList.add('text-indigo-600', 'font-semibold', 'active-mobile-link');
            link.classList.remove('text-gray-500');
        }
    });
    
    window.scrollTo(0, 0);
}

// ഹോം പേജിൽ നിന്ന് കാറ്റഗറി പേജിലേക്ക് പോകാൻ
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

// ഡിസ്‌കൗണ്ട് വില നൽകുന്നു
function getDiscountedPrice(product) {
    const price = product.price || 0;
    const retailPrice = product.retailPrice || price; 
    return retailPrice;
}

// ക്ലിപ്പ്ബോർഡിലേക്ക് കോപ്പി ചെയ്യാൻ
function copyTextToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed'; 
    textarea.style.opacity = 0;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        const successful = document.execCommand('copy');
        return successful;
    } catch (err) {
        console.error('Copy command failed:', err);
        return false;
    } finally {
        document.body.removeChild(textarea);
    }
}

// കാറ്റഗറി ഐക്കൺ നൽകുന്നു
function getCategoryIcon(categoryId) {
    if (!categoryId) return 'fas fa-tag';
    const category = categoriesCache.find(c => c.id === categoryId);
    return category ? (category.iconClass || 'fas fa-tag') : 'fas fa-tag';
}


// --- Product List Renderers (Home - Social Feed Style) ---
// "Show More" / "Show Less" ബട്ടൺ
window.toggleDescription = function(productId, buttonElement) {
    const descEl = document.getElementById(`desc-${productId}`);
    if (!descEl || !buttonElement) return;
    if (descEl.classList.contains('line-clamp-3')) {
        descEl.classList.remove('line-clamp-3');
        buttonElement.textContent = 'Show Less';
    } else {
        descEl.classList.add('line-clamp-3');
        buttonElement.textContent = 'Show More';
    }
}

// ഹോം പേജിലെ പ്രൊഡക്റ്റ് ലിസ്റ്റ് റെൻഡർ ചെയ്യുന്നു
function renderHomeProductList(productsToRender) {
    const container = document.getElementById('home-product-list-container');
    if (!container) return;
    container.innerHTML = '';
    if (productsToRender.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8 bg-white rounded-lg shadow-md">No products available.</p>';
        return;
    }
    productsToRender.forEach(product => {
        const imageUrl = product.imageUrl || `https://placehold.co/600x400/E2E8F0/333?text=${encodeURIComponent(product.name)}`;
        const originalPrice = product.price || 0;
        const retailPrice = product.retailPrice || originalPrice;
        const discount = product.discountPercentage || 0;
        const discountedPrice = retailPrice.toFixed(0);
        const categoryName = product.categoryName || 'General';
        const categoryIcon = getCategoryIcon(product.categoryId);
        const isLiked = product.likes.includes(currentUserId);
        const likeIconClass = isLiked ? 'fas' : 'far';
        const likeCount = product.likes.length || 0;
        const brandHtml = product.brand ? `<p class="text-sm font-medium text-gray-500 mb-1">${product.brand}</p>` : '';
        const description = product.description || '';
        const descriptionId = `desc-${product.id}`;
        let descriptionHtml = '';
        if (description) {
            const isLong = description.length > 150 || description.split('\n').length > 3; 
            descriptionHtml = `
            <div class="mt-3 pt-3 border-t">
                <p id="${descriptionId}" class="text-sm text-gray-600 whitespace-pre-wrap ${isLong ? 'line-clamp-3' : ''}">${description}</p>
                ${isLong ? `<button class="text-sm font-medium text-indigo-600 hover:text-indigo-800 mt-1" onclick="toggleDescription('${product.id}', this)">Show More</button>` : ''}
            </div>`;
        }
        
        const card = `
            <div class="bg-white rounded-lg shadow-md overflow-hidden pb-4">
                <div class="flex items-center p-3">
                    <div class="flex items-center flex-grow cursor-pointer" onclick="navigateToCategory('${product.categoryId}')">
                        <div class="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center mr-3 flex-shrink-0">
                            <i class="${categoryIcon} text-indigo-500 text-lg"></i>
                        </div>
                        <div class="flex-grow">
                            <span class="font-semibold text-gray-800">${categoryName}</span>
                        </div>
                    </div>
                    <i class="fas fa-ellipsis-v text-gray-400 cursor-pointer"></i>
                </div>
                <div class="cursor-pointer" onclick="showProductDetail('${product.id}')">
                    <img src="${imageUrl}" alt="${product.name}" class="w-full object-cover max-h-[400px]" onerror="this.src='https://placehold.co/600x400/E2E8F0/333?text=Image+Error'">
                </div>
                <div class="p-3">
                    <div class="flex items-center space-x-5 mb-3 border-b pb-3">
                        <button class="flex items-center text-red-500 hover:text-red-700 transition duration-150" onclick="toggleLike('${product.id}')">
                            <i class="${likeIconClass} fa-heart text-2xl"></i>
                            <span class="ml-2 text-sm font-semibold">${likeCount}</span>
                        </button>
                        <button class="flex items-center text-gray-600 hover:text-blue-500 transition duration-150" onclick="showCommentsOverlay('${product.id}', '${product.name}')">
                            <i class="far fa-comment text-2xl"></i>
                            <span class="ml-2 text-sm font-semibold">${product.commentCount || 0}</span>
                        </button>
                        
                        <button class="text-gray-600 hover:text-indigo-500 transition duration-150 ml-auto p-2" onclick="addToCart('${product.id}')" title="Add to Cart">
                            <i class="far fa-bookmark text-2xl"></i>
                        </button>
                    </div>
                    <div class="cursor-pointer" onclick="showProductDetail('${product.id}')">
                        ${brandHtml} 
                        <h3 class="text-lg font-bold text-gray-800 mb-1">${product.name}</h3>
                        <div class="text-xl font-bold mb-1 flex items-baseline">
                            <span class="text-green-600 mr-2">₹${discountedPrice}</span>
                            ${discount > 0 ? `<span class="text-gray-500 line-through text-sm mr-1">₹${originalPrice.toFixed(0)}</span>` : ''}
                            ${discount > 0 ? `<span class="text-red-500 text-sm">(${discount}% Off)</span>` : ''}
                        </div>
                    </div>
                    ${descriptionHtml}
                </div>
            </div>`;
        container.innerHTML += card;
    });
}

// ഹോം പേജിലെ സെർച്ച് ഫിൽറ്റർ
function filterAndRenderHomeProducts(searchTerm) {
    const filteredProducts = allProducts.filter(product => 
        product.name.toLowerCase().includes(searchTerm) || 
        (product.description && product.description.toLowerCase().includes(searchTerm)) ||
        product.id.toLowerCase().includes(searchTerm) ||
        (product.categoryName && product.categoryName.toLowerCase().includes(searchTerm))
    );
    renderHomeProductList(filteredProducts);
}

// --- Category Filtering Logic for Products Page (Client Side) ---
// കാറ്റഗറി ചിപ്പുകൾ റെൻഡർ ചെയ്യുന്നു
function renderProductPage() {
    const filterContainer = document.getElementById('category-filters');
    if (!filterContainer) return;
    filterContainer.innerHTML = '';
    const allChip = document.createElement('div');
    allChip.className = `category-chip ${activeCategoryId === 'all' ? 'active' : ''}`;
    allChip.dataset.id = 'all';
    allChip.innerHTML = `<i class="fas fa-border-all mr-2"></i> All Products`;
    filterContainer.appendChild(allChip);
    categoriesCache.forEach(cat => {
        const chip = document.createElement('div');
        const iconClass = cat.iconClass || 'fas fa-tag';
        chip.className = `category-chip ${activeCategoryId === cat.id ? 'active' : ''}`;
        chip.dataset.id = cat.id;
        chip.innerHTML = `<i class="${iconClass} mr-2"></i> ${cat.name}`;
        filterContainer.appendChild(chip);
    });
    filterProductsByCategory(activeCategoryId);
}

// കാറ്റഗറി അനുസരിച്ച് പ്രൊഡക്റ്റുകൾ ഫിൽറ്റർ ചെയ്യുന്നു
window.filterProductsByCategory = function(categoryId) {
    activeCategoryId = categoryId;
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

// 'All Products' പേജിലെ പ്രൊഡക്റ്റ് ഗ്രിഡ് റെൻഡർ ചെയ്യുന്നു
function renderProductList(productsToRender) {
    const container = document.getElementById('product-list-container');
    if (!container) return;
    container.innerHTML = '';
     if (productsToRender.length === 0) {
        container.innerHTML = '<p class="text-gray-500 w-full col-span-2 text-center py-8">No products found in this category.</p>';
        return;
    }
    productsToRender.forEach(product => {
        const imageUrl = product.imageUrl || `https://placehold.co/400x300/E2E8F0/333?text=${encodeURIComponent(product.name)}`;
        const originalPrice = product.price || 0;
        const retailPrice = product.retailPrice || originalPrice;
        const discount = product.discountPercentage || 0;
        const discountedPrice = retailPrice.toFixed(0);
        let deliveryBadge = '';
        if (product.freeDelivery) {
            deliveryBadge = `<span class="bg-blue-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center"><i class="fas fa-truck mr-1 text-xs"></i> Free Delivery</span>`;
        } else if (product.deliveryCharge > 0) {
             deliveryBadge = `<span class="bg-black bg-opacity-70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center"><i class="fas fa-shipping-fast mr-1 text-xs"></i> ₹${product.deliveryCharge.toFixed(0)}</span>`;
        }
        const brandBadge = product.brand ? `<span class="bg-black bg-opacity-70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">${product.brand}</span>` : '';
        
        const card = `
            <div class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition duration-300 flex flex-col">
                <div onclick="showProductDetail('${product.id}')" class="relative cursor-pointer">
                    <img src="${imageUrl}" alt="${product.name}" class="w-full h-48 sm:h-56 object-cover" onerror="this.src='https://placehold.co/400x300/E2E8F0/333?text=Image+Error'">
                    <div class="absolute top-2 left-2">${brandBadge}</div>
                    <div class="absolute bottom-2 left-2">${deliveryBadge}</div>
                </div>
                <div class="p-3 sm:p-4 flex flex-col flex-grow">
                    <h3 class="text-sm sm:text-base font-bold text-gray-800 mb-2 cursor-pointer" onclick="showProductDetail('${product.id}')" title="${product.name}">${product.name}</h3>
                    <div class="mb-3">
                        <span class="text-lg sm:text-xl font-bold text-gray-900 mr-2">₹${discountedPrice}</span>
                        ${discount > 0 ? `<span class="text-gray-500 line-through text-xs sm:text-sm mr-1">₹${originalPrice.toFixed(0)}</span><span class="text-green-600 text-xs sm:text-sm font-semibold">${discount}% Off</span>` : ''}
                    </div>
                    
                    <div class="flex gap-2 mt-auto">
                        <button class="w-1/2 bg-green-500 text-white font-bold py-2 px-3 rounded-lg hover:bg-green-600 transition duration-300 text-sm" onclick="openWhatsAppChat('${product.name}', '${product.id}')">
                            <i class="fab fa-whatsapp mr-1 sm:mr-2"></i> Chat
                        </button>
                        <button class="w-1/2 bg-indigo-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-indigo-700 transition duration-300 text-sm" onclick="addToCart('${product.id}')">
                            <i class="fas fa-cart-plus mr-1 sm:mr-2"></i> Add
                        </button>
                    </div>
                </div>
            </div>`;
        container.innerHTML += card;
    });
}
    
// --- Product Detail Page ---
window.showProductDetail = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        showMessage("Product not found.", 'error');
        return;
    }
    
    activeProduct = product;
    currentSlideIndex = 0; 
    
    const container = document.getElementById('product-detail-container');
    if (!container) return;
    
    const mainImageUrl = product.imageUrl || `https://placehold.co/800x600/E2E8F0/333?text=${encodeURIComponent(product.name)}`;
    const allImages = [mainImageUrl, ...(product.otherImages || [])].filter(url => url.length > 0);
    
    const originalPrice = product.price || 0;
    const retailPrice = product.retailPrice || originalPrice;
    const discount = product.discountPercentage || 0;
    const discountedPrice = retailPrice.toFixed(0);
    
    const specificationsList = (product.specifications || '')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => `<li class="text-sm text-gray-700 list-disc ml-4">${s}</li>`).join('');

    const categoryName = product.categoryName || 'General';
    const categoryIcon = getCategoryIcon(product.categoryId);
    
    const isLiked = product.likes.includes(currentUserId);
    const likeIconClass = isLiked ? 'fas' : 'far';
    const likeCount = product.likes.length || 0;
    const commentCount = product.commentCount || 0;
    
    let deliveryBadge = '';
    if (product.freeDelivery) {
        deliveryBadge = `<div class="bg-indigo-500 text-white text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center mt-3"><i class="fas fa-truck mr-2"></i> Free Delivery</div>`;
    } else if (product.deliveryCharge > 0) {
         deliveryBadge = `<div class="bg-gray-700 text-white text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center mt-3"><i class="fas fa-shipping-fast mr-2"></i> Delivery: ₹${product.deliveryCharge.toFixed(0)}</div>`;
    }
    
    const slidesHtml = allImages.map((imgUrl, index) => `
        <div class="carousel-slide"><img src="${imgUrl}" alt="Product Image ${index + 1}" class="object-contain w-full h-full" onerror="this.src='https://placehold.co/800x600/E2E8F0/333?text=Image+Error'"></div>
    `).join('');

    const dotsHtml = allImages.map((_, index) => `
        <div class="dot ${index === 0 ? 'active' : ''}" onclick="goToSlide(${index})"></div>
    `).join('');


    container.innerHTML = `
        <div class="flex items-center justify-between p-3 bg-white border-b sticky top-0 z-10">
            <button onclick="showPage('home')" class="text-gray-600 hover:text-indigo-600">
                   <i class="fas fa-arrow-left"></i>
            </button>
            <div class="flex items-center">
                <i class="${categoryIcon} text-indigo-500 mr-2"></i> 
                <span class="text-md font-semibold text-gray-800">${categoryName}</span>
            </div>
            <div class="text-lg text-gray-500 cursor-pointer">
                <i class="fas fa-ellipsis-v"></i>
            </div>
        </div>
        
        <div class="carousel-container">
            <div id="image-carousel-track" class="carousel-track">${slidesHtml}</div>
            ${allImages.length > 1 ? `<div class="carousel-dots">${dotsHtml}</div>` : ''}
            ${allImages.length > 1 ? `
                <button class="carousel-nav-btn absolute left-2" onclick="prevSlide()"><i class="fas fa-chevron-left"></i></button>
                <button class="carousel-nav-btn absolute right-2" onclick="nextSlide()"><i class="fas fa-chevron-right"></i></button>
            ` : ''}
        </div>
        
        <div class="fixed bottom-0 left-0 right-0 p-3 z-30 flex justify-center w-full max-w-xl mx-auto md:px-4 space-x-2 bg-white border-t border-gray-200">
            <button class="w-1/2 flex items-center justify-center bg-indigo-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-indigo-700 transition duration-300 transform hover:scale-[1.01]" id="add-to-cart-btn">
                <i class="fas fa-cart-plus text-lg mr-2"></i>
                Add to Cart
            </button>
            <button class="w-1/2 flex items-center justify-center bg-green-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-green-600 transition duration-300 transform hover:scale-[1.01]" onclick="openWhatsAppChat('${product.name}', '${product.id}')">
                <i class="fab fa-whatsapp text-2xl mr-2"></i>
                Chat
            </button>
        </div>

        <div class="p-4 bg-white border-b">
            <div class="flex items-center space-x-5 border-b pb-3 mb-3">
                <button class="flex items-center text-red-500 hover:text-red-700 transition duration-150" onclick="toggleLike('${product.id}')">
                    <i id="detail-like-icon" class="${likeIconClass} fa-heart text-2xl"></i>
                    <span id="detail-like-count" class="ml-2 text-sm font-semibold">${likeCount}</span>
                </button>
                <button class="flex items-center text-gray-600 hover:text-blue-500 transition duration-150" onclick="showCommentsOverlay('${product.id}', '${product.name}')">
                    <i class="far fa-comment text-2xl"></i>
                    <span id="detail-comment-count" class="ml-2 text-sm font-semibold">${commentCount}</span>
                </button>
            </div>
            
            <h1 class="text-2xl font-bold text-gray-800 mb-1">${product.name}</h1>
            <div class="text-3xl font-bold mb-4 flex items-baseline flex-wrap">
                <span class="text-green-600 mr-3">₹${discountedPrice}</span>
                ${discount > 0 ? `<span class="text-gray-500 line-through text-xl mr-2">₹${originalPrice.toFixed(0)}</span>` : ''}
                ${discount > 0 ? `<span class="text-red-500 text-lg">(${discount}% Off)</span>` : ''}
            </div>
            ${deliveryBadge}
            <h2 class="text-xl font-bold text-gray-800 mb-2 mt-4 border-t pt-4">Description</h2>
            <p class="text-gray-700 mb-6 whitespace-pre-wrap">${product.description || 'No detailed description available.'}</p>
            ${specificationsList.length > 0 ? `
            <div class="mb-6">
                <h2 class="text-xl font-bold text-gray-800 mb-2">Specifications / Key Features</h2>
                <ul class="list-none space-y-1">${specificationsList}</ul>
            </div>
            ` : ''}
        </div>
        <div class="h-32 sm:h-40"></div> 
    `;
    showPage('product-detail');
    updateCarousel(); 
    
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    if (addToCartBtn) {
        addToCartBtn.onclick = () => addToCart(product.id);
    }
}

// --- CAROUSEL FUNCTIONS ---
function updateCarousel() {
    const track = document.getElementById('image-carousel-track');
    const dotsContainer = document.querySelector('#product-detail-container .carousel-dots');
    if (!track) return;
    const totalSlides = track.children.length;
    if (totalSlides === 0) return;
    if (currentSlideIndex >= totalSlides) currentSlideIndex = 0;
    if (currentSlideIndex < 0) currentSlideIndex = totalSlides - 1;
    track.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
    if (dotsContainer) {
        const dots = dotsContainer.querySelectorAll('.dot');
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentSlideIndex);
        });
    }
}

window.goToSlide = function(index) {
    const track = document.getElementById('image-carousel-track');
    if (!track) return;
    const totalSlides = track.children.length;
    if (index >= 0 && index < totalSlides) {
        currentSlideIndex = index;
        updateCarousel();
    }
}

window.prevSlide = function() {
    const track = document.getElementById('image-carousel-track');
    if (!track) return;
    const totalSlides = track.children.length;
    if (totalSlides <= 1) return;
    currentSlideIndex = (currentSlideIndex - 1 + totalSlides) % totalSlides;
    updateCarousel();
};

window.nextSlide = function() {
    const track = document.getElementById('image-carousel-track');
    if (!track) return;
    const totalSlides = track.children.length;
    if (totalSlides <= 1) return;
    currentSlideIndex = (currentSlideIndex + 1) % totalSlides;
    updateCarousel();
};
    
// --- WHATSAPP CHAT FUNCTION ---
window.openWhatsAppChat = function(productName, productId) {
    if (!whatsappNumber) {
        showMessage("Admin WhatsApp number is not set. Please set it in the Admin Panel.", 'error');
        return;
    }
    const message = `Hello, I am interested in the product: ${productName}. Could you provide more details? (Product ID: ${productId})`;
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// കാർട്ടിലെ സാധനങ്ങൾ ചേർത്ത് WhatsApp-ലേക്ക് പോകാനുള്ള ഫംഗ്ഷൻ
window.openWhatsAppChatForCart = function() {
    if (!whatsappNumber) {
        showMessage("Admin WhatsApp number is not set.", 'error');
        return;
    }
    if (cart.length === 0) {
        showMessage("Your cart is empty.", 'error');
        return;
    }

    let message = "Hello, I would like to order the following items:\n\n";
    let total = 0;

    cart.forEach(item => {
        message += `* ${item.name} (x ${item.quantity}) - ₹${(item.price * item.quantity).toFixed(2)}\n`;
        total += item.price * item.quantity;
    });

    message += `\n*Total: ₹${total.toFixed(2)}*`;
    
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

window.shareProductLink = function(productName, productId) {
    const linkText = `Check out this product: ${productName}! (ID: ${productId}).`;
    if (copyTextToClipboard(linkText)) {
        showMessage("Product details copied to clipboard. Share the link!", 'success');
    } else {
        showMessage("Failed to copy link. Please try manually.", 'error');
    }
}

// --- LIKE FUNCTION ---
window.toggleLike = async function(productId) {
    if (!currentUserId) {
        showMessage("You must be signed in to like a product.", 'error');
        return;
    }
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

// --- COMMENT FUNCTIONS (Overlay) ---
window.showCommentsOverlay = function(productId, productName) {
    const prod = allProducts.find(p => p.id === productId);
    if (!prod) { showMessage("Product not found.", 'error'); return; }
    activeProduct = prod;
    const commentProductName = document.getElementById('comment-product-name');
    const commentProductId = document.getElementById('comment-product-id');
    if (commentProductName) commentProductName.textContent = prod.name;
    if (commentProductId) commentProductId.value = productId;
    setupCommentsListener(productId);
    if (commentsModal) commentsModal.classList.add('show');
    if (commentsBackdrop) commentsBackdrop.classList.remove('hidden');
}

window.closeCommentsModal = function() {
    if (unsubscribeComments) {
        unsubscribeComments(); 
        unsubscribeComments = null;
    }
    if (commentsModal) commentsModal.classList.remove('show');
    if (commentsBackdrop) commentsBackdrop.classList.add('hidden');
}

function setupCommentsListener(productId) {
    if (unsubscribeComments) unsubscribeComments();
    const commentsCollection = collection(productsCollectionRef, productId, 'comments');
    unsubscribeComments = onSnapshot(query(commentsCollection), (snapshot) => {
        let comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        comments.sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.toDate().getTime() : 0;
            const timeB = b.createdAt ? b.createdAt.toDate().getTime() : 0;
            return timeB - timeA;
        });
        renderComments(comments);
        const productIndex = allProducts.findIndex(p => p.id === productId);
        if (productIndex !== -1) {
            allProducts[productIndex].commentCount = comments.length;
            const homePageEl = document.getElementById('home-page');
            const searchInputEl = document.getElementById('search-input');
            if (homePageEl && homePageEl.classList.contains('active') && searchInputEl && searchInputEl.value === '') {
                renderHomeProductList(allProducts); 
            }
        }
    }, (error) => {
        console.error("Error fetching comments:", error);
        showMessage("Failed to load comments.");
    });
}

function renderComments(comments) {
    const container = document.getElementById('comments-list');
    const noCommentsMsg = document.getElementById('no-comments-msg');
    if (!container || !noCommentsMsg) {
        console.warn("Comments UI elements are missing. Skipping render.");
        return;
    }
    container.innerHTML = '';
    if (comments.length === 0) {
        container.appendChild(noCommentsMsg);
        noCommentsMsg.classList.remove('hidden'); 
        const detailCount = document.getElementById('detail-comment-count');
        if (detailCount) detailCount.textContent = 0;
        return;
    }
    noCommentsMsg.classList.add('hidden');
    comments.forEach(comment => {
        const date = comment.createdAt ? comment.createdAt.toDate().toLocaleString() : 'Just now';
        const commentHtml = `
            <div class="border-b pb-3">
                   <div class="flex items-start mb-1">
                        <div class="bg-gray-200 h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold mr-3 flex-shrink-0">
                            ${comment.userName.charAt(0).toUpperCase()}
                        </div>
                        <div class="flex-grow">
                            <div class="flex items-baseline space-x-2">
                                <span class="font-bold text-gray-800">${comment.userName}</span>
                                <span class="text-xs text-gray-500">${date}</span>
                            </div>
                            <p class="text-gray-700 whitespace-pre-wrap">${comment.feedback}</p>
                        </div>
                    </div>
            </div>`;
        container.innerHTML += commentHtml;
    });
    const countDisplay = document.getElementById('detail-comment-count');
    if (countDisplay) {
         countDisplay.textContent = comments.length;
    }
    container.scrollTop = 0;
}

async function handleAddComment(e) {
    e.preventDefault();
    const productIdInput = document.getElementById('comment-product-id');
    const userNameInput = document.getElementById('comment-user-name');
    const feedbackInput = document.getElementById('comment-feedback');
    
    if (!productIdInput || !userNameInput || !feedbackInput) return;
    
    const productId = productIdInput.value;
    let userName = userNameInput.value.trim();
    const feedback = feedbackInput.value.trim();
    
    if (!feedback) { 
        showMessage("Please share your feedback.", 'error'); 
        return; 
    }
    if (!userName) {
        userName = "Guest User";
    }
    if (!currentUserId) { showMessage("You must be authenticated to post a comment.", 'error'); return; }
    try {
        const commentsCollection = collection(productsCollectionRef, productId, 'comments');
        await addDoc(commentsCollection, {
            productId, userName, feedback,
            userId: currentUserId,
            createdAt: serverTimestamp()
        });
        const productRef = doc(db, productsCollectionRef.path, productId);
        const product = allProducts.find(p => p.id === productId);
        if (product) {
            await updateDoc(productRef, {
                commentCount: (product.commentCount || 0) + 1 
            });
        }
        feedbackInput.value = '';
        userNameInput.value = ''; 
    } catch (error) {
        console.error("Error adding comment:", error);
        showMessage("Failed to post comment.", 'error');
    }
}
    

// ---------------------------------------------------
// കാർട്ടിനു വേണ്ടിയുള്ള ഫംഗ്ഷനുകൾ
// ---------------------------------------------------

// 1. ലോക്കൽ സ്റ്റോറേജിൽ നിന്ന് കാർട്ട് ലോഡ് ചെയ്യുന്നു
function loadCartFromStorage() {
    try {
        cart = JSON.parse(localStorage.getItem('socialShopCart')) || [];
    } catch (error) {
        console.error('Error loading cart from storage:', error);
        cart = [];
    }
}

// 2. കാർട്ട് ലോക്കൽ സ്റ്റോറേജിലേക്ക് സേവ് ചെയ്യുന്നു
function saveCartToStorage() {
    try {
        localStorage.setItem('socialShopCart', JSON.stringify(cart));
    } catch (error) {
        console.error('Error saving cart to storage:', error);
    }
}

// 3. കാർട്ട് ബാഡ്ജ് അപ്‌ഡേറ്റ് ചെയ്യുന്നു
function updateCartUI() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    const badges = [$cartBadgeBottomNav];
    
    badges.forEach(badge => {
        if (badge) {
            badge.textContent = totalItems;
            badge.classList.toggle('hidden', totalItems === 0);
        }
    });
}

// 4. കാർട്ടിലേക്ക് പ്രൊഡക്റ്റ് ചേർക്കുന്നു
window.addToCart = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        showMessage("Could not find product to add.", "error");
        return;
    }

    const existingItem = cart.find(item => item.id === productId);
    const retailPrice = product.retailPrice || product.price || 0;

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: retailPrice,
            imageUrl: product.imageUrl || `https://placehold.co/80x80/E2E8F0/333?text=Img`,
            quantity: 1
        });
    }

    saveCartToStorage();
    updateCartUI();
    showMessage(`${product.name} added to cart!`, 'success');
}

// 5. കാർട്ട് പേജ് റെൻഡർ ചെയ്യുന്നു
window.renderCartPage = function() {
    if (!$cartItemsContainer || !$cartEmptyMsg || !$cartSummarySection) return;

    if (cart.length === 0) {
        $cartEmptyMsg.classList.remove('hidden');
        $cartItemsContainer.classList.add('hidden');
        $cartSummarySection.classList.add('hidden');
    } else {
        $cartEmptyMsg.classList.add('hidden');
        $cartItemsContainer.classList.remove('hidden');
        $cartSummarySection.classList.remove('hidden');

        $cartItemsContainer.innerHTML = '';
        let subtotal = 0;

        cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;

            const itemHtml = `
                <div class="cart-item">
                    <img src="${item.imageUrl}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://placehold.co/80x80/E2E8F0/333?text=Error'">
                    <div class="cart-item-details">
                        <h3 class="font-bold text-gray-800">${item.name}</h3>
                        <p class="text-indigo-600 font-semibold text-sm">₹${item.price.toFixed(2)}</p>
                        <button class="cart-remove-btn mt-1" onclick="removeFromCart('${item.id}')">
                            <i class="fas fa-trash-alt mr-1"></i>Remove
                        </button>
                    </div>
                    <div class="cart-quantity-controls">
                        <button class="cart-quantity-btn" onclick="updateCartQuantity('${item.id}', -1)">-</button>
                        <span class="cart-quantity-display">${item.quantity}</span>
                        <button class="cart-quantity-btn" onclick="updateCartQuantity('${item.id}', 1)">+</button>
                    </div>
                </div>
            `;
            $cartItemsContainer.innerHTML += itemHtml;
        });

        if ($cartSubtotal) $cartSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
        if ($cartTotal) $cartTotal.textContent = `₹${subtotal.toFixed(2)}`;
    }
}

// 6. കാർട്ട് ക്വാണ്ടിറ്റി അപ്‌ഡേറ്റ് ചെയ്യുന്നു
window.updateCartQuantity = function(productId, change) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    item.quantity += change;

    if (item.quantity <= 0) {
        removeFromCart(productId);
    } else {
        saveCartToStorage();
        renderCartPage();
        updateCartUI();
    }
}

// 7. കാർട്ടിൽ നിന്ന് നീക്കം ചെയ്യുന്നു
window.removeFromCart = function(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCartToStorage();
    renderCartPage();
    updateCartUI();
    showMessage("Item removed from cart.", 'info');
}

// --- Utility Functions ---
function showLoading(show) { 
    if (loadingSpinner) loadingSpinner.classList.toggle('hidden', !show);
}

function showMessage(message, type = 'info') { 
    if (!messageModal || !messageModalText) return;
    messageModalText.innerText = message;
    messageModalText.classList.remove('text-red-500', 'text-green-600', 'text-gray-700');
    let colorClass = 'text-gray-700';
    if (type === 'error') colorClass = 'text-red-500';
    else if (type === 'success') colorClass = 'text-green-600';
    messageModalText.classList.add(colorClass);
    messageModal.classList.remove('hidden');
}

window.closeModal = function() { 
    if (messageModal) messageModal.classList.add('hidden');
}

function showConfirmModal(message, callback, buttonText = 'Confirm') {
    if (!confirmModal || !confirmModalText || !confirmModalButton) return;
    confirmModalText.textContent = message;
    confirmModalButton.textContent = buttonText;
    confirmCallback = callback;
    confirmModal.classList.remove('hidden');
}

window.closeConfirmModal = function(isConfirmed) {
    if (confirmModal) confirmModal.classList.add('hidden');
    if (confirmCallback) {
        confirmCallback(isConfirmed);
        confirmCallback = null; 
    }
}