import { useEffect, useState } from 'react';
import { api, money } from './api.js';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [error, setError] = useState('');

  const load = () => api.products().then(setProducts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createProduct({ name, unit });
      setName('');
      setUnit('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function setPhoto(product, file) {
    if (!file) return;
    setError('');
    try {
      await api.uploadPhoto(product.id, file);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <form className="add" onSubmit={add}>
        <input placeholder="Producto (ej. Leche entera)" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Unidad" value={unit} onChange={(e) => setUnit(e.target.value)} className="unit" />
        <button type="submit">Agregar</button>
      </form>
      {error && <p className="error">{error}</p>}
      {products.length === 0 && <p className="empty">Todavía no hay productos.</p>}
      <ul className="products">
        {products.map((p) => (
          <li key={p.id}>
            <label className="photo" title="Cambiar foto">
              {p.photo ? <img src={`/photos/${p.photo}`} alt={p.name} /> : <span>📷</span>}
              <input type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => setPhoto(p, e.target.files[0])} />
            </label>
            <div className="info">
              <strong>{p.name}</strong>
              {p.unit && <small>{p.unit}</small>}
            </div>
            <span className="price">{money(p.last_price)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
