import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  ToggleLeft, 
  ToggleRight, 
  GitBranch, 
  Search,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Settings,
  Cpu,
  ArrowDown,
  MessageSquare,
  Play
} from 'lucide-react';
import type { DataProduct, DataProject, Workflow, Agent } from '../types';
import { AISuggestInput } from './AISuggestInput';

interface WorkflowStudioProps {
  products: DataProduct[];
  projects: DataProject[];
  selectedProjectId?: number | null;
  setSelectedProjectId?: React.Dispatch<React.SetStateAction<number | null>>;
  onRefresh?: () => void;
}

export const WorkflowStudio: React.FC<WorkflowStudioProps> = ({
  products,
  projects,
  onRefresh
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProductId, setFilterProductId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Wizard Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Chat Modal State
  const [activeChatWorkflow, setActiveChatWorkflow] = useState<Workflow | null>(null);
  const [testQuery, setTestQuery] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [workflowLogs, setWorkflowLogs] = useState<string[]>([]);
  const [triggerQuery, setTriggerQuery] = useState('Initiate data ingestion and schema profiling sequence.');
  const [customParams, setCustomParams] = useState('{\n  "mode": "delta_upsert",\n  "checkpoint": true\n}');

  // Parameter collection states
  const [missingParams, setMissingParams] = useState<any[]>([]);
  const [collectedParams, setCollectedParams] = useState<Record<string, string>>({});
  const [collectingParamIdx, setCollectingParamIdx] = useState<number>(-1);

  const chatEndRef = React.useRef<HTMLDivElement | null>(null);
  const logsEndRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [workflowLogs]);

  useEffect(() => {
    if (!activeChatWorkflow) {
      setMissingParams([]);
      setCollectedParams({});
      setCollectingParamIdx(-1);
      return;
    }
    
    let paramsList: any[] = [];
    try {
      paramsList = typeof activeChatWorkflow.missing_parameters === 'string'
        ? JSON.parse(activeChatWorkflow.missing_parameters)
        : activeChatWorkflow.missing_parameters;
    } catch {
      paramsList = activeChatWorkflow.missing_parameters || [];
    }

    setMissingParams(paramsList);
    setCollectedParams({});
    setCompletedSteps([]);
    setWorkflowLogs([]);
    setActiveStepIndex(-1);

    if (paramsList.length > 0) {
      setCollectingParamIdx(0);
      const firstParam = paramsList[0];
      setChatHistory([
        {
          role: 'agent',
          status: 'success',
          content: `Welcome to the Orchestration Sandbox for **${activeChatWorkflow.name}**.\n\nSome parameters are currently missing. Please provide a value for:\n\n* **${firstParam.name}** (${firstParam.type}): ${firstParam.description || 'No description provided'}`
        }
      ]);
    } else {
      setCollectingParamIdx(-1);
      setChatHistory([
        {
          role: 'agent',
          status: 'success',
          content: `Welcome to the Orchestration Sandbox for **${activeChatWorkflow.name}**.\n\nAll parameters verified. I will automatically proceed with executing the workflow sequence.`
        }
      ]);
      setTimeout(() => {
        triggerWorkflowRunDirectly("Initiate automated ingestion and pipeline execution.");
      }, 1500);
    }
  }, [activeChatWorkflow]);

  // Form Fields State
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);
  const [seqAgents, setSeqAgents] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);

  const fetchWorkflowsAndAgents = async () => {
    setLoading(true);
    try {
      const [wfRes, agRes, skRes] = await Promise.all([
        fetch('/api/workflows'),
        fetch('/api/agents'),
        fetch('/api/skills')
      ]);
      if (wfRes.ok) setWorkflows(await wfRes.json());
      if (agRes.ok) setAgents(await agRes.json());
      if (skRes.ok) setSkills(await skRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflowsAndAgents();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDesc('');
    setSelectedProductId(products[0]?.id || null);
    setTargetProjectId(projects[0]?.id || null);
    setSeqAgents([
      "Requirement Gathering Agent",
      "Discovery Agent",
      "Data Modelling Agent",
      "Spec Creation Agent",
      "Pipeline Generation Agent",
      "Pipeline Running Agent",
      "Testing Agent"
    ]);
    setIsEnabled(true);
    setMsg(null);
    setWizardStep(1);
  };

  const handleOpenCreateWizard = () => {
    resetForm();
    setIsWizardOpen(true);
  };

  const handleEdit = (wf: Workflow) => {
    setEditingId(wf.id);
    setName(wf.name);
    setDesc(wf.description || '');
    setSelectedProductId(wf.data_product_id);
    setTargetProjectId(wf.data_project_id);
    
    let parsedSeq: string[] = [];
    try {
      parsedSeq = typeof wf.agents_sequence === 'string' ? JSON.parse(wf.agents_sequence) : wf.agents_sequence;
    } catch {
      parsedSeq = wf.agents_sequence || [];
    }
    setSeqAgents(parsedSeq || []);
    setIsEnabled(wf.is_enabled);
    setMsg(null);
    setWizardStep(1);
    setIsWizardOpen(true);
  };

  const triggerWorkflowRunDirectly = async (queryText: string, paramsPayload?: Record<string, string>) => {
    if (!activeChatWorkflow) return;

    setTestLoading(true);
    setCompletedSteps([]);
    setActiveStepIndex(-1);

    const time = () => new Date().toLocaleTimeString();
    const logMessage = (msg: string) => {
      setWorkflowLogs(prev => [...prev, `[${time()}] ${msg}`]);
    };

    let seq: string[] = [];
    try {
      seq = typeof activeChatWorkflow.agents_sequence === 'string'
        ? JSON.parse(activeChatWorkflow.agents_sequence)
        : activeChatWorkflow.agents_sequence || [];
    } catch {
      seq = activeChatWorkflow.agents_sequence || [];
    }

    // Post initial "starting" chat message
    setChatHistory(prev => [...prev, {
      role: 'agent',
      status: 'info',
      content: `🚀 **Initiating workflow execution** for **${activeChatWorkflow.name}**\n\nPipeline sequence (${seq.length} agents):\n${seq.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}\n\n_Sending execution request to backend orchestrator..._`
    }]);

    logMessage(`[ORCHESTRATOR] Initiating execution: ${activeChatWorkflow.name}`);
    logMessage(`[ORCHESTRATOR] Trigger: "${queryText}"`);
    logMessage(`[ORCHESTRATOR] Sequence: ${seq.join(' ➔ ')}`);
    logMessage(`[ORCHESTRATOR] Parameters: ${JSON.stringify(paramsPayload || {})}`);

    // Fire the real execute endpoint (runs chained agents on backend)
    const executePromise = (async () => {
      try {
        const res = await fetch(`/api/workflows/${activeChatWorkflow.id}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger_query: queryText,
            input_parameters: paramsPayload || {}
          })
        });
        return await res.json();
      } catch {
        return { status: 'error', error: 'Connection to backend failed.', agent_outputs: {} };
      }
    })();

    // Animate step-by-step topology while backend runs
    for (let i = 0; i < seq.length; i++) {
      const agentName = seq[i];
      const agentObj = agents.find(a => a.name === agentName);
      const role = agentObj?.role || 'Agent';

      setActiveStepIndex(i);
      logMessage(`[STEP ${i + 1}/${seq.length}] → ${agentName} (${role})`);

      setChatHistory(prev => [...prev, {
        role: 'agent',
        status: 'info',
        content: `⚙️ **Step ${i + 1}/${seq.length} — Running: ${agentName}**\n_Role: ${role}_`
      }]);

      // Wait proportionally based on sequence length (minimum 1.2s per step)
      await new Promise(resolve => setTimeout(resolve, 1200));
      logMessage(`[${agentName}] ✓ Step dispatched.`);
    }

    // Wait for real backend response
    const execData = await executePromise;
    setActiveStepIndex(-1);

    logMessage(`[ORCHESTRATOR] Backend response received.`);

    if (execData.status === 'Completed' || execData.agent_outputs) {
      const agentOutputs: Record<string, string> = execData.agent_outputs || {};
      const executionId: string = execData.execution_id || '';

      // Post each agent's real output into chat
      seq.forEach((agentName, idx) => {
        const output = agentOutputs[agentName];
        setCompletedSteps(prev => [...prev, idx]);
        if (output) {
          logMessage(`[${agentName}] ✓ Completed.`);
          setChatHistory(prev => [...prev, {
            role: 'agent',
            status: 'success',
            content: `✅ **${agentName} — Output**\n\n${output}`
          }]);
        }
      });

      logMessage(`[SUCCESS] All agents completed. Execution ID: ${executionId}`);
      setChatHistory(prev => [...prev, {
        role: 'agent',
        status: 'success',
        content: `---\n\n**📋 Execution Complete**${executionId ? `\n_Execution ID: \`${executionId}\`_` : ''}\n\nAll ${seq.length} agents completed successfully. Artifacts have been saved and are available in the Artifact Nexus.`
      }]);
    } else {
      setCompletedSteps([]);
      logMessage(`[ERROR] Execution failed: ${execData.error || 'Unknown error'}`);
      setChatHistory(prev => [...prev, {
        role: 'agent',
        status: 'error',
        content: `❌ **Workflow execution failed**\n\n${execData.error || execData.detail || 'Unknown error during pipeline execution.'}`
      }]);
    }

    setTestLoading(false);
  };

  const handleRunTest = async () => {
    if (!testQuery.trim() || !activeChatWorkflow) return;
    
    const userMsg = testQuery.trim();
    const updatedHistory = [...chatHistory, { role: 'user', content: userMsg }];
    setChatHistory(updatedHistory);
    setTestQuery('');

    // If we are currently collecting missing parameters
    if (collectingParamIdx !== -1 && collectingParamIdx < missingParams.length) {
      const currentParam = missingParams[collectingParamIdx];
      const newCollected = { ...collectedParams, [currentParam.name]: userMsg };
      setCollectedParams(newCollected);

      const nextIdx = collectingParamIdx + 1;
      if (nextIdx < missingParams.length) {
        setCollectingParamIdx(nextIdx);
        const nextParam = missingParams[nextIdx];
        setChatHistory([
          ...updatedHistory,
          {
            role: 'agent',
            status: 'success',
            content: `Thank you. Next, please provide a value for:\n\n* **${nextParam.name}** (${nextParam.type}): ${nextParam.description || 'No description provided'}`
          }
        ]);
      } else {
        setCollectingParamIdx(-1);
        setChatHistory([
          ...updatedHistory,
          {
            role: 'agent',
            status: 'success',
            content: `All parameters collected successfully:\n\n${Object.entries(newCollected).map(([k, v]) => `* **${k}**: ${v}`).join('\n')}\n\nProceeding to execute the workflow execution sequence...`
          }
        ]);
        
        // Wait briefly and then execute
        setTimeout(() => {
          triggerWorkflowRunDirectly(`Initiate ingestion with parameters: ${JSON.stringify(newCollected)}`, newCollected);
        }, 1200);
      }
    } else {
      // Normal chat after execution or if no parameters were collected
      setTestLoading(true);
      
      const logMessage = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        setWorkflowLogs(prev => [...prev, `[${time}] ${msg}`]);
      };

      logMessage(`[ORCHESTRATOR] Received query in Sandbox session: "${userMsg}"`);
      
      try {
        const res = await fetch('/api/agents/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Orchestrator (${activeChatWorkflow.name})`,
            role: 'Workflow Orchestrator',
            skills: [],
            instructions: `You are the Workflow Orchestrator. Your current pipeline sequence is: ${activeChatWorkflow.agents_sequence}. Assist the user with coordinating or discussing this workflow.`,
            inputs: { query: userMsg, collected_parameters: collectedParams },
            history: updatedHistory.map(m => ({ role: m.role, text: m.content }))
          })
        });
        const data = await res.json();
        if (data.status === 'success') {
          setChatHistory([
            ...updatedHistory,
            { role: 'agent', status: 'success', content: data.output || 'Complete.' }
          ]);
          logMessage(`[SUCCESS] Orchestration query executed successfully.`);
        } else {
          setChatHistory([
            ...updatedHistory,
            { role: 'agent', status: 'error', content: data.output || 'Execution failed.' }
          ]);
          logMessage(`[ERROR] Orchestration query failed.`);
        }
      } catch (e) {
        setChatHistory([
          ...updatedHistory,
          { role: 'agent', status: 'error', content: 'Connection failed.' }
        ]);
        logMessage(`[ERROR] Connection failed.`);
      }
      setTestLoading(false);
    }
  };

  const handleNextStep = () => {
    if (wizardStep === 1) {
      if (!name.trim()) {
        setMsg({ type: 'error', text: 'Workflow Name is required.' });
        return;
      }
      if (/\s/.test(name)) {
        setMsg({ type: 'error', text: 'Workflow Name must not contain spaces.' });
        return;
      }
      if (!selectedProductId || !targetProjectId) {
        setMsg({ type: 'error', text: 'Data Product and Project targets are required.' });
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
      data_product_id: selectedProductId,
      data_project_id: targetProjectId,
      agents_sequence: seqAgents,
      is_enabled: isEnabled
    };

    try {
      const url = editingId ? `/api/workflows/${editingId}` : '/api/workflows';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setMsg({ type: 'success', text: `Workflow ${editingId ? 'updated' : 'configured'} successfully!` });
        setIsWizardOpen(false);
        resetForm();
        fetchWorkflowsAndAgents();
        if (onRefresh) onRefresh();
      } else {
        const d = await res.json();
        setMsg({ type: 'error', text: d.detail || 'Failed to save workflow' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this workflow configuration?')) return;
    try {
      const res = await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchWorkflowsAndAgents();
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStatus = async (wf: Workflow) => {
    try {
      let parsedSeq: string[] = [];
      try {
        parsedSeq = typeof wf.agents_sequence === 'string' ? JSON.parse(wf.agents_sequence) : wf.agents_sequence;
      } catch {
        parsedSeq = wf.agents_sequence || [];
      }
      const res = await fetch(`/api/workflows/${wf.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wf.name,
          description: wf.description,
          data_product_id: wf.data_product_id,
          data_project_id: wf.data_project_id,
          agents_sequence: parsedSeq,
          is_enabled: !wf.is_enabled
        })
      });
      if (res.ok) {
        fetchWorkflowsAndAgents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSeqStep = () => {
    setSeqAgents([...seqAgents, '']);
  };

  const handleRemoveSeqStep = (idx: number) => {
    setSeqAgents(seqAgents.filter((_, i) => i !== idx));
  };

  const handleUpdateSeqStep = (idx: number, val: string) => {
    const nextSeq = [...seqAgents];
    nextSeq[idx] = val;
    setSeqAgents(nextSeq);
  };

  const filteredWorkflows = workflows.filter(wf => {
    if (filterProductId && wf.data_product_id !== filterProductId) return false;
    
    const q = searchQuery.toLowerCase();
    const productName = (products.find(p => p.id === wf.data_product_id)?.name || '').toLowerCase();
    const projectName = (projects.find(p => p.id === wf.data_project_id)?.name || '').toLowerCase();
    
    if (!q) return true;
    return (
      wf.name.toLowerCase().includes(q) ||
      (wf.description || '').toLowerCase().includes(q) ||
      productName.includes(q) ||
      projectName.includes(q)
    );
  });

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><GitBranch size={22} /></div>
          <div>
            <h1 className="page-title">Workflow Studio</h1>
            <p className="page-subtitle">Design multi-agent orchestration pipelines and map them to workspace targets.</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Product:</span>
            <select
              className="form-select"
              style={{ border: 'none', backgroundColor: 'transparent', color: 'var(--text-primary)', padding: '2px 24px 2px 4px', fontSize: '0.8rem', height: 'auto', minWidth: '120px' }}
              value={filterProductId || ''}
              onChange={e => setFilterProductId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All Data Products</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 12px' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search workflows..." 
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
            <span>Design Workflow</span>
          </button>
        </div>
      </div>

      {/* Configured Workflows Grid */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <Settings size={30} className="spin-animation text-cyan" />
            <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading Workflow Mappings...</p>
          </div>
        ) : (
          <div className="card-grid-2">
          {filteredWorkflows.map(wf => {
            const product = products.find(p => p.id === wf.data_product_id);
            const project = projects.find(p => p.id === wf.data_project_id);
            let parsedSeq: string[] = [];
            try {
              parsedSeq = typeof wf.agents_sequence === 'string' ? JSON.parse(wf.agents_sequence) : wf.agents_sequence;
            } catch {
              parsedSeq = wf.agents_sequence || [];
            }

            return (
              <div key={wf.id} className={`card ${!wf.is_enabled ? 'opacity-60' : ''}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '260px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '4px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent-blue)', fontSize: '1.05rem', wordBreak: 'break-word', display: 'inline-block' }}>{wf.name}</span>
                      {!wf.is_enabled && <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginLeft: '6px', verticalAlign: 'middle' }}>DISABLED</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button 
                        onClick={() => toggleStatus(wf)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title={wf.is_enabled ? 'Disable' : 'Enable'}
                      >
                        {wf.is_enabled ? <ToggleRight className="text-green" size={16} /> : <ToggleLeft className="text-muted" size={16} />}
                      </button>
                      <button 
                        onClick={() => handleEdit(wf)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        onClick={() => handleDelete(wf.id)} 
                        className="btn btn-danger" 
                        style={{ padding: '4px 6px' }}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <p style={{ 
                    fontSize: '0.85rem', 
                    color: 'var(--text-secondary)', 
                    marginTop: '8px', 
                    lineHeight: '1.4',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minHeight: '40px'
                  }}>
                    {wf.description || 'No description provided.'}
                  </p>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    <div>
                      <span style={{ display: 'inline-block', width: '90px' }}>Target Product:</span> 
                      <strong style={{ color: 'var(--text-primary)' }}>{product?.name || `ID ${wf.data_product_id}`}</strong>
                    </div>
                    <div>
                      <span style={{ display: 'inline-block', width: '90px' }}>Target Workspace:</span> 
                      <strong style={{ color: 'var(--text-primary)' }}>{project?.name || `ID ${wf.data_project_id}`}</strong>
                    </div>
                  </div>

                  {parsedSeq && parsedSeq.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                        <Cpu size={12} /> Agent Pipeline Sequence
                      </span>
                      <div className="agent-nodes-container" style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                        {parsedSeq.map((agent, idx) => (
                          <div key={idx} style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            <div style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              backgroundColor: 'rgba(56, 189, 248, 0.08)',
                              color: 'var(--accent-blue)',
                              border: '1px solid rgba(56, 189, 248, 0.2)',
                              whiteSpace: 'nowrap'
                            }}>
                              {idx + 1}. {agent.split(' ')[0]}
                            </div>
                            {idx < parsedSeq.length - 1 && (
                              <ChevronRight size={14} className="text-muted" style={{ marginLeft: '10px' }} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => {
                      setActiveChatWorkflow(wf);
                    }} 
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '8px' }}
                    disabled={!wf.is_enabled}
                  >
                    <MessageSquare size={16} />
                    <span>Test & Chat</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredWorkflows.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              No workflow mappings found. Use the Design Workflow wizard to register a new agentic workflow.
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
          backgroundColor: 'rgba(5, 7, 15, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 1000
        }}>
          <div className="slide-panel">
            <button 
              onClick={() => setIsWizardOpen(false)} 
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div className="card-header" style={{ marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              <GitBranch size={18} className="text-cyan" />
              <span style={{ fontSize: '1.1rem' }}>{editingId ? 'Edit Workflow Definition' : 'Design New Workflow'}</span>
            </div>

            {/* Step indicator */}
            <div className="step-indicator" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 1 ? 'active' : (wizardStep > 1 ? 'done' : 'pending')}`}>1</div>
                <span className={`step-label ${wizardStep === 1 ? 'active' : ''}`}>Mapping</span>
              </div>
              <div className="step-connector" />
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 2 ? 'active' : (wizardStep > 2 ? 'done' : 'pending')}`}>2</div>
                <span className={`step-label ${wizardStep === 2 ? 'active' : ''}`}>Sequencer</span>
              </div>
              <div className="step-connector" />
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 3 ? 'active' : 'pending'}`}>3</div>
                <span className={`step-label ${wizardStep === 3 ? 'active' : ''}`}>Deploy</span>
              </div>
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1.5rem', flexShrink: 0 }}>{msg.text}</div>}

            {/* Step 1: Details */}
            {wizardStep === 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', height: '100%' }}>
                <div className="form-stack" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="form-group" style={{ flexShrink: 0 }}>
                    <label className="form-label">Pipeline Identifier <span className="required">*</span></label>
                    <AISuggestInput 
                      value={name} 
                      onChange={setName} 
                      fieldContext="workflow name" 
                      placeholder="e.g. BronzeToSilverPipeline (no spaces)" 
                    />
                    <p className="form-hint">Must not contain any spaces. PascalCase recommended.</p>
                  </div>

                  <div className="form-group" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <label className="form-label">Description</label>
                    <textarea 
                      className="form-control"
                      value={desc} 
                      onChange={e => setDesc(e.target.value)} 
                      placeholder="Briefly describe what this workflow route orchestrates..." 
                      style={{ flexGrow: 1, resize: 'none', minHeight: '100px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem', padding: '10px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', flexShrink: 0 }}>
                    <input 
                      type="checkbox" 
                      id="wf-enabled-check"
                      checked={isEnabled} 
                      onChange={e => setIsEnabled(e.target.checked)} 
                    />
                    <label htmlFor="wf-enabled-check" style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>
                      Enable this pipeline route upon registration
                    </label>
                  </div>
                </div>

                <div className="form-stack" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="form-group" style={{ flexShrink: 0 }}>
                    <label className="form-label">Target Data Product <span className="required">*</span></label>
                    <select 
                      className="form-select"
                      value={selectedProductId || ''}
                      onChange={e => setSelectedProductId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">-- Select Product --</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ flexShrink: 0 }}>
                    <label className="form-label">Target Workspace <span className="required">*</span></label>
                    <select 
                      className="form-select"
                      value={targetProjectId || ''}
                      onChange={e => setTargetProjectId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">-- Select Project --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Visual Sequencer */}
            {wizardStep === 2 && (
              <div className="form-stack">
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Pipeline Nodes</label>
                  <p className="form-hint" style={{ marginBottom: '1.25rem' }}>Visually stack the multi-agent sequence. Execution flows from top to bottom.</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0', backgroundColor: '#05070f', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: '8px' }}>
                    {seqAgents.map((agentName, idx) => (
                      <div key={idx} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        {/* Node Container */}
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px', 
                          width: '100%', 
                          backgroundColor: 'rgba(255,255,255,0.03)', 
                          padding: '10px 14px', 
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.05)',
                          zIndex: 2
                        }}>
                          <div style={{ 
                            width: '28px', height: '28px', 
                            borderRadius: '50%', 
                            backgroundColor: 'rgba(56, 189, 248, 0.1)', 
                            border: '1px solid var(--accent-blue)', 
                            color: 'var(--accent-blue)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.75rem', fontWeight: 'bold'
                          }}>
                            {idx + 1}
                          </div>
                          
                          <select
                            className="form-select"
                            value={agentName}
                            onChange={e => handleUpdateSeqStep(idx, e.target.value)}
                            style={{ flex: 1, padding: '6px 12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                          >
                            <option value="">-- Assign Agent Node --</option>
                            {agents.filter(a => a.is_enabled).map(agent => (
                              <option key={agent.id} value={agent.name}>{agent.name}</option>
                            ))}
                          </select>
                          
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '6px', color: 'var(--text-muted)' }}
                            title="Remove Node"
                            onClick={() => handleRemoveSeqStep(idx)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        {/* Connecting Line */}
                        {idx < seqAgents.length - 1 && (
                          <div style={{
                            width: '2px',
                            height: '24px',
                            backgroundColor: 'var(--accent-blue)',
                            opacity: 0.3,
                            marginLeft: '27px',
                            zIndex: 1
                          }} />
                        )}
                      </div>
                    ))}
                    
                    {/* Add Node Button */}
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: seqAgents.length > 0 ? '0' : '0' }}>
                      {seqAgents.length > 0 && (
                        <div style={{
                          width: '2px',
                          height: '24px',
                          backgroundColor: 'var(--border-color)',
                          marginLeft: '27px',
                          zIndex: 1
                        }} />
                      )}
                      <button
                        type="button"
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: '8px', 
                          padding: '8px 16px', borderRadius: '20px', 
                          backgroundColor: 'rgba(255,255,255,0.05)', 
                          border: '1px dashed var(--text-muted)', 
                          color: 'var(--text-secondary)',
                          fontSize: '0.8rem', fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          marginLeft: '10px',
                          zIndex: 2
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--text-muted)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        onClick={handleAddSeqStep}
                      >
                        <Plus size={14} /> Append Agent Node
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {wizardStep === 3 && (
              <div className="review-card" style={{ padding: '1.5rem', backgroundColor: 'rgba(17, 24, 39, 0.9)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div className="review-section-title" style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>Deployment Review</div>
                <div className="review-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div className="review-label" style={{ color: 'var(--text-muted)' }}>Identifier</div>
                  <div className="review-value" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{name}</div>
                </div>
                <div className="review-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div className="review-label" style={{ color: 'var(--text-muted)' }}>Data Product Target</div>
                  <div className="review-value" style={{ fontWeight: 500 }}>{products.find(p => p.id === selectedProductId)?.name || 'Unknown'}</div>
                </div>
                <div className="review-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div className="review-label" style={{ color: 'var(--text-muted)' }}>Workspace Target</div>
                  <div className="review-value" style={{ fontWeight: 500 }}>{projects.find(p => p.id === targetProjectId)?.name || 'Unknown'}</div>
                </div>
                <div className="review-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div className="review-label" style={{ color: 'var(--text-muted)' }}>State</div>
                  <div className="review-value">
                    {isEnabled ? <span className="badge badge-success">Active</span> : <span className="badge badge-warning">Disabled</span>}
                  </div>
                </div>
                <div className="review-row" style={{ flexDirection: 'column' }}>
                  <div className="review-label" style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>Pipeline Topology</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', backgroundColor: '#05070f', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    {seqAgents.map((ag, i) => (
                      <React.Fragment key={i}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: 'var(--accent-blue)' }}>{i+1}.</span> {ag.split(' ')[0]}
                        </span>
                        {i < seqAgents.length - 1 && <ChevronRight size={12} className="text-muted" />}
                      </React.Fragment>
                    ))}
                    {seqAgents.length === 0 && <span style={{ fontStyle: 'italic', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Empty pipeline.</span>}
                  </div>
                </div>
              </div>
            )}
            </div>

            {/* Wizard Navigation */}
            <div className="step-nav" style={{ marginTop: 'auto', paddingTop: '1.5rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)' }}>
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
                  <span>Continue</span>
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                  <Check size={16} />
                  <span>{editingId ? 'Update Pipeline' : 'Deploy Pipeline'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!isWizardOpen && activeChatWorkflow && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            width: '96vw',
            maxWidth: '1700px',
            height: '92vh',
            backgroundColor: 'rgba(17, 24, 39, 0.98)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <GitBranch size={18} className="text-cyan" />
                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Workflow Orchestration Sandbox: {activeChatWorkflow.name}</span>
                <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Workflow Orchestrator</span>
              </div>
              <button 
                onClick={() => setActiveChatWorkflow(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>
            
            {/* 3-Column Layout */}
            <div style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.2fr', overflow: 'hidden' }}>
              
              {/* Column 1: Left - Sequence Topology */}
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border-color)', minHeight: 0, backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sequence Topology</span>
                  {testLoading && <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}><Settings size={12} className="spin-animation" /> Running...</span>}
                </div>
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0px', minHeight: 0 }}>
                  {(() => {
                    let seq: string[] = [];
                    try {
                      seq = typeof activeChatWorkflow.agents_sequence === 'string' ? JSON.parse(activeChatWorkflow.agents_sequence) : activeChatWorkflow.agents_sequence;
                    } catch {
                      seq = activeChatWorkflow.agents_sequence || [];
                    }
                    if (seq.length === 0) return <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No agents registered in this sequence.</div>;
                    
                    return seq.map((agentName, idx) => {
                      const agentObj = agents.find(a => a.name === agentName);
                      const isCompleted = completedSteps.includes(idx);
                      const isActive = activeStepIndex === idx;
                      
                      let statusText = 'Pending';
                      let statusColor = 'var(--text-muted)';
                      let cardBorder = '1px solid var(--border-color)';
                      let indicatorBg = 'rgba(255,255,255,0.05)';
                      
                      if (isCompleted) {
                        statusText = 'Completed';
                        statusColor = 'var(--accent-green)';
                        cardBorder = '1px solid rgba(16, 185, 129, 0.4)';
                        indicatorBg = 'rgba(16, 185, 129, 0.1)';
                      } else if (isActive) {
                        statusText = 'In Progress';
                        statusColor = 'var(--accent-blue)';
                        cardBorder = '1px solid rgba(56, 189, 248, 0.6)';
                        indicatorBg = 'rgba(56, 189, 248, 0.15)';
                      }
                      
                      return (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                          <div style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            backgroundColor: isActive ? 'rgba(56, 189, 248, 0.04)' : 'rgba(255,255,255,0.02)',
                            border: cardBorder,
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'center',
                            transition: 'all 0.3s ease'
                          }}>
                            {/* Left Status Indicator */}
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: indicatorBg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              border: isActive ? '2px solid var(--accent-blue)' : (isCompleted ? '2px solid var(--accent-green)' : '1px solid var(--border-color)')
                            }}>
                              {isCompleted ? (
                                <Check size={14} className="text-green" style={{ strokeWidth: 3 }} />
                              ) : isActive ? (
                                <Settings size={14} className="text-cyan spin-animation" />
                              ) : (
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{idx + 1}</span>
                              )}
                            </div>
                            
                            {/* Main Info */}
                            <div style={{ flexGrow: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>{agentName}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{statusText}</span>
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {agentObj?.role || 'Pipeline Agent Node'}
                              </div>
                            </div>
                          </div>
                          
                          {/* Connector line */}
                          {idx < seq.length - 1 && (
                            <div style={{
                              width: '2px',
                              height: '24px',
                              backgroundColor: isCompleted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255,255,255,0.05)',
                              alignSelf: 'flex-start',
                              marginLeft: '29px',
                              borderLeft: isCompleted ? '2px solid var(--accent-green)' : '2px dashed rgba(255,255,255,0.1)'
                            }} />
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              
              {/* Column 2: Middle - Chat Sandbox */}
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border-color)', minHeight: 0 }}>
                {/* AI-Generated Description banner on top */}
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Orchestration Sequence Overview</div>
                  <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: '1.4', fontStyle: 'italic' }}>
                    {activeChatWorkflow.description || "Generating workflow details..."}
                  </div>
                </div>

                {/* Chat History */}
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'rgba(0,0,0,0.15)', minHeight: 0 }}>
                  {chatHistory.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const isInfo = msg.status === 'info';
                    const isSuccess = msg.status === 'success';
                    const isError = msg.status === 'error';

                    const bubbleBg = isUser
                      ? 'var(--accent-blue)'
                      : isInfo
                        ? 'rgba(56, 189, 248, 0.06)'
                        : isError
                          ? 'rgba(239, 68, 68, 0.06)'
                          : 'rgba(255,255,255,0.05)';

                    const bubbleBorder = isUser
                      ? 'none'
                      : isInfo
                        ? '1px solid rgba(56, 189, 248, 0.2)'
                        : isError
                          ? '1px solid rgba(239, 68, 68, 0.3)'
                          : isSuccess
                            ? '1px solid rgba(16, 185, 129, 0.2)'
                            : '1px solid rgba(255,255,255,0.05)';

                    const bubbleColor = isUser
                      ? '#fff'
                      : isError
                        ? 'var(--accent-red)'
                        : 'var(--text-secondary)';

                    // Parse italic spans around _text_
                    const renderContent = (content: string) =>
                      content.split('**').map((part: string, i: number) =>
                        i % 2 === 1
                          ? <strong key={i} style={{ color: isUser ? 'inherit' : 'var(--text-primary)' }}>{part}</strong>
                          : part.split('_').map((p: string, j: number) =>
                              j % 2 === 1
                                ? <em key={j} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{p}</em>
                                : p
                            )
                      );

                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                        alignSelf: isUser ? 'flex-end' : 'flex-start',
                        maxWidth: '90%'
                      }}>
                        {!isUser && (
                          <div style={{
                            width: '26px', height: '26px', borderRadius: '50%',
                            backgroundColor: isInfo ? 'rgba(56,189,248,0.15)' : isError ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, marginTop: '2px',
                            border: `1px solid ${isInfo ? 'rgba(56,189,248,0.3)' : isError ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`
                          }}>
                            {isInfo
                              ? <Settings size={12} style={{ color: 'var(--accent-cyan)' }} />
                              : isError
                                ? <X size={12} style={{ color: 'var(--accent-red)' }} />
                                : <Check size={12} style={{ color: 'var(--accent-green)' }} />
                            }
                          </div>
                        )}
                        <div style={{
                          backgroundColor: bubbleBg,
                          color: bubbleColor,
                          padding: '10px 14px',
                          borderRadius: isUser ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                          fontSize: '0.85rem',
                          border: bubbleBorder,
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.5,
                          flex: 1
                        }}>
                          {renderContent(msg.content)}
                        </div>
                      </div>
                    );
                  })}
                  {testLoading && chatHistory.length > 0 && chatHistory[chatHistory.length - 1]?.status !== 'info' && (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: 'rgba(56,189,248,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(56,189,248,0.2)' }}>
                        <Settings size={12} className="text-cyan spin-animation" />
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Processing next step...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Message input */}
                <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', backgroundColor: 'transparent' }}>
                  <input 
                    type="text"
                    className="form-control"
                    placeholder="Enter query parameters to trigger execution flow..."
                    value={testQuery}
                    onChange={e => setTestQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !testLoading) {
                        handleRunTest();
                      }
                    }}
                    style={{ flexGrow: 1 }}
                    disabled={testLoading}
                  />
                  <button 
                    className="btn btn-primary" 
                    onClick={handleRunTest} 
                    disabled={testLoading || !testQuery.trim()}
                    style={{ padding: '0 24px', display: 'flex', gap: '8px', alignItems: 'center' }}
                  >
                    <Play size={14} fill="currentColor" />
                    <span>Run</span>
                  </button>
                </div>
              </div>
              
              {/* Column 3: Right - Parameters & Logs */}
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0 }}>
                {/* Target Workspace details */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Parameters</div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Target Product</label>
                      <input type="text" className="form-control" readOnly value={products.find(p => p.id === activeChatWorkflow.data_product_id)?.name || `ID ${activeChatWorkflow.data_product_id}`} style={{ fontSize: '0.75rem', padding: '6px 10px', backgroundColor: 'rgba(0,0,0,0.2)', cursor: 'not-allowed' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Target Workspace</label>
                      <input type="text" className="form-control" readOnly value={projects.find(p => p.id === activeChatWorkflow.data_project_id)?.name || `ID ${activeChatWorkflow.data_project_id}`} style={{ fontSize: '0.75rem', padding: '6px 10px', backgroundColor: 'rgba(0,0,0,0.2)', cursor: 'not-allowed' }} />
                    </div>
                  </div>
                </div>

                {/* Telemetry Logs */}
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#090d16' }}>
                  <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>TELEMETRY EXECUTION LOGS</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{workflowLogs.length} entries</span>
                  </div>
                  <div style={{ 
                    flexGrow: 1, 
                    overflowY: 'auto', 
                    padding: '1.25rem', 
                    fontSize: '0.75rem', 
                    fontFamily: 'monospace', 
                    color: '#a9b1d6', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px', 
                    lineHeight: '1.5',
                    minHeight: 0
                  }}>
                    {workflowLogs.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '4rem' }}>
                        No logs recorded. Submit a query in the chat Sandbox to trace the multi-agent pipeline sequence.
                      </div>
                    ) : (
                      workflowLogs.map((log, idx) => {
                        let logColor = '#a9b1d6';
                        if (log.includes('[SUCCESS]')) logColor = 'var(--accent-green)';
                        else if (log.includes('[ERROR]')) logColor = 'var(--accent-red)';
                        else if (log.includes('[STEP')) logColor = 'var(--accent-blue)';
                        else if (log.includes('[ORCHESTRATOR]')) logColor = 'var(--accent-cyan)';
                        
                        return (
                          <div key={idx} style={{ color: logColor, whiteSpace: 'pre-wrap', borderLeft: '2px solid rgba(255,255,255,0.05)', paddingLeft: '8px' }}>
                            {log}
                          </div>
                        );
                      })
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
