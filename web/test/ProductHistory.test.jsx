import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProductHistory from '../src/ProductHistory.jsx';
import { fakeApi } from './fakeApi.js';

const product = { id: 10, name: 'Leche', unit: 'litro', photo: null };

describe('ProductHistory', () => {
  it('shows the overall change based on prices without promo', async () => {
    fakeApi({
      'GET /api/products/10/prices': () => ({
        product,
        history: [
          { id: 1, price: 1000, regular_price: null, promo: null, store: 'Coto', recorded_at: '2026-09-01 10:00:00', recorded_by: 'ana', change_pct: null },
          { id: 2, price: 800, regular_price: 1250, promo: '2x1', store: 'Dia', recorded_at: '2026-10-01 10:00:00', recorded_by: 'beto', change_pct: 25 },
        ],
      }),
    });
    render(<ProductHistory id={10} onBack={() => {}} />);
    expect(await screen.findByText(/25% desde 1\/9\/2026/)).toHaveClass('up');
    expect(screen.getByText('+25%')).toBeInTheDocument();
    expect(screen.getByText(/· 2x1/)).toBeInTheDocument();
    expect(screen.getByText(/sin promo/)).toHaveTextContent(/1\.250/);
    // newest first
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('beto');
  });

  it('handles a product without prices', async () => {
    fakeApi({ 'GET /api/products/10/prices': () => ({ product, history: [] }) });
    render(<ProductHistory id={10} onBack={() => {}} />);
    expect(await screen.findByText('Todavía no se anotó ningún precio.')).toBeInTheDocument();
  });
});
