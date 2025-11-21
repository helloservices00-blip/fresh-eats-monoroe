import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Assuming you have a basic CSS file for Tailwind imports
import App from './App'; // This assumes your main component is in App.js or App.jsx

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
