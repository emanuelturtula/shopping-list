import { useEffect, useState } from 'react';
import { api } from './api.js';
import Products from './Products.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('products');

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(false));
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Lista del súper</h1>
        {me && <span className="who">{me.email}</span>}
      </header>
      <nav>
        <button className={tab === 'lists' ? 'active' : ''} onClick={() => setTab('lists')}>Listas</button>
        <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Productos</button>
      </nav>
      <main>
        {me === false && <p className="error">No se pudo identificar al usuario.</p>}
        {tab === 'products' && <Products />}
        {tab === 'lists' && <p className="empty">Las listas de compras llegan en el próximo paso.</p>}
      </main>
    </div>
  );
}
