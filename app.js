// --- Product Detail Page (With Media & Common Instructions) ---
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
    
    // Get all media
    let allMedia = [];
    if (product.mediaUrls && product.mediaUrls.length > 0) {
        allMedia = product.mediaUrls;
    } else if (product.imageUrl) {
        allMedia = [{ url: product.imageUrl, type: 'image' }];
        if (product.otherImages && product.otherImages.length > 0) {
            allMedia = [...allMedia, ...product.otherImages.map(url => ({ url, type: 'image' }))];
        }
    }
    
    if (allMedia.length === 0) {
        allMedia = [{ url: `https://placehold.co/800x600/E2E8F0/333?text=${encodeURIComponent(product.name)}`, type: 'image' }];
    }
    
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
    
    // Create swipeable carousel
    const swipeContainerId = `swipe-detail-${product.id}`;
    let carouselHtml = '';
    
    if (allMedia.length > 1) {
        const slidesHtml = allMedia.map((media, index) => createMediaElement(media, product.name)).join('');

        const dotsHtml = allMedia.map((_, index) => `
            <div class="swipe-dot ${index === 0 ? 'active' : ''}"></div>
        `).join('');

        carouselHtml = `
            <div id="${swipeContainerId}" class="carousel-container swipe-container">
                <div class="swipe-track carousel-track">${slidesHtml}</div>
                <div class="swipe-dots carousel-dots">${dotsHtml}</div>
            </div>
        `;
    } else {
        carouselHtml = `
            <div class="carousel-container">
                ${createMediaElement(allMedia[0], product.name)}
            </div>
        `;
    }

    // Linkify description
    const linkedDescription = linkifyText(product.description || 'No detailed description available.');

    // Common Instructions
    const commonInstructions = infoContent.commonInstructions || '';
    const instructionsHtml = commonInstructions ? `
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
            <div class="flex items-start">
                <i class="fas fa-info-circle text-yellow-600 text-xl mr-3 mt-1"></i>
                <div>
                    <h3 class="text-sm font-bold text-gray-800 mb-1">Important Instructions</h3>
                    <p class="text-sm text-gray-700 whitespace-pre-wrap">${commonInstructions}</p>
                </div>
            </div>
        </div>
    ` : '';

    // Similar Products
    const similarProductsHtml = renderSimilarProducts(product.id, product.categoryId);

    container.innerHTML = `
        <div class="flex items-center justify-between p-3 bg-white border-b sticky top-0 z-10">
            <button onclick="goBack()" class="text-gray-600 hover:text-indigo-600">
                   <i class="fas fa-arrow-left"></i>
            </button>
            <div class="flex items-center">
                <img src="${categoryIcon}" alt="${categoryName}" class="w-6 h-6 rounded-full object-cover mr-2" onerror="this.src='https://placehold.co/40x40/6366f1/fff?text=Icon'">
                <span class="text-md font-semibold text-gray-800">${categoryName}</span>
            </div>
            <div class="text-lg text-gray-500 cursor-pointer">
                <i class="fas fa-ellipsis-v"></i>
            </div>
        </div>
        
        ${carouselHtml}
        
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
                <button class="flex items-center text-gray-600 hover:text-green-500 transition duration-150" onclick="openShareModal('${product.id}')">
                    <i class="fas fa-share-alt text-2xl"></i>
                    <span class="ml-2 text-sm font-semibold">Share</span>
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
            <div class="text-gray-700 mb-6 whitespace-pre-wrap">${linkedDescription}</div>
            ${specificationsList.length > 0 ? `
            <div class="mb-6">
                <h2 class="text-xl font-bold text-gray-800 mb-2">Specifications / Key Features</h2>
                <ul class="list-none space-y-1">${specificationsList}</ul>
            </div>
            ` : ''}
            ${instructionsHtml}
        </div>
        ${similarProductsHtml}
        <div class="h-32 sm:h-40"></div> 
    `;
    showPage('product-detail');
    
    if (allMedia.length > 1) {
        setTimeout(() => initializeSwipeGesture(swipeContainerId, allMedia, product.id), 0);
    }
    
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    if (addToCartBtn) {
        addToCartBtn.onclick = () => addToCart(product.id);
    }
}

// --- SHARE MODAL ---
window.openShareModal = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    activeProduct = product;
    
    if ($shareModal) {
        $shareModal.classList.remove('hidden');
        const copyBtn = document.getElementById('copy-link-text');
        if (copyBtn) copyBtn.textContent = 'Copy Link';
    }
}

window.closeShareModal = function() {
    if ($shareModal) {
        $shareModal.classList.add('hidden');
    }
}

window.shareVia = function(platform) {
    if (!activeProduct) return;
    
    const productLink = `${APP_BASE_URL}?product=${activeProduct.id}`;
    const price = activeProduct.retailPrice || activeProduct.price || 0;
    
    const shareText = `🛍️ *${activeProduct.name}*

💰 Price: ₹${price.toFixed(2)}
🆔 Product ID: ${activeProduct.id}

📱 View Product: ${productLink}

Check out this amazing product!`;
    
    const encodedText = encodeURIComponent(shareText);
    const encodedLink = encodeURIComponent(productLink);
    
    let shareUrl = '';
    
    switch(platform) {
        case 'whatsapp':
            shareUrl = `https://wa.me/?text=${encodedText}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
            break;
        case 'telegram':
            shareUrl = `https://t.me/share/url?url=${encodedLink}&text=${encodeURIComponent(activeProduct.name)}`;
            break;
        case 'copy':
            if (copyTextToClipboard(shareText)) {
                const copyBtn = document.getElementById('copy-link-text');
                if (copyBtn) {
                    copyBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy mr-2"></i>Copy Link';
                    }, 2000);
                }
                showMessage("Link copied to clipboard!", 'success');
            } else {
                showMessage("Failed to copy link.", 'error');
            }
            return;
    }
    
    if (shareUrl) {
        window.open(shareUrl, '_blank');
        closeShareModal();
    }
}
    
