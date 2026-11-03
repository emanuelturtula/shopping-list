import { useEffect, useState } from 'react';
import { api, money, date } from './api.js';

const STATUS = { draft: 'Armando', shopping: 'Comprando', done: 'Terminada' };

export default function Lists({ onOpen }) {
  const [lists, setLists] = useState(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.lists().then((ls) => {
      setLists(ls);
      if (ls.length) setCopyFrom(String(ls[0].id));
    }).catch((e) => setError(e.message));
  }, []);

  async function create() {
    setError('');
    try {
      const list = await api.createList(copyFrom ? { copy_from: Number(copyFrom) } : {});
      onOpen(list.id);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!lists) return error ? <p className="error">{error}</p> : null;

  return (
    <section>
      <div className="card new-list">
        <button className="primary" onClick={create}>Nueva lista</button>
        {lists.length > 0 && (
          <label>
            <span>Partir de</span>
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Lista vacía</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {lists.length === 0 && (
        <p className="empty">Todavía no hay listas. Creá la primera y anotá los precios cuando vayas a comprar.</p>
      )}
      <ul className="rows">
        {lists.map((l) => (
          <li key={l.id} onClick={() => onOpen(l.id)} className="clickable">
            <div className="info">
              <strong>{l.name}</strong>
              <small>{[l.store, `${l.item_count} productos`, date(l.created_at)].filter(Boolean).join(' · ')}</small>
            </div>
            <div className="right">
              <span className="price">{money(l.status === 'done' ? l.spent_total : l.estimated_total)}</span>
              <small className={`badge ${l.status}`}>{STATUS[l.status]}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
