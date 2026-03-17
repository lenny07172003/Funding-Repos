"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Rocket,
  ShoppingCart,
  ArrowLeft,
  Plus,
  Minus,
  Star,
  X,
} from "lucide-react";

interface MerchItem {
  id: number;
  name: string;
  category: string;
  price: number;
  rating: number;
  reviews: number;
  description: string;
  colors: string[];
  sizes?: string[];
  emoji: string;
}

const merchItems: MerchItem[] = [
  {
    id: 1,
    name: "Research Revolution Tee",
    category: "Clothing",
    price: 29.99,
    rating: 4.8,
    reviews: 124,
    description:
      "Premium cotton tee featuring the iconic PrimetimeResearch logo. Perfect for lab days and beyond.",
    colors: ["Black", "White", "Navy"],
    sizes: ["S", "M", "L", "XL", "2XL"],
    emoji: "👕",
  },
  {
    id: 2,
    name: "Innovation Hoodie",
    category: "Clothing",
    price: 54.99,
    rating: 4.9,
    reviews: 89,
    description:
      "Heavyweight fleece hoodie with embroidered logo. Stay warm during those late-night research sessions.",
    colors: ["Charcoal", "Navy", "Forest Green"],
    sizes: ["S", "M", "L", "XL", "2XL"],
    emoji: "🧥",
  },
  {
    id: 3,
    name: "Lab Genius Mug",
    category: "Drinkware",
    price: 16.99,
    rating: 4.7,
    reviews: 203,
    description:
      "15oz ceramic mug with 'Fueled by Coffee & Research' print. Microwave and dishwasher safe.",
    colors: ["White", "Black"],
    emoji: "☕",
  },
  {
    id: 4,
    name: "Data-Driven Dad Hat",
    category: "Accessories",
    price: 24.99,
    rating: 4.6,
    reviews: 67,
    description:
      "Classic dad hat with embroidered PrimetimeResearch wordmark. Adjustable strap for perfect fit.",
    colors: ["Black", "White", "Khaki"],
    emoji: "🧢",
  },
  {
    id: 5,
    name: "Hypothesis Crewneck",
    category: "Clothing",
    price: 44.99,
    rating: 4.8,
    reviews: 56,
    description:
      "Midweight crewneck sweatshirt with screen-printed scientific formula design on the back.",
    colors: ["Heather Grey", "Black", "Cream"],
    sizes: ["S", "M", "L", "XL", "2XL"],
    emoji: "👔",
  },
  {
    id: 6,
    name: "Eureka! Travel Tumbler",
    category: "Drinkware",
    price: 22.99,
    rating: 4.9,
    reviews: 145,
    description:
      "20oz double-wall insulated tumbler. Keeps drinks hot 8 hrs or cold 24 hrs. Leak-proof lid.",
    colors: ["Matte Black", "Stainless Steel", "Navy"],
    emoji: "🥤",
  },
  {
    id: 7,
    name: "R&D Joggers",
    category: "Clothing",
    price: 49.99,
    rating: 4.7,
    reviews: 42,
    description:
      "Ultra-soft joggers with tapered fit and subtle logo on the hip. Zippered pockets.",
    colors: ["Black", "Charcoal", "Navy"],
    sizes: ["S", "M", "L", "XL", "2XL"],
    emoji: "👖",
  },
  {
    id: 8,
    name: "Breakthrough Tote Bag",
    category: "Accessories",
    price: 19.99,
    rating: 4.5,
    reviews: 78,
    description:
      "Heavy-duty canvas tote with reinforced handles. Spacious enough for laptops, books, and lab gear.",
    colors: ["Natural", "Black"],
    emoji: "👜",
  },
  {
    id: 9,
    name: "Molecule Sticker Pack",
    category: "Accessories",
    price: 9.99,
    rating: 4.9,
    reviews: 312,
    description:
      "Set of 12 die-cut vinyl stickers featuring molecule designs and research slogans. Waterproof.",
    colors: ["Multicolor"],
    emoji: "🔬",
  },
  {
    id: 10,
    name: "Think Tank Polo",
    category: "Clothing",
    price: 39.99,
    rating: 4.6,
    reviews: 34,
    description:
      "Performance polo with moisture-wicking fabric and embroidered chest logo. Conference-ready.",
    colors: ["White", "Navy", "Black"],
    sizes: ["S", "M", "L", "XL", "2XL"],
    emoji: "👕",
  },
  {
    id: 11,
    name: "Lab Notes Notebook",
    category: "Accessories",
    price: 14.99,
    rating: 4.8,
    reviews: 96,
    description:
      "200-page hardcover notebook with dot grid pages and PrimetimeResearch branding. Lay-flat binding.",
    colors: ["Black", "Navy"],
    emoji: "📓",
  },
  {
    id: 12,
    name: "Quantum Leap Zip-Up",
    category: "Clothing",
    price: 59.99,
    rating: 4.9,
    reviews: 28,
    description:
      "Premium full-zip jacket with tech fleece lining. Sleek minimal design with embossed logo.",
    colors: ["Black", "Charcoal"],
    sizes: ["S", "M", "L", "XL", "2XL"],
    emoji: "🧥",
  },
];

