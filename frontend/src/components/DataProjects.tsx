import React, { useState, useEffect } from 'react';
import { Briefcase, CheckCircle, ChevronRight, ChevronLeft, Layers, Database, Wrench, Trash2, Shield, X, HelpCircle, Plus, Search, Check, Edit2, ToggleRight, ToggleLeft, FileText } from 'lucide-react';
import type { DataProduct, DataProject, SkillParameter } from '../types';
import { AISuggestInput } from './AISuggestInput';
import { ParameterBuilder } from './ParameterBuilder';

interface Props {
  products: DataProduct[];
  projects: DataProject[];
  onRefresh: () => void;
}

const STEPS = [
  { label: 'Details', icon: Briefcase },
  { label: 'Configuration', icon: Database },
  { label: 'Instructions', icon: FileText },
  { label: 'Review', icon: CheckCircle },
] as const;

const DEFAULT_INSTRUCTIONS = `1. Always use t_ as prefix for table name.
2. Always Use external layer for landing layer it can use csv, json or parquet data type based on data specification.
3. File path for landing layer should be {storage_account}/{segment}/landing/{domain}/t_{table_name}.
4. File path for silver layer should be {storage_account}/{segment}/silver/{domain}/t_{table_name}. Bad data should be at {storage_account}/{segment}/bad_data/{domain}/t_{table_name}. Checkpoints at {storage_account}/{segment}/checkpoints/silver/{domain}/t_{table_name}.
5. File path for gold layer should be {storage_account}/{segment}/gold/{domain}/t_{table_name}. Checkpoints at {storage_account}/{segment}/checkpoints/gold/{domain}/t_{table_name}.`;

