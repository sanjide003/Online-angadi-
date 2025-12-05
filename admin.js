import { 
    db, auth, APP_ID, 
    doc, setDoc, onSnapshot, collection, query, 
    addDoc, updateDoc, deleteDoc, serverTimestamp,
    signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from './firebase-config.js';

let currentUserId = null;
let allProducts = [];
let categoriesCache = []; 
let headerSettings = { shopName: 'SocialShop', iconClass: 'fas fa-camera-retro' };
let infoContent = {}; // Cache for content settings

let productsCollectionRef, categoriesCollectionRef, settingsDocRef, infoDocRef; 
let unsubscribeProducts, unsubscribeCategories, unsubscribeSettings, unsubscribeInfo; 
let confirmCallback = null; 
let adminFilterCategoryId = 'all';

// DOM Elements
let $loginSection, $dashboardSection, $loginForm, $loginEmail, $loginPassword, $loginErrorMsg, $loginBtn;
let loadingSpinner, messageModal, messageModalText, confirmModal, confirmModalText, confirmModalButton;
let $viewAddProduct, $viewManageProducts, $viewControlCategory, $viewManageContent, $viewWhatsAppSettings;
let $adminMenuButton, $adminMenuDropdown, $adminCurrentViewTitle;
let $categorySelect, $categoryHelp, $addCategoryForm, $categoryListContainer, $noCategoriesMsg, $userIdDisplay, $whatsappInput, $contentForm, $adminProductFilterSelect, $shopNameInput, $shopIconClassInput, $shopIconPreview;

document.addEventListener('DOMContentLoaded', () => {
    // Login Elements
    $loginSection = document.getElementById('login-section');
    $dashboardSection = document.getElementById('dashboard-section');
    $loginForm = document.getElementById('login-form');
    $loginEmail = document.getElementById('login-email');
    $loginPassword = document.getElementById('login-password');
    $loginErrorMsg = document.getElementById('login-error-msg');
    $loginBtn = document.getElementById('login-btn');

    // Admin UI Elements
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
        console.error("Firebase Init Error");
        return;
    }
    
    // Auth Listener
    setupAuthListener();

    // Login Handler
    if ($loginForm) {
        $loginForm.addEventListener('submit', handleLogin);
    }

    // Attach UI Event Listeners
    setupEventListeners();
});

