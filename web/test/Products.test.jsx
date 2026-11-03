import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Products from '../src/Products.jsx';
import { fakeApi, json } from './fakeApi.js';

describe('Products', () => {
  it('adds a product and reloads the list', async () => {
    let products = [];
    const calls = fakeApi({
      'GET /api/products': () => products,
      'POST /api/products': (b) => { products = [{ id: 1, name: b.name, unit: b.unit, last_price: null }]; return products[0]; },
    });
    render(<Products onOpen={() => {}} />);
    await userEvent.type(await screen.findByPlaceholderText(/Producto/), 'Yerba');
    await userEvent.type(screen.getByPlaceholderText('Unidad'), '1 kg');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Yerba')).toBeInTheDocument();
    expect(calls.find(([m]) => m === 'POST')[2]).toEqual({ name: 'Yerba', unit: '1 kg' });
  });

  it('shows a duplicate-name error', async () => {
    fakeApi({ 'GET /api/products': () => [], 'POST /api/products': () => json({ error: 'Ya existe un producto con ese nombre' }, 409) });
    render(<Products onOpen={() => {}} />);
    await userEvent.type(await screen.findByPlaceholderText(/Producto/), 'Leche');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText('Ya existe un producto con ese nombre')).toBeInTheDocument();
  });

  it('uploads a photo and opens the history', async () => {
    const onOpen = vi.fn();
    const calls = fakeApi({
      'GET /api/products': () => [{ id: 1, name: 'Leche', last_price: 1000 }],
      'POST /api/products/1/photo': () => ({ id: 1, photo: 'a.jpg' }),
    });
    const { container } = render(<Products onOpen={onOpen} />);
    await screen.findByText('Leche');
    const file = new File(['x'], 'leche.jpg', { type: 'image/jpeg' });
    await userEvent.upload(container.querySelector('input[type=file]'), file);
    const upload = calls.find(([m]) => m === 'POST');
    expect(upload[2]).toBeInstanceOf(FormData);
    expect(upload[2].get('photo').name).toBe('leche.jpg');
    await userEvent.click(screen.getByText('Leche'));
    expect(onOpen).toHaveBeenCalledWith(1);
  });
});
