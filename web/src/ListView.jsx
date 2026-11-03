import { useEffect, useState } from 'react';
import { api, money, date } from './api.js';

export default function ListView({ id, onBack, onProduct }) {
  const [list, setList] = useState(null);
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [pricing, setPricing] = useState(null); // item id whose price form is open
  const [error, setError] = useState('');

  useEffect(() => {
    api.list(id).then(setList).catch((e) => setError(e.message));
    api.products().then(setProducts).catch(() => {});
  }, [id]);

  async function run(fn) {
    setError('');
    try {
      const next = await fn();
      if (next) setList(next);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  async function add(e) {
    e.preventDefault();
    const match = products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    const ok = await run(() => api.addItem(id, match ? { product_id: match.id, quantity: qty } : { name, quantity: qty }));
    if (ok) {
      setName('');
      setQty('1');
      if (!match) api.products().then(setProducts).catch(() => {});
    }
  }

  if (!list) return error ? <p className="error">{error}</p> : null;

  const shopping = list.status === 'shopping';
  const nextStatus = { draft: ['shopping', 'Empezar a comprar'], shopping: ['done', 'Terminar compra'], done: ['shopping', 'Reabrir'] }[list.status];

  return (
    <section>
      <button className="link" onClick={onBack}>← Listas</button>
      <div className="list-head">
        <input className="title" value={list.name}
          onChange={(e) => setList({ ...list, name: e.target.value })}
          onBlur={(e) => run(() => api.updateList(id, { name: e.target.value }))} />
        <input placeholder="Súper (ej. Coto)" value={list.store ?? ''}
          onChange={(e) => setList({ ...list, store: e.target.value })}
          onBlur={(e) => run(() => api.updateList(id, { store: e.target.value }))} />
      </div>

      <div className="totals card">
        <div>
          <small>Estimado</small>
          <strong>{money(list.estimated_total)}</strong>
          {list.items_without_price > 0 && <small className="muted">{list.items_without_price} sin precio</small>}
        </div>
        <div>
          <small>Anotado</small>
          <strong>{money(list.spent_total)}</strong>
        </div>
        <button className="primary" onClick={() => run(() => api.updateList(id, { status: nextStatus[0] }))}>
          {nextStatus[1]}
        </button>
      </div>

      <form className="add" onSubmit={add}>
        <input list="products" placeholder="Agregar producto" value={name} onChange={(e) => setName(e.target.value)} required />
        <datalist id="products">
          {products.map((p) => <option key={p.id} value={p.name} />)}
        </datalist>
        <input className="qty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        <button type="submit" aria-label="Agregar">+</button>
      </form>
      {error && <p className="error">{error}</p>}
      {list.items.length === 0 && <p className="empty">La lista está vacía.</p>}

      <ul className="rows">
        {list.items.map((it) => (
          <li key={it.id} className={`item ${it.checked ? 'checked' : ''}`}>
            <div className="item-main">
              <input type="checkbox" checked={!!it.checked}
                onChange={(e) => run(() => api.updateItem(id, it.id, { checked: e.target.checked }))} />
              <button className="thumb" onClick={() => onProduct(it.product_id)} title="Ver historial">
                {it.photo ? <img src={`/photos/${it.photo}`} alt="" /> : <span>📷</span>}
              </button>
              <div className="info" onClick={() => onProduct(it.product_id)}>
                <strong>{it.name}</strong>
                <small>
                  {it.price != null
                    ? <>Hoy {money(it.price)}{it.promo && <span className="promo"> · {it.promo}</span>}</>
                    : it.last_price != null
                      ? <>Último {money(it.last_price)} ({date(it.last_price_at)}){it.last_promo && ' con promo'}</>
                      : 'Sin precio todavía'}
                </small>
              </div>
              <div className="qty-ctl">
                <button onClick={() => it.quantity > 1 && run(() => api.updateItem(id, it.id, { quantity: it.quantity - 1 }))}>−</button>
                <span>{it.quantity}</span>
                <button onClick={() => run(() => api.updateItem(id, it.id, { quantity: it.quantity + 1 }))}>+</button>
              </div>
            </div>
            <div className="item-foot">
              <span className="price">{money(it.subtotal)}</span>
              <button className={shopping ? 'primary small' : 'link'} onClick={() => setPricing(pricing === it.id ? null : it.id)}>
                {it.price != null ? 'Cambiar precio' : 'Anotar precio'}
              </button>
              <button className="link danger" onClick={() => run(() => api.removeItem(id, it.id))}>Quitar</button>
            </div>
            {pricing === it.id && (
              <PriceForm item={it} onCancel={() => setPricing(null)}
                onSave={async (data) => { if (await run(() => api.recordPrice(id, it.id, data))) setPricing(null); }} />
            )}
          </li>
        ))}
      </ul>
      {list.status === 'done' && (
        <button className="link danger" onClick={async () => { if (confirm('¿Borrar esta lista?')) { await api.deleteList(id); onBack(); } }}>
          Borrar lista
        </button>
      )}
    </section>
  );
}

function PriceForm({ item, onSave, onCancel }) {
  const [price, setPrice] = useState(item.price ?? item.last_price ?? '');
  const [promo, setPromo] = useState(item.promo ?? '');
  const [regular, setRegular] = useState(item.regular_price ?? '');
  const [hasPromo, setHasPromo] = useState(!!item.promo);

  return (
    <form className="price-form" onSubmit={(e) => {
      e.preventDefault();
      onSave({ price, promo: hasPromo ? promo : '', regular_price: hasPromo ? regular : '' });
    }}>
      <label>Precio por unidad
        <input type="number" inputMode="decimal" min="0" step="any" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} required />
      </label>
      <label className="inline"><input type="checkbox" checked={hasPromo} onChange={(e) => setHasPromo(e.target.checked)} /> Tenía promoción</label>
      {hasPromo && (
        <>
          <label>Promoción
            <input placeholder="ej. 2x1, 30% la segunda" value={promo} onChange={(e) => setPromo(e.target.value)} />
          </label>
          <label>Precio sin promo (opcional)
            <input type="number" inputMode="decimal" min="0" step="any" value={regular} onChange={(e) => setRegular(e.target.value)} />
          </label>
        </>
      )}
      <div className="actions">
        <button type="button" className="link" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary">Guardar</button>
      </div>
    </form>
  );
}
