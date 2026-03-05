const fs = require("fs");
const path = require("path");

const cartFile = path.join(__dirname, "../data/cart.json");
const productsFile = path.join(__dirname, "../data/products.json");

// ================= READ / WRITE =================
const readCart = () => {
    // Cart file có thể đang ở 2 dạng:
    // 1) { items: [...] }
    // 2) [...] (legacy)
    if (!fs.existsSync(cartFile)) return { items: [] };

    const raw = fs.readFileSync(cartFile, "utf-8");
    const parsed = raw ? JSON.parse(raw) : null;

    if (Array.isArray(parsed)) return { items: parsed };
    if (parsed && Array.isArray(parsed.items)) return { items: parsed.items };

    return { items: [] };
};

const writeCart = (cart) => {
    // Luôn ghi theo chuẩn { items: [...] }
    fs.writeFileSync(cartFile, JSON.stringify(cart, null, 2));
};

const readProducts = () => {
    return JSON.parse(fs.readFileSync(productsFile, "utf-8"));
};

// ================= CART LOGIC =================
const getCartView = () => {
    const cart = readCart(); // { items: [{ productId, quantity }] }
    const products = readProducts();

    const detailedItems = cart.items
        .map((ci) => {
            const product = products.find((p) => Number(p.id) === Number(ci.productId));
            if (!product) return null; // product bị xoá / id không tồn tại

            const price = Number(product.price);
            const quantity = Number(ci.quantity);

            return {
                productId: Number(ci.productId),
                quantity,
                product: {
                    id: Number(product.id),
                    name: product.name,
                    price,
                    category: product.category,
                    isActive: product.isActive,
                    image: product.image, // nếu có
                },
                lineTotal: price * quantity,
            };
        })
        .filter(Boolean);

    const totalQuantity = detailedItems.reduce((sum, i) => sum + i.quantity, 0);
    const totalItems = detailedItems.length;
    const totalPrice = detailedItems.reduce((sum, i) => sum + i.lineTotal, 0);

    return {
        items: detailedItems,
        summary: {
            totalItems,
            totalQuantity,
            totalPrice,
        },
    };
};

const addItem = (productId, quantity) => {
    const products = readProducts();
    const product = products.find(p => p.id === productId);

    if (!product) {
        throw new Error("productId không tồn tại");
    }

    const cart = readCart();
    const existing = cart.items.find((i) => i.productId === productId);

    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.items.push({ productId, quantity });
    }

    writeCart(cart);
    return getCartView();
};

const updateItem = (productId, quantity) => {
    const cart = readCart();
    const item = cart.items.find((i) => i.productId === productId);

    if (!item) throw new Error("Sản phẩm không có trong giỏ");

    if (quantity <= 0) {
        return removeItem(productId);
    }

    item.quantity = quantity;
    writeCart(cart);
    return getCartView();
};

const removeItem = (productId) => {
    const cart = readCart();
    cart.items = cart.items.filter((i) => i.productId !== productId);
    writeCart(cart);
    return getCartView();
};

const clearCart = () => {
    const cart = { items: [] };
    writeCart(cart);
    return getCartView();
};

module.exports = {
    getCartView,
    addItem,
    updateItem,
    removeItem,
    clearCart,
};