// --- WHATSAPP CHAT ---
window.openWhatsAppChat = function(productName, productId) {
    if (!whatsappNumber) {
        showMessage("Admin WhatsApp number is not set.", 'error');
        return;
    }
    
    const product = allProducts.find(p => p.id === productId);
    const price = product?.retailPrice || product?.price || 0;
    
    const productLink = `${APP_BASE_URL}?product=${productId}`;
    
    const message = `🛍️ *${productName}*

💰 Price: ₹${price.toFixed(2)}
🆔 Product ID: ${productId}

📱 View Product: ${productLink}

Hello, I'm interested in this product. Could you provide more details?`;
    
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

window.openWhatsAppChatForCart = function() {
    if (!whatsappNumber) {
        showMessage("Admin WhatsApp number is not set.", 'error');
        return;
    }
    if (cart.length === 0) {
        showMessage("Your cart is empty.", 'error');
        return;
    }

    let message = "🛒 *My Shopping Cart*\n\n";
    let total = 0;

    cart.forEach((item, index) => {
        const productLink = `${APP_BASE_URL}?product=${item.id}`;
        
        message += `${index + 1}. *${item.name}*\n`;
        message += `   Qty: ${item.quantity} × ₹${item.price.toFixed(2)} = ₹${(item.price * item.quantity).toFixed(2)}\n`;
        message += `   🔗 View: ${productLink}\n\n`;
        
        total += item.price * item.quantity;
    });

    message += `━━━━━━━━━━━━━━━\n`;
    message += `💵 *Total: ₹${total.toFixed(2)}*\n\n`;
    message += `I would like to place this order. Please confirm availability and delivery details.`;
    
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
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

// --- COMMENT FUNCTIONS ---
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
    if (!container || !noCommentsMsg) return;
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

// --- CART FUNCTIONS ---
function loadCartFromStorage() {
    try {
        cart = JSON.parse(localStorage.getItem('socialShopCart')) || [];
    } catch (error) {
        console.error('Error loading cart:', error);
        cart = [];
    }
}

function saveCartToStorage() {
    try {
        localStorage.setItem('socialShopCart', JSON.stringify(cart));
    } catch (error) {
        console.error('Error saving cart:', error);
    }
}

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

window.toggleCart = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        showMessage("Could not find product.", "error");
        return;
    }
    
    const existingItemIndex = cart.findIndex(item => item.id === productId);
    const retailPrice = product.retailPrice || product.price || 0;
    
    if (existingItemIndex !== -1) {
        cart.splice(existingItemIndex, 1);
        showMessage(`${product.name} removed from cart!`, 'info');
    } else {
        const firstMedia = product.mediaUrls && product.mediaUrls.length > 0 ? product.mediaUrls[0] : null;
        const imageUrl = firstMedia?.url || product.imageUrl || `https://placehold.co/80x80/E2E8F0/333?text=Img`;
        
        cart.push({
            id: product.id,
            name: product.name,
            price: retailPrice,
            imageUrl: imageUrl,
            quantity: 1
        });
        showMessage(`${product.name} added to cart!`, 'success');
    }
    
    saveCartToStorage();
    updateCartUI();
    updateBookmarkIcon(productId);
    
    const cartPageEl = document.getElementById('cart-page');
    if (cartPageEl && cartPageEl.classList.contains('active')) {
        renderCartPage();
    }
}

function updateBookmarkIcon(productId) {
    const bookmarkIcon = document.getElementById(`bookmark-${productId}`);
    if (bookmarkIcon) {
        const inCart = isProductInCart(productId);
        if (inCart) {
            bookmarkIcon.classList.remove('far');
            bookmarkIcon.classList.add('fas', 'in-cart');
        } else {
            bookmarkIcon.classList.remove('fas', 'in-cart');
            bookmarkIcon.classList.add('far');
        }
    }
}

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
        const firstMedia = product.mediaUrls && product.mediaUrls.length > 0 ? product.mediaUrls[0] : null;
        const imageUrl = firstMedia?.url || product.imageUrl || `https://placehold.co/80x80/E2E8F0/333?text=Img`;
        
        cart.push({
            id: product.id,
            name: product.name,
            price: retailPrice,
            imageUrl: imageUrl,
            quantity: 1
        });
    }

    saveCartToStorage();
    updateCartUI();
    showMessage(`${product.name} added to cart!`, 'success');
}

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
                    <img src="${item.imageUrl}" 
                         alt="${item.name}" 
                         class="cart-item-img" 
                         onclick="showProductDetail('${item.id}')"
                         onerror="this.src='https://placehold.co/80x80/E2E8F0/333?text=Error'">
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

window.removeFromCart = function(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCartToStorage();
    renderCartPage();
    updateCartUI();
    updateBookmarkIcon(productId);
    
    const homePageEl = document.getElementById('home-page');
    const searchInputEl = document.getElementById('search-input');
    if (homePageEl && homePageEl.classList.contains('active') && searchInputEl && searchInputEl.value === '') {
        renderHomeProductList(allProducts);
    }
    
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