export const DataProjects: React.FC<Props> = ({ products, projects, onRefresh }) => {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProductId, setFilterProductId] = useState<number | 'all'>('all');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [productId, setProductId] = useState<number | ''>('');
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [customParameters, setCustomParameters] = useState<SkillParameter[]>([]);

  const [loading, setLoading] = useState(false);
  const [editingProject, setEditingProject] = useState<DataProject | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleNameChange = (val: string) => {
    const camelCased = val
      .split(/[\s_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    setName(camelCased);
  };

  // Load parent product's global parameters to pre-fill default values when productId changes
  useEffect(() => {
    if (productId !== '') {
      const parentProduct = products.find(p => p.id === Number(productId));
      if (parentProduct && parentProduct.global_parameters) {
        try {
          const gps: SkillParameter[] = JSON.parse(parentProduct.global_parameters);
          const defaults: Record<string, any> = {};
          gps.forEach(gp => {
            // Only set if not already set by editing mode or manual entry
            if (paramValues[gp.name] === undefined) {
              let val: any = gp.default_value;
              if (val !== undefined && val !== '') {
                if (gp.type === 'boolean') {
                  val = val === 'true' || val === true;
                } else if (gp.type === 'integer' || gp.type === 'number') {
                  val = Number(val);
                  if (isNaN(val)) val = 0;
                }
              } else {
                val = gp.type === 'boolean' ? false : gp.type === 'integer' || gp.type === 'number' ? 0 : '';
              }
              defaults[gp.name] = val;
            }
          });
          if (Object.keys(defaults).length > 0) {
            setParamValues(prev => ({ ...defaults, ...prev }));
          }
        } catch {}
      }
    }
  }, [productId, products]);

  const canNext = [
    name.trim().length > 0 && productId !== '',
    true, // Configuration — workspace fields optional except URL & schema are validated on submit
    true, // Instructions
    true, // Review step
  ][step];

  const handleOpenCreateWizard = () => {
    setEditingProject(null);
    setName('');
    setDescription('');
    setInstructions(DEFAULT_INSTRUCTIONS);
    setProductId('');
    setParamValues({});
    setCustomParameters([]);
    setStep(0);
    setMsg(null);
    setIsWizardOpen(true);
  };

  const startEdit = (p: DataProject) => {
    setEditingProject(p);
    setName(p.name);
    setDescription(p.description || '');
    setInstructions(p.instructions || '');
    setProductId(p.data_product_id);

    let params: Record<string, any> = {};
    let customParams: SkillParameter[] = [];
    if (p.parameters) {
      try {
        params = JSON.parse(p.parameters);
        if (params.__custom_params) {
          customParams = params.__custom_params;
        }
      } catch {}
    }

    const seedValues: Record<string, any> = {
      databricks_url: p.databricks_url || '',
      catalog_name: p.catalog_name || '',
      schema_name: p.schema_name || '',
      table_prefix: p.table_prefix || '',
      ...params,
    };
    setParamValues(seedValues);
    setCustomParameters(customParams);
    setStep(0);
    setMsg(null);
    setIsWizardOpen(true);
  };

  const handleCreateOrUpdate = async () => {
    setLoading(true); setMsg(null);
    try {
      const url = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
      const method = editingProject ? 'PUT' : 'POST';
      
      // Extract workspace fields from paramValues
      const databricksUrl = String(paramValues['databricks_url'] || '');
      const catalogName = String(paramValues['catalog_name'] || '');
      const schemaName = String(paramValues['schema_name'] || '');
      const tablePrefix = String(paramValues['table_prefix'] || '');

      // Non-workspace, non-internal params go into the stored parameters field
      const workspaceKeys = new Set(['databricks_url', 'catalog_name', 'schema_name', 'table_prefix', '__custom_params']);
      const extraParamValues = Object.fromEntries(
        Object.entries(paramValues).filter(([k]) => !workspaceKeys.has(k))
      );

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          data_product_id: Number(productId),
          databricks_url: databricksUrl,
          catalog_name: catalogName,
          schema_name: schemaName,
          table_prefix: tablePrefix,
          instructions,
          is_enabled: editingProject ? editingProject.is_enabled : true,
          parameters: {
            ...extraParamValues,
            __custom_params: customParameters
          }
        }),
      });
      if (res.ok) {
        setMsg({ type: 'success', text: `"${name}" ${editingProject ? 'updated' : 'created'} successfully!` });
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

  const toggleEnable = async (p: DataProject) => {
    try {
      let params: Record<string, any> = {};
      if (p.parameters) {
        try { params = JSON.parse(p.parameters); } catch {}
      }
      const res = await fetch(`/api/projects/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: p.name,
          description: p.description,
          data_product_id: p.data_product_id,
          databricks_url: p.databricks_url,
          catalog_name: p.catalog_name,
          schema_name: p.schema_name,
          table_prefix: p.table_prefix,
          instructions: p.instructions,
          is_enabled: !p.is_enabled,
          parameters: params
        }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        const d = await res.json();
        alert(d.detail || 'Failed to toggle status');
      }
    } catch {
      alert('Network error while toggling status');
    }
  };

  const handleDelete = async (p: DataProject) => {
    if (!window.confirm(`Are you sure you want to delete data project "${p.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/projects/${p.id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      } else {
        const d = await res.json();
        alert(d.detail || 'Failed to delete project');
      }
    } catch {
      alert('Network error while deleting project');
    }
  };

  // Filter project list based on top-level filter and search query
  const filteredProjects = projects.filter(p => {
    const q = searchQuery.toLowerCase();
    const productRef = products.find(pr => pr.id === p.data_product_id);
    const domainMatch = filterProductId === 'all' || p.data_product_id === Number(filterProductId);
    const textMatch = p.name.toLowerCase().includes(q) || 
                      (p.description || '').toLowerCase().includes(q) || 
                      (productRef?.name || '').toLowerCase().includes(q) ||
                      (p.catalog_name || '').toLowerCase().includes(q) ||
                      (p.schema_name || '').toLowerCase().includes(q);
    return domainMatch && textMatch;
  });

  // Fetch parent product of the current configuration
  const parentProduct = products.find(p => p.id === Number(productId));
  let parentParams: SkillParameter[] = [];
  if (parentProduct && parentProduct.global_parameters) {
    try {
      parentParams = JSON.parse(parentProduct.global_parameters);
    } catch {}
  }

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Briefcase size={22} /></div>
          <div>
            <h1 className="page-title">Data Projects</h1>
            <p className="page-subtitle">Configure Databricks workspace linkages and schema cascades</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Domain:</span>
            <select 
              className="form-select" 
              style={{ border: 'none', background: 'transparent', padding: '2px 24px 2px 4px', fontSize: '0.8rem', height: 'auto', minWidth: '120px' }}
              value={filterProductId}
              onChange={e => setFilterProductId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">All Domains</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 12px' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', padding: '4px 0', fontSize: '0.85rem', color: 'var(--text-primary)', width: '180px', outline: 'none' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={14} />
              </button>
            )}
          </div>
          <button className="btn btn-primary" onClick={handleOpenCreateWizard}>
            <Plus size={16} />
            <span>Create New Project</span>
          </button>
        </div>
      </div>

      {/* Grid of Projects */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
        <div className="card-grid-2">
        {filteredProjects.map(p => {
          const productRef = products.find(pr => pr.id === p.data_product_id);
          let projParamsList: [string, any][] = [];
          if (p.parameters) {
            try { projParamsList = Object.entries(JSON.parse(p.parameters)); } catch {}
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
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{p.name}</div>
                      {!p.is_enabled && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>DISABLED</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Layers size={12} />
                      <span>Domain: <strong>{productRef?.name || 'Unknown'}</strong></span>
                    </div>
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

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '10px 0', lineHeight: '1.4' }}>{p.description || 'No description provided.'}</p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.75rem', marginTop: '10px', background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                    <Shield size={13} className="text-cyan" />
                    <span>Workspace: <code style={{ color: 'var(--accent-blue)' }}>{p.catalog_name || 'main'}</code>.<code style={{ color: 'var(--accent-blue)' }}>{p.schema_name}</code></span>
                  </span>
                  {p.table_prefix && (
                    <span style={{ color: 'var(--text-secondary)' }}>Prefix: <code style={{ color: 'var(--accent-purple)' }}>{p.table_prefix}</code></span>
                  )}
                </div>

                {projParamsList.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <Wrench size={10} /> <span>Override Values:</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {projParamsList.map(([key, val]) => (
                        <span key={key} className="param-tag" style={{ fontSize: '0.675rem', padding: '1px 4px' }}>
                          {key}: <strong>{String(val)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Created {new Date(p.created_at).toLocaleDateString()}
                </span>
                <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>#{p.id}</span>
              </div>
            </div>
          );
        })}
        </div>
        {filteredProjects.length === 0 && (
          <div className="empty-state">No projects found. Create a new data project to get started.</div>
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
              <Briefcase size={16} className={editingProject ? 'text-purple' : 'text-cyan'} style={{ color: editingProject ? 'var(--accent-purple)' : undefined }} />
              <span style={{ fontSize: '1.1rem' }}>{editingProject ? `Edit Project: ${editingProject.name}` : 'Create New Data Project'}</span>
            </div>

            {/* Step Indicator */}
            <div className="step-indicator" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
              {STEPS.map((s, i) => (
                <React.Fragment key={i}>
                  <div className="step-item" onClick={() => i <= step && setStep(i)} style={{ cursor: i <= step ? 'pointer' : 'default' }}>
                    <div className={`step-circle ${i < step ? 'done' : i === step ? 'active' : 'pending'}`}>
                      {i < step ? <CheckCircle size={13} /> : <span>{i + 1}</span>}
                    </div>
                    <span className={`step-label ${i === step ? 'active' : ''}`} style={{ fontSize: '0.7rem' }}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`step-connector ${i < step ? 'done' : ''}`} />}
                </React.Fragment>
              ))}
            </div>

            {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1rem', flexShrink: 0 }}>{msg.text}</div>}

            <div style={{ flexGrow: 1, overflowY: (step === 1 || step === 2) ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {step === 0 && (
                <div className="form-stack">
                  <div className="form-group">
                    <label className="form-label">Data Project Name <span className="required">*</span></label>
                    <p className="form-hint">A specific data engineering project or pipeline scope.</p>
                    <AISuggestInput value={name} onChange={handleNameChange} fieldContext="data project name" placeholder="e.g. ERPLegacyIngestion" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Parent Data Product Domain <span className="required">*</span></label>
                    <p className="form-hint">Assign this project to a governed business domain.</p>
                    <select className="form-select" value={productId} onChange={e => { setProductId(e.target.value ? Number(e.target.value) : ''); setParamValues({}); }} required>
                      <option value="">-- Select Data Product --</option>
                      {products.filter(p => p.is_enabled).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.type || 'Ingestion'})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <AISuggestInput value={description} onChange={setDescription} fieldContext="description" placeholder="Describe data sources, scopes, and objectives..." rows={4} />
                  </div>
                </div>
              )}

              {/* Step 1: Configuration */}
              {step === 1 && (
                <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                  {/* Column 1: Workspace Configuration */}
                  <div style={{ flex: '1 1 25%', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Database size={13} />
                      <span>Workspace Configuration</span>
                    </div>
                    <div className="info-box" style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
                      Configure the Databricks destination for this project's artifacts.
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Databricks Workspace URL <span className="required">*</span></label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={paramValues['databricks_url'] || ''} 
                        onChange={e => setParamValues(p => ({ ...p, databricks_url: e.target.value }))}
                        placeholder="https://<workspace>.cloud.databricks.com" 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Unity Catalog Name</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={paramValues['catalog_name'] || ''} 
                        onChange={e => setParamValues(p => ({ ...p, catalog_name: e.target.value }))}
                        placeholder="e.g. main or finance_prod" 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Schema / Database Name <span className="required">*</span></label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={paramValues['schema_name'] || ''} 
                        onChange={e => setParamValues(p => ({ ...p, schema_name: e.target.value }))}
                        placeholder="e.g. default or erp_landing" 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Table Prefix</label>
                      <p className="form-hint" style={{ marginTop: '-4px' }}>Prefix prepended to all tables built by this project.</p>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={paramValues['table_prefix'] || ''} 
                        onChange={e => setParamValues(p => ({ ...p, table_prefix: e.target.value }))}
                        placeholder="e.g. tr_" 
                      />
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Layers size={13} />
                      <span>LLM Integration</span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">LLM Provider</label>
                      <select 
                        className="form-select" 
                        value={paramValues['llm_provider'] || 'gemini'}
                        onChange={e => setParamValues(p => ({ ...p, llm_provider: e.target.value }))}
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="databricks">Databricks Serving (Experiment/Model)</option>
                      </select>
                    </div>

                    {paramValues['llm_provider'] === 'databricks' && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Serving Endpoint Name</label>
                          <input 
                            type="text" 
                            className="form-control" 
                            value={paramValues['databricks_llm_endpoint_name'] || ''} 
                            onChange={e => setParamValues(p => ({ ...p, databricks_llm_endpoint_name: e.target.value }))}
                            placeholder="e.g. databricks-meta-llama-3-1-70b-instruct" 
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">MLflow Experiment ID</label>
                          <p className="form-hint" style={{ marginTop: '-4px' }}>Optional MLflow tracking ID for LLM runs.</p>
                          <input 
                            type="text" 
                            className="form-control" 
                            value={paramValues['databricks_llm_experiment_id'] || ''} 
                            onChange={e => setParamValues(p => ({ ...p, databricks_llm_experiment_id: e.target.value }))}
                            placeholder="e.g. 29384728" 
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Column 2: Domain Requirements — Parameter Overrides */}
                  <div style={{ flex: '1 1 25%', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Wrench size={13} />
                      <span>Domain Requirements</span>
                    </div>
                    <div className="info-box" style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
                      Configure values for parameters required by the parent domain: <strong>{parentProduct?.name}</strong>.
                    </div>

                    {parentParams.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem 1rem', border: '1px dashed var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                        <HelpCircle size={24} style={{ opacity: 0.3, marginBottom: '0.4rem' }} />
                        <p style={{ fontSize: '0.85rem' }}>No global parameters defined on the parent domain.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {parentParams.map((gp, idx) => (
                          <div key={idx} className="form-group" style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {gp.name} {gp.required && <span className="required">*</span>}
                                {gp.default_value !== undefined && gp.default_value !== '' && (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>
                                    (Default: {gp.default_value})
                                  </span>
                                )}
                              </span>
                              <span className="badge" style={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>{gp.type}</span>
                            </div>
                            {gp.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>{gp.description}</p>}

                            {gp.type === 'boolean' ? (
                              <select
                                className="form-select"
                                value={paramValues[gp.name] !== undefined ? String(paramValues[gp.name]) : 'false'}
                                onChange={e => setParamValues({ ...paramValues, [gp.name]: e.target.value === 'true' })}
                              >
                                <option value="true">True</option>
                                <option value="false">False</option>
                              </select>
                            ) : gp.type === 'integer' || gp.type === 'number' ? (
                              <input
                                type="number"
                                className="form-control"
                                value={paramValues[gp.name] !== undefined ? paramValues[gp.name] : ''}
                                onChange={e => setParamValues({ ...paramValues, [gp.name]: Number(e.target.value) })}
                                placeholder="e.g. 90"
                              />
                            ) : (
                              <input
                                type="text"
                                className="form-control"
                                value={paramValues[gp.name] !== undefined ? paramValues[gp.name] : ''}
                                onChange={e => setParamValues({ ...paramValues, [gp.name]: e.target.value })}
                                placeholder="Enter variable value..."
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Column 3: Project-Specific Parameters */}
                  <div style={{ flex: '2 2 50%', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Plus size={13} />
                      <span>Project-Specific Parameters</span>
                    </div>
                    <div className="info-box" style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
                      Define custom parameters specifically for this project (e.g. storage paths, endpoints).
                    </div>
                    <ParameterBuilder
                      parameters={customParameters}
                      onChange={setCustomParameters}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Instructions */}
              {step === 2 && (
                <div className="form-stack" style={{ height: '100%' }}>
                  <div className="form-group" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <label className="form-label">Workspace Instructions / Guidelines</label>
                    <p className="form-hint">Design rules and context for downward artifact generation inherited by AI agents.</p>
                    <AISuggestInput value={instructions} onChange={setInstructions} fieldContext="instruction" placeholder="e.g. Always use t_ as prefix for table name. Always use external layer for landing layer..." rows={12} style={{ height: '100%' }} />
                  </div>
                </div>
              )}

              {/* Step 3: Review and Confirm */}
              {step === 3 && (
                <div className="review-card">
                  <div className="review-section-title">Review Project details</div>

                  <div className="review-row">
                    <span className="review-label">Data Project Name</span>
                    <span className="review-value">{name}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-label">Domain</span>
                    <span className="review-value">{parentProduct?.name || '—'}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-label">Databricks URL</span>
                    <span className="review-value" style={{ wordBreak: 'break-all' }}>{paramValues['databricks_url'] || <em style={{ color: 'var(--text-muted)' }}>Not configured</em>}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-label">Catalog / Schema</span>
                    <span className="review-value">{paramValues['catalog_name'] || '—'} / {paramValues['schema_name'] || '—'}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-label">Instructions</span>
                    <span className="review-value">{instructions ? <span style={{ whiteSpace: 'pre-wrap' }}>{instructions}</span> : <em style={{ color: 'var(--text-muted)' }}>(none)</em>}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-label">Table Prefix</span>
                    <span className="review-value">{paramValues['table_prefix'] || <em style={{ color: 'var(--text-muted)' }}>(none)</em>}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-label">Domain Overrides</span>
                    <span className="review-value">
                      {Object.keys(paramValues).filter(k => !['databricks_url', 'catalog_name', 'schema_name', 'table_prefix'].includes(k)).length === 0 ? (
                        <em style={{ color: 'var(--text-muted)' }}>None</em>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                          {Object.entries(paramValues).filter(([k]) => !['databricks_url', 'catalog_name', 'schema_name', 'table_prefix'].includes(k)).map(([k, v]) => (
                            <div key={k} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              <strong>{k}</strong>: <span>{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </span>
                  </div>
                  <div className="review-row">
                    <span className="review-label">Project-Specific Params</span>
                    <span className="review-value">
                      {customParameters.length === 0 ? (
                        <em style={{ color: 'var(--text-muted)' }}>None</em>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                          {customParameters.map((p, idx) => (
                            <div key={idx} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              <strong>{p.name}</strong>: <span>{p.default_value || '—'}</span> <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({p.type})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Step Navigation controls */}
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

              {step < STEPS.length - 1 ? (
                <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext}>
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleCreateOrUpdate} disabled={loading || !canNext}>
                  <Check size={16} />
                  <span>{loading ? (editingProject ? 'Saving...' : 'Creating...') : (editingProject ? 'Save Changes' : 'Create Data Project')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
