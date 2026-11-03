import { useEffect, useState } from 'react';
import { api } from './api.js';
import Products from './Products.jsx';
import Lists from './Lists.jsx';
import ListView from './ListView.jsx';
import ProductHistory from './ProductHistory.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('lists');
  const [listId, setListId] = useState(null);
  const [productId, setProductId] = useState(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(false));
  }, []);

  const go = (t) => { setTab(t); setListId(null); setProductId(null); };

  let content;
  if (productId) content = <ProductHistory id={productId} onBack={() => setProductId(null)} />;
  else if (tab === 'lists' && listId) content = <ListView id={listId} onBack={() => setListId(null)} onProduct={setProductId} />;
  else if (tab === 'lists') content = <Lists onOpen={setListId} />;
  else content = <Products onOpen={setProductId} />;

  return (
    <div className="app">
      <header>
        <h1>Lista del súper</h1>
        {me && <span className="who">{me.email}</span>}
      </header>
      <nav>
        <button className={tab === 'lists' ? 'active' : ''} onClick={() => go('lists')}>Listas</button>
        <button className={tab === 'products' ? 'active' : ''} onClick={() => go('products')}>Productos</button>
      </nav>
      <main>
        {me === false && <p className="error">No se pudo identificar al usuario.</p>}
        {content}
      </main>
    </div>
  );
}
