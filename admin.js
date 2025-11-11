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

        // അഡ്മിൻ ഫോം ഇവന്റ് ലിസനറുകൾ
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
        
        // അഡ്മിൻ ടാബ് ഇവന്റ് ലിസനറുകൾ
        $addCategoryForm.addEventListener('submit', handleAddCategory);
        $categoryListContainer.addEventListener('click', handleDeleteCategoryClick);
        $contentForm.addEventListener('submit', handleSaveContent); 
        
        // ഹെഡർ ഇൻപുട്ട് ലൈവ് പ്രിവ്യൂ
        $shopIconClassInput.addEventListener('input', updateIconPreview);
        
        // കാറ്റഗറി ഐക്കൺ ലൈവ് പ്രിവ്യൂ
        document.getElementById('new-category-icon').addEventListener('input', updateCategoryIconPreview);

        // അഡ്മിൻ പ്രൊഡക്ട് ഫിൽട്ടർ ലിസനർ
        $adminProductFilterSelect.addEventListener('change', (e) => {
            adminFilterCategoryId = e.target.value;
            filterAdminProducts();
        });
        
        // അഡ്മിൻ മെനു ലിസനറുകൾ
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

        // അഡ്മിൻ ഡ്രോപ്പുഡൗൺ പുറത്ത് ക്ലിക്ക് ചെയ്താൽ ക്ലോസ് ചെയ്യാൻ
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
            
            // യൂസർ ലോഗിൻ ആയതിന് ശേഷം മാത്രം ഡാറ്റ ലോഡ് ചെയ്യുന്നു
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

// --- അഡ്മിൻ ഹെഡർ അപ്ഡേറ്റർ ---
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
        
        // 'Manage Content' ടാബ് ആക്ടീവ് ആണെങ്കിൽ ഫോം പ്രീ-ഫിൽ ചെയ്യുന്നു
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

    // Product Instructions (NEW)
    const productInstructionsInput = document.getElementById('product-instructions');
    if (productInstructionsInput) {
        productInstructionsInput.value = data.productInstructions || '';
    }

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

        // Product Instructions (NEW)
        productInstructions: document.getElementById('product-instructions').value.trim(),

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

        showMessage("Content saved successfully! Header and instructions updated.", 'success');
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

    // 2. ഡ്രോപ്പുഡൗൺ ആക്ടീവ് സ്റ്റേറ്റ് അപ്ഡേറ്റ് ചെയ്യുന്നു
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

// അഡ്മിൻ പ്രൊഡക്ട് ഫിൽട്ടർ ഡ്രോപ്പുഡൗൺ നിറയ്ക്കുന്നു
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

// ഡ്രോപ്പുഡൗൺ അനുസരിച്ച് അഡ്മിൻ പ്രൊഡക്ട് ലിസ്റ്റ് ഫിൽട്ടർ ചെയ്യുന്നു
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

// അഡ്മിൻ പ്രൊഡക്ട് ലിസ്റ്റ് റെൻഡർ ചെയ്യുന്നു
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

// അഡ്മിൻ പ്രൊഡക്ട് ഫോം സബ്മിറ്റ് ഹാൻഡിൽ ചെയ്യുന്നു
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
        