// firebase-config.js-ൽ നിന്ന് ആവശ്യമായവ ഇമ്പോർട്ട് ചെയ്യുന്നു
import { 
    db, auth, APP_ID, 
    doc, setDoc, onSnapshot, collection, query, 
    addDoc, updateDoc, deleteDoc, serverTimestamp,
    signInAnonymously 
} from './firebase-config.js';

// --- Global Instances & Caches (Admin) ---
let currentUserId = null;
let allProducts = [];
let categoriesCache = []; 
let whatsappNumber = '';
let infoContent = {}; 
let headerSettings = { shopName: 'SocialShop', iconClass: 'fas fa-camera-retro' }; // Default header

// Firestore References (Admin)
let productsCollectionRef;
let categoriesCollectionRef;
let settingsDocRef;
let infoDocRef; 

// Snapshot Unsubscribe Functions (Admin)
let unsubscribeProducts = null;
let unsubscribeCategories = null; 
let unsubscribeSettings = null; 
let unsubscribeInfo = null; 

let confirmCallback = null; 

// UI State (Admin)
let adminFilterCategoryId = 'all';

// --- DOM Elements (Admin Page) ---
let pages, loadingSpinner, messageModal, messageModalText, confirmModal, confirmModalText, confirmModalButton;
let $viewAddProduct, $viewManageProducts, $viewControlCategory, $viewManageContent, $viewWhatsAppSettings;
let $adminMenuButton, $adminMenuDropdown, $adminCurrentViewTitle;
let $categorySelect, $categoryHelp, $addCategoryForm, $categoryListContainer, $noCategoriesMsg, $userIdDisplay, $whatsappInput, $contentForm, $adminProductFilterSelect, $shopNameInput, $shopIconClassInput, $shopIconPreview;


// ========= App Initialization & Setup (Admin) =========

document.addEventListener('DOMContentLoaded', () => {
    
    // DOM ഘടകങ്ങൾ എടുക്കുന്നു (Admin)
    pages = document.querySelectorAll('.page');
    loadingSpinner = document.getElementById('loading-spinner');
    messageModal = document.getElementById('message-modal');
    messageModalText = document.getElementById('message-modal-text');
    confirmModal = document.getElementById('confirm-modal');
    confirmModalText = document.getElementById('confirm-modal-text');
    confirmModalButton = document.getElementById('confirm-modal-button');
    
    $viewAddProduct = document.getElementById('view-add-product');
    $viewManageProducts = document.getElementById('view-manage-products');
    $viewControlCategory = document.getElementById('view-control-category');
    $viewManageContent = document.getElementById('view-manage-content'); 
    $viewWhatsAppSettings = document.getElementById('view-whatsapp-settings');
    
    $adminMenuButton = document.getElementById('admin-menu-button');
    $adminMenuDropdown = document.getElementById('admin-menu-dropdown');
    $adminCurrentViewTitle = document.getElementById('admin-current-view-title');
    
    $categorySelect = document.getElementById('product-category-select');
    $categoryHelp = document.getElementById('category-help-message');
    $addCategoryForm = document.getElementById('add-category-form');
    $categoryListContainer = document.getElementById('category-list-container');
    $noCategoriesMsg = document.getElementById('no-categories');
    $userIdDisplay = document.getElementById('user-id-display');
    $whatsappInput = document.getElementById('whatsapp-number');
    $contentForm = document.getElementById('content-form'); 
    $adminProductFilterSelect = document.getElementById('admin-product-category-filter');
    $shopNameInput = document.getElementById('shop-name');
    $shopIconClassInput = document.getElementById('shop-icon-class');
    $shopIconPreview = document.getElementById('shop-icon-preview');

    if (!db || !auth) {
        console.error("Firebase is not initialized. Check firebase-config.js");
        showMessage("Application cannot start. Firebase config error.", "error");
        return;
    }
    
    try {
        setupAuthListener();

        // അഡ്മിൻ ഫോം ഇവന്റ് ലിസ്‌നറുകൾ
        document.getElementById('admin-product-form').addEventListener('submit', handleAdminFormSubmit);
        document.getElementById('product-price').addEventListener('input', calculateDiscountDisplay);
        document.getElementById('product-retail-price').addEventListener('input', calculateDiscountDisplay);
        
        document.getElementById('delivery-free').addEventListener('change', toggleDeliveryChargeInput);
        document.getElementById('delivery-charge').addEventListener('change', toggleDeliveryChargeInput);
        
        document.getElementById('toggle-advanced-options-btn').addEventListener('click', () => {
            const advancedOptions = document.getElementById('advanced-product-options');
            const btn = document.getElementById('toggle-advanced-options-btn');
            const isHidden = advancedOptions.classList.toggle('hidden');
            
            if (isHidden) {
                btn.innerHTML = '<span>Show Advanced Options</span> <i class="fas fa-chevron-down ml-1 text-xs"></i>';
            } else {
                btn.innerHTML = '<span>Hide Advanced Options</span> <i class="fas fa-chevron-up ml-1 text-xs"></i>';
            }
        });
        
        // അഡ്മിൻ ടാബ് ഇവന്റ് ലിസ്‌നറുകൾ
        $addCategoryForm.addEventListener('submit', handleAddCategory);
        $categoryListContainer.addEventListener('click', handleDeleteCategoryClick);
        $contentForm.addEventListener('submit', handleSaveContent); 
        
        // ഹെഡർ ഇൻപുട്ട് ലൈവ് പ്രിവ്യൂ
        $shopIconClassInput.addEventListener('input', updateIconPreview);
        
        // കാറ്റഗറി ഐക്കൺ ലൈവ് പ്രിവ്യൂ
        document.getElementById('new-category-icon').addEventListener('input', updateCategoryIconPreview);

        // അഡ്മിൻ പ്രൊഡക്റ്റ് ഫിൽറ്റർ ലിസ്‌നർ
        $adminProductFilterSelect.addEventListener('change', (e) => {
            adminFilterCategoryId = e.target.value;
            filterAdminProducts();
        });
        
        // അഡ്മിൻ മെനു ലിസ്‌നറുകൾ
        $adminMenuButton.addEventListener('click', (e) => {
            e.stopPropagation(); 
            $adminMenuDropdown.classList.toggle('hidden');
        });

        $adminMenuDropdown.addEventListener('click', (e) => {
            e.preventDefault();
            const link = e.target.closest('.admin-menu-link');
            if (link) {
                const viewId = link.dataset.view;
                changeAdminView(viewId);
                $adminMenuDropdown.classList.add('hidden'); // Close menu on selection
            }
        });

        // അഡ്മിൻ ഡ്രോപ്പ്ഡൗൺ പുറത്ത് ക്ലിക്ക് ചെയ്താൽ ക്ലോസ് ചെയ്യാൻ
        window.addEventListener('click', (e) => {
            if ($adminMenuDropdown && !$adminMenuDropdown.classList.contains('hidden')) {
                if (!$adminMenuButton.contains(e.target) && !$adminMenuDropdown.contains(e.target)) {
                    $adminMenuDropdown.classList.add('hidden');
                }
            }
        });

        // ഡിഫോൾട്ട് ആയി ആദ്യത്തെ വ്യൂ കാണിക്കുന്നു
        changeAdminView('add-product');

    } catch (error) {
        console.error("Admin initialization failed:", error);
        showMessage("Admin initialization failed: " + error.message, 'error');
    }
});

