import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  Plus, 
  Trash2, 
  Edit2, 
  Play, 
  ToggleLeft, 
  ToggleRight, 
  Search, 
  X, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  Settings,
  Code
} from 'lucide-react';
import type { Tool, SkillParameter } from '../types';
import { ParameterBuilder } from './ParameterBuilder';
import { AISuggestInput } from './AISuggestInput';

export const ToolStudio: React.FC = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Wizard Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState('python');
  const [code, setCode] = useState('');
  const [params, setParams] = useState<SkillParameter[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);

  // Test State (Inline - used in wizard review step)
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testDuration, setTestDuration] = useState<number | null>(null);

  // Quick Test Modal State (standalone, separate from edit wizard)
  const [quickTestModalOpen, setQuickTestModalOpen] = useState(false);
  const [quickTestTool, setQuickTestTool] = useState<Tool | null>(null);
  const [quickTestInputs, setQuickTestInputs] = useState<Record<string, string>>({});
  const [quickTestResult, setQuickTestResult] = useState<any>(null);
  const [quickTestLoading, setQuickTestLoading] = useState(false);
  const [quickTestDuration, setQuickTestDuration] = useState<number | null>(null);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tools');
      if (res.ok) {
        setTools(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDesc('');
    setType('python');
    setCode('');
    setParams([]);
    setIsEnabled(true);
    setMsg(null);
    setWizardStep(1);
    setTestInputs({});
    setTestResult(null);
    setTestDuration(null);
  };

  const handleOpenCreateWizard = () => {
    resetForm();
    setIsWizardOpen(true);
  };

  const handleEdit = (tool: Tool) => {
    setEditingId(tool.id);
    setName(tool.name);
    setDesc(tool.description || '');
    setType(tool.type);
    setCode(tool.code || '');
    let parsedParams: SkillParameter[] = [];
    try {
      parsedParams = typeof tool.parameters === 'string' ? JSON.parse(tool.parameters) : tool.parameters;
    } catch {
      parsedParams = [];
    }
    setParams(parsedParams || []);
    setIsEnabled(tool.is_enabled);
    setMsg(null);
    setWizardStep(1);
    setIsWizardOpen(true);
  };

  const handleNextStep = () => {
    if (wizardStep === 1) {
      if (!name.trim()) {
        setMsg({ type: 'error', text: 'Tool Name is required.' });
        return;
      }
      if (/\s/.test(name)) {
        setMsg({ type: 'error', text: 'Tool Name must not contain spaces.' });
        return;
      }
      setMsg(null);
    }
    setWizardStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setWizardStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setMsg(null);

    const payload = {
      name,
      description: desc,
      type,
      code,
      parameters: params,
      is_enabled: isEnabled
    };

    try {
      const url = editingId ? `/api/tools/${editingId}` : '/api/tools';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        fetchTools();
        setIsWizardOpen(false);
        resetForm();
      } else {
        const d = await res.json();
        setMsg({ type: 'error', text: d.detail || 'Failed to save tool' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this tool?')) return;
    try {
      const res = await fetch(`/api/tools/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTools();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStatus = async (tool: Tool) => {
    try {
      let parsedParams: SkillParameter[] = [];
      try {
        parsedParams = typeof tool.parameters === 'string' ? JSON.parse(tool.parameters) : tool.parameters;
      } catch {
        parsedParams = [];
      }
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tool.name,
          description: tool.description,
          type: tool.type,
          code: tool.code,
          parameters: parsedParams,
          is_enabled: !tool.is_enabled
        })
      });
      if (res.ok) {
        fetchTools();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    setTestDuration(null);
    const startTime = performance.now();
    try {
      const res = await fetch('/api/tools/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          type: type,
          inputs: testInputs
        })
      });
      const endTime = performance.now();
      setTestDuration(Math.round(endTime - startTime));
      if (res.ok) {
        setTestResult(await res.json());
      } else {
        const errorData = await res.json();
        setTestResult({
          status: 'error',
          output: errorData.detail || 'Failed to complete test run.'
        });
      }
    } catch (e) {
      setTestResult({
        status: 'error',
        output: 'Network connection failed during test.'
      });
    } finally {
      setTestLoading(false);
    }
  };

  const openQuickTestModal = (tool: Tool) => {
    setQuickTestTool(tool);
    const initialInputs: Record<string, string> = {};
    let parsedParams: SkillParameter[] = [];
    try {
      parsedParams = typeof tool.parameters === 'string' ? JSON.parse(tool.parameters) : tool.parameters;
    } catch {}
    (parsedParams || []).forEach(p => { initialInputs[p.name] = ''; });
    setQuickTestInputs(initialInputs);
    setQuickTestResult(null);
    setQuickTestDuration(null);
    setQuickTestModalOpen(true);
  };

  const handleRunQuickTest = async () => {
    if (!quickTestTool) return;
    setQuickTestLoading(true);
    setQuickTestResult(null);
    setQuickTestDuration(null);
    const startTime = performance.now();
    try {
      const res = await fetch('/api/tools/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: quickTestTool.code,
          type: quickTestTool.type,
          inputs: quickTestInputs
        })
      });
      const endTime = performance.now();
      setQuickTestDuration(Math.round(endTime - startTime));
      if (res.ok) {
        setQuickTestResult(await res.json());
      } else {
        const errorData = await res.json();
        setQuickTestResult({
          status: 'error',
          output: errorData.detail || 'Failed to complete test run.'
        });
      }
    } catch (e) {
      setQuickTestResult({
        status: 'error',
        output: 'Network connection failed during test.'
      });
    } finally {
      setQuickTestLoading(false);
    }
  };

  const filteredTools = tools.filter(tool => {
    const q = searchQuery.toLowerCase();
    return (
      tool.name.toLowerCase().includes(q) ||
      (tool.description || '').toLowerCase().includes(q) ||
      tool.type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Wrench size={22} /></div>
          <div>
            <h1 className="page-title">Tool Studio</h1>
            <p className="page-subtitle">Configure, enable/disable and manage custom execution tools for agents</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 12px' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search tools..." 
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
            <span>Create Tool</span>
          </button>
        </div>
      </div>

      {/* Grid of Tool Cards */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Settings size={30} className="spin-animation text-cyan" />
          <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading Registered Tools...</p>
        </div>
      ) : (
        <div className="card-grid-2">
          {filteredTools.map(tool => {
            let parsedParams: SkillParameter[] = [];
            try {
              parsedParams = typeof tool.parameters === 'string' ? JSON.parse(tool.parameters) : tool.parameters;
            } catch {
              parsedParams = [];
            }
            return (
              <div key={tool.id} className={`card ${!tool.is_enabled ? 'opacity-60' : ''}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '220px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent-blue)', fontSize: '1rem' }}>{tool.name}</span>
                      <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{tool.type.toUpperCase()}</span>
                      {!tool.is_enabled && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>DISABLED</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => toggleStatus(tool)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title={tool.is_enabled ? 'Disable' : 'Enable'}
                      >
                        {tool.is_enabled ? <ToggleRight className="text-green" size={16} /> : <ToggleLeft className="text-muted" size={16} />}
                      </button>
                      <button 
                        onClick={() => handleEdit(tool)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        onClick={() => handleDelete(tool.id)} 
                        className="btn btn-danger" 
                        style={{ padding: '4px 6px' }}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.4' }}>
                    {tool.description || 'No description provided.'}
                  </p>

                  {tool.code && (
                    <div style={{ marginTop: '0.75rem', backgroundColor: '#05070f', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', maxHeight: '70px', overflowY: 'auto' }}>
                      <code style={{ fontSize: '0.7rem', color: '#a5f3fc', display: 'block', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                        {tool.code}
                      </code>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '1rem' }}>
                  {parsedParams && parsedParams.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '0.75rem' }}>
                      {parsedParams.map((p, i) => (
                        <span key={i} className="param-tag" style={{ fontSize: '0.65rem' }}>
                          {p.name}: {p.type}{p.required ? ' *' : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  <button 
                    className="btn btn-secondary btn-full" 
                    style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                    onClick={() => openQuickTestModal(tool)}
                  >
                    <Play size={12} className="text-green" />
                    <span>Test Tool</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredTools.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              No tools match your search criteria. Register a new tool by clicking Create Tool.
            </div>
          )}
        </div>
      )}
      </div>

      {/* Multistep Create/Edit Wizard Modal */}
      {isWizardOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.96)',
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
              <Plus size={16} className="text-cyan" />
              <span style={{ fontSize: '1.1rem' }}>{editingId ? `Edit Tool: ${name}` : 'Register New Tool'}</span>
            </div>

            {/* Step indicator */}
            <div className="step-indicator" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 1 ? 'active' : (wizardStep > 1 ? 'done' : 'pending')}`}>1</div>
                <span className={`step-label ${wizardStep === 1 ? 'active' : ''}`}>Details</span>
              </div>
              <div className="step-connector" />
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 2 ? 'active' : (wizardStep > 2 ? 'done' : 'pending')}`}>2</div>
                <span className={`step-label ${wizardStep === 2 ? 'active' : ''}`}>Configuration</span>
              </div>
              <div className="step-connector" />
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 3 ? 'active' : 'pending'}`}>3</div>
                <span className={`step-label ${wizardStep === 3 ? 'active' : ''}`}>Review</span>
              </div>
            </div>

            {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1rem', flexShrink: 0 }}>{msg.text}</div>}

            <div style={{ flexGrow: 1, overflowY: wizardStep === 2 ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Step 1: Details */}
              {wizardStep === 1 && (
                <div className="form-stack">
                  <div className="form-group">
                    <label className="form-label">Tool Name <span className="required">*</span></label>
                    <AISuggestInput 
                      value={name} 
                      onChange={setName} 
                      fieldContext="tool name" 
                      placeholder="e.g. ExecuteSQLQuery (no spaces)" 
                    />
                    <p className="form-hint">Must not contain any spaces. Format using PascalCase or snake_case.</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <AISuggestInput 
                      value={desc} 
                      onChange={setDesc} 
                      fieldContext="tool description" 
                      placeholder="What does this integration tool do?" 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Tool Type</label>
                    <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                      <option value="python">Python Script</option>
                      <option value="sql">SQL Query</option>
                      <option value="api">API Call / REST</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      id="tool-enabled-check"
                      checked={isEnabled} 
                      onChange={e => setIsEnabled(e.target.checked)} 
                    />
                    <label htmlFor="tool-enabled-check" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                      Enable this tool for active execution
                    </label>
                  </div>
                </div>
              )}

              {/* Step 2: Configuration (Split params and code) */}
              {wizardStep === 2 && (
                <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                  {/* Left Column: Input Parameter Schema */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Wrench size={13} />
                      <span>Input Parameter Schema</span>
                    </div>
                    <div className="info-box" style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
                      Define input parameters for the execution sandbox.
                    </div>
                    <ParameterBuilder parameters={params} onChange={setParams} />
                  </div>

                  {/* Right Column: Source Code / Config Template */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Code size={13} />
                      <span>Source Code / Config Template</span>
                    </div>
                    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <AISuggestInput 
                        value={code}
                        onChange={setCode}
                        fieldContext={`tool code (${type})`}
                        placeholder={type === 'python' ? 'def run(params):\n    print("Executing tool logic...")' : (type === 'sql' ? 'SELECT * FROM {catalog_name}.{schema_name}.{table} LIMIT 10' : 'https://api.example.com/v1/data')}
                        rows={14}
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem', flexGrow: 1, resize: 'none', height: '100%' }}
                      />
                      <p className="form-hint" style={{ marginTop: '4px' }}>Reference parameters inside braces, e.g. <code>{'{parameter_name}'}</code>.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {wizardStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="review-card">
                    <div className="review-section-title">Review Tool Configuration</div>

                    <div className="review-row">
                      <span className="review-label">Tool Name</span>
                      <span className="review-value">{name}</span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Tool Type</span>
                      <span className="review-value badge badge-info" style={{ width: 'fit-content', textTransform: 'uppercase' }}>{type}</span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Description</span>
                      <span className="review-value">{desc || <em style={{ color: 'var(--text-muted)' }}>No description</em>}</span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Status</span>
                      <span className="review-value">{isEnabled ? <span style={{ color: 'var(--accent-green)' }}>Enabled</span> : <span style={{ color: 'var(--text-muted)' }}>Disabled</span>}</span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Input Parameters</span>
                      <span className="review-value">
                        {params.length === 0 ? (
                          <em style={{ color: 'var(--text-muted)' }}>None defined</em>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {params.map((p, i) => (
                              <span key={i} className="param-tag">{p.name}: {p.type}{p.required ? ' *' : ''}</span>
                            ))}
                          </div>
                        )}
                      </span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Source Code / Endpoint</span>
                      <span className="review-value">
                        {code ? (
                          <pre style={{ margin: 0, padding: '8px', backgroundColor: '#05070f', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#a5f3fc', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                            {code}
                          </pre>
                        ) : (
                          <em style={{ color: 'var(--text-muted)' }}>No code / template</em>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Structured Execution Sandbox (Side-by-Side) */}
                  <div style={{ backgroundColor: 'rgba(17, 24, 39, 0.9)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', display: 'flex', gap: '1.25rem', marginTop: '1rem' }}>
                    
                    {/* Left Column: Sandbox Trigger & Inputs */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
                        <Play size={13} />
                        <span>Execution Sandbox</span>
                      </div>

                      {params.length === 0 ? (
                        <div className="info-box" style={{ marginBottom: '0.5rem' }}>No input parameters required for this sandbox.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {params.map(p => (
                            <div className="form-group" key={p.name} style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>{p.name} {p.required && <span className="required">*</span>}</label>
                              <input 
                                type={p.type === 'integer' ? 'number' : 'text'}
                                className="form-control"
                                style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                placeholder={p.description || `Enter value`}
                                value={testInputs[p.name] || ''}
                                onChange={e => setTestInputs({ ...testInputs, [p.name]: e.target.value })}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <button 
                        className="btn btn-primary" 
                        onClick={handleRunTest} 
                        disabled={testLoading}
                        style={{ fontSize: '0.8rem', padding: '6px 12px', marginTop: '0.5rem', alignSelf: 'flex-start' }}
                      >
                        <Play size={14} />
                        {testLoading ? 'Running sandbox...' : 'Test Execution Sandbox'}
                      </button>
                    </div>

                    {/* Right Column: Console Logs & Simulation Outputs */}
                    <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Simulation logs & variables
                        </span>
                        {testResult ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span className={`badge ${testResult.status === 'success' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>
                              {testResult.status}
                            </span>
                            {testDuration !== null && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{testDuration}ms</span>
                            )}
                          </div>
                        ) : (
                          <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>NOT RUN YET</span>
                        )}
                      </div>

                      {/* Console / Output Logs */}
                      <div className="terminal-window" style={{ flexGrow: 1, padding: '0.75rem', minHeight: '120px', maxHeight: '200px', overflowY: 'auto' }}>
                        {testResult ? (
                          <>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginBottom: '6px', fontFamily: 'monospace' }}>
                              STDOUT / Execution Logs:
                            </div>
                            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#e2e8f0', fontSize: '0.7rem', margin: 0 }}>
                              {testResult.output}
                            </pre>
                            {testResult.traceback && (
                              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: 'var(--accent-red)', fontSize: '0.7rem', marginTop: '6px', margin: 0 }}>
                                {testResult.traceback}
                              </pre>
                            )}
                          </>
                        ) : (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                            No logs captured. Execute the sandbox test.
                          </div>
                        )}
                      </div>

                      {/* Returned variables/rows */}
                      {testResult && testResult.variables && Object.keys(testResult.variables).length > 0 && (
                        <div style={{ backgroundColor: 'rgba(5,7,15,0.3)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px' }}>
                          <div style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.04em' }}>
                            Returned Sandbox variables
                          </div>
                          <pre style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#a5f3fc', margin: 0, maxHeight: '80px', overflowY: 'auto' }}>
                            {JSON.stringify(testResult.variables, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="step-nav" style={{ marginTop: 'auto', paddingTop: '1.5rem', flexShrink: 0 }}>
              {wizardStep > 1 ? (
                <button className="btn btn-secondary" onClick={handlePrevStep}>
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={() => setIsWizardOpen(false)}>
                  Cancel
                </button>
              )}

              {wizardStep < 3 ? (
                <button className="btn btn-primary" onClick={handleNextStep}>
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                  <Check size={16} />
                  <span>{editingId ? 'Save Changes' : 'Register Tool'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Test Modal (standalone, not part of edit wizard) */}
      {quickTestModalOpen && quickTestTool && (() => {
        let qtParams: SkillParameter[] = [];
        try {
          qtParams = typeof quickTestTool.parameters === 'string' ? JSON.parse(quickTestTool.parameters) : quickTestTool.parameters;
        } catch {}
        qtParams = qtParams || [];
        return (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(5, 7, 15, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1100
          }}>
            <div style={{
              width: '1150px',
              maxWidth: '95vw',
              height: '85vh',
              backgroundColor: 'rgba(17, 24, 39, 0.98)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
            }}>
              {/* Header */}
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={16} style={{ color: 'var(--accent-green)' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Sandbox Test: {quickTestTool.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>{quickTestTool.type.toUpperCase()}</span>
                      <span>{quickTestTool.description || 'Interactive tool code executor'}</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setQuickTestModalOpen(false)} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '1.5rem', flex: 1, display: 'flex', gap: '1.5rem', minHeight: 0, overflow: 'hidden' }}>
                {/* Left Panel: Inputs & Execution Trigger */}
                <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '1rem', borderRight: '1px solid var(--border-color)', paddingRight: '1.5rem', flexShrink: 0, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.75rem', color: 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)' }}>
                    <Settings size={12} />
                    <span>Configuration Inputs</span>
                  </div>

                  {qtParams.length === 0 ? (
                    <div className="info-box" style={{ fontSize: '0.8rem' }}>No input parameters required for this tool.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {qtParams.map(p => (
                        <div className="form-group" key={p.name} style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'block' }}>{p.name} {p.required && <span className="required">*</span>}</label>
                          {p.description && <p className="form-hint" style={{ margin: '0 0 4px 0', fontSize: '0.7rem' }}>{p.description}</p>}
                          <input 
                            type={p.type === 'integer' ? 'number' : 'text'}
                            className="form-control"
                            style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                            placeholder={`Enter ${p.name}...`}
                            value={quickTestInputs[p.name] || ''}
                            onChange={e => setQuickTestInputs({ ...quickTestInputs, [p.name]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleRunQuickTest} 
                      disabled={quickTestLoading}
                      style={{ fontSize: '0.8rem', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}
                    >
                      <Play size={14} />
                      {quickTestLoading ? 'Executing...' : 'Execute Test'}
                    </button>
                  </div>
                </div>

                {/* Right Panel: Sandbox Output & Returned Variables */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Execution Result & Sandbox Output
                    </span>
                    {quickTestResult ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className={`badge ${quickTestResult.status === 'success' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>
                          {quickTestResult.status}
                        </span>
                        {quickTestDuration !== null && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{quickTestDuration}ms</span>
                        )}
                      </div>
                    ) : (
                      <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>NOT RUN YET</span>
                    )}
                  </div>

                  <div className="terminal-window" style={{ flexGrow: 1, padding: '1rem', minHeight: '220px', overflowY: 'auto' }}>
                    {quickTestResult ? (
                      <>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginBottom: '6px', fontFamily: 'monospace' }}>
                          STDOUT / Execution Output:
                        </div>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#e2e8f0', fontSize: '0.8rem', margin: 0, lineHeight: '1.4' }}>
                          {quickTestResult.output}
                        </pre>
                        {quickTestResult.traceback && (
                          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: 'var(--accent-red)', fontSize: '0.75rem', marginTop: '6px', margin: 0 }}>
                            {quickTestResult.traceback}
                          </pre>
                        )}
                      </>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }}>
                        Provide inputs on the left and click "Execute Test" to run this tool code in a sandbox.
                      </div>
                    )}
                  </div>

                  {/* Returned variables */}
                  {quickTestResult && quickTestResult.variables && Object.keys(quickTestResult.variables).length > 0 && (
                    <div style={{ backgroundColor: 'rgba(5,7,15,0.3)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', flexShrink: 0 }}>
                      <div style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                        Returned Context Variables
                      </div>
                      <pre style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#a5f3fc', margin: 0, maxHeight: '150px', overflowY: 'auto', lineHeight: '1.4' }}>
                        {JSON.stringify(quickTestResult.variables, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
