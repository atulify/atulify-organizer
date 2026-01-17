import { useState } from 'react';
import { Button } from './Button';
import type { BragDoc } from '../types';
import './BragDocForm.css';

interface BragDocFormProps {
  initialData?: BragDoc;
  onSubmit: (data: Omit<BragDoc, 'id' | 'entries'>) => void;
  onCancel: () => void;
}

export function BragDocForm({ initialData, onSubmit, onCancel }: BragDocFormProps) {
  const today = new Date().toISOString().split('T')[0];
  const threeMonthsLater = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const [title, setTitle] = useState(initialData?.title || '');
  const [startDate, setStartDate] = useState(initialData?.start_date || today);
  const [endDate, setEndDate] = useState(initialData?.end_date || threeMonthsLater);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (startDate > endDate) {
      setError('Start date must be before end date');
      return;
    }

    onSubmit({
      title: title.trim(),
      start_date: startDate,
      end_date: endDate,
    });
  };

  // Quick period buttons
  const setQuarterlyPeriod = () => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const year = now.getFullYear();
    const startMonth = quarter * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setTitle(`Q${quarter + 1} ${year}`);
  };

  const setMonthlyPeriod = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    setTitle(start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  };

  return (
    <form className="brag-doc-form" onSubmit={handleSubmit}>
      {!initialData && (
        <div className="quick-period-buttons">
          <span className="quick-period-label">Quick set:</span>
          <button type="button" className="quick-period-btn" onClick={setQuarterlyPeriod}>
            This Quarter
          </button>
          <button type="button" className="quick-period-btn" onClick={setMonthlyPeriod}>
            This Month
          </button>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="title" className="form-label">Title</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Q1 2026, January 2026"
          className="form-input"
          autoFocus
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="startDate" className="form-label">Start Date</label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label htmlFor="endDate" className="form-label">End Date</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {initialData ? 'Save Changes' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