// --- AUTH (Admin) ---
function setupAuthListener() {
    // [സൂചന] അനാവശ്യമായ 'noop' സ്നാപ്പ്ഷോട്ട് നീക്കം ചെയ്തു.
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUserId = user.uid;
            if ($userIdDisplay) $userIdDisplay.textContent = `Current User ID: ${currentUserId}`;
            
            // Firestore റഫറൻസുകൾ ഇവിടെ സെറ്റ് ചെയ്യുന്നു
            productsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/products`);
            categoriesCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/categories`); 
            settingsDocRef = doc(db, `artifacts/${APP_ID}/public/data/settings/admin`);
            infoDocRef = doc(db, `artifacts/${APP_ID}/public/data/content/info`); 
            
            // യൂസർ ലോഗിൻ ആയതിനു ശേഷം മാത്രം ഡാറ്റ ലോഡ് ചെയ്യുന്നു
            loadAdminData();
        } else {
            currentUserId = null;
            try {
                // യൂസർ ലോഗിൻ അല്ലെങ്കിൽ, അനോണിമസ് ആയി സൈൻ ഇൻ ചെയ്യുന്നു
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Anonymous authentication failed:", error);
                showMessage("Failed to connect to service. Please refresh.", "error");
            }
        }
    });
}

// --- അഡ്മിൻ ഹെഡർ അപ്‌ഡേറ്റർ ---
function updateAdminHeader(settings) {
    headerSettings = {
        shopName: settings.shopName || 'SocialShop',
        iconClass: settings.iconClass || 'fas fa-camera-retro',
        whatsappNumber: settings.whatsappNumber || ''
    };
    whatsappNumber = headerSettings.whatsappNumber;
}

