import { useState } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button, Modal, ImageLightbox } from './index';
import { EntryForm } from './EntryForm';
import { exportBragDocToMarkdown } from '../utils/exportMarkdown';
import type { BragDoc, BragEntry } from '../types';
import '../views/BragDocView.css';

interface BragDocDetailProps {
  doc: BragDoc;
  onBack: () => void;
  onEdit: () => void;
  onAddEntry: (entry: Omit<BragEntry, 'id'>) => void;
  onUpdateEntry: (entryId: string, entry: Omit<BragEntry, 'id'>) => void;
  onDeleteEntry: (entryId: string) => void;
}

export function BragDocDetail({
  doc,
  onBack,
  onEdit,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
}: BragDocDetailProps) {
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BragEntry | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setShowLightbox(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatEntryDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Sort entries by date descending
  const sortedEntries = [...doc.entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleExport = async () => {
    const markdown = exportBragDocToMarkdown(doc);

    // Create a blob and download it
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-brag-doc.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddEntry = (entry: Omit<BragEntry, 'id'>) => {
    onAddEntry(entry);
    setShowAddEntry(false);
  };

  const handleUpdateEntry = (entry: Omit<BragEntry, 'id'>) => {
    if (!editingEntry) return;
    onUpdateEntry(editingEntry.id, entry);
    setEditingEntry(null);
  };

  return (
    <div className="brag-doc-detail">
      <div className="brag-doc-detail-header">
        <div className="brag-doc-detail-nav">
          <button className="back-btn" onClick={onBack}>
            &larr; Back to all
          </button>
        </div>
        <div className="brag-doc-detail-title">
          <div>
            <h1>{doc.title}</h1>
            <p className="brag-doc-detail-dates">
              {formatDate(doc.start_date)} - {formatDate(doc.end_date)}
            </p>
          </div>
          <div className="brag-doc-detail-actions">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit Period
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExport}>
              Export MD
            </Button>
            <Button size="sm" onClick={() => setShowAddEntry(true)}>
              + Add Entry
            </Button>
          </div>
        </div>
      </div>

      <div className="brag-doc-detail-content">
        <div className="entries-header">
          <h2 className="section-title">Accomplishments</h2>
          <span className="entries-count">{doc.entries.length} entries</span>
        </div>

        {sortedEntries.length === 0 ? (
          <div className="empty-state">
            <p>No entries yet. Add your first accomplishment!</p>
            <Button onClick={() => setShowAddEntry(true)} style={{ marginTop: '16px' }}>
              + Add First Entry
            </Button>
          </div>
        ) : (
          <div className="entries-list">
            {sortedEntries.map((entry) => (
              <div key={entry.id} className="entry-card">
                <div className="entry-card-header">
                  <h3 className="entry-card-title">{entry.title}</h3>
                  <span className="entry-card-date">{formatEntryDate(entry.date)}</span>
                </div>
                {entry.description && (
                  <p className="entry-card-description">{entry.description}</p>
                )}
                {entry.links.length > 0 && (
                  <div className="entry-card-links">
                    {entry.links.map((link, index) => (
                      <a
                        key={index}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="entry-link"
                      >
                        {new URL(link).hostname}
                      </a>
                    ))}
                  </div>
                )}
                {entry.images.length > 0 && (
                  <div className="entry-images">
                    {entry.images.map((image, index) => (
                      <button
                        key={index}
                        type="button"
                        className="entry-image-btn"
                        onClick={() => openLightbox(entry.images, index)}
                      >
                        <img
                          src={`asset://localhost/${image}`}
                          alt=""
                          className="entry-image-thumb"
                        />
                      </button>
                    ))}
                  </div>
                )}
                <div className="entry-card-actions">
                  <button
                    className="entry-action-btn"
                    onClick={() => setEditingEntry(entry)}
                  >
                    Edit
                  </button>
                  <button
                    className="entry-action-btn danger"
                    onClick={async () => {
                      const confirmed = await ask('Delete this entry?', { title: 'Confirm Delete', kind: 'warning' });
                      if (confirmed) {
                        onDeleteEntry(entry.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      <Modal
        isOpen={showAddEntry}
        onClose={() => setShowAddEntry(false)}
        title="Add Accomplishment"
        size="lg"
      >
        <EntryForm
          onSubmit={handleAddEntry}
          onCancel={() => setShowAddEntry(false)}
        />
      </Modal>

      {/* Edit Entry Modal */}
      <Modal
        isOpen={!!editingEntry}
        onClose={() => setEditingEntry(null)}
        title="Edit Accomplishment"
        size="lg"
      >
        {editingEntry && (
          <EntryForm
            initialData={editingEntry}
            onSubmit={handleUpdateEntry}
            onCancel={() => setEditingEntry(null)}
          />
        )}
      </Modal>

      {/* Image Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={showLightbox}
        onClose={() => setShowLightbox(false)}
      />
    </div>
  );
}