// --- AUTHENTICATION ---
function setupAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user && !user.isAnonymous) {
            // Logged in as Admin
            currentUserId = user.uid;
            showDashboard(true);
            $userIdDisplay.textContent = `Admin ID: ${currentUserId}`;
            
            // Setup Refs
            productsCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/products`);
            categoriesCollectionRef = collection(db, `artifacts/${APP_ID}/public/data/categories`); 
            settingsDocRef = doc(db, `artifacts/${APP_ID}/public/data/settings/admin`);
            infoDocRef = doc(db, `artifacts/${APP_ID}/public/data/content/info`); 
            
            loadAdminData();
        } else {
            // Not logged in (or Anonymous)
            currentUserId = null;
            showDashboard(false);
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const email = $loginEmail.value;
    const password = $loginPassword.value;
    $loginErrorMsg.classList.add('hidden');
    $loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error(error);
        $loginErrorMsg.textContent = "Invalid Email or Password!";
        $loginErrorMsg.classList.remove('hidden');
    } finally {
        $loginBtn.textContent = 'Sign In';
    }
}

window.handleLogout = async function() {
    try {
        await signOut(auth);
        window.location.reload();
    } catch (error) {
        console.error("Logout failed", error);
    }
}

function showDashboard(show) {
    if (show) {
        $loginSection.classList.add('hidden');
        $dashboardSection.classList.remove('hidden');
        changeAdminView('add-product');
    } else {
        $loginSection.classList.remove('hidden');
        $dashboardSection.classList.add('hidden');
    }
}

// --- DATA & EVENT LISTENERS ---
function setupEventListeners() {
    document.getElementById('admin-product-form').addEventListener('submit', handleAdminFormSubmit);
    document.getElementById('product-price').addEventListener('input', calculateDiscountDisplay);
    document.getElementById('product-retail-price').addEventListener('input', calculateDiscountDisplay);
    
    document.getElementById('delivery-free').addEventListener('change', toggleDeliveryChargeInput);
    document.getElementById('delivery-charge').addEventListener('change', toggleDeliveryChargeInput);
    
    document.getElementById('toggle-advanced-options-btn').addEventListener('click', toggleAdvancedOptions);
    
    $addCategoryForm.addEventListener('submit', handleAddCategory);
    $categoryListContainer.addEventListener('click', handleDeleteCategoryClick);
    $contentForm.addEventListener('submit', handleSaveContent); 
    
    $shopIconClassInput.addEventListener('input', updateIconPreview);
    document.getElementById('new-category-icon').addEventListener('input', updateCategoryIconPreview);

    $adminProductFilterSelect.addEventListener('change', (e) => {
        adminFilterCategoryId = e.target.value;
        filterAdminProducts();
    });
    
    $adminMenuButton.addEventListener('click', (e) => {
        e.stopPropagation(); 
        $adminMenuDropdown.classList.toggle('hidden');
    });

    $adminMenuDropdown.addEventListener('click', (e) => {
        e.preventDefault();
        const link = e.target.closest('.admin-menu-link');
        if (link) {
            changeAdminView(link.dataset.view);
            $adminMenuDropdown.classList.add('hidden');
        }
    });

    window.addEventListener('click', (e) => {
        if ($adminMenuDropdown && !$adminMenuDropdown.classList.contains('hidden')) {
            if (!$adminMenuButton.contains(e.target) && !$adminMenuDropdown.contains(e.target)) {
                $adminMenuDropdown.classList.add('hidden');
            }
        }
    });
}

function loadAdminData() {
    showLoading(true);
    
    if (unsubscribeCategories) unsubscribeCategories();
    unsubscribeCategories = onSnapshot(categoriesCollectionRef, (snapshot) => {
        categoriesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCategoryList(categoriesCache); 
        populateCategorySelect(categoriesCache); 
        populateAdminFilterSelect(categoriesCache);
    });

    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
        const settings = docSnap.exists() ? docSnap.data() : {};
        if ($whatsappInput) $whatsappInput.value = settings.whatsappNumber || '';
        headerSettings = { ...headerSettings, ...settings };
    });
    
    if (unsubscribeProducts) unsubscribeProducts();
    unsubscribeProducts = onSnapshot(productsCollectionRef, (snapshot) => {
        allProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        filterAdminProducts();
        showLoading(false);
    });
    
    if (unsubscribeInfo) unsubscribeInfo();
    unsubscribeInfo = onSnapshot(infoDocRef, (docSnap) => {
        const data = docSnap.exists() ? docSnap.data() : {};
        infoContent = data; // Update global cache
        
        // If currently viewing Manage Content, update the form live
        if ($viewManageContent && !$viewManageContent.classList.contains('hidden')) {
             prefillContentForm(data);
        }
    });
}

// --- VIEW HELPERS ---
window.changeAdminView = function(viewId) {
    [$viewAddProduct, $viewManageProducts, $viewControlCategory, $viewManageContent, $viewWhatsAppSettings].forEach(el => el.classList.add('hidden'));
    
    document.querySelectorAll('.admin-menu-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`.admin-menu-link[data-view="${viewId}"]`)?.classList.add('active');

    let title = 'Admin Panel';
    if (viewId === 'add-product') {
        $viewAddProduct.classList.remove('hidden');
        title = 'Add/Edit Product';
        resetAdminForm();
    } else if (viewId === 'manage-products') {
        $viewManageProducts.classList.remove('hidden');
        title = 'Manage Products';
        filterAdminProducts();
    } else if (viewId === 'control-category') {
        $viewControlCategory.classList.remove('hidden');
        title = 'Manage Categories';
    } else if (viewId === 'manage-content') {
        $viewManageContent.classList.remove('hidden');
        title = 'Manage Content';
        prefillContentForm(infoContent); // Use cached data
    } else if (viewId === 'whatsapp-settings') {
        $viewWhatsAppSettings.classList.remove('hidden');
        title = 'WhatsApp Settings';
    }
    $adminCurrentViewTitle.textContent = title;
}

// --- FORM HANDLERS ---
function toggleAdvancedOptions() {
    const advancedOptions = document.getElementById('advanced-product-options');
    const btn = document.getElementById('toggle-advanced-options-btn');
    const isHidden = advancedOptions.classList.toggle('hidden');
    btn.innerHTML = isHidden ? 'Show Advanced Options' : 'Hide Advanced Options';
}

function toggleDeliveryChargeInput() {
    const container = document.getElementById('delivery-charge-input-container');
    const isCharge = document.getElementById('delivery-charge').checked;
    isCharge ? container.classList.remove('hidden') : container.classList.add('hidden');
}

function calculateDiscountDisplay() { 
    const price = parseFloat(document.getElementById('product-price').value) || 0;
    const retailPrice = parseFloat(document.getElementById('product-retail-price').value) || 0;
    const displayEl = document.getElementById('discount-display');
    
    if (retailPrice > price && price > 0) {
        displayEl.className = 'text-xs text-red-500 mt-1 h-3';
        displayEl.textContent = "Selling price > MRP";
    } else if (price > 0 && retailPrice < price) {
        const discount = (((price - retailPrice) / price) * 100).toFixed(0);
        displayEl.className = 'text-xs text-green-600 mt-1 h-3';
        displayEl.textContent = `Discount: ${discount}%`;
    } else {
        displayEl.textContent = "";
    }
}

// --- CRUD OPERATIONS ---
async function handleAdminFormSubmit(event) { 
    event.preventDefault();
    showLoading(true);
    const id = document.getElementById('product-edit-id').value;
    const price = parseFloat(document.getElementById('product-price').value);
    const retailPriceInput = document.getElementById('product-retail-price').value;
    const retailPrice = parseFloat(retailPriceInput) || price;
    
    if (retailPrice > price) {
         showMessage("Selling Price cannot be higher than MRP.", 'error');
         showLoading(false);
         return;
    }

    const discountPercentage = price > 0 && retailPrice < price ? Math.round(((price - retailPrice) / price) * 100) : 0;
    
    const deliveryOption = document.querySelector('input[name="delivery-option"]:checked').value;
    const deliveryCharge = deliveryOption === 'charge' ? (parseFloat(document.getElementById('product-delivery-charge').value) || 0) : 0;

    // Collect Other Images
    const otherImages = Array.from(document.querySelectorAll('#other-images-list input')).map(i => i.value.trim()).filter(u => u);

    let productData = {
        name: document.getElementById('product-name').value,
        categoryId: $categorySelect.value,
        categoryName: $categorySelect.options[$categorySelect.selectedIndex].text,
        price, retailPrice, discountPercentage,
        imageUrl: document.getElementById('product-image').value,
        description: document.getElementById('product-description').value,
        brand: document.getElementById('product-brand').value,
        sku: document.getElementById('product-sku').value,
        specifications: document.getElementById('product-specifications').value,
        otherImages,
        freeDelivery: deliveryOption === 'free',
        deliveryCharge,
        updatedAt: serverTimestamp(),
    };

    try {
        if (id) {
            await updateDoc(doc(productsCollectionRef, id), productData);
            showMessage("Updated successfully!", 'success');
        } else {
            productData.createdAt = serverTimestamp();
            productData.likes = [];
            productData.commentCount = 0;
            await addDoc(productsCollectionRef, productData);
            showMessage("Added successfully!", 'success');
        }
        resetAdminForm();
        changeAdminView('manage-products');
    } catch (error) {
        showMessage("Error: " + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

window.editProduct = function(productId) { 
    const p = allProducts.find(x => x.id === productId);
    if (!p) return;
    changeAdminView('add-product');
    
    document.getElementById('product-edit-id').value = p.id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-retail-price').value = p.retailPrice;
    document.getElementById('product-image').value = p.imageUrl;
    document.getElementById('product-description').value = p.description || '';
    $categorySelect.value = p.categoryId;
    
    document.getElementById('product-brand').value = p.brand || '';
    document.getElementById('product-sku').value = p.sku || '';
    document.getElementById('product-specifications').value = p.specifications || '';
    
    window.renderMainImagePreview(p.imageUrl);
    renderOtherImageInputs(p.otherImages || []);
    
    if (p.freeDelivery) document.getElementById('delivery-free').checked = true;
    else {
        document.getElementById('delivery-charge').checked = true;
        document.getElementById('product-delivery-charge').value = p.deliveryCharge;
    }
    toggleDeliveryChargeInput();

    document.getElementById('admin-form-submit-btn').textContent = "Update Product";
    document.getElementById('admin-form-cancel-btn').classList.remove('hidden');
    document.getElementById('toggle-advanced-options-btn').click(); // Show advanced
    calculateDiscountDisplay();
}

window.showDeleteProductConfirm = function(id) {
    showConfirmModal("Delete this product?", async (yes) => {
        if (yes) {
            showLoading(true);
            await deleteDoc(doc(productsCollectionRef, id));
            showLoading(false);
            showMessage("Deleted!", 'success');
        }
    }, 'Delete');
}

window.resetAdminForm = function() {
    document.getElementById('admin-product-form').reset();
    document.getElementById('product-edit-id').value = '';
    document.getElementById('admin-form-submit-btn').textContent = "Add Product";
    document.getElementById('admin-form-cancel-btn').classList.add('hidden');
    window.renderMainImagePreview('');
    renderOtherImageInputs([]);
    toggleDeliveryChargeInput();
}

// --- CATEGORY & CONTENT ---
async function handleAddCategory(e) {
    e.preventDefault();
    showLoading(true);
    await addDoc(categoriesCollectionRef, {
        name: document.getElementById('new-category-name').value,
        iconClass: document.getElementById('new-category-icon').value || 'fas fa-tag',
        createdAt: serverTimestamp()
    });
    document.getElementById('add-category-form').reset();
    updateCategoryIconPreview();
    showLoading(false);
    showMessage("Category Added", 'success');
}

function handleDeleteCategoryClick(e) {
    const id = e.target.closest('button')?.dataset.categoryId;
    if (id) {
        showConfirmModal("Delete category?", async (yes) => {
            if (yes) {
                await deleteDoc(doc(categoriesCollectionRef, id));
                showMessage("Category Deleted");
            }
        });
    }
}

async function handleSaveContent(e) {
    e.preventDefault();
    showLoading(true);
    
    const shopData = {
        shopName: document.getElementById('shop-name').value,
        iconClass: document.getElementById('shop-icon-class').value,
        updatedAt: serverTimestamp()
    };
    
    const infoData = {
        followWhatsapp: document.getElementById('follow-whatsapp').value,
        followInstagram: document.getElementById('follow-instagram').value,
        followFacebook: document.getElementById('follow-facebook').value,
        followYoutube: document.getElementById('follow-youtube').value,
        contactPhone: document.getElementById('contact-phone').value,
        contactEmail: document.getElementById('contact-email').value,
        aboutTitle: document.getElementById('about-title').value,
        aboutContent: document.getElementById('about-content').value,
        conditionsTitle: document.getElementById('conditions-title').value,
        conditionsContent: document.getElementById('conditions-content').value,
        copyrightText: document.getElementById('copyright-text').value,
        updatedAt: serverTimestamp()
    };

    await setDoc(settingsDocRef, shopData, { merge: true });
    await setDoc(infoDocRef, infoData, { merge: true });
    
    showLoading(false);
    showMessage("Content Saved!", 'success');
}

window.updateWhatsAppNumber = async function() {
    const num = $whatsappInput.value.replace(/[^0-9]/g, '');
    await setDoc(settingsDocRef, { whatsappNumber: num }, { merge: true });
    showMessage("WhatsApp Saved");
}

// --- RENDERERS ---
function populateCategorySelect(cats) {
    $categorySelect.innerHTML = '<option value="" disabled selected>Select a Category</option>';
    cats.forEach(c => {
        const op = document.createElement('option');
        op.value = c.id; op.textContent = c.name;
        $categorySelect.appendChild(op);
    });
    $categoryHelp.classList.toggle('hidden', cats.length > 0);
}

function renderCategoryList(cats) {
    $categoryListContainer.innerHTML = '';
    if (cats.length === 0) $noCategoriesMsg.classList.remove('hidden');
    else {
        $noCategoriesMsg.classList.add('hidden');
        cats.forEach(c => {
            $categoryListContainer.innerHTML += `
                <div class="flex justify-between items-center p-3 bg-white border rounded mb-2">
                    <span><i class="${c.iconClass || 'fas fa-tag'} mr-2"></i>${c.name}</span>
                    <button data-category-id="${c.id}" class="text-red-500"><i class="fas fa-trash-alt"></i></button>
                </div>`;
        });
    }
}

function populateAdminFilterSelect(cats) {
    $adminProductFilterSelect.innerHTML = '<option value="all">All Categories</option>';
    cats.forEach(c => $adminProductFilterSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}

window.filterAdminProducts = function() {
    const list = adminFilterCategoryId === 'all' ? allProducts : allProducts.filter(p => p.categoryId === adminFilterCategoryId);
    const tbody = document.getElementById('admin-product-list-body');
    tbody.innerHTML = '';
    document.getElementById('admin-product-list-empty').classList.toggle('hidden', list.length > 0);
    
    list.forEach(p => {
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-3"><img src="${p.imageUrl}" class="w-10 h-10 object-cover rounded"></td>
                <td class="p-3 font-medium">${p.name}</td>
                <td class="p-3 text-green-600 font-bold">₹${p.retailPrice || p.price}</td>
                <td class="p-3">
                    <button class="text-indigo-600 mr-3" onclick="editProduct('${p.id}')">Edit</button>
                    <button class="text-red-600" onclick="showDeleteProductConfirm('${p.id}')">Delete</button>
                </td>
            </tr>`;
    });
}