// --- ADMIN DATA LOADING ---
function loadAdminData() {
    if (!currentUserId || !db) return;
    
    showLoading(true);
    
    // 1. Load Categories (Public)
    if (unsubscribeCategories) unsubscribeCategories();
    unsubscribeCategories = onSnapshot(categoriesCollectionRef, (snapshot) => {
        categoriesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCategoryList(categoriesCache); 
        populateCategorySelect(categoriesCache); 
        populateAdminFilterSelect(categoriesCache);
    }, (error) => {
        console.error("Error fetching categories (Check Firestore Security Rules):", error);
        showMessage("Failed to load categories. Permission Denied.", 'error');
        showLoading(false);
    });

    // 2. Load Settings (Public) - WhatsApp, Header
    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
        const settings = docSnap.exists() ? docSnap.data() : {};
        updateAdminHeader(settings);
        if ($whatsappInput) $whatsappInput.value = settings.whatsappNumber || '';
    }, (error) => {
        console.error("Error fetching settings:", error);
    });
    
    // 3. Load Products (Public)
    if (unsubscribeProducts) unsubscribeProducts();
    unsubscribeProducts = onSnapshot(productsCollectionRef, (snapshot) => {
        allProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        filterAdminProducts(); // അഡ്മിൻ ലിസ്റ്റ് റെൻഡർ ചെയ്യുന്നു
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
        
        // 'Manage Content' ടാബ് ആക്റ്റീവ് ആണെങ്കിൽ ഫോം പ്രീ-ഫിൽ ചെയ്യുന്നു
        if ($viewManageContent && $viewManageContent.classList.contains('active')) {
            prefillContentForm(infoContent);
        }
    }, (error) => {
        console.error("Error fetching info content:", error);
    });
}


// --- WHATSAPP UPDATE FUNCTION (Triggered by Save button) ---
window.updateWhatsAppNumber = async function() {
    if (!$whatsappInput) return;
    const newNumber = $whatsappInput.value.trim().replace(/[^0-9]/g, '');
    if (!currentUserId) { showMessage('Authentication required to update settings.', 'error'); return; }

    showLoading(true);
    try {
        await setDoc(settingsDocRef, { whatsappNumber: newNumber }, { merge: true });
        showMessage("WhatsApp number updated successfully.", 'success');
    } catch (error) {
        console.error("Error updating WhatsApp number:", error);
        showMessage("Failed to update WhatsApp number. Check Firestore write permissions.", 'error');
    } finally {
        showLoading(false);
    }
}

// --- അഡ്മിൻ ഹെഡർ ലൈവ് പ്രിവ്യൂ ---
function updateIconPreview() {
    if (!$shopIconClassInput || !$shopIconPreview) return;
    const newClass = $shopIconClassInput.value.trim();
    $shopIconPreview.className = '';
    $shopIconPreview.classList.add(...newClass.split(' '));
    if (!newClass) {
        $shopIconPreview.classList.add('fas', 'fa-question-circle');
    }
    $shopIconPreview.classList.add('text-2xl', 'text-indigo-600', 'flex-shrink-0');
}

// --- കാറ്റഗറി ഐക്കൺ ലൈവ് പ്രിവ്യൂ ---
function updateCategoryIconPreview() {
    const newClass = document.getElementById('new-category-icon').value.trim();
    const previewEl = document.getElementById('new-category-icon-preview');
    previewEl.className = '';
    if (newClass) {
        previewEl.classList.add(...newClass.split(' '));
    } else {
        previewEl.classList.add('fas', 'fa-tag'); // Default
    }
    previewEl.classList.add('text-2xl', 'text-indigo-600', 'flex-shrink-0');
}

// --- Admin Content Handlers ---

function prefillContentForm(data) {
    if (!$shopNameInput || !$shopIconClassInput) return;
    
    // Header
    $shopNameInput.value = data.shopName || headerSettings.shopName;
    $shopIconClassInput.value = data.iconClass || headerSettings.iconClass;
    updateIconPreview(); 

    // Follow/Contact
    document.getElementById('follow-whatsapp').value = data.followWhatsapp || '';
    document.getElementById('follow-instagram').value = data.followInstagram || '';
    document.getElementById('follow-facebook').value = data.followFacebook || '';
    document.getElementById('follow-youtube').value = data.followYoutube || '';
    document.getElementById('contact-phone').value = data.contactPhone || '';
    document.getElementById('contact-email').value = data.contactEmail || '';
    
    // Content
    document.getElementById('about-title').value = data.aboutTitle || '';
    document.getElementById('about-content').value = data.aboutContent || '';
    document.getElementById('conditions-title').value = data.conditionsTitle || '';
    document.getElementById('conditions-content').value = data.conditionsContent || '';
    document.getElementById('copyright-text').value = data.copyrightText || '';
}

