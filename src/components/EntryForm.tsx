import { useState } from 'react';
import { Button } from './Button';
import { ImageUpload } from './ImageUpload';
import type { BragEntry } from '../types';
import './BragDocForm.css';

interface EntryFormProps {
  initialData?: BragEntry;
  onSubmit: (data: Omit<BragEntry, 'id'>) => void;
  onCancel: () => void;
}

export function EntryForm({ initialData, onSubmit, onCancel }: EntryFormProps) {
  const today = new Date().toISOString().split('T')[0];

  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [date, setDate] = useState(initialData?.date || today);
  const [links, setLinks] = useState<string[]>(initialData?.links || []);
  const [images, setImages] = useState<string[]>(initialData?.images || []);
  const [newLink, setNewLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      date,
      links,
      images,
    });
  };

  const handleAddLink = () => {
    if (!newLink.trim()) return;

    try {
      // Validate URL
      const url = new URL(newLink.trim().startsWith('http') ? newLink.trim() : `https://${newLink.trim()}`);
      setLinks([...links, url.toString()]);
      setNewLink('');
    } catch {
      setError('Invalid URL');
    }
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === document.getElementById('newLink')) {
      e.preventDefault();
      handleAddLink();
    }
  };

  return (
    <form className="entry-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="entryTitle" className="form-label">Title *</label>
        <input
          id="entryTitle"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What did you accomplish?"
          className="form-input"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label htmlFor="entryDescription" className="form-label">Description</label>
        <textarea
          id="entryDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add details about your accomplishment..."
          className="form-input form-textarea"
        />
      </div>

      <div className="form-group">
        <label htmlFor="entryDate" className="form-label">Date</label>
        <input
          id="entryDate"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="form-input"
          style={{ width: 'auto' }}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Links</label>
        <div className="links-input-group">
          {links.length > 0 && (
            <div className="links-list">
              {links.map((link, index) => (
                <div key={index} className="link-item">
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    {link}
                  </a>
                  <button
                    type="button"
                    className="link-remove-btn"
                    onClick={() => handleRemoveLink(index)}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="add-link-row">
            <input
              id="newLink"
              type="text"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://github.com/..."
              className="form-input"
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleAddLink}>
              Add
            </Button>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Screenshots / Images</label>
        <ImageUpload
          images={images}
          onChange={setImages}
          maxImages={5}
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {initialData ? 'Save Changes' : 'Add Entry'}
        </Button>
      </div>
    </form>
  );
}
