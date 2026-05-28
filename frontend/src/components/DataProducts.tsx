import React, { useState } from 'react';
import { Layers, CheckCircle, ChevronRight, ChevronLeft, Shield, Wrench, FileText, Lock, X, Plus, Search, Edit2, ToggleRight, ToggleLeft, Check, Trash2 } from 'lucide-react';
import type { DataProduct, DataProject, SkillParameter } from '../types';
import { AISuggestInput } from './AISuggestInput';
import { ParameterBuilder } from './ParameterBuilder';

interface Props {
  products: DataProduct[];
  projects: DataProject[];
  onRefresh: () => void;
}

const DEFAULT_INSTRUCTIONS = `1. Always use t_ as prefix for table name.
2. Always Use external layer for landing layer it can use csv, json or parquet data type based on data specification.
3. File path for landing layer should be {storage_account}/{segment}/landing/{domain}/t_{table_name}.
4. File path for silver layer should be {storage_account}/{segment}/silver/{domain}/t_{table_name}. Bad data should be at {storage_account}/{segment}/bad_data/{domain}/t_{table_name}. Checkpoints at {storage_account}/{segment}/checkpoints/silver/{domain}/t_{table_name}.
5. File path for gold layer should be {storage_account}/{segment}/gold/{domain}/t_{table_name}. Checkpoints at {storage_account}/{segment}/checkpoints/gold/{domain}/t_{table_name}.`;