async function handleSaveContent(e) {
    e.preventDefault();
    if (!currentUserId) { showMessage('Authentication required to manage content.', 'error'); return; }

    const contentToSave = {
        // Header Settings
        shopName: $shopNameInput.value.trim() || 'SocialShop',
        iconClass: $shopIconClassInput.value.trim() || 'fas fa-camera-retro',

        // Follow/Contact
        followWhatsapp: document.getElementById('follow-whatsapp').value.trim(),
        followInstagram: document.getElementById('follow-instagram').value.trim(),
        followFacebook: document.getElementById('follow-facebook').value.trim(),
        followYoutube: document.getElementById('follow-youtube').value.trim(),
        contactPhone: document.getElementById('contact-phone').value.trim(),
        contactEmail: document.getElementById('contact-email').value.trim(),

        // Account Content
        aboutTitle: document.getElementById('about-title').value.trim(),
        aboutContent: document.getElementById('about-content').value.trim(),
        conditionsTitle: document.getElementById('conditions-title').value.trim(),
        conditionsContent: document.getElementById('conditions-content').value.trim(),
        copyrightText: document.getElementById('copyright-text').value.trim(),
        updatedAt: serverTimestamp()
    };
    
    showLoading(true);
    try {
        // ഹെഡർ സെറ്റിംഗ്സ് admin ഡോക്യുമെന്റിൽ സേവ് ചെയ്യുന്നു
        await setDoc(settingsDocRef, { 
            shopName: contentToSave.shopName,
            iconClass: contentToSave.iconClass,
            updatedAt: serverTimestamp()
        }, { merge: true });

        // ഇൻഫോ കണ്ടന്റ് info ഡോക്യുമെന്റിൽ സേവ് ചെയ്യുന്നു
        const infoSaveData = { ...contentToSave };
        delete infoSaveData.shopName; 
        delete infoSaveData.iconClass;
        await setDoc(infoDocRef, infoSaveData, { merge: true });

        showMessage("Content saved successfully! Header updated.", 'success');
    } catch (error) {
        console.error("Error saving content:", error);
        showMessage("Failed to save content. Check Firebase permissions.", 'error');
    } finally {
        showLoading(false);
    }
}


// ========= UI NAVIGATION (Admin) =========

// --- അഡ്മിൻ ടാബ് നാവിഗേഷൻ ---
window.changeAdminView = function(viewId) {
    if (!$viewAddProduct || !$viewManageProducts || !$viewControlCategory || !$viewManageContent || !$viewWhatsAppSettings || !$adminCurrentViewTitle) {
        console.warn("Admin view elements not initialized yet.");
        return;
    }

    // 1. എല്ലാ വ്യൂ പാനലുകളും മറയ്ക്കുന്നു
    $viewAddProduct.classList.add('hidden');
    $viewManageProducts.classList.add('hidden');
    $viewControlCategory.classList.add('hidden');
    $viewManageContent.classList.add('hidden');
    $viewWhatsAppSettings.classList.add('hidden');

    // 2. ഡ്രോപ്പ്ഡൗൺ ആക്റ്റീവ് സ്റ്റേറ്റ് അപ്‌ഡേറ്റ് ചെയ്യുന്നു
    document.querySelectorAll('.admin-menu-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.view === viewId) {
            link.classList.add('active');
        }
    });

    let currentTitle = '';

    // 3. ശരിയായ വ്യൂ പാനൽ കാണിക്കുകയും ടൈറ്റിൽ സെറ്റ് ചെയ്യുകയും ചെയ്യുന്നു
    if (viewId === 'add-product') {
        $viewAddProduct.classList.remove('hidden');
        currentTitle = 'Add/Edit Product';
        resetAdminForm();
        
    } else if (viewId === 'manage-products') {
        $viewManageProducts.classList.remove('hidden');
        currentTitle = 'Manage Products';
        filterAdminProducts();
        
    } else if (viewId === 'control-category') {
        $viewControlCategory.classList.remove('hidden');
        currentTitle = 'Manage Categories';
        
    } else if (viewId === 'manage-content') {
        $viewManageContent.classList.remove('hidden');
        currentTitle = 'Manage Content';
        prefillContentForm(infoContent); 
    
    } else if (viewId === 'whatsapp-settings') {
        $viewWhatsAppSettings.classList.remove('hidden');
        currentTitle = 'WhatsApp Settings';
    }
    
    // 4. ഹെഡർ ടൈറ്റിൽ സെറ്റ് ചെയ്യുന്നു
    $adminCurrentViewTitle.textContent = currentTitle;
}

// --- Admin Panel Functions (Product) ---
    
// ഡെലിവറി ചാർജ് ഇൻപുട്ട് കാണിക്കുക/മറയ്ക്കുക
function toggleDeliveryChargeInput() {
    const chargeContainer = document.getElementById('delivery-charge-input-container');
    const chargeInput = document.getElementById('product-delivery-charge');
    if (!chargeContainer || !chargeInput) return;
    
    if (document.getElementById('delivery-charge').checked) {
        chargeContainer.classList.remove('hidden');
    } else {
        chargeContainer.classList.add('hidden');
        chargeInput.value = ''; // ഫ്രീ ആക്കുമ്പോൾ വാല്യൂ ക്ലിയർ ചെയ്യുന്നു
    }
}