const categories = ["All", "Clothing", "Drinkware", "Accessories"];

interface CartItem {
  item: MerchItem;
  quantity: number;
  selectedColor: string;
  selectedSize?: string;
}

export default function MerchPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MerchItem | null>(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");

  const filteredItems =
    activeCategory === "All"
      ? merchItems
      : merchItems.filter((item) => item.category === activeCategory);

  const cartTotal = cart.reduce(
    (sum, ci) => sum + ci.item.price * ci.quantity,
    0
  );
  const cartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0);

  function addToCart() {
    if (!selectedItem) return;
    if (selectedItem.sizes && !selectedSize) return;

    const existing = cart.find(
      (ci) =>
        ci.item.id === selectedItem.id &&
        ci.selectedColor === selectedColor &&
        ci.selectedSize === selectedSize
    );

    if (existing) {
      setCart(
        cart.map((ci) =>
          ci === existing ? { ...ci, quantity: ci.quantity + 1 } : ci
        )
      );
    } else {
      setCart([
        ...cart,
        {
          item: selectedItem,
          quantity: 1,
          selectedColor,
          selectedSize: selectedSize || undefined,
        },
      ]);
    }
    setSelectedItem(null);
    setCartOpen(true);
  }

  function updateQuantity(index: number, delta: number) {
    setCart(
      cart
        .map((ci, i) =>
          i === index ? { ...ci, quantity: ci.quantity + delta } : ci
        )
        .filter((ci) => ci.quantity > 0)
    );
  }

  function openItemModal(item: MerchItem) {
    setSelectedItem(item);
    setSelectedColor(item.colors[0]);
    setSelectedSize(item.sizes ? item.sizes[1] : "");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/primetimeresearch"
                className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium hidden sm:inline">Back</span>
              </Link>
              <div className="flex items-center gap-2">
                <Rocket className="w-6 h-6 text-indigo-600" />
                <span className="text-lg font-bold text-gray-900">
                  Primetime<span className="text-indigo-600">Research</span>
                </span>
                <span className="text-sm text-gray-400 font-medium ml-1">
                  Merch
                </span>
              </div>
            </div>
            <button
              onClick={() => setCartOpen(!cartOpen)}
              className="relative flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Cart</span>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">
            Official Merch Store
          </h1>
          <p className="text-indigo-100 text-lg max-w-xl mx-auto">
            Wear your passion for research. Premium gear for scientists,
            innovators, and R&D enthusiasts.
          </p>
        </div>
      </section>

      {/* Category Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => openItemModal(item)}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-indigo-200 transition-all duration-300 text-left group"
            >
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 flex items-center justify-center h-48">
                <span className="text-7xl group-hover:scale-110 transition-transform duration-300">
                  {item.emoji}
                </span>
              </div>
              <div className="p-5">
                <div className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">
                  {item.category}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  {item.name}
                </h3>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-0.5">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-sm text-gray-600">{item.rating}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    ({item.reviews} reviews)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-gray-900">
                    ${item.price.toFixed(2)}
                  </span>
                  <span className="text-sm text-indigo-600 font-medium group-hover:underline">
                    View Details
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSelectedItem(null)}
          />
          <div className="relative bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-12 flex items-center justify-center rounded-t-2xl">
              <span className="text-8xl">{selectedItem.emoji}</span>
            </div>
            <div className="p-6">
              <div className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">
                {selectedItem.category}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {selectedItem.name}
              </h2>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-0.5">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-medium text-gray-700">
                    {selectedItem.rating}
                  </span>
                </div>
                <span className="text-sm text-gray-400">
                  ({selectedItem.reviews} reviews)
                </span>
              </div>
              <p className="text-gray-500 text-sm mb-6">
                {selectedItem.description}
              </p>

              {/* Color Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        selectedColor === color
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size Selection */}
              {selectedItem.sizes && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Size
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.sizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`w-12 h-10 rounded-lg text-sm font-medium border transition-colors ${
                          selectedSize === size
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-gray-900">
                  ${selectedItem.price.toFixed(2)}
                </span>
                <button
                  onClick={addToCart}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Sidebar */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCartOpen(false)}
          />
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                Shopping Cart ({cartCount})
              </h2>
              <button
                onClick={() => setCartOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Your cart is empty</p>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="mt-4 text-indigo-600 font-medium hover:underline"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((ci, index) => (
                    <div
                      key={`${ci.item.id}-${ci.selectedColor}-${ci.selectedSize}`}
                      className="flex gap-4 p-4 bg-gray-50 rounded-xl"
                    >
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-3xl flex-shrink-0">
                        {ci.item.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 text-sm truncate">
                          {ci.item.name}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {ci.selectedColor}
                          {ci.selectedSize ? ` / ${ci.selectedSize}` : ""}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(index, -1)}
                              className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-sm font-medium w-6 text-center">
                              {ci.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(index, 1)}
                              className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="font-semibold text-sm text-gray-900">
                            ${(ci.item.price * ci.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-xl font-bold text-gray-900">
                    ${cartTotal.toFixed(2)}
                  </span>
                </div>
                <button className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
                  Checkout
                </button>
                <p className="text-xs text-gray-400 text-center mt-3">
                  Shipping calculated at checkout
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
