import React, { useState, useEffect, useMemo } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button, ImageUpload, ImageLightbox } from '../components';
import type { AppData, Note, Tag } from '../types';
import './Views.css';
import './NotesView.css';

interface NotesViewProps {
  data: AppData;
  onDataChange: (data: AppData) => void;
}

export function NotesView({ data, onDataChange }: NotesViewProps) {
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Editor state
  const [editContent, setEditContent] = useState('');
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [editImages, setEditImages] = useState<string[]>([]);

  // Lightbox state
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  // Tag management
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let notes = [...data.notes];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      notes = notes.filter((note) =>
        note.content.toLowerCase().includes(query)
      );
    }

    // Filter by tags
    if (selectedTagIds.length > 0) {
      notes = notes.filter((note) =>
        selectedTagIds.some((tagId) => note.tag_ids.includes(tagId))
      );
    }

    // Sort by updated_at descending
    notes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    return notes;
  }, [data.notes, searchQuery, selectedTagIds]);

  // Start creating a new note
  const handleStartCreate = () => {
    setEditContent('');
    setEditTagIds([]);
    setEditImages([]);
    setIsCreating(true);
    setSelectedNote(null);
    setIsEditing(false);
  };

  // Start editing a note
  const handleStartEdit = (note: Note) => {
    setSelectedNote(note);
    setEditContent(note.content);
    setEditTagIds([...note.tag_ids]);
    setEditImages([...note.images]);
    setIsEditing(true);
    setIsCreating(false);
  };

  // Save note (create or update)
  const handleSaveNote = () => {
    if (!editContent.trim()) return;

    const now = new Date().toISOString();

    if (isCreating) {
      const newNote: Note = {
        id: crypto.randomUUID(),
        content: editContent.trim(),
        created_at: now,
        updated_at: now,
        tag_ids: editTagIds,
        linked_task_ids: [],
        images: editImages,
      };

      onDataChange({
        ...data,
        notes: [newNote, ...data.notes],
      });

      setSelectedNote(newNote);
      setIsCreating(false);
      setIsEditing(false);
    } else if (selectedNote) {
      onDataChange({
        ...data,
        notes: data.notes.map((note) =>
          note.id === selectedNote.id
            ? {
                ...note,
                content: editContent.trim(),
                updated_at: now,
                tag_ids: editTagIds,
                images: editImages,
              }
            : note
        ),
      });

      setSelectedNote({
        ...selectedNote,
        content: editContent.trim(),
        updated_at: now,
        tag_ids: editTagIds,
        images: editImages,
      });
      setIsEditing(false);
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    const confirmed = await ask('Delete this note?', { title: 'Confirm Delete', kind: 'warning' });
    if (!confirmed) return;

    onDataChange({
      ...data,
      notes: data.notes.filter((note) => note.id !== noteId),
    });

    if (selectedNote?.id === noteId) {
      setSelectedNote(null);
      setIsEditing(false);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsCreating(false);
    if (isCreating) {
      setSelectedNote(null);
    }
  };

  // Toggle tag filter
  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Toggle tag on note
  const toggleNoteTag = (tagId: string) => {
    setEditTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Create new tag
  const handleCreateTag = () => {
    if (!newTagName.trim()) return;

    const colors = [
      '#E53E3E', '#DD6B20', '#D69E2E', '#38A169', '#319795', '#3182CE',
      '#5A67D8', '#805AD5', '#D53F8C', '#718096', '#8B5A2B', '#4A5568',
    ];
    const color = colors[data.tags.length % colors.length];

    const newTag: Tag = {
      id: crypto.randomUUID(),
      name: newTagName.trim(),
      color,
    };

    onDataChange({
      ...data,
      tags: [...data.tags, newTag],
    });

    setEditTagIds((prev) => [...prev, newTag.id]);
    setNewTagName('');
    setShowTagInput(false);
  };

  // Open lightbox
  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setShowLightbox(true);
  };

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && (isEditing || isCreating)) {
        e.preventDefault();
        handleSaveNote();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, isCreating, editContent, editTagIds, editImages]);

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get note preview
  const getNotePreview = (content: string) => {
    const firstLine = content.split('\n')[0];
    return firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine || 'Empty note';
  };

  return (
    <div className="view notes-view">
      <div className="view-header">
        <div className="view-header-content">
          <div>
            <h1 className="view-title">Notes</h1>
            <p className="view-subtitle">Quick capture with Markdown support</p>
          </div>
          <Button onClick={handleStartCreate}>+ New Note</Button>
        </div>
      </div>

      <div className="notes-layout">
        {/* Sidebar - Note List */}
        <div className="notes-sidebar">
          {/* Search */}
          <div className="notes-search">
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
            />
          </div>

          {/* Tag Filters */}
          {data.tags.length > 0 && (
            <div className="notes-tag-filters">
              {data.tags.map((tag) => (
                <button
                  key={tag.id}
                  className={`tag-filter-btn ${selectedTagIds.includes(tag.id) ? 'active' : ''}`}
                  style={{
                    '--tag-color': tag.color,
                  } as React.CSSProperties}
                  onClick={() => toggleTagFilter(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          {/* Note List */}
          <div className="notes-list">
            {filteredNotes.length === 0 ? (
              <div className="notes-empty">
                {searchQuery || selectedTagIds.length > 0
                  ? 'No matching notes'
                  : 'No notes yet'}
              </div>
            ) : (
              filteredNotes.map((note) => (
                <button
                  key={note.id}
                  className={`note-list-item ${selectedNote?.id === note.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedNote(note);
                    setIsEditing(false);
                    setIsCreating(false);
                  }}
                >
                  <span className="note-list-preview">{getNotePreview(note.content)}</span>
                  <span className="note-list-date">{formatDate(note.updated_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="notes-content">
          {isCreating || isEditing ? (
            /* Editor */
            <div className="note-editor">
              <textarea
                className="note-editor-textarea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Write your note... (Markdown supported)"
                autoFocus
              />

              {/* Tags */}
              <div className="note-editor-tags">
                <span className="note-editor-label">Tags:</span>
                <div className="note-tags-list">
                  {data.tags.map((tag) => (
                    <button
                      key={tag.id}
                      className={`note-tag-btn ${editTagIds.includes(tag.id) ? 'active' : ''}`}
                      style={{ '--tag-color': tag.color } as React.CSSProperties}
                      onClick={() => toggleNoteTag(tag.id)}
                    >
                      {tag.name}
                    </button>
                  ))}
                  {showTagInput ? (
                    <div className="new-tag-input">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Tag name"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateTag();
                          if (e.key === 'Escape') setShowTagInput(false);
                        }}
                        autoFocus
                      />
                      <Button size="sm" onClick={handleCreateTag}>Add</Button>
                    </div>
                  ) : (
                    <button
                      className="add-tag-btn"
                      onClick={() => setShowTagInput(true)}
                    >
                      + Tag
                    </button>
                  )}
                </div>
              </div>

              {/* Images */}
              <div className="note-editor-images">
                <span className="note-editor-label">Images:</span>
                <ImageUpload
                  images={editImages}
                  onChange={setEditImages}
                  maxImages={10}
                />
              </div>

              {/* Actions */}
              <div className="note-editor-actions">
                <span className="note-editor-hint">Cmd+Enter to save</span>
                <div className="note-editor-buttons">
                  <Button variant="ghost" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveNote} disabled={!editContent.trim()}>
                    {isCreating ? 'Create Note' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </div>
          ) : selectedNote ? (
            /* Note Viewer */
            <div className="note-viewer">
              <div className="note-viewer-header">
                <span className="note-viewer-date">
                  {new Date(selectedNote.updated_at).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <div className="note-viewer-actions">
                  <Button variant="ghost" size="sm" onClick={() => handleStartEdit(selectedNote)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteNote(selectedNote.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {/* Tags */}
              {selectedNote.tag_ids.length > 0 && (
                <div className="note-viewer-tags">
                  {selectedNote.tag_ids.map((tagId) => {
                    const tag = data.tags.find((t) => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <span
                        key={tag.id}
                        className="note-tag"
                        style={{ backgroundColor: tag.color + '20', color: tag.color }}
                      >
                        {tag.name}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Content with Markdown */}
              <div className="note-viewer-content markdown-content">
                <MarkdownRenderer content={selectedNote.content} />
              </div>

              {/* Images */}
              {selectedNote.images.length > 0 && (
                <div className="note-viewer-images">
                  {selectedNote.images.map((image, index) => (
                    <button
                      key={index}
                      className="note-image-btn"
                      onClick={() => openLightbox(selectedNote.images, index)}
                    >
                      <img
                        src={`asset://localhost/${image}`}
                        alt=""
                        className="note-image-thumb"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="notes-empty-content">
              <div className="notes-empty-icon">@</div>
              <h2>Select a note or create a new one</h2>
              <p>Your notes support Markdown formatting and images</p>
              <Button onClick={handleStartCreate} style={{ marginTop: '16px' }}>
                + New Note
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={showLightbox}
        onClose={() => setShowLightbox(false)}
      />
    </div>
  );
}

// Simple Markdown Renderer
function MarkdownRenderer({ content }: { content: string }) {
  const renderMarkdown = (text: string) => {
    // Split into lines
    const lines = text.split('\n');
    const elements: React.ReactElement[] = [];
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const ListTag = listType;
        elements.push(
          <ListTag key={elements.length}>
            {listItems.map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
            ))}
          </ListTag>
        );
        listItems = [];
        listType = null;
      }
    };

    const parseInline = (line: string): string => {
      // Bold **text** or __text__
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      line = line.replace(/__(.+?)__/g, '<strong>$1</strong>');

      // Italic *text* or _text_
      line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
      line = line.replace(/_(.+?)_/g, '<em>$1</em>');

      // Code `text`
      line = line.replace(/`(.+?)`/g, '<code>$1</code>');

      // Links [text](url)
      line = line.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

      return line;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Headers
      if (line.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={i} dangerouslySetInnerHTML={{ __html: parseInline(line.slice(4)) }} />
        );
      } else if (line.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={i} dangerouslySetInnerHTML={{ __html: parseInline(line.slice(3)) }} />
        );
      } else if (line.startsWith('# ')) {
        flushList();
        elements.push(
          <h1 key={i} dangerouslySetInnerHTML={{ __html: parseInline(line.slice(2)) }} />
        );
      }
      // Unordered list
      else if (line.match(/^[-*] /)) {
        if (listType !== 'ul') {
          flushList();
          listType = 'ul';
        }
        listItems.push(line.slice(2));
      }
      // Ordered list
      else if (line.match(/^\d+\. /)) {
        if (listType !== 'ol') {
          flushList();
          listType = 'ol';
        }
        listItems.push(line.replace(/^\d+\. /, ''));
      }
      // Horizontal rule
      else if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
        flushList();
        elements.push(<hr key={i} />);
      }
      // Empty line
      else if (line.trim() === '') {
        flushList();
      }
      // Regular paragraph
      else {
        flushList();
        elements.push(
          <p key={i} dangerouslySetInnerHTML={{ __html: parseInline(line) }} />
        );
      }
    }

    flushList();
    return elements;
  };

  return <>{renderMarkdown(content)}</>;
}
