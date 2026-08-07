import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import ProductEditor from '../../src/pages/product-editor/index.jsx';
import { ToastProvider } from '../../src/components/ui/Toast.jsx';
import { __e2e } from '../../src/services/waBusinessService.js';
import '../../src/styles/tailwind.css';
import '../../src/styles/index.css';

window.__WALINKA_E2E__ = __e2e;

function Outside() {
  return <main style={{ padding: 40 }}><h1>Fuera del editor</h1><Link to="/product-editor">Volver al editor</Link></main>;
}

createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/product-editor" element={<ProductEditor />} />
        <Route path="*" element={<Outside />} />
      </Routes>
    </BrowserRouter>
  </ToastProvider>,
);
