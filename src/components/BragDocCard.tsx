import { ask } from '@tauri-apps/plugin-dialog';
import type { BragDoc } from '../types';
import './BragDocCard.css';

interface BragDocCardProps {
  doc: BragDoc;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function BragDocCard({ doc, onClick, onEdit, onDelete }: BragDocCardProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const today = new Date().toISOString().split('T')[0];
  const isActive = doc.start_date <= today && doc.end_date >= today;
  const isPast = doc.end_date < today;

  return (
    <div className={`brag-doc-card ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}>
      <div className="brag-doc-card-main" onClick={onClick}>
        <div className="brag-doc-card-header">
          <h3 className="brag-doc-card-title">{doc.title}</h3>
          {isActive && <span className="brag-doc-card-badge">Active</span>}
        </div>
        <p className="brag-doc-card-dates">
          {formatDate(doc.start_date)} - {formatDate(doc.end_date)}
        </p>
        <p className="brag-doc-card-count">
          {doc.entries.length} {doc.entries.length === 1 ? 'entry' : 'entries'}
        </p>
      </div>
      <div className="brag-doc-card-actions">
        <button
          className="brag-doc-card-action"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label="Edit brag doc"
        >
          Edit
        </button>
        <button
          className="brag-doc-card-action danger"
          onClick={async (e) => {
            e.stopPropagation();
            const confirmed = await ask('Delete this brag doc and all its entries?', { title: 'Confirm Delete', kind: 'warning' });
            if (confirmed) {
              onDelete();
            }
          }}
          aria-label="Delete brag doc"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
