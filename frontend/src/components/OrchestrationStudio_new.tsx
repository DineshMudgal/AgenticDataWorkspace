import React, { useEffect, useState } from 'react';
import { Play, RotateCcw, AlertTriangle, Cpu, Terminal, Layers, CheckCircle2, Database, Search, Check, Settings, Clock, FileText } from 'lucide-react';
import type { DataProduct, DataProject, Workflow } from '../types';

interface OrchestrationStudioProps {
  products: DataProduct[];
  projects: DataProject[];
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
  onRefresh?: () => void;
}

const schedulePresets = [
  { label: 'Every 1 minute', value: '1 minute', description: 'Run every 60 seconds' },
  { label: 'Every 5 minutes', value: '5 minutes', description: 'Run every 5 minutes' },
  { label: 'Hourly', value: 'hourly', description: 'Run every hour at :00' },
  { label: 'Daily', value: 'daily', description: 'Run once per day at midnight' },
  { label: 'Weekly', value: 'weekly', description: 'Run once per week on Monday' },
];

export const OrchestrationStudio: React.FC<OrchestrationStudioProps> = ({
  products,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  onRefresh
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scheduleCron, setScheduleCron] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState('');
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'execution' | 'logs'>('schedule');

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workflows');
      if (res.ok) {
        setWorkflows(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setActiveWorkflow(null);
      setPromptValues({});
      setScheduleCron('');
      setScheduleEnabled(false);
      setActiveTab('schedule');
      return;
    }

    const matched = workflows.find(w => w.data_project_id === selectedProjectId);
    setActiveWorkflow(matched || null);

    if (matched) {
      setScheduleCron(matched.schedule_cron || '');
      setScheduleEnabled(!!matched.schedule_enabled);
      const missing = matched.missing_parameters || [];
      const initVals: Record<string, string> = {};
      missing.forEach(m => {
        initVals[m.name] = (matched.parameters || {})[m.name] || '';
      });
      setPromptValues(initVals);
    } else {
      setPromptValues({});
      setScheduleCron('');
      setScheduleEnabled(false);
    }
  }, [selectedProjectId, workflows]);

  const handleSaveSchedule = async () => {
    if (!activeWorkflow) {
      setScheduleMsg({ type: 'error', text: 'Select a project with an active workflow first.' });
      return;
    }

    setLoading(true);
    setScheduleMsg(null);
    try {
      const res = await fetch(`/api/workflows/${activeWorkflow.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_cron: scheduleCron || null, schedule_enabled: scheduleEnabled })
      });
      if (res.ok) {
        setScheduleMsg({ type: 'success', text: 'Schedule updated successfully.' });
        fetchWorkflows();
        if (onRefresh) onRefresh();
      } else {
        const data = await res.json();
        setScheduleMsg({ type: 'error', text: data.detail || 'Failed to save schedule.' });
      }
    } catch (e) {
      setScheduleMsg({ type: 'error', text: 'Network error while saving schedule.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRunWorkflow = async () => {
    if (!selectedProjectId || !activeWorkflow) return;
    setRunLoading(true);
    setRunError('');

    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: promptValues })
      });

      if (res.ok) {
        const updated = await res.json();
        setWorkflows(prev => prev.map(w => (w.id === updated.id ? updated : w)));
        setActiveWorkflow(updated);
        setActiveTab('logs');
        const missing = updated.missing_parameters || [];
        const nextVals: Record<string, string> = {};
        missing.forEach((m: any) => {
          nextVals[m.name] = updated.parameters[m.name] || '';
        });
        setPromptValues(nextVals);
      } else {
        const data = await res.json();
        setRunError(data.detail || 'Workflow execution failed.');
      }
    } catch (e) {
      setRunError('Network error while triggering workflow.');
    } finally {
      setRunLoading(false);
    }
  };

  const handleResetWorkflow = async () => {
    if (!selectedProjectId) return;
    if (!window.confirm('Reset the workflow state and remove generated artifacts for this project?')) return;
    setRunLoading(true);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/reset`, { method: 'POST' });
      if (res.ok) {
        fetchWorkflows();
        setPromptValues({});
      }
    } catch (e) {
      console.error('Reset failed', e);
    } finally {
      setRunLoading(false);
    }
  };

  const getHierarchyData = () => {
    if (!selectedProjectId) return null;
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return null;
    const product = products.find(p => p.id === project.data_product_id);

    let parsedProductParams: any[] = [];
    try {
      parsedProductParams = product && product.global_parameters
        ? (typeof product.global_parameters === 'string' ? JSON.parse(product.global_parameters) : product.global_parameters)
        : [];
    } catch {
      parsedProductParams = [];
    }

    let parsedProjectParams: any[] = [];
    try {
      parsedProjectParams = project.parameters
        ? (typeof project.parameters === 'string' ? JSON.parse(project.parameters) : project.parameters)
        : [];
    } catch {
      parsedProjectParams = [];
    }

    return {
      productName: product?.name || 'Unknown Product',
      productParams: parsedProductParams,
      projectName: project.name,
      projectParams: parsedProjectParams,
      workflowParams: activeWorkflow?.parameters || {}
    };
  };

  const hierarchy = getHierarchyData();
  const activeProject = projects.find(p => p.id === selectedProjectId);

  // Tab button component
  const TabButton: React.FC<{ tab: 'schedule' | 'execution' | 'logs'; icon: React.ReactNode; label: string }> = ({ tab, icon, label }) => (
    <button
      onClick={() => setActiveTab(tab)}
      style={{
        padding: '0.75rem 1rem',
        backgroundColor: 'transparent',
        color: activeTab === tab ? 'var(--accent-blue)' : 'var(--text-secondary)',
        border: 'none',
        borderBottom: activeTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: activeTab === tab ? 600 : 500,
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Cpu size={22} /></div>
          <div>
            <h1 className="page-title">Orchestration Studio</h1>
            <p className="page-subtitle">Schedule workflows, trigger execution, and manage orchestration state.</p>
          </div>
        </div>
      </div>

      {/* Workspace Selector */}
      <div className="card card-compact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Search size={18} className="text-muted" />
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Select Workspace</span>
        </div>
        <select
          className="form-select"
          style={{ minWidth: '280px' }}
          value={selectedProjectId || ''}
          onChange={e => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">-- Choose Active Project --</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Settings size={30} className="spin-animation text-cyan" />
          <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading orchestration metadata...</p>
        </div>
      ) : selectedProjectId && activeWorkflow ? (
        <>
          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0', marginTop: '1.5rem' }}>
            <TabButton tab="schedule" icon={<Clock size={16} />} label="Schedule" />
            <TabButton tab="execution" icon={<Play size={16} />} label="Execution" />
            <TabButton tab="logs" icon={<Terminal size={16} />} label="Logs & History" />
          </div>

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="card card-compact" style={{ padding: '1.5rem', marginTop: '1.25rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1rem' }}>Schedule Configuration</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Configure when the selected workflow should run automatically.</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={scheduleEnabled} onChange={e => setScheduleEnabled(e.target.checked)} style={{ cursor: 'pointer' }} />
                  <span>Enable schedule</span>
                </label>
                {activeWorkflow?.last_run_at && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>Last run: <strong>{new Date(activeWorkflow.last_run_at).toLocaleString()}</strong></span>
                )}
              </div>

              <div style={{ display: 'grid', gap: '1.25rem' }}>
                <div>
                  <label className="form-label" style={{ marginBottom: '0.75rem', display: 'block' }}>Quick Presets</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                    {schedulePresets.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`btn ${scheduleCron === option.value ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ 
                          padding: '0.75rem 0.5rem', 
                          fontSize: '0.82rem',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          lineHeight: '1.2',
                          minHeight: '60px',
                          justifyContent: 'flex-start'
                        }}
                        onClick={() => setScheduleCron(option.value)}
                        title={option.description}
                      >
                        <span style={{ fontWeight: 600 }}>{option.label}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label">Custom Expression</label>
                  <input
                    type="text"
                    className="form-control"
                    value={scheduleCron}
                    onChange={e => setScheduleCron(e.target.value)}
                    placeholder="e.g. hourly, daily, weekly, 1 minute"
                    disabled={!scheduleEnabled}
                  />
                  <p className="form-hint">Accepts friendly cadence text: hourly, daily, weekly, 1 minute, 5 minutes, etc.</p>
                </div>
              </div>

              {scheduleMsg && (
                <div className={`alert alert-${scheduleMsg.type}`} style={{ marginTop: '1rem' }}>
                  {scheduleMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={!activeWorkflow || loading}>
                  <Check size={16} />
                  Save Schedule
                </button>
                <button className="btn btn-secondary" onClick={fetchWorkflows} disabled={loading}>
                  Refresh
                </button>
              </div>
            </div>
          )}

          {/* Execution Tab */}
          {activeTab === 'execution' && (
            <div style={{ marginTop: '1.25rem' }}>
              <div className="card card-compact" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1rem' }}>Execution Control</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Trigger runs manually or resume blocked workflows.</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Status: <strong className={`badge ${activeWorkflow.status === 'Completed' ? 'badge-success' : activeWorkflow.status === 'Blocked' ? 'badge-warning' : activeWorkflow.status === 'Running' ? 'badge-info' : 'badge-neutral'}`}>
                        {activeWorkflow.status}
                      </strong>
                    </span>
                    <button className="btn btn-primary" onClick={handleRunWorkflow} disabled={runLoading || activeWorkflow.status === 'Completed'}>
                      <Play size={14} /> Trigger
                    </button>
                    <button className="btn btn-danger" onClick={handleResetWorkflow} disabled={runLoading || activeWorkflow.status === 'Idle'}>
                      <RotateCcw size={14} /> Reset
                    </button>
                  </div>
                </div>
              </div>

              {/* Agent Flow Visualization */}
              <div className="card card-compact" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <Cpu size={14} />
                  <span>LangGraph Sequence Execution Flow</span>
                </div>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
                  {(() => {
                    let parsedSeq: string[] = [];
                    try {
                      parsedSeq = typeof activeWorkflow.agents_sequence === 'string' ? JSON.parse(activeWorkflow.agents_sequence) : activeWorkflow.agents_sequence;
                    } catch {
                      parsedSeq = [];
                    }

                    return parsedSeq.length === 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No agents in workflow sequence</div>
                    ) : parsedSeq.map((agentName, idx) => {
                          let parsedLogs: any[] = [];
                          try { parsedLogs = typeof activeWorkflow.history_logs === 'string' ? JSON.parse(activeWorkflow.history_logs) : (activeWorkflow.history_logs || []); } catch { parsedLogs = []; }
                          
                          const isCurrent = activeWorkflow.current_agent === agentName;
                          const isCompleted = activeWorkflow.status === 'Completed' || parsedLogs.some((l: any) => l.agent_name === agentName && l.level === 'SUCCESS');
                          const isBlocked = isCurrent && activeWorkflow.status === 'Blocked';

                      let stateClass = '';
                      if (isBlocked) stateClass = 'blocked';
                      else if (isCurrent && activeWorkflow.status === 'Running') stateClass = 'active';
                      else if (isCompleted) stateClass = 'completed';

                      return (
                        <div key={idx} style={{ flexShrink: 0, textAlign: 'center' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            border: '2px solid',
                            borderColor: stateClass === 'completed' ? 'var(--accent-green)' : stateClass === 'blocked' ? 'var(--accent-amber)' : stateClass === 'active' ? 'var(--accent-blue)' : 'var(--border-color)',
                            backgroundColor: stateClass === 'completed' ? 'rgba(16, 185, 129, 0.1)' : stateClass === 'blocked' ? 'rgba(245, 158, 11, 0.1)' : stateClass === 'active' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                            color: stateClass === 'completed' ? 'var(--accent-green)' : stateClass === 'blocked' ? 'var(--accent-amber)' : stateClass === 'active' ? 'var(--accent-blue)' : 'var(--text-muted)',
                            boxShadow: stateClass === 'active' ? `0 0 12px rgba(56, 189, 248, 0.3)` : 'none'
                          }}>
                            {idx + 1}
                          </div>
                          <div style={{ fontSize: '0.7rem', marginTop: '8px', fontWeight: isCurrent ? 'bold' : 'normal', maxWidth: '50px', wordBreak: 'break-word' }}>
                            {agentName.split(' ')[0]}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Parameter Hierarchy */}
              {hierarchy && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div className="card card-compact" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-purple)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '1rem' }}>
                      <Layers size={14} />
                      <span>Product Global Parameters</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {hierarchy.productParams && hierarchy.productParams.length > 0 ? (
                        hierarchy.productParams.map((p: any, idx: number) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{p.name}</span>
                            <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{String(p.value || '—')}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No global parameters</span>
                      )}
                    </div>
                  </div>

                  <div className="card card-compact" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '1rem' }}>
                      <Database size={14} />
                      <span>Project Parameters</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {hierarchy.projectParams && hierarchy.projectParams.length > 0 ? (
                        hierarchy.projectParams.map((p: any, idx: number) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{p.name}</span>
                            <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{String(p.value || '—')}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No project parameters</span>
                      )}
                    </div>
                  </div>

                  <div className="card card-compact" style={{ borderLeft: '3px solid var(--accent-green)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '1rem' }}>
                      <CheckCircle2 size={14} />
                      <span>Active Parameters</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                      {Object.keys(hierarchy.workflowParams).length > 0 ? (
                        Object.entries(hierarchy.workflowParams).map(([key, val], idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '4px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{key}</span>
                            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>{String(val)}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No active parameters</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Blocked State with Parameter Input */}
              {activeWorkflow.status === 'Blocked' && activeWorkflow.missing_parameters && activeWorkflow.missing_parameters.length > 0 && (
                <div className="card card-compact" style={{ border: '1px solid rgba(245, 158, 11, 0.3)', backgroundColor: 'rgba(245, 158, 11, 0.03)', padding: '1.25rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }}>
                    <AlertTriangle size={18} />
                    <span>Execution Blocked: Missing Parameters</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Agent <strong>{activeWorkflow.current_agent}</strong> requires additional parameters to proceed.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    {activeWorkflow.missing_parameters.map((param, i) => (
                      <div key={i} className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                          {param.name.replace(/_/g, ' ').toUpperCase()}
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder={param.description || `Enter ${param.name}`}
                          value={promptValues[param.name] || ''}
                          onChange={e => setPromptValues({ ...promptValues, [param.name]: e.target.value })}
                          style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}
                        />
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary" onClick={handleRunWorkflow} disabled={runLoading}>
                    Submit & Resume
                  </button>
                </div>
              )}

              {/* Error Display */}
              {runError && (
                <div style={{ color: 'var(--accent-red)', backgroundColor: 'rgba(239,68,68,0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} />
                    Execution Error
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.8rem' }}>{runError}</div>
                </div>
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="card card-compact" style={{ padding: '1rem', marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>
                <Terminal size={16} />
                <span>Execution Logs</span>
              </div>
              <div style={{ backgroundColor: '#05070f', borderRadius: '8px', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#e2e8f0', minHeight: '400px', maxHeight: '600px', overflowY: 'auto', border: '1px solid var(--border-color)' }}>
                {(() => {
                  const logs = typeof activeWorkflow.history_logs === 'string' ? JSON.parse(activeWorkflow.history_logs) : activeWorkflow.history_logs;
                  if (!logs || logs.length === 0) {
                    return (
                      <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={40} style={{ opacity: 0.2 }} />
                        <div>No logs yet.</div>
                        <div style={{ fontSize: '0.7rem' }}>Trigger a workflow to see execution logs.</div>
                      </div>
                    );
                  }
                  return logs.map((log: any, i: number) => (
                    <div key={i} style={{ marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '6px' }}>
                      <span style={{
                        color: log.level === 'ERROR' ? 'var(--accent-red)' : log.level === 'WARN' ? 'var(--accent-amber)' : log.level === 'SUCCESS' ? 'var(--accent-green)' : 'var(--accent-blue)',
                        fontWeight: 'bold',
                        marginRight: '8px'
                      }}>
                        [{log.level}]
                      </span>
                      {log.timestamp && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginRight: '6px' }}>[{log.timestamp}]</span>}
                      {log.agent_name && <span style={{ color: 'var(--accent-purple)', fontWeight: 600, marginRight: '6px' }}>{log.agent_name}:</span>}
                      <span>{log.message}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </>
      ) : selectedProjectId && !activeWorkflow ? (
        <div className="empty-panel" style={{ marginTop: '2rem' }}>
          <AlertTriangle size={36} style={{ opacity: 0.3, marginBottom: '0.5rem', color: 'var(--accent-amber)' }} />
          <strong>No workflow configured</strong>
          <p style={{ maxWidth: '400px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Create a workflow for this project in Workflow Studio to enable scheduling and orchestration.
          </p>
        </div>
      ) : (
        <div className="empty-panel" style={{ marginTop: '2rem' }}>
          <Cpu size={48} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
          <strong>Select a project</strong>
          <p style={{ maxWidth: '400px', textAlign: 'center', fontSize: '0.875rem' }}>Choose a project workspace to manage scheduling and orchestration.</p>
        </div>
      )}
    </div>
  );
};
