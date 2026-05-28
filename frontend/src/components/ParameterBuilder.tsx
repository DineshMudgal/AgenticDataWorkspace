import React, { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import type { SkillParameter } from '../types';

interface Props {
  parameters: SkillParameter[];
  onChange: (params: SkillParameter[]) => void;
}

const TYPES = ['string', 'integer', 'number', 'boolean', 'list'] as const;

const emptyDraft = (): SkillParameter => ({ name: '', type: 'string', description: '', required: true, default_value: '' });

export const ParameterBuilder: React.FC<Props> = ({ parameters, onChange }) => {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<SkillParameter>(emptyDraft());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<SkillParameter>(emptyDraft());
  const [error, setError] = useState('');

  const addParam = () => {
    if (!draft.name.trim()) { setError('Name is required'); return; }
    if (parameters.some(p => p.name === draft.name)) { setError('Duplicate name'); return; }
    onChange([...parameters, { ...draft }]);
    setDraft(emptyDraft());
    setAdding(false);
    setError('');
  };

  const remove = (i: number) => {
    if (editingIdx === i) setEditingIdx(null);
    onChange(parameters.filter((_, idx) => idx !== i));
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditDraft({ ...parameters[i] });
    setError('');
  };

  const saveEdit = () => {
    if (!editDraft.name.trim()) { setError('Name is required'); return; }
    const duplicate = parameters.some((p, idx) => p.name === editDraft.name && idx !== editingIdx);
    if (duplicate) { setError('Duplicate name'); return; }
    const updated = parameters.map((p, idx) => idx === editingIdx ? { ...editDraft } : p);
    onChange(updated);
    setEditingIdx(null);
    setError('');
  };

  const cancelEdit = () => { setEditingIdx(null); setError(''); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {parameters.length > 0 && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Type</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Description</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Default</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>Req.</th>
                <th style={{ padding: '0.6rem 0.75rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {parameters.map((p, i) => (
                <React.Fragment key={i}>
                  {/* Display row */}
                  <tr style={{
                    borderBottom: (i < parameters.length - 1 || editingIdx === i) ? '1px solid var(--border-color)' : 'none',
                    background: editingIdx === i ? 'rgba(56,189,248,0.04)' : 'transparent',
                  }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontSize: '0.75rem' }}>
                      {p.name}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span style={{ background: 'rgba(139,92,246,0.1)', color: 'var(--accent-purple)', padding: '1px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>{p.type}</span>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)' }}>{p.description || '—'}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{p.default_value || '—'}</td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      {p.required
                        ? <span style={{ color: 'var(--accent-red)', fontSize: '0.7rem', fontWeight: 700 }}>YES</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>no</span>}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        {editingIdx === i ? (
                          <>
                            <button onClick={saveEdit} title="Save" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-green)', padding: '2px' }}>
                              <Check size={14} />
                            </button>
                            <button onClick={cancelEdit} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}>
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(i)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => remove(i)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Inline edit form row */}
                  {editingIdx === i && (
                    <tr style={{ borderBottom: i < parameters.length - 1 ? '1px solid var(--border-color)' : 'none', background: 'rgba(56,189,248,0.03)' }}>
                      <td colSpan={6} style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr 1fr auto auto', gap: '0.5rem', alignItems: 'end' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Name *</label>
                            <input className="form-control" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }}
                              value={editDraft.name} onChange={e => setEditDraft({ ...editDraft, name: e.target.value })} placeholder="param_name" />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Type</label>
                            <select className="form-select" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }}
                              value={editDraft.type} onChange={e => setEditDraft({ ...editDraft, type: e.target.value as SkillParameter['type'] })}>
                              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Description</label>
                            <input className="form-control" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }}
                              value={editDraft.description} onChange={e => setEditDraft({ ...editDraft, description: e.target.value })} placeholder="What this param does" />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Default Value</label>
                            <input className="form-control" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }}
                              value={editDraft.default_value || ''} onChange={e => setEditDraft({ ...editDraft, default_value: e.target.value })} placeholder="Default value" />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Required</label>
                            <input type="checkbox" checked={editDraft.required} onChange={e => setEditDraft({ ...editDraft, required: e.target.checked })}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={saveEdit}>Save</button>
                            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={cancelEdit}>Cancel</button>
                          </div>
                        </div>
                        {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.75rem', marginTop: '0.5rem' }}>{error}</div>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div style={{ border: '1px solid var(--accent-cyan)', borderRadius: '8px', padding: '1rem', background: 'rgba(56,189,248,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 1fr 1fr auto auto', gap: '0.5rem', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Name *</label>
              <input className="form-control" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }} value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="param_name" />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Type</label>
              <select className="form-select" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }} value={draft.type}
                onChange={e => setDraft({ ...draft, type: e.target.value as SkillParameter['type'] })}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Description</label>
              <input className="form-control" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }} value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="What this param does" />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Default Value</label>
              <input className="form-control" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }} value={draft.default_value || ''}
                onChange={e => setDraft({ ...draft, default_value: e.target.value })} placeholder="Default value" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Required</label>
              <input type="checkbox" checked={draft.required} onChange={e => setDraft({ ...draft, required: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={addParam}>Add</button>
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
            </div>
          </div>
          {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.75rem', marginTop: '0.5rem' }}>{error}</div>}
        </div>
      ) : (
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }} onClick={() => setAdding(true)}>
          <Plus size={14} /> Add Parameter
        </button>
      )}
    </div>
  );
};
