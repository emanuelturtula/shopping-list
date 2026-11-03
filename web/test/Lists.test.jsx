import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Lists from '../src/Lists.jsx';
import { fakeApi } from './fakeApi.js';

const lists = [
  { id: 2, name: 'Segunda', store: 'Coto', status: 'shopping', item_count: 3, created_at: '2026-11-02 10:00:00', estimated_total: 5000, spent_total: 1000 },
  { id: 1, name: 'Primera', store: null, status: 'done', item_count: 2, created_at: '2026-10-01 10:00:00', estimated_total: 0, spent_total: 3000 },
];

describe('Lists', () => {
  it('explains what to do when there are no lists', async () => {
    fakeApi({ 'GET /api/lists': () => [] });
    render(<Lists onOpen={() => {}} />);
    expect(await screen.findByText(/Todavía no hay listas/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Partir de')).not.toBeInTheDocument();
  });

  it('shows the estimate for open lists and the amount spent for finished ones', async () => {
    fakeApi({ 'GET /api/lists': () => lists });
    render(<Lists onOpen={() => {}} />);
    const open = (await screen.findByText('Segunda', { selector: 'strong' })).closest('li');
    expect(open).toHaveTextContent(/5\.000/);
    expect(open).toHaveTextContent('Comprando');
    expect(screen.getByText('Primera', { selector: 'strong' }).closest('li')).toHaveTextContent(/3\.000/);
  });

  it('creates a new list from the latest one by default', async () => {
    const onOpen = vi.fn();
    const calls = fakeApi({ 'GET /api/lists': () => lists, 'POST /api/lists': () => ({ id: 3 }) });
    render(<Lists onOpen={onOpen} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva lista' }));
    expect(calls.at(-1)[2]).toEqual({ copy_from: 2 });
    expect(onOpen).toHaveBeenCalledWith(3);
  });

  it('can create an empty list', async () => {
    const calls = fakeApi({ 'GET /api/lists': () => lists, 'POST /api/lists': () => ({ id: 3 }) });
    render(<Lists onOpen={() => {}} />);
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'Lista vacía');
    await userEvent.click(screen.getByRole('button', { name: 'Nueva lista' }));
    expect(calls.at(-1)[2]).toEqual({});
  });
});
