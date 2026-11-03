import { useEffect, useState } from 'react';
import { api, money, date } from './api.js';

export default function ProductHistory({ id, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.prices(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (!data) return error ? <p className="error">{error}</p> : null;
  const { product, history } = data;
  const first = history[0];
  const last = history[history.length - 1];
  const base = (h) => h.regular_price ?? h.price;
  const total = first && last && first !== last && base(first)
    ? Math.round(((base(last) - base(first)) / base(first)) * 1000) / 10 : null;

  return (
    <section>
      <button className="link" onClick={onBack}>← Volver</button>
      <div className="product-head">
        {product.photo && <img src={`/photos/${product.photo}`} alt={product.name} />}
        <div>
          <h2>{product.name}</h2>
          {product.unit && <small className="muted">{product.unit}</small>}
          {total != null && (
            <p className={total > 0 ? 'up' : 'down'}>
              {total > 0 ? '▲' : '▼'} {Math.abs(total)}% desde {date(first.recorded_at)}
            </p>
          )}
        </div>
      </div>
      {history.length === 0 && <p className="empty">Todavía no se anotó ningún precio.</p>}
      <ul className="rows">
        {[...history].reverse().map((h) => (
          <li key={h.id}>
            <div className="info">
              <strong>{money(h.price)}{h.promo && <span className="promo"> · {h.promo}</span>}</strong>
              <small>{[date(h.recorded_at), h.store, h.recorded_by].filter(Boolean).join(' · ')}
                {h.regular_price != null && ` · sin promo ${money(h.regular_price)}`}</small>
            </div>
            {h.change_pct != null && h.change_pct !== 0 && (
              <span className={h.change_pct > 0 ? 'up' : 'down'}>{h.change_pct > 0 ? '+' : ''}{h.change_pct}%</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
