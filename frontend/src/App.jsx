import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot } from 'firebase/firestore';
import { MapPin, ShoppingBag, Loader, AlertTriangle, User } from 'lucide-react';

// --- Global Variable Access ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// The main application component
const App = () => {
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);

  // Use a ref to hold Firebase instances
  const firebaseRef = useRef({ db: null, auth: null });

  // 1. Initialize Firebase and Authenticate
  useEffect(() => {
    let unsubscribeAuth = () => {};

    const initFirebase = async () => {
      try {
        if (Object.keys(firebaseConfig).length === 0) {
          throw new Error("Firebase configuration is missing.");
        }

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        firebaseRef.current = { db, auth };

        // Set up Auth State Listener
        unsubscribeAuth = onAuthStateChanged(auth, (user) => {
          if (user) {
            setUserId(user.uid);
          } else {
            setUserId(null);
          }
          setAuthReady(true);
        });

        // Sign in using provided token or anonymously
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }

      } catch (e) {
        console.error("Firebase Initialization Error:", e);
        setError(`Initialization Failed: ${e.message}`);
        setIsLoading(false);
        setAuthReady(true);
      }
    };

    initFirebase();

    return () => unsubscribeAuth();
  }, []);

  // 2. Fetch Data (Real-time listener)
  useEffect(() => {
    if (!authReady || !firebaseRef.current.db) return;

    const db = firebaseRef.current.db;
    const collectionPath = `artifacts/${appId}/public/data/stores`;
    const q = query(collection(db, collectionPath));

    // Listen for real-time updates
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedStores = [];
      snapshot.forEach((doc) => {
        fetchedStores.push({ id: doc.id, ...doc.data() });
      });
      // Sort in memory (as orderBy() can require indexes)
      fetchedStores.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setStores(fetchedStores);
      setIsLoading(false);
    }, (e) => {
      console.error("Firestore Fetch Error:", e);
      // The most common error here is the Firestore Rule not allowing reads for unauthenticated users.
      setError("Failed to fetch store catalog. Check Firestore Rules.");
      setIsLoading(false);
    });

    // Cleanup listener on component unmount
    return () => unsubscribe();
  }, [authReady]);

  const StoreCard = ({ name, category, description, rating, deliveryTime }) => (
    <div className="bg-white p-5 rounded-xl shadow-lg hover:shadow-xl transition duration-300 border border-gray-100 flex flex-col justify-between h-full">
      <div className="flex justify-between items-start mb-3">
        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
          category === 'Food' ? 'bg-green-100 text-green-800' : 
          category === 'Grocery' ? 'bg-blue-100 text-blue-800' : 
          'bg-gray-100 text-gray-800'
        }`}>
          {category}
        </span>
        <span className="text-yellow-500 font-bold flex items-center">
          ⭐ {rating}
        </span>
      </div>
      <h3 className="text-xl font-bold text-gray-800 mb-2 truncate">{name}</h3>
      <p className="text-sm text-gray-500 mb-3 line-clamp-2">{description}</p>
      <div className="flex justify-between items-center text-sm text-gray-600 border-t pt-3 mt-auto">
        <div className="flex items-center">
          <MapPin className="w-4 h-4 mr-1 text-red-500" />
          <span>{deliveryTime} min</span>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition duration-200 shadow-md">
          Order Now
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    if (error) {
      return (
        <div className="text-center p-10 bg-red-50 rounded-lg border-red-300 border mt-10">
          <AlertTriangle className="w-8 h-8 mx-auto text-red-600 mb-3" />
          <h2 className="text-xl font-semibold text-red-700 mb-2">Application Error</h2>
          <p className="text-red-600">{error}</p>
          {userId && <p className="text-xs text-red-500 mt-2">Current User ID: {userId}</p>}
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-20">
          <Loader className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="mt-4 text-gray-600">Loading delivery options...</p>
        </div>
      );
    }

    if (stores.length === 0) {
      return (
        <div className="text-center p-20 bg-gray-50 rounded-xl mt-10">
          <ShoppingBag className="w-10 h-10 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700">No Stores Found</h2>
          <p className="text-gray-500">The catalog is currently empty. The administrator needs to add stores.</p>
          <p className="text-sm text-gray-400 mt-4">Current App ID: {appId}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores.map((store) => (
          <StoreCard key={store.id} {...store} />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white shadow-md p-5 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-indigo-600">FreshEats (Client)</h1>
          <div className="flex items-center text-sm text-gray-500">
            <MapPin className="w-4 h-4 mr-1" /> Delivery Service
          </div>
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-gray-500" />
            <span className="text-gray-700 font-medium hidden sm:inline">User ID: {userId ? userId.substring(0, 8) + '...' : 'N/A'}</span>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto p-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Explore Restaurants Near You</h2>
        <p className="text-gray-500 mb-8">Fastest delivery and great quality food guaranteed.</p>
        
        {renderContent()}

      </main>
    </div>
  );
};

export default App;
