import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, onSnapshot, collection, query, serverTimestamp, setLogLevel } from 'firebase/firestore';
import { Package, PlusCircle, Loader2, DollarSign, List, XCircle, Users } from 'lucide-react';

// ----------------------
// 1. FIREBASE SETUP
// ----------------------

// Fallback configuration for external (Render) deployment
// NOTE: For security in a real application, you would use Render Environment Variables 
// instead of hardcoding a mock config.
const FALLBACK_FIREBASE_CONFIG = {
    apiKey: "MOCK_API_KEY", 
    authDomain: "mock-auth-domain.firebaseapp.com",
    projectId: "mock-project-id",
    storageBucket: "mock-storage-bucket.appspot.com",
    messagingSenderId: "MOCK_SENDER_ID",
    appId: "MOCK_APP_ID"
};

const DEFAULT_APP_ID = 'fresh-eats-admin-dev'; // Used if __app_id is missing

// Check for Canvas variables first, then fallback
const appId = typeof __app_id !== 'undefined' ? __app_id : DEFAULT_APP_ID;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let firebaseConfig;
try {
    firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config 
        ? JSON.parse(__firebase_config) 
        : FALLBACK_FIREBASE_CONFIG;
} catch (e) {
    firebaseConfig = FALLBACK_FIREBASE_CONFIG;
}

// The collection path for public data (products)
const getProductCollectionPath = (appId) => `/artifacts/${appId}/public/data/products`;

setLogLevel('error'); // Set log level to reduce console noise unless debugging

let app;
let db;
let auth;

// ----------------------
// 2. MAIN APP COMPONENT
// ----------------------