export const DataProducts: React.FC<Props> = ({ products, projects, onRefresh }) => {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('Ingestion');
  const [ucOwner, setUcOwner] = useState('');
  const [tags, setTags] = useState('');
  const [ownerGroup, setOwnerGroup] = useState('');
  const [globalParams, setGlobalParams] = useState<SkillParameter[]>([]);
  const [globalInstruction, setGlobalInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<DataProduct | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const steps = ['Details', 'Configuration', 'Instructions', 'Review'];

  const currentStepLabel = steps[step];

  const canNext = step === 0 ? name.trim().length > 0 : true;

  const handleNameChange = (val: string) => {
    const camelCased = val
      .split(/[\s_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    setName(camelCased);
  };

  const startEdit = (p: DataProduct) => {
    setEditingProduct(p);
    setName(p.name);
    setDescription(p.description || '');
    setType(p.type || 'Ingestion');
    setUcOwner(p.uc_owner || '');
    setTags(p.tags || '');
    setOwnerGroup(p.owner_group || '');
    setGlobalInstruction(p.global_instruction || '');
    let params: SkillParameter[] = [];
    if (p.global_parameters) {
      try {
        params = JSON.parse(p.global_parameters);
      } catch {
        params = [];
      }
    }
    setGlobalParams(params);
    setStep(0);
    setMsg(null);
    setIsWizardOpen(true);
  };

  const handleOpenCreateWizard = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setType('Ingestion');
    setUcOwner('');
    setTags('');
    setOwnerGroup('');
    setGlobalParams([]);
    setGlobalInstruction(DEFAULT_INSTRUCTIONS);
    setStep(0);
    setMsg(null);
    setIsWizardOpen(true);
  };

  const handleRegister = async () => {
    setLoading(true); setMsg(null);
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          type,
          uc_owner: ucOwner,
          tags,
          global_parameters: globalParams,
          global_instruction: globalInstruction,
          is_enabled: editingProduct ? editingProduct.is_enabled : true,
          owner_group: ownerGroup
        }),
      });
      if (res.ok) {
        setMsg({
          type: 'success',
          text: `"${name}" ${editingProduct ? 'updated' : 'registered'} successfully!`
        });
        setTimeout(() => {
          setIsWizardOpen(false);
          onRefresh();
        }, 1000);
      } else {
        const d = await res.json();
        setMsg({ type: 'error', text: d.detail || 'Failed' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (p: DataProduct) => {
    const linkedCount = projects.filter(pr => pr.data_product_id === p.id).length;
    const warning = linkedCount > 0
      ? `\n\n⚠️ Warning: This product has ${linkedCount} linked project${linkedCount !== 1 ? 's' : ''} that will also be affected.`
      : '';
    if (!window.confirm(`Delete "${p.name}"?${warning}\n\nThis action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      } else {
        const d = await res.json();
        alert(d.detail || 'Failed to delete product');
      }
    } catch {
      alert('Network error while deleting product');
    }
  };

  const toggleEnable = async (p: DataProduct) => {
    try {
      let params: SkillParameter[] = [];
      if (p.global_parameters) {
        try { params = JSON.parse(p.global_parameters); } catch { }
      }
      const res = await fetch(`/api/products/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: p.name,
          description: p.description,
          uc_owner: p.uc_owner,
          tags: p.tags,
          global_parameters: params,
          global_instruction: p.global_instruction,
          is_enabled: !p.is_enabled,
          owner_group: p.owner_group
        }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        const d = await res.json();
        alert(d.detail || 'Failed to update status');
      }
    } catch {
      alert('Network error while toggling status');
    }
  };

  const filteredProducts = products.filter(p => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.type || '').toLowerCase().includes(q) ||
      (p.tags || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Layers size={22} /></div>
          <div>
            <h1 className="page-title">Data Products</h1>
            <p className="page-subtitle">Register high-level data governance domains for your organization</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 12px' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', padding: '4px 0', fontSize: '0.85rem', color: 'var(--text-primary)', width: '200px', outline: 'none' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={14} />
              </button>
            )}
          </div>
          <button className="btn btn-primary" onClick={handleOpenCreateWizard}>
            <Plus size={16} />
            <span>Register Domain</span>
          </button>
        </div>
      </div>

      {/* Grid of Product Cards */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
        <div className="card-grid-2">
        {filteredProducts.map(p => {
          const linked = projects.filter(pr => pr.data_product_id === p.id).length;
          let params: SkillParameter[] = [];
          if (p.global_parameters) {
            try {
              params = JSON.parse(p.global_parameters);
            } catch {
              params = [];
            }
          }
          return (
            <div
              key={p.id}
              className={`card ${!p.is_enabled ? 'opacity-60' : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '220px'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent-blue)', fontSize: '1rem' }}>{p.name}</span>
                    <span className="badge badge-secondary" style={{ fontSize: '0.65rem', background: 'rgba(56,189,248,0.1)', color: 'var(--accent-cyan)' }}>
                      {p.type || 'Ingestion'}
                    </span>
                    {!p.is_enabled && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>DISABLED</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => toggleEnable(p)} 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 6px' }}
                      title={p.is_enabled ? 'Disable' : 'Enable'}
                    >
                      {p.is_enabled ? <ToggleRight className="text-green" size={16} /> : <ToggleLeft className="text-muted" size={16} />}
                    </button>
                    <button 
                      onClick={() => startEdit(p)} 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 6px' }}
                      title="Edit"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button 
                      onClick={() => handleDelete(p)} 
                      className="btn btn-danger" 
                      style={{ padding: '4px 6px' }}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.4' }}>{p.description || 'No description provided.'}</div>

                {(p.uc_owner || p.owner_group || p.tags) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.75rem', marginTop: '12px' }}>
                    {p.uc_owner && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                        <Shield size={12} className="text-cyan" />
                        <span>UC: <strong>{p.uc_owner}</strong></span>
                      </span>
                    )}
                    {p.owner_group && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                        <Lock size={12} style={{ color: 'var(--accent-purple)' }} />
                        <span>RBAC: <strong>{p.owner_group}</strong></span>
                      </span>
                    )}
                    {p.tags && (
                      <span style={{ color: 'var(--accent-purple)', background: 'rgba(139,92,246,0.06)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                        {p.tags}
                      </span>
                    )}
                  </div>
                )}
                
                {params.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <Wrench size={10} /> <span>Global Parameters:</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {params.map((param, i) => (
                        <span key={i} className="param-tag" style={{ fontSize: '0.65rem' }}>{param.name} ({param.type})</span>
                      ))}
                    </div>
                  </div>
                )}

                {p.global_instruction && (
                  <div style={{ marginTop: '10px', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                      <FileText size={10} /> <span>Global Instruction:</span>
                    </div>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {p.global_instruction}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  <span>{linked} project{linked !== 1 ? 's' : ''}</span>
                  <span>Created {new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          );
        })}
        </div>
        {filteredProducts.length === 0 && (
          <div className="empty-state">No data products match your search criteria.</div>
        )}
      </div>

      {/* Multistep Create/Edit Wizard Modal */}
      {isWizardOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 1000
        }}>
          <div className="slide-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <button 
              onClick={() => setIsWizardOpen(false)} 
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div className="card-header" style={{ marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              <Layers size={16} className={editingProduct ? "text-purple" : "text-cyan"} style={{ color: editingProduct ? 'var(--accent-purple)' : 'var(--accent-cyan)' }} />
              <span style={{ fontSize: '1.1rem' }}>{editingProduct ? `Edit Data Product: ${editingProduct.name}` : 'Register Data Product Domain'}</span>
            </div>

            {/* Step progress */}
            <div className="step-indicator" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
              {steps.map((label, i) => (
                <React.Fragment key={i}>
                  <div className="step-item" onClick={() => i < step + 1 && setStep(i)} style={{ cursor: i <= step ? 'pointer' : 'default' }}>
                    <div className={`step-circle ${i < step ? 'done' : i === step ? 'active' : 'pending'}`}>
                      {i < step ? <CheckCircle size={14} /> : <span>{i + 1}</span>}
                    </div>
                    <span className={`step-label ${i === step ? 'active' : ''}`} style={{ fontSize: '0.7rem' }}>{label}</span>
                  </div>
                  {i < steps.length - 1 && <div className={`step-connector ${i < step ? 'done' : ''}`} />}
                </React.Fragment>
              ))}
            </div>

            {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1rem', flexShrink: 0 }}>{msg.text}</div>}

            <div style={{ flexGrow: 1, overflowY: currentStepLabel === 'Configuration' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {currentStepLabel === 'Details' && (
                <div className="form-stack">
                  <div className="form-group">
                    <label className="form-label">Product Name <span className="required">*</span></label>
                    <p className="form-hint">A high-level business domain grouping (e.g. "Finance Data Product")</p>
                    <AISuggestInput value={name} onChange={handleNameChange} fieldContext="product name" placeholder="e.g. FinanceDataProduct" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Product Type <span className="required">*</span></label>
                    <p className="form-hint">Define the core operation type of this Data Product domain.</p>
                    <select className="form-select" value={type} onChange={e => setType(e.target.value)} required>
                      <option value="Ingestion">Ingestion</option>
                      <option value="Migration">Migration</option>
                      <option value="Warehousing">Warehousing</option>
                      <option value="Governance">Governance</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <p className="form-hint">Describe the scope, ownership, and data catalogs this domain covers.</p>
                    <AISuggestInput value={description} onChange={setDescription} fieldContext="product description" placeholder="Describe the scope and business context..." rows={4} />
                  </div>
                </div>
              )}

              {currentStepLabel === 'Configuration' && (
                <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                  {/* Left Column: Governance */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Shield size={13} />
                      <span>Governance Settings</span>
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Unity Catalog Owner Group</label>
                      <p className="form-hint">Identify the administrative owner group for Databricks catalogs.</p>
                      <AISuggestInput value={ucOwner} onChange={setUcOwner} fieldContext="unity catalog owner" placeholder="e.g. finance-admin-group" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Access Control Group (Future RBAC)</label>
                      <p className="form-hint">Configure which IAM/Okta group can modify this product configuration.</p>
                      <AISuggestInput value={ownerGroup} onChange={setOwnerGroup} fieldContext="unity catalog owner" placeholder="e.g. finance-leads" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Governance Tags</label>
                      <p className="form-hint">Comma-separated tags for catalog classification (e.g. "governed,pii,financial").</p>
                      <AISuggestInput value={tags} onChange={setTags} fieldContext="governance tags" placeholder="e.g. governed,financial,internal" />
                    </div>
                  </div>

                  {/* Right Column: Global Parameters */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Wrench size={13} />
                      <span>Global Parameters</span>
                    </div>
                    <div className="info-box" style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
                      Define input variables inherited globally by all child data projects.
                    </div>
                    <ParameterBuilder parameters={globalParams} onChange={setGlobalParams} />
                  </div>
                </div>
              )}

              {currentStepLabel === 'Instructions' && (
                <div className="form-stack" style={{ height: '100%' }}>
                  <div className="form-group" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <label className="form-label">Instructions</label>
                    <p className="form-hint">Enter rules that AI agents will automatically inherit when running downstream workflows.</p>
                    <AISuggestInput value={globalInstruction} onChange={setGlobalInstruction} fieldContext="global instruction" placeholder="e.g. Ensure all tables have a 'last_modified_by' audit column and facts use Decimal precision (18, 2)." rows={12} style={{ height: '100%' }} />
                  </div>
                </div>
              )}

              {currentStepLabel === 'Review' && (
                <div className="review-card">
                  <div className="review-section-title">Review Product Configuration</div>

                  <div className="review-row">
                    <span className="review-label">Product Name</span>
                    <span className="review-value">{name}</span>
                  </div>

                  <div className="review-row">
                    <span className="review-label">Product Type</span>
                    <span className="review-value">{type}</span>
                  </div>

                  <div className="review-row">
                    <span className="review-label">Description</span>
                    <span className="review-value">{description || <em style={{ color: 'var(--text-muted)' }}>Not provided</em>}</span>
                  </div>

                  <div className="review-row">
                    <span className="review-label">UC Owner Group</span>
                    <span className="review-value">{ucOwner || <em style={{ color: 'var(--text-muted)' }}>Not specified</em>}</span>
                  </div>

                  <div className="review-row">
                    <span className="review-label">Access Control Group</span>
                    <span className="review-value">{ownerGroup || <em style={{ color: 'var(--text-muted)' }}>Not configured</em>}</span>
                  </div>

                  <div className="review-row">
                    <span className="review-label">Governance Tags</span>
                    <span className="review-value">{tags || <em style={{ color: 'var(--text-muted)' }}>None</em>}</span>
                  </div>

                  <div className="review-row">
                    <span className="review-label">Global Parameters</span>
                    <span className="review-value">
                      {globalParams.length === 0 ? (
                        <em style={{ color: 'var(--text-muted)' }}>None configured</em>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {globalParams.map((p, i) => (
                            <span key={i} className="param-tag">{p.name}: {p.type}{p.required ? ' *' : ''}</span>
                          ))}
                        </div>
                      )}
                    </span>
                  </div>

                  <div className="review-row">
                    <span className="review-label">Global Instructions</span>
                    <span className="review-value" style={{ whiteSpace: 'pre-wrap' }}>
                      {globalInstruction || <em style={{ color: 'var(--text-muted)' }}>None defined</em>}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="step-nav" style={{ marginTop: 'auto', paddingTop: '1.5rem', flexShrink: 0 }}>
              {step > 0 ? (
                <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={() => setIsWizardOpen(false)}>
                  Cancel
                </button>
              )}

              {step < steps.length - 1 ? (
                <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext}>
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleRegister} disabled={loading || !canNext}>
                  <Check size={16} />
                  <span>{loading ? (editingProduct ? 'Saving...' : 'Registering...') : (editingProduct ? 'Save Changes' : 'Register Domain')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