function prefillContentForm(d) {
    document.getElementById('shop-name').value = d.shopName || headerSettings.shopName;
    document.getElementById('shop-icon-class').value = d.iconClass || headerSettings.iconClass;
    document.getElementById('follow-whatsapp').value = d.followWhatsapp || '';
    document.getElementById('follow-instagram').value = d.followInstagram || '';
    document.getElementById('follow-facebook').value = d.followFacebook || '';
    document.getElementById('follow-youtube').value = d.followYoutube || '';
    document.getElementById('contact-phone').value = d.contactPhone || '';
    document.getElementById('contact-email').value = d.contactEmail || '';
    document.getElementById('about-title').value = d.aboutTitle || '';
    document.getElementById('about-content').value = d.aboutContent || '';
    document.getElementById('conditions-title').value = d.conditionsTitle || '';
    document.getElementById('conditions-content').value = d.conditionsContent || '';
    document.getElementById('copyright-text').value = d.copyrightText || '';
    updateIconPreview();
}

// Image Helpers
window.renderMainImagePreview = (u) => document.getElementById('main-image-preview').src = u || 'https://placehold.co/60x60?text=Img';
window.addOtherImageInput = () => {
    const div = document.createElement('div');
    div.className = "flex space-x-2";
    div.innerHTML = `<input class="flex-grow border p-2 rounded text-sm" placeholder="Image URL"><button type="button" class="text-red-500" onclick="this.parentElement.remove()">X</button>`;
    document.getElementById('other-images-list').appendChild(div);
}
function renderOtherImageInputs(urls) {
    const list = document.getElementById('other-images-list');
    list.innerHTML = '';
    urls.forEach(u => {
        const div = document.createElement('div');
        div.className = "flex space-x-2";
        div.innerHTML = `<input class="flex-grow border p-2 rounded text-sm" value="${u}"><button type="button" class="text-red-500" onclick="this.parentElement.remove()">X</button>`;
        list.appendChild(div);
    });
}
function updateIconPreview() {
    const cls = $shopIconClassInput.value;
    $shopIconPreview.className = cls || 'fas fa-question';
}
function updateCategoryIconPreview() {
    document.getElementById('new-category-icon-preview').className = document.getElementById('new-category-icon').value || 'fas fa-tag';
}

// Utils
function showLoading(show) { loadingSpinner.classList.toggle('hidden', !show); }
function showMessage(msg, type='info') {
    messageModalText.textContent = msg;
    messageModalText.className = type === 'error' ? 'text-red-500' : 'text-green-600';
    messageModal.classList.remove('hidden');
}
window.closeModal = () => messageModal.classList.add('hidden');
function showConfirmModal(msg, cb, txt='Delete') {
    confirmModalText.textContent = msg;
    confirmModalButton.textContent = txt;
    confirmCallback = cb;
    confirmModal.classList.remove('hidden');
}
window.closeConfirmModal = (y) => {
    confirmModal.classList.add('hidden');
    if (confirmCallback) confirmCallback(y);
}