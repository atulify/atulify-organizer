import { useState } from 'react';
import { Button, Modal } from '../components';
import type { AppData, BragDoc, BragEntry } from '../types';
import { BragDocCard } from '../components/BragDocCard';
import { BragDocDetail } from '../components/BragDocDetail';
import { BragDocForm } from '../components/BragDocForm';
import { useGitHubStats } from '../hooks/useGitHubStats';
import './Views.css';
import './BragDocView.css';

interface BragDocViewProps {
  data: AppData;
  onDataChange: (data: AppData) => void;
}

export function BragDocView({ data, onDataChange }: BragDocViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<BragDoc | null>(null);

  const { stats, loading: statsLoading, fetchStats } = useGitHubStats();

  const selectedDoc = data.brag_docs.find((doc) => doc.id === selectedDocId);

  // Sort brag docs by end_date descending (most recent first)
  const sortedDocs = [...data.brag_docs].sort(
    (a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
  );

  // Check if we need to prompt for a new brag doc
  const latestDoc = sortedDocs[0];
  const today = new Date().toISOString().split('T')[0];
  const needsNewDoc = !latestDoc || latestDoc.end_date < today;

  const handleCreateDoc = (doc: Omit<BragDoc, 'id' | 'entries'>) => {
    const newDoc: BragDoc = {
      ...doc,
      id: crypto.randomUUID(),
      entries: [],
    };
    onDataChange({
      ...data,
      brag_docs: [...data.brag_docs, newDoc],
    });
    setShowCreateModal(false);
    setSelectedDocId(newDoc.id);
  };

  const handleUpdateDoc = (doc: Omit<BragDoc, 'id' | 'entries'>) => {
    if (!editingDoc) return;
    onDataChange({
      ...data,
      brag_docs: data.brag_docs.map((d) =>
        d.id === editingDoc.id ? { ...d, ...doc } : d
      ),
    });
    setEditingDoc(null);
  };

  const handleDeleteDoc = (docId: string) => {
    onDataChange({
      ...data,
      brag_docs: data.brag_docs.filter((d) => d.id !== docId),
    });
    if (selectedDocId === docId) {
      setSelectedDocId(null);
    }
  };

  const handleAddEntry = (entry: Omit<BragEntry, 'id'>) => {
    if (!selectedDocId) return;
    const newEntry: BragEntry = {
      ...entry,
      id: crypto.randomUUID(),
    };
    onDataChange({
      ...data,
      brag_docs: data.brag_docs.map((doc) =>
        doc.id === selectedDocId
          ? { ...doc, entries: [...doc.entries, newEntry] }
          : doc
      ),
    });
  };

  const handleUpdateEntry = (entryId: string, entry: Omit<BragEntry, 'id'>) => {
    if (!selectedDocId) return;
    onDataChange({
      ...data,
      brag_docs: data.brag_docs.map((doc) =>
        doc.id === selectedDocId
          ? {
              ...doc,
              entries: doc.entries.map((e) =>
                e.id === entryId ? { ...e, ...entry } : e
              ),
            }
          : doc
      ),
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    if (!selectedDocId) return;
    onDataChange({
      ...data,
      brag_docs: data.brag_docs.map((doc) =>
        doc.id === selectedDocId
          ? { ...doc, entries: doc.entries.filter((e) => e.id !== entryId) }
          : doc
      ),
    });
  };

  // If viewing a specific doc, show the detail view
  if (selectedDoc) {
    return (
      <BragDocDetail
        doc={selectedDoc}
        onBack={() => setSelectedDocId(null)}
        onEdit={() => setEditingDoc(selectedDoc)}
        onAddEntry={handleAddEntry}
        onUpdateEntry={handleUpdateEntry}
        onDeleteEntry={handleDeleteEntry}
      />
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-content">
          <div>
            <h1 className="view-title">Brag Doc</h1>
            <p className="view-subtitle">Track your accomplishments</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>+ New Period</Button>
        </div>
      </div>

      <div className="view-content">
        {/* GitHub Stats */}
        <div className="github-stats-section">
          <div className="github-stats-header">
            <h2 className="github-stats-title">GitHub Activity</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchStats}
              disabled={statsLoading}
            >
              {statsLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
          {statsLoading && !stats && (
            <div className="github-stats-loading">
              <div className="spinner spinner-sm"></div>
              <span>Loading stats...</span>
            </div>
          )}
          {stats && (
            <div className="github-stats-grid">
              <div className="github-stats-card">
                <h3 className="stats-card-title">PRs Merged</h3>
                <div className="stats-card-rows">
                  <div className="stats-row">
                    <span className="stats-label">This Month</span>
                    <span className="stats-value">{stats.prs_merged_mtd}</span>
                  </div>
                  <div className="stats-row">
                    <span className="stats-label">Last Month</span>
                    <span className="stats-value">{stats.prs_merged_prev_month}</span>
                  </div>
                  <div className="stats-row">
                    <span className="stats-label">Last 3 Months</span>
                    <span className="stats-value">{stats.prs_merged_prev_3_months}</span>
                  </div>
                </div>
              </div>
              <div className="github-stats-card">
                <h3 className="stats-card-title">PRs Reviewed</h3>
                <div className="stats-card-rows">
                  <div className="stats-row">
                    <span className="stats-label">This Month</span>
                    <span className="stats-value">{stats.prs_approved_mtd}</span>
                  </div>
                  <div className="stats-row">
                    <span className="stats-label">Last Month</span>
                    <span className="stats-value">{stats.prs_approved_prev_month}</span>
                  </div>
                  <div className="stats-row">
                    <span className="stats-label">Last 3 Months</span>
                    <span className="stats-value">{stats.prs_approved_prev_3_months}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {needsNewDoc && sortedDocs.length > 0 && (
          <div className="brag-doc-alert">
            <p>Your current brag doc period has ended. Start a new one?</p>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              Create New Period
            </Button>
          </div>
        )}

        {sortedDocs.length === 0 ? (
          <div className="empty-state">
            <p>No brag docs yet. Create your first one to start tracking accomplishments!</p>
            <Button onClick={() => setShowCreateModal(true)} style={{ marginTop: '16px' }}>
              + Create First Brag Doc
            </Button>
          </div>
        ) : (
          <div className="brag-doc-grid">
            {sortedDocs.map((doc) => (
              <BragDocCard
                key={doc.id}
                doc={doc}
                onClick={() => setSelectedDocId(doc.id)}
                onEdit={() => setEditingDoc(doc)}
                onDelete={() => handleDeleteDoc(doc.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Brag Doc Period"
      >
        <BragDocForm
          onSubmit={handleCreateDoc}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingDoc}
        onClose={() => setEditingDoc(null)}
        title="Edit Brag Doc Period"
      >
        {editingDoc && (
          <BragDocForm
            initialData={editingDoc}
            onSubmit={handleUpdateDoc}
            onCancel={() => setEditingDoc(null)}
          />
        )}
      </Modal>
    </div>
  );
}