const App = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState(null);
  
  // State for the new product form
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: 0,
    category: 'Main Dish',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const categories = ['Main Dish', 'Appetizer', 'Dessert', 'Drink'];


  // --- Firebase Initialization and Auth ---
  useEffect(() => {
    // Check for a usable config before attempting initialization
    if (!firebaseConfig || !firebaseConfig.projectId) {
        setError("Initialization Failed: Firebase configuration is missing or invalid.");
        setIsAuthReady(true);
        return;
    }
    
    try {
      app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      auth = getAuth(app);

      // Listen for auth state changes to set userId and mark ready
      const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          // Attempt sign-in if not authenticated
          try {
            // Use custom token if provided (e.g., in Canvas), otherwise sign in anonymously
            if (initialAuthToken) {
              await signInWithCustomToken(auth, initialAuthToken);
            } else {
              await signInAnonymously(auth);
            }
          } catch (e) {
            console.error("Firebase Auth Error:", e);
            // This is expected if using the mock config, so we set a mock ID
            setUserId(crypto.randomUUID()); 
            console.warn("Using mock user ID due to failed auth, which is expected with mock config.");
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribeAuth();
    } catch (e) {
      console.error("Firebase Init Error:", e);
      setError(`Initialization Error: ${e.message}.`);
      setIsAuthReady(true); 
    }
  }, []);

  // --- Firestore Listener ---
  useEffect(() => {
    // Only proceed if Firebase is initialized and Auth is ready
    if (!isAuthReady || !db || !userId || error) return;

    const productsRef = collection(db, getProductCollectionPath(appId));
    const productsQuery = query(productsRef);

    // Set up real-time listener for products
    const unsubscribeSnapshot = onSnapshot(productsQuery, (snapshot) => {
      try {
        const productList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(productList.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
        setLoading(false);
      } catch (e) {
        console.error("Firestore Snapshot Error:", e);
        // This often happens if security rules are too restrictive for anonymous users
        setError(`Data fetch failed: ${e.message}. Please verify Firestore rules.`);
        setLoading(false);
      }
    }, (e) => {
      console.error("onSnapshot failed:", e);
      setError(`Real-time data error: ${e.message}. Please verify Firestore rules.`);
      setLoading(false);
    });

    // Cleanup function
    return () => unsubscribeSnapshot();
  }, [isAuthReady, userId, error]); 

  // --- Data Handlers ---

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setNewProduct(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Prevent submission if not ready OR if using the mock config
    if (isSubmitting || !db || !userId || !isAuthReady || error || firebaseConfig === FALLBACK_FIREBASE_CONFIG) {
        if (firebaseConfig === FALLBACK_FIREBASE_CONFIG) {
             setError("Write operation denied: Cannot write to Firestore when using the external mock configuration. Data saving only works inside Canvas.");
        }
        return;
    }
    
    if (!newProduct.name || newProduct.price <= 0) {
      setError("Product name is required and price must be greater than 0.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const collectionPath = getProductCollectionPath(appId);
      await addDoc(collection(db, collectionPath), {
        ...newProduct,
        price: parseFloat(newProduct.price.toFixed(2)), 
        available: true,
        createdAt: serverTimestamp(),
        createdBy: userId,
      });

      setNewProduct({ name: '', description: '', price: 0, category: 'Main Dish' });
    } catch (e) {
      console.error("Error adding document: ", e);
      setError(`Failed to add product: ${e.message}. Check your Firebase rules.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render Functions ---

  const renderProductForm = () => (
    <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-100">
      <h2 className="flex items-center text-xl font-bold text-gray-700 mb-4 border-b pb-2">
        <PlusCircle className="w-5 h-5 mr-2 text-indigo-500" />
        Add New Menu Item
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={newProduct.name}
            onChange={handleInputChange}
            placeholder="e.g., Spicy Tuna Roll"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            id="description"
            name="description"
            value={newProduct.description}
            onChange={handleInputChange}
            rows="3"
            placeholder="A brief description of the dish."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500"
          ></textarea>
        </div>
        <div className="flex space-x-4">
          <div className="flex-1">
            <label htmlFor="price" className="block text-sm font-medium text-gray-700">Price (USD)</label>
            <div className="relative mt-1 rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                id="price"
                name="price"
                value={newProduct.price}
                onChange={handleInputChange}
                step="0.01"
                min="0.01"
                required
                className="block w-full rounded-md pl-10 pr-2 border border-gray-300 p-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex-1">
            <label htmlFor="category" className="block text-sm font-medium text-gray-700">Category</label>
            <select
              id="category"
              name="category"
              value={newProduct.category}
              onChange={handleInputChange}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:ring-indigo-500 focus:border-indigo-500"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !isAuthReady || !userId || firebaseConfig === FALLBACK_FIREBASE_CONFIG}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <PlusCircle className="w-5 h-5 mr-2" />
              {firebaseConfig === FALLBACK_FIREBASE_CONFIG ? 'Read-Only Mode' : 'Add Product'}
            </>
          )}
        </button>
        {firebaseConfig === FALLBACK_FIREBASE_CONFIG && (
            <p className="text-xs text-red-500 mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                This app is in **Read-Only Mode** because it is deployed outside of the Canvas environment. To add products, please use the application within Canvas.
            </p>
        )}
      </form>
    </div>
  );

  const renderProductList = () => (
    <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-100">
      <h2 className="flex items-center text-xl font-bold text-gray-700 mb-4 border-b pb-2">
        <List className="w-5 h-5 mr-2 text-emerald-500" />
        Current Menu Items ({products.length})
      </h2>
      {loading ? (
        <div className="text-center py-8 text-gray-500">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          Loading products...
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-md">
          <Package className="w-8 h-8 mx-auto mb-2" />
          No products added yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => (
            <li key={product.id} className="p-3 border rounded-md hover:bg-gray-50 transition duration-100 flex justify-between items-center">
              <div>
                <p className="font-semibold text-gray-800">{product.name}</p>
                <p className="text-sm text-gray-500 italic">{product.description || 'No description provided.'}</p>
              </div>
              <div className="text-right">
                <span className="font-bold text-lg text-indigo-600">${product.price.toFixed(2)}</span>
                <span className="block text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full mt-1">
                  {product.category}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const renderHeader = () => (
    <header className="bg-white shadow-md p-4 mb-8 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Package className="w-8 h-8 text-indigo-600" />
          <h1 className="text-2xl font-extrabold text-gray-800">Fresh Eats Admin Panel</h1>
        </div>
        <div className="text-sm text-gray-600 flex items-center space-x-2">
          <Users className="w-4 h-4 text-gray-500" />
          <span>Admin User:</span>
          <span className="font-mono text-xs bg-gray-100 p-1 rounded break-all">
            {userId || 'Mock ID...'}
          </span>
        </div>
      </div>
    </header>
  );

  // --- Main Render ---

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-red-50">
        <div className="bg-white p-6 rounded-lg shadow-xl border-l-4 border-red-500">
          <h2 className="flex items-center text-xl font-bold text-red-600 mb-2">
            <XCircle className="w-6 h-6 mr-2" />
            Application Error
          </h2>
          <p className="text-gray-700">{error}</p>
          <p className="text-sm mt-4 text-red-500">
            If this error persists, there may be an issue with Firebase rules or service availability.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {renderHeader()}
      <main className="max-w-7xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            {renderProductForm()}
          </div>
          <div className="lg:col-span-2">
            {renderProductList()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