// ഡിസ്‌കൗണ്ട് ശതമാനം കണക്കാക്കുന്നു
function calculateDiscountDisplay() { 
    const priceEl = document.getElementById('product-price');
    const retailPriceEl = document.getElementById('product-retail-price');
    const displayEl = document.getElementById('discount-display');
    
    if (!priceEl || !retailPriceEl || !displayEl) return;
    
    const price = parseFloat(priceEl.value) || 0;
    const retailPrice = parseFloat(retailPriceEl.value) || 0;

    if (retailPrice > price && price > 0) {
        displayEl.classList.remove('text-green-600');
        displayEl.classList.add('text-red-500');
        displayEl.textContent = "Retail price cannot be higher than MRP.";
        return;
    }

    if (price > 0 && retailPrice < price) {
        const discount = (((price - retailPrice) / price) * 100).toFixed(0);
        displayEl.classList.remove('text-red-500');
        displayEl.classList.add('text-green-600');
        displayEl.textContent = `Discount: ${discount}%`;
    } else if (price === retailPrice && price > 0) {
        displayEl.classList.remove('text-red-500');
        displayEl.classList.add('text-green-600');
        displayEl.textContent = "Discount: 0%";
    } else {
        displayEl.textContent = "";
    }
}

// അഡ്മിൻ പ്രൊഡക്റ്റ് ഫിൽറ്റർ ഡ്രോപ്പ്ഡൗൺ നിറയ്ക്കുന്നു
function populateAdminFilterSelect(categories) {
    if (!$adminProductFilterSelect) return;
    $adminProductFilterSelect.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        $adminProductFilterSelect.appendChild(option);
    });
    $adminProductFilterSelect.value = adminFilterCategoryId;
}

// ഡ്രോപ്പ്ഡൗൺ അനുസരിച്ച് അഡ്മിൻ പ്രൊഡക്റ്റ് ലിസ്റ്റ് ഫിൽറ്റർ ചെയ്യുന്നു
window.filterAdminProducts = function() {
    const categoryId = adminFilterCategoryId;
    
    let filteredProducts;
    if (categoryId === 'all') {
        filteredProducts = allProducts;
    } else {
        filteredProducts = allProducts.filter(p => p.categoryId === categoryId);
    }
    renderAdminProductList(filteredProducts);
}

