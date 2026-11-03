import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListView from '../src/ListView.jsx';
import { fakeApi, json } from './fakeApi.js';
import { item, list } from './fixtures.js';

const products = [{ id: 10, name: 'Leche' }, { id: 11, name: 'Pan' }];
const setup = (routes) => {
  const calls = fakeApi({ 'GET /api/products': () => products, ...routes });
  const user = userEvent.setup();
  render(<ListView id={5} onBack={() => {}} onProduct={() => {}} />);
  return { calls, user };
};

describe('ListView', () => {
  it('shows the estimate and each item with its last known price', async () => {
    setup({ 'GET /api/lists/5': () => list({ items_without_price: 1, items: [item(), item({ id: 2, product_id: 11, name: 'Pan', last_price: null, subtotal: null })] }) });
    expect(await screen.findByDisplayValue('Compra semanal')).toBeInTheDocument();
    expect(screen.getByText('Estimado').parentElement).toHaveTextContent(/2\.000/);
    expect(screen.getByText('1 sin precio')).toBeInTheDocument();
    expect(screen.getByText(/Último/)).toHaveTextContent('1/10/2026');
    expect(screen.getByText('Sin precio todavía')).toBeInTheDocument();
  });

  it('adds an existing product by id and a new one by name', async () => {
    const { calls, user } = setup({
      'GET /api/lists/5': () => list({ items: [] }),
      'POST /api/lists/5/items': () => list(),
    });
    const input = await screen.findByPlaceholderText('Agregar producto');
    await user.type(input, 'leche');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await user.type(input, 'Queso');
    const qty = screen.getByDisplayValue('1');
    await user.clear(qty);
    await user.type(qty, '3');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    const posts = calls.filter(([m, u]) => m === 'POST' && u === '/api/lists/5/items').map((c) => c[2]);
    expect(posts).toEqual([{ product_id: 10, quantity: '1' }, { name: 'Queso', quantity: '3' }]);
  });

  it('changes quantity with the stepper but never below 1', async () => {
    const { calls, user } = setup({
      'GET /api/lists/5': () => list({ items: [item({ quantity: 1 })] }),
      'PATCH /api/lists/5/items/1': (b) => list({ items: [item({ quantity: b.quantity })] }),
    });
    await screen.findByText('Leche');
    await user.click(screen.getByRole('button', { name: '−' }));
    expect(calls.some(([m]) => m === 'PATCH')).toBe(false);
    const row = screen.getByText('Leche').closest('li');
    await user.click(within(row).getByRole('button', { name: '+' }));
    expect(calls.find(([m]) => m === 'PATCH')[2]).toEqual({ quantity: 2 });
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it('records a price with a promotion', async () => {
    const { calls, user } = setup({
      'GET /api/lists/5': () => list({ status: 'shopping' }),
      'POST /api/lists/5/items/1/price': () => list({ status: 'shopping', items: [item({ price: 900, promo: '2x1', checked: 1 })] }),
    });
    await user.click(await screen.findByRole('button', { name: 'Anotar precio' }));
    const price = screen.getByLabelText('Precio por unidad');
    expect(price).toHaveValue(1000); // prefilled with the last price
    await user.clear(price);
    await user.type(price, '900');
    await user.click(screen.getByLabelText('Tenía promoción'));
    await user.type(screen.getByLabelText('Promoción'), '2x1');
    await user.type(screen.getByLabelText('Precio sin promo (opcional)'), '1200');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(calls.find(([m]) => m === 'POST')[2]).toEqual({ price: '900', promo: '2x1', regular_price: '1200' });
    expect(await screen.findByText(/Hoy/)).toHaveTextContent('2x1');
    expect(screen.queryByLabelText('Precio por unidad')).not.toBeInTheDocument();
  });

  it('drops promo fields when the promo box is unticked', async () => {
    const { calls, user } = setup({
      'GET /api/lists/5': () => list({ items: [item({ price: 900, promo: '2x1' })] }),
      'POST /api/lists/5/items/1/price': () => list(),
    });
    await user.click(await screen.findByRole('button', { name: 'Cambiar precio' }));
    await user.click(screen.getByLabelText('Tenía promoción'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(calls.find(([m]) => m === 'POST')[2]).toEqual({ price: 900, promo: '', regular_price: '' });
  });

  it('moves the list through its states', async () => {
    const { calls, user } = setup({
      'GET /api/lists/5': () => list(),
      'PATCH /api/lists/5': (b) => list({ status: b.status }),
    });
    await user.click(await screen.findByRole('button', { name: 'Empezar a comprar' }));
    await user.click(await screen.findByRole('button', { name: 'Terminar compra' }));
    expect(await screen.findByRole('button', { name: 'Reabrir' })).toBeInTheDocument();
    expect(calls.filter(([m]) => m === 'PATCH').map((c) => c[2])).toEqual([{ status: 'shopping' }, { status: 'done' }]);
  });

  it('shows server errors', async () => {
    const { user } = setup({
      'GET /api/lists/5': () => list(),
      'POST /api/lists/5/items/1/price': () => json({ error: 'Precio inválido' }, 400),
    });
    await user.click(await screen.findByRole('button', { name: 'Anotar precio' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Precio inválido')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio por unidad')).toBeInTheDocument();
  });
});
