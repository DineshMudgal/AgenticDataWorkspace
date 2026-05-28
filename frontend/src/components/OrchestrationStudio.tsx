import React, { useEffect, useState } from 'react';
import { Play, RotateCcw, AlertTriangle, Cpu, Terminal, Layers, CheckCircle2, Database, Search, X, ChevronRight, ChevronLeft, Check, Settings, Clock, TrendingUp, FileText, Plus, Trash2, Calendar, Activity, PlayCircle, Edit2, ToggleRight, ToggleLeft } from 'lucide-react';
import type { DataProduct, DataProject, Workflow, ActiveTab } from '../types';
import { AgentHistory } from './AgentHistory';

interface OrchestrationStudioProps {
  products: DataProduct[];
  projects: DataProject[];
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
  onRefresh?: () => void;
  onNavigate: (tab: ActiveTab) => void;
  activeTab: 'execution' | 'schedules' | 'history';
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
  onRefresh,
  onNavigate,
  activeTab
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Execution State
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState('');
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const [overrideParams, setOverrideParams] = useState<Array<{key: string, value: string}>>([]);
  const [filterProductId, setFilterProductId] = useState<number | null>(null);

  // Layout State
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Chatbot Execution State
  const [chatHistory, setChatHistory] = useState<Array<{role: 'agent'|'user', text: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [currentParamIndex, setCurrentParamIndex] = useState(0);

  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardMsg, setWizardMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [scheduleTargetId, setScheduleTargetId] = useState<number | null>(null);
  const [scheduleCron, setScheduleCron] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);

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
      setOverrideParams([]);
      return;
    }

    const matched = workflows.find(w => w.data_project_id === selectedProjectId);
    setActiveWorkflow(matched || null);

    if (matched) {
      let missing: any[] = [];
      try { missing = typeof matched.missing_parameters === 'string' ? JSON.parse(matched.missing_parameters) : (matched.missing_parameters || []); } catch { missing = []; }
      
      let params: Record<string, any> = {};
      try { params = typeof matched.parameters === 'string' ? JSON.parse(matched.parameters) : (matched.parameters || {}); } catch { params = {}; }

      const initVals: Record<string, string> = {};
      missing.forEach((m: any) => {
        initVals[m.name] = params[m.name] || '';
      });
      setPromptValues(initVals);
      setOverrideParams([]); // Reset overrides on project change
    } else {
      setPromptValues({});
      setOverrideParams([]);
    }
  }, [selectedProjectId, workflows]);

  const handleOpenWizard = (wf?: Workflow) => {
    if (wf) {
      setScheduleTargetId(wf.data_project_id);
      setScheduleCron(wf.schedule_cron || '');
      setScheduleEnabled(wf.schedule_enabled ?? false);
    } else {
      setScheduleTargetId(null);
      setScheduleCron('');
      setScheduleEnabled(true);
    }
    setWizardStep(1);
    setWizardMsg(null);
    setIsWizardOpen(true);
  };

  const handleWizardNext = () => {
    if (wizardStep === 1) {
      if (!scheduleTargetId) {
        setWizardMsg({ type: 'error', text: 'Please select a target workflow to schedule.' });
        return;
      }
      setWizardMsg(null);
    }
    setWizardStep(prev => prev + 1);
  };

  const handleSaveSchedule = async () => {
    if (!scheduleTargetId) return;
    const targetWf = workflows.find(w => w.data_project_id === scheduleTargetId);
    if (!targetWf) return;

    setLoading(true);
    setWizardMsg(null);
    try {
      const res = await fetch(`/api/workflows/${targetWf.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_cron: scheduleCron || null, schedule_enabled: scheduleEnabled })
      });
      if (res.ok) {
        setWizardMsg({ type: 'success', text: 'Schedule configured successfully.' });
        fetchWorkflows();
        if (onRefresh) onRefresh();
        setTimeout(() => setIsWizardOpen(false), 1500);
      } else {
        const data = await res.json();
        setWizardMsg({ type: 'error', text: data.detail || 'Failed to save schedule.' });
      }
    } catch (e) {
      setWizardMsg({ type: 'error', text: 'Network error while saving schedule.' });
    } finally {
      setLoading(false);
    }
  };

  const toggleScheduleStatus = async (wf: Workflow) => {
    try {
      const res = await fetch(`/api/workflows/${wf.id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_cron: wf.schedule_cron, schedule_enabled: !wf.schedule_enabled })
      });
      if (res.ok) fetchWorkflows();
    } catch (e) {
      console.error(e);
    }
  };

  // Initialize chat when missing parameters appear
  useEffect(() => {
    if (activeWorkflow && activeWorkflow.status === 'Blocked') {
      let missingParams: any[] = [];
      try { missingParams = typeof activeWorkflow.missing_parameters === 'string' ? JSON.parse(activeWorkflow.missing_parameters) : (activeWorkflow.missing_parameters || []); } catch { missingParams = []; }
      
      if (missingParams.length > 0) {
        if (chatHistory.length === 0) {
          const firstParam = missingParams[0];
          setChatHistory([
            { role: 'agent', text: "Execution is paused. I need some additional details to proceed." },
            { role: 'agent', text: `Please provide a value for **${firstParam.name.replace('_', ' ').toUpperCase()}**${firstParam.description ? `\n\n_${firstParam.description}_` : ''}` }
          ]);
          setCurrentParamIndex(0);
        }
      }
    } else {
      setChatHistory([]);
      setCurrentParamIndex(0);
    }
  }, [activeWorkflow]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeWorkflow) return;
    
    let missingParams: any[] = [];
    try { missingParams = typeof activeWorkflow.missing_parameters === 'string' ? JSON.parse(activeWorkflow.missing_parameters) : (activeWorkflow.missing_parameters || []); } catch { missingParams = []; }
    
    const currentParam = missingParams[currentParamIndex];
    if (!currentParam) return;

    const userInput = chatInput.trim();
    const newHistory: Array<{role: 'agent'|'user', text: string}> = [
      ...chatHistory,
      { role: 'user', text: userInput }
    ];
    
    const updatedPrompts = { ...promptValues, [currentParam.name]: userInput };
    setPromptValues(updatedPrompts);
    
    const nextIndex = currentParamIndex + 1;
    
    if (nextIndex < missingParams.length) {
      const nextParam = missingParams[nextIndex];
      newHistory.push({ role: 'agent', text: `Great! Next, please provide a value for **${nextParam.name.replace('_', ' ').toUpperCase()}**${nextParam.description ? `\n\n_${nextParam.description}_` : ''}` });
      setChatHistory(newHistory);
      setCurrentParamIndex(nextIndex);
      setChatInput('');
    } else {
      newHistory.push({ role: 'agent', text: "All required parameters gathered. Resuming execution..." });
      setChatHistory(newHistory);
      setChatInput('');
      handleRunWorkflow(updatedPrompts);
    }
  };

  const handleRunWorkflow = async (overridePromptValues?: Record<string, string>) => {
    if (!selectedProjectId || !activeWorkflow) return;
    setRunLoading(true);
    setRunError('');

    const finalParams = { ...(overridePromptValues || promptValues) };
    overrideParams.forEach(p => {
      if (p.key.trim() !== '') {
        finalParams[p.key] = p.value;
      }
    });

    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: finalParams })
      });

      if (res.ok) {
        const updated = await res.json();
        setWorkflows(prev => prev.map(w => (w.id === updated.id ? updated : w)));
        setActiveWorkflow(updated);
        
        let missing: any[] = [];
        try { missing = typeof updated.missing_parameters === 'string' ? JSON.parse(updated.missing_parameters) : (updated.missing_parameters || []); } catch { missing = []; }
        
        let params: Record<string, any> = {};
        try { params = typeof updated.parameters === 'string' ? JSON.parse(updated.parameters) : (updated.parameters || {}); } catch { params = {}; }

        const nextVals: Record<string, string> = {};
        missing.forEach((m: any) => {
          nextVals[m.name] = params[m.name] || '';
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
        setOverrideParams([]);
      }
    } catch (e) {
      console.error('Reset failed', e);
    } finally {
      setRunLoading(false);
    }
  };

  const addOverrideParam = () => setOverrideParams([...overrideParams, { key: '', value: '' }]);
  const removeOverrideParam = (idx: number) => setOverrideParams(overrideParams.filter((_, i) => i !== idx));
  const updateOverrideParam = (idx: number, field: 'key' | 'value', val: string) => {
    const next = [...overrideParams];
    next[idx][field] = val;
    setOverrideParams(next);
  };

  const getHierarchyData = () => {
    if (!selectedProjectId) return null;
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return null;
    const product = products.find(p => p.id === project.data_product_id);

    let parsedProductParams: any[] = [];
    try { parsedProductParams = product && product.global_parameters ? (typeof product.global_parameters === 'string' ? JSON.parse(product.global_parameters) : product.global_parameters) : []; } catch { parsedProductParams = []; }

    let parsedProjectParams: any[] = [];
    try { parsedProjectParams = project.parameters ? (typeof project.parameters === 'string' ? JSON.parse(project.parameters) : project.parameters) : []; } catch { parsedProjectParams = []; }

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

  const scheduledWorkflows = workflows.filter(w => w.schedule_cron !== null && w.schedule_cron !== '').filter(w => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const proj = projects.find(p => p.id === w.data_project_id);
    return w.name.toLowerCase().includes(q) || (proj?.name || '').toLowerCase().includes(q);
  });

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon" style={{ width: '32px', height: '32px' }}><Cpu size={18} /></div>
          <div>
            <h1 className="page-title">Orchestration Studio</h1>
            <p className="page-subtitle">Configure automated schedules, run workflows, and monitor execution context.</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            style={{ width: '220px', padding: '0.4rem 0.75rem' }}
            value={filterProductId || ''}
            onChange={e => {
              setFilterProductId(e.target.value ? Number(e.target.value) : null);
              setSelectedProjectId(null);
            }}
          >
            <option value="">-- All Data Products --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            className="form-select"
            style={{ width: '280px', padding: '0.4rem 0.75rem' }}
            value={selectedProjectId || ''}
            onChange={e => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Choose Data Project --</option>
            {projects.filter(p => !filterProductId || p.data_product_id === filterProductId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {activeTab === 'schedules' && (
            <button className="btn btn-primary" onClick={() => handleOpenWizard()}>
              <Calendar size={16} />
              <span>Create Schedule</span>
            </button>
          )}
        </div>
      </div>


      {loading && workflows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Settings size={30} className="spin-animation text-cyan" />
          <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading orchestration metadata...</p>
        </div>
      ) : activeTab === 'history' ? (
        <AgentHistory 
          projects={projects} 
          setSelectedProjectId={setSelectedProjectId} 
          onNavigate={onNavigate} 
          isEmbedded={true} 
        />
      ) : activeTab === 'schedules' ? (
        <div>
          <div className="card card-compact" style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
            <Search size={18} className="text-muted" style={{ marginLeft: '12px', marginRight: '8px' }} />
            <input 
              type="text" 
              className="form-control" 
              placeholder="Filter schedules by pipeline name or workspace..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', padding: '12px 8px', flex: 1, boxShadow: 'none' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: '12px' }}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="card-grid-3">
            {scheduledWorkflows.map(wf => {
              const proj = projects.find(p => p.id === wf.data_project_id);
              return (
                <div key={wf.id} className={`card ${!wf.schedule_enabled ? 'opacity-60' : ''}`} style={{ display: 'flex', flexDirection: 'column', minHeight: '180px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={16} className="text-green" /> {wf.name}
                      </span>
                      {!wf.schedule_enabled && <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginTop: '4px' }}>DISABLED</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => toggleScheduleStatus(wf)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title={wf.schedule_enabled ? 'Disable Schedule' : 'Enable Schedule'}
                      >
                        {wf.schedule_enabled ? <ToggleRight className="text-green" size={16} /> : <ToggleLeft className="text-muted" size={16} />}
                      </button>
                      <button 
                        onClick={() => handleOpenWizard(wf)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title="Edit Schedule"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      <strong>Target Workspace:</strong> {proj?.name || `Project ${wf.data_project_id}`}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      <strong>Cadence:</strong> <span className="badge badge-neutral" style={{ fontFamily: 'monospace' }}>{wf.schedule_cron}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Last run: {wf.last_run_at ? new Date(wf.last_run_at).toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {scheduledWorkflows.length === 0 && (
            <div className="empty-panel" style={{ marginTop: '1rem' }}>
              <Calendar size={48} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
              <strong>No Scheduled Workflows Found</strong>
              <p style={{ maxWidth: '360px', textAlign: 'center', fontSize: '0.875rem' }}>Create a schedule to automate the execution of your configured agentic pipelines.</p>
            </div>
          )}
        </div>
      ) : (
        // EXECUTION WORKSPACE
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>          {!selectedProjectId ? (
            <div className="empty-panel" style={{ marginTop: '1rem' }}>
              <Cpu size={48} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
              <strong>Select a Data Project Workspace</strong>
              <p style={{ maxWidth: '360px', textAlign: 'center', fontSize: '0.875rem' }}>Choose a project from the dropdown above to manage orchestration parameters and trigger runs.</p>
            </div>
          ) : !activeWorkflow ? (
            <div className="empty-panel" style={{ marginTop: '1rem' }}>
              <AlertTriangle size={36} style={{ opacity: 0.3, marginBottom: '0.5rem', color: 'var(--accent-amber)' }} />
              <strong>No pipeline is configured for the chosen project.</strong>
              <p style={{ maxWidth: '360px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Design a pipeline for this workspace in Workflow Studio and then return here to orchestrate it.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="card card-compact" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Execution Workspace</span>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Trigger runs, provide override parameters, and monitor live orchestration.</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Status: <strong className={`badge ${activeWorkflow.status === 'Completed' ? 'badge-success' : activeWorkflow.status === 'Blocked' ? 'badge-warning' : 'badge-info'}`}>{activeWorkflow.status}</strong>
                    </span>
                    <button className="btn btn-primary" onClick={() => handleRunWorkflow()} disabled={runLoading || activeWorkflow.status === 'Completed' || activeWorkflow.status === 'Blocked'}>
                      <Play size={14} /> Trigger Workflow
                    </button>
                    <button className="btn btn-danger" onClick={handleResetWorkflow} disabled={runLoading || activeWorkflow.status === 'Idle'}>
                      <RotateCcw size={14} /> Reset State
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: '1rem', marginTop: '1rem', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
                  {/* Column 1: Configs & Sequence */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', paddingRight: '4px' }}>
                    
                    {/* Agent Sequence Area */}
                    <details name="col1-accordion" open style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      <summary style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={14} className="text-blue" /> Agent Sequence
                      </summary>
                      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: '12px' }}>
                          {(() => {
                            let parsedSeq: string[] = [];
                            try { parsedSeq = typeof activeWorkflow.agents_sequence === 'string' ? JSON.parse(activeWorkflow.agents_sequence) : activeWorkflow.agents_sequence; } catch { parsedSeq = activeWorkflow.agents_sequence || []; }

                            return (parsedSeq || []).map((agentName, idx) => {
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
                                <div key={idx} className={`agent-node ${stateClass}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', minWidth: '40px' }}>
                                  <div className="agent-bubble" style={{
                                    width: '24px', height: '24px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.65rem', fontWeight: 'bold', border: '1.5px solid',
                                    borderColor: stateClass === 'completed' ? 'var(--accent-green)' : stateClass === 'blocked' ? 'var(--accent-amber)' : stateClass === 'active' ? 'var(--accent-blue)' : 'var(--border-color)',
                                    backgroundColor: stateClass === 'completed' ? 'rgba(16, 185, 129, 0.1)' : stateClass === 'blocked' ? 'rgba(245, 158, 11, 0.1)' : stateClass === 'active' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                                    color: stateClass === 'completed' ? 'var(--accent-green)' : stateClass === 'blocked' ? 'var(--accent-amber)' : stateClass === 'active' ? 'var(--accent-blue)' : 'var(--text-muted)'
                                  }}>
                                    {idx + 1}
                                  </div>
                                  <div className="agent-node-title" style={{ fontSize: '0.6rem', marginTop: '4px', textAlign: 'center', fontWeight: isCurrent ? 'bold' : 'normal', wordBreak: 'break-word', maxWidth: '60px' }}>
                                    {agentName}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </details>

                    {/* Collapsible Parameters Area */}
                    <details name="col1-accordion" style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                      <summary style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Settings size={14} className="text-purple" /> Configuration & Parameters
                      </summary>
                      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        
                        {/* Parameter Overrides Section */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            <Settings size={14} className="text-purple" />
                            <span>Parameter Overrides (Optional)</span>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                            Provide custom key-value pairs to override inherited configuration during the next trigger.
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {overrideParams.map((param, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input type="text" className="form-control" placeholder="Parameter Key" value={param.key} onChange={e => updateOverrideParam(idx, 'key', e.target.value)} style={{ flex: 1 }} />
                                <input type="text" className="form-control" placeholder="Value" value={param.value} onChange={e => updateOverrideParam(idx, 'value', e.target.value)} style={{ flex: 2 }} />
                                <button className="btn btn-secondary" onClick={() => removeOverrideParam(idx)}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                            <button className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: '0.75rem' }} onClick={addOverrideParam}>
                              <Plus size={14} /> Add Override
                            </button>
                          </div>
                        </div>

                        {/* Upward Parameter Flow Section */}
                        {activeWorkflow?.resolved_parameters && activeWorkflow.resolved_parameters.length > 0 && (
                          <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              <Layers size={14} className="text-green" />
                              <span>Upward Parameter Flow (Tool ➔ Skill ➔ Agent ➔ Workflow)</span>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                              Parameters defined in underlying Tools, Skills, and Agents automatically propagate upward and are exposed as generic workflow-level inputs.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {activeWorkflow.resolved_parameters.map((p, idx) => (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '4px', borderLeft: '3px solid var(--accent-green)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{p.name}</span>
                                    <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>{p.type || 'string'}</span>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.description}</div>
                                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center' }}>
                                    {(() => {
                                      const desc = p.description || '';
                                      const toolMatch = desc.match(/Tool '([^']+)'/);
                                      const skillMatch = desc.match(/Skill '([^']+)'/);
                                      const agentMatch = desc.match(/Agent '([^']+)'/);

                                      if (toolMatch) {
                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                            <span style={{ color: 'var(--accent-purple)' }}>🔧 Tool: {toolMatch[1]}</span>
                                            <span>➔</span>
                                            <span style={{ opacity: 0.5 }}>📜 Skill</span>
                                            <span>➔</span>
                                            <span style={{ opacity: 0.5 }}>🤖 Agent</span>
                                            <span>➔</span>
                                            <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>🌐 Workflow</span>
                                          </div>
                                        );
                                      }
                                      if (skillMatch) {
                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                            <span style={{ color: 'var(--accent-blue)' }}>📜 Skill: {skillMatch[1]}</span>
                                            <span>➔</span>
                                            <span style={{ opacity: 0.5 }}>🤖 Agent</span>
                                            <span>➔</span>
                                            <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>🌐 Workflow</span>
                                          </div>
                                        );
                                      }
                                      if (agentMatch) {
                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                            <span style={{ color: 'var(--accent-amber)' }}>🤖 Agent: {agentMatch[1]}</span>
                                            <span>➔</span>
                                            <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>🌐 Workflow</span>
                                          </div>
                                        );
                                      }
                                      return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                          <span style={{ color: 'var(--text-muted)' }}>📋 Defined</span>
                                          <span>➔</span>
                                          <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>🌐 Workflow</span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Runtime Hierarchy Overview */}
                        {hierarchy && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                            <div className="card card-compact" style={{ borderLeft: '3px solid var(--accent-purple)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-purple)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '8px' }}>
                                <Layers size={14} />
                                <span>Inherited: Data Product Global Parameters</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {hierarchy.productParams && hierarchy.productParams.length > 0 ? (
                                  hierarchy.productParams.map((p: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '4px' }}>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.name}</span>
                                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{String(p.value || 'Not Configured')}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No global parameters defined</span>
                                )}
                              </div>
                            </div>
                            <div className="card card-compact" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '8px' }}>
                                <Database size={14} />
                                <span>Inherited: Data Project Workspace Parameters</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {hierarchy.projectParams && hierarchy.projectParams.length > 0 ? (
                                  hierarchy.projectParams.map((p: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '4px' }}>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.name}</span>
                                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{String(p.value || 'Not Configured')}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No project parameters defined</span>
                                )}
                              </div>
                            </div>
                            <div className="card card-compact" style={{ borderLeft: '3px solid var(--accent-green)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '8px' }}>
                                <CheckCircle2 size={14} />
                                <span>Active Context: Runtime State</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                                {Object.keys(hierarchy.workflowParams).length > 0 ? (
                                  Object.entries(hierarchy.workflowParams).map(([key, val], idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '4px' }}>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{key}</span>
                                      <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>{String(val)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active run parameters loaded</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    </details>

                    </div> {/* End of Column 1 */}

                    {/* Column 2: Chatbot Prompt Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
                        {(() => {
                          let missingParams: any[] = [];
                          try { missingParams = typeof activeWorkflow.missing_parameters === 'string' ? JSON.parse(activeWorkflow.missing_parameters) : (activeWorkflow.missing_parameters || []); } catch { missingParams = []; }
                          
                          if (activeWorkflow.status === 'Blocked' && missingParams.length > 0) {
                            return (
                              <div className="block-prompt-panel" style={{ border: '1px solid var(--border-color)', backgroundColor: 'rgba(5, 7, 15, 0.4)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                <div style={{ padding: '0.75rem 1.25rem', backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div className="agent-bubble" style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                                    <AlertTriangle size={14} />
                                  </div>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Workflow Orchestrator</span>
                                  <span className="badge badge-warning" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>Action Required</span>
                                </div>
                                
                                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                  {chatHistory.map((msg, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                      {msg.role === 'agent' && (
                                        <div className="agent-bubble" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                                          <Cpu size={14} className="text-cyan" />
                                        </div>
                                      )}
                                      <div style={{ 
                                        backgroundColor: msg.role === 'user' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)', 
                                        color: msg.role === 'user' ? '#fff' : 'var(--text-secondary)',
                                        padding: '10px 14px', borderRadius: '12px', fontSize: '0.85rem',
                                        borderBottomRightRadius: msg.role === 'user' ? '2px' : '12px',
                                        borderTopLeftRadius: msg.role === 'agent' ? '2px' : '12px',
                                        border: msg.role === 'agent' ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                        whiteSpace: 'pre-wrap'
                                      }}>
                                        {/* Very basic markdown bold rendering */}
                                        {(msg.text || '').split('**').map((part, index) => index % 2 === 1 ? <strong key={index} style={{ color: msg.role === 'agent' ? 'var(--text-primary)' : 'inherit' }}>{part}</strong> : part)}
                                      </div>
                                    </div>
                                  ))}
                                  {runLoading && (
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                      <div className="agent-bubble" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Settings size={14} className="text-cyan spin-animation" />
                                      </div>
                                      <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '12px', borderTopLeftRadius: '2px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Processing and resuming workflow...
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                  <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                    <textarea 
                                      className="form-control" 
                                      placeholder="Type your response here... (Press Ctrl+Enter to send)" 
                                      value={chatInput}
                                      onChange={e => setChatInput(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                          e.preventDefault();
                                          handleChatSubmit(e);
                                        }
                                      }}
                                      disabled={runLoading}
                                      autoFocus
                                      rows={2}
                                      style={{ 
                                        flex: 1, 
                                        backgroundColor: 'rgba(255,255,255,0.03)', 
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        resize: 'vertical',
                                        minHeight: '44px',
                                        maxHeight: '120px'
                                      }}
                                    />
                                    <button type="submit" className="btn btn-primary" style={{ height: '44px' }} disabled={runLoading || !chatInput.trim()}>
                                      Send
                                    </button>
                                  </form>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                    </div> {/* End of Column 2 */}

                  {/* Column 3: Execution Logs */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
                    {runError && (
                      <div style={{ color: 'var(--accent-red)', backgroundColor: 'rgba(239,68,68,0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={16} />
                        Workflow Execution Error
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '0.8rem' }}>{runError}</div>
                    </div>
                  )}

                  {/* Execution Logs */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                      <Terminal size={16} />
                      <span>Execution Logs</span>
                    </div>
                    <div style={{ backgroundColor: '#05070f', borderRadius: '8px', padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#e2e8f0', flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
                      {(() => {
                        const logs = typeof activeWorkflow.history_logs === 'string' ? JSON.parse(activeWorkflow.history_logs) : activeWorkflow.history_logs;
                        if (!logs || logs.length === 0) {
                          return (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '4rem' }}>
                              Console ready. Trigger the workflow to begin execution.
                            </div>
                          );
                        }
                        return logs.map((log: any, i: number) => (
                          <div key={i} style={{ marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '6px' }}>
                            <span style={{ color: log.level === 'ERROR' ? 'var(--accent-red)' : log.level === 'WARN' ? 'var(--accent-amber)' : log.level === 'SUCCESS' ? 'var(--accent-green)' : 'var(--accent-blue)', fontWeight: 'bold', marginRight: '6px' }}>
                              [{log.level}]
                            </span>
                            {log.timestamp && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginRight: '6px' }}>[{log.timestamp}]</span>}
                            {log.agent_name && <span style={{ color: 'var(--accent-purple)', fontWeight: 600, marginRight: '4px' }}>{log.agent_name}:</span>}
                            <span>{log.message}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Create/Edit Schedule Wizard Modal */}
      {isWizardOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'flex-end', zIndex: 1000
        }}>
          <div className="slide-panel">
            <button 
              onClick={() => setIsWizardOpen(false)} 
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div className="card-header" style={{ marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
              <Calendar size={18} className="text-green" />
              <span style={{ fontSize: '1.1rem' }}>Configure Workflow Schedule</span>
            </div>

            {/* Step indicator */}
            <div className="step-indicator" style={{ marginBottom: '1.5rem' }}>
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 1 ? 'active' : 'done'}`}>1</div>
                <span className={`step-label ${wizardStep === 1 ? 'active' : ''}`}>Target</span>
              </div>
              <div className="step-connector" />
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 2 ? 'active' : 'pending'}`}>2</div>
                <span className={`step-label ${wizardStep === 2 ? 'active' : ''}`}>Cadence</span>
              </div>
            </div>

            {wizardMsg && <div className={`alert alert-${wizardMsg.type}`} style={{ marginBottom: '1.5rem' }}>{wizardMsg.text}</div>}

            {wizardStep === 1 && (
              <div className="form-stack">
                <div className="form-group">
                  <label className="form-label">Select Target Pipeline <span className="required">*</span></label>
                  <p className="form-hint">Choose which orchestrated workflow you wish to run on a schedule.</p>
                  <select 
                    className="form-select"
                    value={scheduleTargetId || ''}
                    onChange={e => setScheduleTargetId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">-- Choose Pipeline (By Project) --</option>
                    {workflows.map(w => {
                      const proj = projects.find(p => p.id === w.data_project_id);
                      return <option key={w.id} value={w.data_project_id}>{w.name} ({proj?.name})</option>;
                    })}
                  </select>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="form-stack">
                <div className="form-group">
                  <label className="form-label">Schedule Pattern</label>
                  <p className="form-hint">Select a preset or write a custom schedule string.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    {schedulePresets.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`btn ${scheduleCron === option.value ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.75rem 0.5rem', fontSize: '0.82rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                        onClick={() => setScheduleCron(option.value)}
                      >
                        <span style={{ fontWeight: 600 }}>{option.label}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Custom Schedule Expression</label>
                  <input
                    type="text"
                    className="form-control"
                    value={scheduleCron}
                    onChange={e => setScheduleCron(e.target.value)}
                    placeholder="e.g. hourly, daily, weekly, 1 minute"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem', padding: '10px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                  <input 
                    type="checkbox" 
                    id="schedule-enabled-check"
                    checked={scheduleEnabled} 
                    onChange={e => setScheduleEnabled(e.target.checked)} 
                  />
                  <label htmlFor="schedule-enabled-check" style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>
                    Enable this schedule immediately
                  </label>
                </div>
              </div>
            )}

            <div className="step-nav" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              {wizardStep > 1 ? (
                <button className="btn btn-secondary" onClick={() => setWizardStep(1)}><ChevronLeft size={16} /> Back</button>
              ) : (
                <button className="btn btn-secondary" onClick={() => setIsWizardOpen(false)}>Cancel</button>
              )}

              {wizardStep < 2 ? (
                <button className="btn btn-primary" onClick={handleWizardNext}>Continue <ChevronRight size={16} /></button>
              ) : (
                <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={loading || !scheduleCron}>
                  <Check size={16} /> Save Schedule
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