// അഡ്മിൻ പ്രൊഡക്റ്റ് ലിസ്റ്റ് റെൻഡർ ചെയ്യുന്നു
function renderAdminProductList(products) { 
    const tbody = document.getElementById('admin-product-list-body');
    const emptyMsg = document.getElementById('admin-product-list-empty');
    
    if (!tbody || !emptyMsg) return;
    tbody.innerHTML = '';

    if (products.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
    }
    emptyMsg.classList.add('hidden');

    products.forEach(product => {
        const imageUrl = product.imageUrl || `https://placehold.co/40x40/E2E8F0/333?text=Img`;
        const retailPrice = product.retailPrice || product.price || 0;
        
        const row = `
            <tr class="hover:bg-gray-50">
                <td class="p-4"><img src="${imageUrl}" alt="${product.name}" class="w-10 h-10 object-cover rounded" onerror="this.src='https://placehold.co/40x40/E2E8F0/333?text=Img'"></td>
                <td class="p-4 font-medium text-gray-900">${product.name}</td>
                <td class="p-4 text-sm text-gray-600">${product.categoryName || 'N/A'}</td>
                <td class="p-4 text-sm font-semibold text-green-600">₹${retailPrice.toFixed(0)}</td>
                <td class="p-4 whitespace-nowrap space-x-2">
                    <button class="text-indigo-600 hover:text-indigo-900" onclick="editProduct('${product.id}')">Edit</button>
                    <button class="text-red-600 hover:text-red-900" onclick="showDeleteProductConfirm('${product.id}')">Delete</button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

// അഡ്മിൻ പ്രൊഡക്റ്റ് ഫോം സബ്മിറ്റ് ഹാൻഡിൽ ചെയ്യുന്നു
async function handleAdminFormSubmit(event) { 
    event.preventDefault();
    if (!currentUserId) { showMessage("Authentication is required to add/edit products.", 'error'); return; }

    const id = document.getElementById('product-edit-id').value;
    const name = document.getElementById('product-name').value;
    const categoryId = $categorySelect.value;
    const categoryName = $categorySelect.options[$categorySelect.selectedIndex].text;
    const price = parseFloat(document.getElementById('product-price').value);
    const retailPriceInput = document.getElementById('product-retail-price').value;
    const retailPrice = parseFloat(retailPriceInput) || price; 
    const imageUrl = document.getElementById('product-image').value;
    
    // Advanced Fields
    const brand = document.getElementById('product-brand').value;
    const sku = document.getElementById('product-sku').value;
    const otherImageInputs = document.querySelectorAll('#other-images-list .image-url-input');
    const otherImages = Array.from(otherImageInputs)
        .map(input => input.value.trim())
        .filter(url => url.length > 0);
    const specifications = document.getElementById('product-specifications').value;
    
    const description = document.getElementById('product-description').value;
    
    // Delivery Logic
    const deliveryOption = document.querySelector('input[name="delivery-option"]:checked').value;
    const freeDelivery = (deliveryOption === 'free');
    let deliveryCharge = 0;
    
    if (deliveryOption === 'charge') {
        const chargeVal = document.getElementById('product-delivery-charge').value;
        deliveryCharge = parseFloat(chargeVal) || 0;
        
        if (deliveryCharge <= 0) {
            showMessage("Please enter a valid delivery charge amount (greater than 0).", 'error');
            return; // Stop submission
        }
    }

    if (retailPrice > price) {
         showMessage("Retail Price cannot be higher than Original Price (MRP).", 'error');
         return;
    }

    const discountPercentage = price > 0 && retailPrice < price 
        ? Math.round(((price - retailPrice) / price) * 100) 
        : 0;

    let productData = {
        name, categoryId, categoryName,
        brand: brand || null,
        sku: sku || null,
        price: price || 0,
        retailPrice: retailPrice,
        discountPercentage,
        imageUrl,
        otherImages, 
        description: description || '',
        specifications,
        freeDelivery, // boolean
        deliveryCharge, // number (0 or charge amount)
        updatedAt: serverTimestamp(),
    };
    
    showLoading(true);

    try {
        if (id) {
            const productRef = doc(db, productsCollectionRef.path, id);
            await updateDoc(productRef, productData);
            showMessage("Product updated successfully!", 'success');
        } else {
            productData.createdAt = serverTimestamp();
            productData.likes = [];
            productData.commentCount = 0;
            await addDoc(productsCollectionRef, productData);
            showMessage("Product added successfully!", 'success');
        }
        resetAdminForm();
        changeAdminView('manage-products'); // Switch to view list
    } catch (error) {
        console.error("Error saving product:", error);
        showMessage(`Failed to save product. Check Firestore write permissions: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// പ്രൊഡക്റ്റ് എഡിറ്റ് ചെയ്യാൻ ഫോം നിറയ്ക്കുന്നു
window.editProduct = function(productId) { 
    const product = allProducts.find(p => p.id === productId);
    if (!product) { showMessage("Product not found for editing.", 'error'); return; }

    changeAdminView('add-product');
    
    // ഫോം നിറയ്ക്കുന്നു
    document.getElementById('product-edit-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-price').value = product.price || '';
    document.getElementById('product-retail-price').value = product.retailPrice || product.price || '';
    document.getElementById('product-image').value = product.imageUrl || '';
    window.renderMainImagePreview(product.imageUrl || ''); 
    document.getElementById('product-description').value = product.description || '';
    $categorySelect.value = product.categoryId || '';
    
    // Advanced Fields
    document.getElementById('product-brand').value = product.brand || '';
    document.getElementById('product-sku').value = product.sku || '';
    renderOtherImageInputs(product.otherImages || []); 
    document.getElementById('product-specifications').value = product.specifications || '';
    
    // Show advanced options
    const advancedOptions = document.getElementById('advanced-product-options');
    const btn = document.getElementById('toggle-advanced-options-btn');
    if (product.brand || product.sku || (product.otherImages && product.otherImages.length > 0) || product.specifications) {
        advancedOptions.classList.remove('hidden');
        btn.innerHTML = '<span>Hide Advanced Options</span> <i class="fas fa-chevron-up ml-1 text-xs"></i>';
    } else {
        advancedOptions.classList.add('hidden');
        btn.innerHTML = '<span>Show Advanced Options</span> <i class="fas fa-chevron-down ml-1 text-xs"></i>';
    }

    // Delivery Options
    const freeDeliveryRadio = document.getElementById('delivery-free');
    const chargeDeliveryRadio = document.getElementById('delivery-charge');
    const chargeInput = document.getElementById('product-delivery-charge');
    
    if (product.freeDelivery) {
        freeDeliveryRadio.checked = true;
        chargeDeliveryRadio.checked = false;
        chargeInput.value = '';
    } else {
        freeDeliveryRadio.checked = false;
        chargeDeliveryRadio.checked = true;
        chargeInput.value = product.deliveryCharge || '';
    }
    toggleDeliveryChargeInput(); 
    
    document.getElementById('admin-form-title').textContent = "Edit Product";
    document.getElementById('admin-form-submit-btn').textContent = "Update Product";
    document.getElementById('admin-form-cancel-btn').classList.remove('hidden');
    
    calculateDiscountDisplay();
    window.scrollTo(0, 0); 
}

// അഡ്മിൻ ഫോം റീസെറ്റ് ചെയ്യുന്നു
window.resetAdminForm = function() { 
    document.getElementById('admin-product-form').reset();
    document.getElementById('product-edit-id').value = '';
    document.getElementById('admin-form-title').textContent = "Add Product";
    document.getElementById('admin-form-submit-btn').textContent = "Add Product";
    document.getElementById('admin-form-cancel-btn').classList.add('hidden');
    document.getElementById('discount-display').textContent = "";
    
    // Reset delivery
    document.getElementById('delivery-free').checked = true;
    document.getElementById('delivery-charge').checked = false;
    document.getElementById('product-delivery-charge').value = '';
    toggleDeliveryChargeInput(); 
    
    // Reset advanced
    const advancedOptions = document.getElementById('advanced-product-options');
    const btn = document.getElementById('toggle-advanced-options-btn');
    if (advancedOptions && btn) {
        advancedOptions.classList.add('hidden');
        btn.innerHTML = '<span>Show Advanced Options</span> <i class="fas fa-chevron-down ml-1 text-xs"></i>';
    }
    
    window.renderMainImagePreview('');
    renderOtherImageInputs([]); 
}

// പ്രൊഡക്റ്റ് ഡിലീറ്റ് കൺഫർമേഷൻ
window.showDeleteProductConfirm = function(productId) {
    showConfirmModal(`Are you sure you want to delete product ID: ${productId}?`, async (confirmed) => {
        if (confirmed) {
            await deleteProduct(productId);
        }
    }, 'Delete Product');
}

// പ്രൊഡക്റ്റ് ഡിലീറ്റ് ചെയ്യുന്നു
async function deleteProduct(productId) { 
    if (!currentUserId) { showMessage("Authentication is required to delete products.", 'error'); return; }

    showLoading(true);
    try {
        const productRef = doc(db, productsCollectionRef.path, productId);
        await deleteDoc(productRef);
        showMessage("Product deleted successfully!", 'success');
    } catch (error) {
        console.error("Error deleting product:", error);
        showMessage(`Failed to delete product. Check Firestore write permissions: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// --- Image Handling Functions (Admin) ---

// മെയിൻ ഇമേജ് പ്രിവ്യൂ
window.renderMainImagePreview = function(url) {
    const previewEl = document.getElementById('main-image-preview');
    if (previewEl) {
        previewEl.src = url || 'https://placehold.co/60x60/f0f0f0/999?text=Main';
    }
}

// മറ്റ് ഇമേജ് ഇൻപുട്ട് ഫീൽഡ് ഉണ്ടാക്കുന്നു
function createOtherImageInput(url = '') {
    const container = document.createElement('div');
    container.className = 'flex items-center space-x-2 other-image-input-group';
    
    const input = document.createElement('input');
    input.type = 'url';
    input.value = url;
    input.placeholder = 'https://example.com/image.jpg';
    input.className = 'flex-grow border-gray-300 rounded-lg shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-2 image-url-input'; 
    
    const preview = document.createElement('img');
    preview.src = url || 'https://placehold.co/40x40/f0f0f0/999?text=Img';
    preview.className = 'w-10 h-10 object-cover rounded-lg border border-gray-300 flex-shrink-0';
    preview.onerror = function() { this.src='https://placehold.co/40x40/f0f0f0/999?text=Error'; };

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'text-red-500 hover:text-red-700 p-2 flex-shrink-0';
    deleteBtn.innerHTML = '<i class="fas fa-trash-alt text-lg"></i>';
    deleteBtn.onclick = function() {
        container.remove();
    };

    input.oninput = function() {
        preview.src = this.value || 'https://placehold.co/40x40/f0f0f0/999?text=Img';
    };

    container.appendChild(input);
    container.appendChild(preview);
    container.appendChild(deleteBtn);
    
    return container;
}

// മറ്റ് ഇമേജ് ഇൻപുട്ട് ഫീൽഡ് ചേർക്കുന്നു
window.addOtherImageInput = function(url = '') {
    const container = document.getElementById('other-images-list');
    if (container) {
        container.appendChild(createOtherImageInput(url));
    }
}

// മറ്റ് ഇമേജ് ഇൻപുട്ടുകൾ റെൻഡർ ചെയ്യുന്നു (എഡിറ്റ് ചെയ്യുമ്പോൾ)
function renderOtherImageInputs(urls) {
    const container = document.getElementById('other-images-list');
    if (container) {
        container.innerHTML = ''; 
        if (urls && urls.length > 0) {
            urls.forEach(url => {
                container.appendChild(createOtherImageInput(url));
            });
        }
    }
}


// --- Admin Panel Functions (Category) ---
// പ്രൊഡക്റ്റ് ഫോമിലെ കാറ്റഗറി സെലക്ട് നിറയ്ക്കുന്നു
function populateCategorySelect(categories) { 
    if (!$categorySelect) return;
    $categorySelect.innerHTML = '<option value="" disabled selected>Select a Category</option>';
    if (categories.length === 0) {
        $categoryHelp.classList.remove('hidden');
        $categorySelect.setAttribute('disabled', 'true');
    } else {
        $categoryHelp.classList.add('hidden');
        $categorySelect.removeAttribute('disabled');
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            $categorySelect.appendChild(option);
        });
    }
}

// കാറ്റഗറി മാനേജ്മെന്റ് ലിസ്റ്റ് റെൻഡർ ചെയ്യുന്നു
function renderCategoryList(categories) { 
    if (!$categoryListContainer || !$noCategoriesMsg) return;

    $categoryListContainer.innerHTML = '';
    
    if (categories.length === 0) {
        $noCategoriesMsg.classList.remove('hidden');
        $categoryListContainer.appendChild($noCategoriesMsg);
        return;
    }
    $noCategoriesMsg.classList.add('hidden');

    categories.forEach(cat => {
        const div = document.createElement('div');
        const iconClass = cat.iconClass || 'fas fa-tag'; // Default icon
        div.className = 'flex justify-between items-center p-3 bg-white border rounded-lg shadow-sm';
        div.innerHTML = `
            <div class="flex items-center">
                <i class="${iconClass} text-indigo-600 text-lg mr-3"></i>
                <span class="font-medium text-gray-800">${cat.name}</span>
            </div>
            <button data-category-id="${cat.id}" class="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition duration-150">
                <i class="fas fa-trash-alt pointer-events-none"></i>
            </button>
        `;
        $categoryListContainer.appendChild(div);
    });
}

// പുതിയ കാറ്റഗറി ചേർക്കുന്നു
async function handleAddCategory(e) { 
    e.preventDefault();
    if (!currentUserId) { showMessage("Authentication is required to manage categories.", 'error'); return; }

    const name = document.getElementById('new-category-name').value.trim();
    const iconClassInput = document.getElementById('new-category-icon').value.trim();
    const iconClass = iconClassInput || 'fas fa-tag'; // Default icon
    
    if (!name) return;
    
    showLoading(true);
    try {
        await addDoc(categoriesCollectionRef, { 
            name, 
            iconClass, // ഐക്കൺ ക്ലാസ് സേവ് ചെയ്യുന്നു
            createdAt: serverTimestamp() 
        });
        document.getElementById('new-category-name').value = '';
        document.getElementById('new-category-icon').value = ''; // ഐക്കൺ ഇൻപുട്ട് റീസെറ്റ് ചെയ്യുന്നു
        updateCategoryIconPreview(); // പ്രിവ്യൂ റീസെറ്റ് ചെയ്യുന്നു
        showMessage(`Category '${name}' added successfully!`, 'success');
    } catch (error) {
        console.error("Error adding category:", error);
        showMessage(`Failed to add category. Check Firestore write permissions: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// കാറ്റഗറി ഡിലീറ്റ് ബട്ടൺ ക്ലിക്ക് ഹാൻഡിൽ ചെയ്യുന്നു
function handleDeleteCategoryClick(e) { 
    const categoryButton = e.target.closest('button');
    const categoryId = categoryButton?.dataset.categoryId;
    if (!categoryId) return;

    showConfirmModal(`Are you sure you want to delete this category? All related products must be updated manually.`, async (confirmed) => {
        if (confirmed) {
            await deleteCategory(categoryId);
        }
    }, 'Delete Category');
}

// കാറ്റഗറി ഡിലീറ്റ് ചെയ്യുന്നു
async function deleteCategory(categoryId) { 
    if (!currentUserId) { showMessage("Authentication is required to manage categories.", 'error'); return; }
    
    showLoading(true);
    try {
        const categoryRef = doc(db, categoriesCollectionRef.path, categoryId);
        await deleteDoc(categoryRef);
        showMessage("Category deleted successfully.", 'success');
    } catch (error) {
        console.error("Error deleting category:", error);
        showMessage(`Failed to delete category. Check Firestore write permissions: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// --- Utility Functions (Modularized/Fixed) ---
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