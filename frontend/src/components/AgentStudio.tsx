import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Edit2, 
  ToggleLeft, 
  ToggleRight, 
  Shield, 
  Wrench, 
  Search, 
  X, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  Settings,
  Play,
  MessageSquare,
  Cpu
} from 'lucide-react';
import type { Agent, Skill } from '../types';
import { AISuggestInput } from './AISuggestInput';

export const AgentStudio: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Wizard Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [assignedSkills, setAssignedSkills] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [instructionOutputs, setInstructionOutputs] = useState('');
  const [guardrails, setGuardrails] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);

  const parseInstructions = (raw: string) => {
    if (!raw) {
      setInstructionOutputs('');
      setGuardrails('');
      return;
    }
    const parts = raw.split('## GUARDRAILS');
    if (parts.length > 1) {
      setInstructionOutputs(parts[0].replace('## INSTRUCTION OUTPUTS\n', '').trim());
      setGuardrails(parts[1].trim());
    } else {
      setInstructionOutputs(raw.trim());
      setGuardrails('');
    }
  };

  // Testing States
  const [testQuery, setTestQuery] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; output: string } | null>(null);
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'agent', content: string, status?: string}[]>([]);
  const [activeChatAgent, setActiveChatAgent] = useState<Agent | null>(null);

  const chatEndRef = React.useRef<HTMLDivElement | null>(null);
  const wizardChatEndRef = React.useRef<HTMLDivElement | null>(null);
  const wizardLogsEndRef = React.useRef<HTMLDivElement | null>(null);
  const standaloneLogsEndRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  useEffect(() => {
    if (wizardChatEndRef.current) {
      wizardChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  useEffect(() => {
    if (wizardLogsEndRef.current) {
      wizardLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  useEffect(() => {
    if (standaloneLogsEndRef.current) {
      standaloneLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [agRes, skRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/skills')
      ]);
      if (agRes.ok) setAgents(await agRes.json());
      if (skRes.ok) setSkills(await skRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setRole('');
    setAssignedSkills([]);
    setInstructions('');
    setInstructionOutputs('');
    setGuardrails('');
    setIsEnabled(true);
    setMsg(null);
    setWizardStep(1);
    setTestQuery('');
    setTestLoading(false);
    setTestResult(null);
    setChatHistory([]);
  };

  const handleOpenCreateWizard = () => {
    resetForm();
    setIsWizardOpen(true);
  };

  const handleEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setName(agent.name);
    setRole(agent.role);
    setAssignedSkills(agent.skills || []);
    setInstructions(agent.instructions || '');
    parseInstructions(agent.instructions || '');
    setIsEnabled(agent.is_enabled);
    setMsg(null);
    setWizardStep(1);
    setTestQuery('');
    setTestLoading(false);
    setTestResult(null);
    setChatHistory([]);
    setIsWizardOpen(true);
  };

  const handleChat = (agent: Agent) => {
    setEditingId(agent.id);
    setName(agent.name);
    setRole(agent.role);
    setAssignedSkills(agent.skills || []);
    setInstructions(agent.instructions || '');
    setTestQuery('');
    setTestLoading(false);
    setTestResult(null);
    const initialContext = agent.introduction || `Hello! I am **${agent.name}**, your **${agent.role}**.\n\nMy primary instructions are: _${agent.instructions || 'None'}_\n\nI have access to the following skills: **${agent.skills?.join(', ') || 'None'}**.\n\nHow can I assist you today?`;
    setChatHistory([{ role: 'agent', content: initialContext, status: 'success' }]);
    setActiveChatAgent(agent);
  };

  const handleRunTest = async () => {
    if (!testQuery.trim()) return;
    
    setTestLoading(true);
    
    // Optimistically add user message
    const currentUserMessage = testQuery;
    setChatHistory(prev => [...prev, { role: 'user', content: currentUserMessage }]);
    setTestQuery(''); // clear input early for better UX
    setTestResult(null);
    
    const combinedInstructions = `## INSTRUCTION OUTPUTS\n${instructionOutputs}\n\n## GUARDRAILS\n${guardrails}`;
    
    try {
      const res = await fetch('/api/agents/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          role, 
          instructions: combinedInstructions, 
          skills: assignedSkills, 
          inputs: { query: currentUserMessage },
          history: chatHistory
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(prev => [...prev, { role: 'agent', content: data.output, status: data.status }]);
        setTestResult(data);
      } else {
        const err = await res.json();
        setChatHistory(prev => [...prev, { role: 'agent', content: err.detail || 'Agent execution failed.', status: 'error' }]);
      }
    } catch (e) {
      setChatHistory(prev => [...prev, { role: 'agent', content: 'Network error executing agent.', status: 'error' }]);
    } finally {
      setTestLoading(false);
    }
  };

  const handleNextStep = () => {
    if (wizardStep === 1) {
      if (!name.trim()) {
        setMsg({ type: 'error', text: 'Agent Name is required.' });
        return;
      }
      if (/\s/.test(name)) {
        setMsg({ type: 'error', text: 'Agent Name must not contain spaces.' });
        return;
      }
      if (!role.trim()) {
        setMsg({ type: 'error', text: 'Agent Role/Title is required.' });
        return;
      }
      setMsg(null);
    }
    if (wizardStep === 2) {
      if (!instructionOutputs.trim()) {
        setMsg({ type: 'error', text: 'Agent Instruction Outputs are required.' });
        return;
      }
      setMsg(null);
    }
    setWizardStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setWizardStep(prev => prev - 1);
  };

  const handleToggleSkill = (skillName: string) => {
    if (assignedSkills.includes(skillName)) {
      setAssignedSkills(assignedSkills.filter(s => s !== skillName));
    } else {
      setAssignedSkills([...assignedSkills, skillName]);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setMsg(null);

    const combinedInstructions = `## INSTRUCTION OUTPUTS\n${instructionOutputs}\n\n## GUARDRAILS\n${guardrails}`;

    const payload = {
      name,
      role,
      skills: assignedSkills,
      tools: [], // tools are inherited through skills
      instructions: combinedInstructions,
      is_enabled: isEnabled
    };

    try {
      const url = editingId ? `/api/agents/${editingId}` : '/api/agents';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        fetchData();
        setIsWizardOpen(false);
        resetForm();
      } else {
        const d = await res.json();
        setMsg({ type: 'error', text: d.detail || 'Failed to save agent' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this agent?')) return;
    try {
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStatus = async (agent: Agent) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agent.name,
          role: agent.role,
          skills: agent.skills || [],
          tools: agent.tools || [],
          instructions: agent.instructions,
          is_enabled: !agent.is_enabled
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Helper to determine inherited tools via assigned skills
  const getInheritedToolsForAgent = (agentSkillNames: string[]) => {
    const toolsSet = new Set<string>();
    agentSkillNames.forEach(skillName => {
      const matchedSkill = skills.find(s => s.name === skillName);
      if (matchedSkill && matchedSkill.tools) {
        let skillTools: string[] = [];
        try {
          skillTools = typeof matchedSkill.tools === 'string' ? JSON.parse(matchedSkill.tools) : matchedSkill.tools;
        } catch {
          skillTools = matchedSkill.tools || [];
        }
        skillTools.forEach(t => toolsSet.add(t));
      }
    });
    return Array.from(toolsSet);
  };

  const filteredAgents = agents.filter(agent => {
    const q = searchQuery.toLowerCase();
    const skillsList = agent.skills || [];
    return (
      agent.name.toLowerCase().includes(q) ||
      agent.role.toLowerCase().includes(q) ||
      (agent.instructions || '').toLowerCase().includes(q) ||
      skillsList.some(s => s.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Users size={22} /></div>
          <div>
            <h1 className="page-title">Agent Studio</h1>
            <p className="page-subtitle">Assemble AI personas, map inherited capabilities, and customize reasoning directions</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 12px' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search agents..." 
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
            <span>Create Agent</span>
          </button>
        </div>
      </div>

      {/* Grid of Agent Cards */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Settings size={30} className="spin-animation text-cyan" />
          <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading Agent Workspace...</p>
        </div>
      ) : (
        <div className="card-grid-2">
          {filteredAgents.map(agent => {
            const inheritedTools = getInheritedToolsForAgent(agent.skills || []);
            return (
              <div key={agent.id} className={`card ${!agent.is_enabled ? 'opacity-60' : ''}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '220px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent-blue)', fontSize: '1rem' }}>{agent.name}</span>
                      <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{agent.role}</span>
                      {!agent.is_enabled && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>DISABLED</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => toggleStatus(agent)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title={agent.is_enabled ? 'Disable' : 'Enable'}
                      >
                        {agent.is_enabled ? <ToggleRight className="text-green" size={16} /> : <ToggleLeft className="text-muted" size={16} />}
                      </button>

                      <button 
                        onClick={() => handleEdit(agent)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        onClick={() => handleDelete(agent.id)} 
                        className="btn btn-danger" 
                        style={{ padding: '4px 6px' }}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {agent.instructions && (
                    <div style={{ maxHeight: '90px', overflowY: 'auto', marginTop: '8px', paddingRight: '4px' }}>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0, whiteSpace: 'pre-wrap' }}>
                        {agent.instructions}
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '1rem' }}>
                  {/* Skill composition list */}
                  {agent.skills && agent.skills.length > 0 && (
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        <Shield size={12} className="text-cyan" />
                        <span>Active Skills</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {agent.skills.map((skillName, idx) => (
                          <span key={idx} className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>
                            {skillName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Inherited tool integration preview */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                    <Wrench size={12} className="text-muted" />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      <strong>Inherited Tools:</strong> {inheritedTools.length > 0 ? inheritedTools.join(', ') : 'None (Autonomous choice)'}
                    </span>
                  </div>

                  <button 
                    onClick={() => handleChat(agent)}
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '8px' }}
                    disabled={!agent.is_enabled}
                  >
                    <MessageSquare size={16} />
                    <span>Test & Chat</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredAgents.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              No agents match your search filter. Register a new agent using Create Agent.
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
          <div className="slide-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <button 
              onClick={() => setIsWizardOpen(false)} 
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div className="card-header" style={{ marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              <Plus size={16} className="text-cyan" />
              <span style={{ fontSize: '1.1rem' }}>{editingId ? 'Edit Agent Configuration' : 'Register New Agent'}</span>
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
                <span className={`step-label ${wizardStep === 2 ? 'active' : ''}`}>Instructions</span>
              </div>
              <div className="step-connector" />
              <div className="step-item">
                <div className={`step-circle ${wizardStep === 3 ? 'active' : 'pending'}`}>3</div>
                <span className={`step-label ${wizardStep === 3 ? 'active' : ''}`}>Review</span>
              </div>
            </div>

            <div style={{ flexGrow: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

            {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1rem', flexShrink: 0 }}>{msg.text}</div>}

            {/* Step 1: Details & Skill Sequence Node Selection */}
            {wizardStep === 1 && (
              <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                {/* Left Column: Details */}
                <div className="form-stack" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
                  <div className="form-group" style={{ flexShrink: 0 }}>
                    <label className="form-label">Agent Name <span className="required">*</span></label>
                    <AISuggestInput 
                      value={name} 
                      onChange={setName} 
                      fieldContext="agent name" 
                      placeholder="e.g. IngestionSpecialist (no spaces)" 
                    />
                    <p className="form-hint">Must not contain any spaces. PascalCase formatting recommended.</p>
                  </div>

                  <div className="form-group" style={{ flexShrink: 0 }}>
                    <label className="form-label">Role Title <span className="required">*</span></label>
                    <AISuggestInput 
                      value={role} 
                      onChange={setRole} 
                      fieldContext="agent role" 
                      placeholder="e.g. Data Profiler, Spec Creator, ETL Builder" 
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem', flexShrink: 0 }}>
                    <input 
                      type="checkbox" 
                      id="agent-enabled-check"
                      checked={isEnabled} 
                      onChange={e => setIsEnabled(e.target.checked)} 
                    />
                    <label htmlFor="agent-enabled-check" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                      Enable this agent persona for workflow sequencing
                    </label>
                  </div>
                </div>

                {/* Right Column: Stepwise Skill selection dropdown to nodes */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto', minHeight: 0 }}>
                  <div className="form-group" style={{ marginBottom: 0, flexShrink: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Assign Capability Skills</label>
                    <p className="form-hint" style={{ marginTop: 0, marginBottom: '8px' }}>Select a skill to add it sequentially into the agent's capability pipeline.</p>
                    <select 
                      className="form-select"
                      value=""
                      onChange={e => {
                        if (e.target.value) {
                          handleToggleSkill(e.target.value);
                        }
                      }}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    >
                      <option value="">-- Choose skill to add --</option>
                      {skills.filter(s => !assignedSkills.includes(s.name)).map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Horizontal visual sequence of nodes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', minHeight: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Pipeline Nodes</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)', minHeight: '64px', flexWrap: 'wrap' }}>
                      {assignedSkills.length === 0 ? (
                        <em style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No skills assigned yet. Use the selector above.</em>
                      ) : (
                        assignedSkills.map((skillName, idx) => (
                          <React.Fragment key={skillName}>
                            {idx > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>➔</span>}
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--accent-cyan)', backgroundColor: 'rgba(6,182,212,0.05)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                              <span>{skillName}</span>
                              <button type="button" onClick={() => handleToggleSkill(skillName)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                                <X size={12} />
                              </button>
                            </div>
                          </React.Fragment>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Inherited tools visualizer box */}
                  <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inherited Capabilities Preview</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '0.5rem' }}>
                      {(() => {
                        const toolsList = getInheritedToolsForAgent(assignedSkills);
                        if (toolsList.length === 0) {
                          return <span style={{ fontSize: '0.75rem', color: 'var(--accent-green)', fontStyle: 'italic' }}>Autonomous Agent Decision (No specific tools constrained)</span>;
                        }
                        return toolsList.map((t, i) => (
                          <span key={i} className="badge badge-info" style={{ fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Wrench size={10} />
                            {t}
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Configuration (Instruction Outputs & Guardrails side-by-side) */}
            {wizardStep === 2 && (
              <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                {/* Left Column: Instruction Outputs */}
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', flex: 1, margin: 0, minHeight: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Instruction Outputs <span className="required">*</span></label>
                  <p className="form-hint" style={{ marginTop: 0, marginBottom: '6px' }}>Define the exact output formats, goals, or targets the agent must accomplish.</p>
                  <AISuggestInput 
                    value={instructionOutputs} 
                    onChange={setInstructionOutputs} 
                    fieldContext={`Instruction outputs for agent ${name}`} 
                    placeholder="e.g. # Output format requirements\n1. Yield a JSON list of all validation records\n2. Provide summary statistics..."
                    rows={12}
                    style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', flexGrow: 1, resize: 'none' }}
                  />
                </div>

                {/* Right Column: Execution Guardrails */}
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', flex: 1, margin: 0, minHeight: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Execution Guardrails</label>
                  <p className="form-hint" style={{ marginTop: 0, marginBottom: '6px' }}>Define strict boundaries, safety rules, or things the agent MUST NOT do.</p>
                  <AISuggestInput 
                    value={guardrails} 
                    onChange={setGuardrails} 
                    fieldContext={`Safety guardrails for agent ${name}`} 
                    placeholder="e.g. # Guardrails\n- Never expose internal database passwords.\n- Do not perform destructive write actions without authorization..." 
                    rows={12}
                    style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', flexGrow: 1, resize: 'none' }}
                  />
                </div>
              </div>
            )}

            {/* Step 3: Review & Sandbox Test (1/3 and 2/3 Split) */}
            {wizardStep === 3 && (
              <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                
                {/* Left Column: Review Details (1/3 width) */}
                <div style={{ flex: '1 1 33.33%', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
                  <div className="review-card" style={{ margin: 0 }}>
                    <div className="review-section-title">Review Agent Details</div>

                    <div className="review-row">
                      <span className="review-label">Agent Name</span>
                      <span className="review-value">{name}</span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Role Title</span>
                      <span className="review-value">{role}</span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Status</span>
                      <span className="review-value">{isEnabled ? <span style={{ color: 'var(--accent-green)' }}>Enabled</span> : <span style={{ color: 'var(--text-muted)' }}>Disabled</span>}</span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Pipeline Skills</span>
                      <span className="review-value">
                        {assignedSkills.length === 0 ? (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No skills assigned</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {assignedSkills.map(s => (
                              <span key={s} className="badge badge-info" style={{ fontSize: '0.65rem' }}>{s}</span>
                            ))}
                          </div>
                        )}
                      </span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Instruction Outputs</span>
                      <span className="review-value" style={{ whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {instructionOutputs}
                      </span>
                    </div>

                    <div className="review-row">
                      <span className="review-label">Guardrails</span>
                      <span className="review-value" style={{ whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {guardrails || <em style={{ color: 'var(--text-muted)' }}>None defined</em>}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Sandbox Test Interface (2/3 width) */}
                <div style={{ flex: '2 2 66.67%', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(17, 24, 39, 0.9)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', minHeight: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                    <Play size={13} />
                    <span>Agent Execution Sandbox</span>
                  </div>

                  <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: 0 }}>
                    {/* Sub-Column 1: Chat interface */}
                    <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--border-color)', paddingRight: '1.25rem' }}>
                      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '6px', marginBottom: '10px' }}>
                        {chatHistory.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 1rem', fontSize: '0.8rem' }}>
                            <MessageSquare size={24} className="text-cyan" style={{ opacity: 0.3, marginBottom: '8px' }} />
                            <div>No messages yet. Send a test query to start a session.</div>
                          </div>
                        ) : (
                          chatHistory.map((m, idx) => (
                            <div key={idx} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                              <div style={{ 
                                backgroundColor: m.role === 'user' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                                color: m.role === 'user' ? '#fff' : (m.status === 'error' ? 'var(--accent-red)' : 'var(--text-secondary)'),
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '0.775rem',
                                border: m.role === 'agent' ? '1px solid var(--border-color)' : 'none',
                                whiteSpace: 'pre-wrap'
                              }}>
                                {m.content}
                              </div>
                            </div>
                          ))
                        )}
                        {testLoading && (
                          <div style={{ alignSelf: 'flex-start', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Agent is reasoning...
                          </div>
                        )}
                        <div ref={wizardChatEndRef} />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <input 
                          type="text"
                          className="form-control"
                          style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                          placeholder="Type test instruction..."
                          value={testQuery}
                          onChange={e => setTestQuery(e.target.value)}
                          disabled={testLoading}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !testLoading) {
                              handleRunTest();
                            }
                          }}
                        />
                        <button 
                          className="btn btn-primary" 
                          onClick={handleRunTest} 
                          disabled={testLoading || !testQuery.trim()}
                          style={{ padding: '0 16px', fontSize: '0.8rem' }}
                        >
                          Send
                        </button>
                      </div>
                    </div>

                    {/* Sub-Column 2: Live Trace Logs */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                        Live Trace Logs
                      </div>
                      <div className="terminal-window" style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', fontSize: '0.7rem', color: 'var(--accent-cyan)', fontFamily: 'monospace', backgroundColor: '#0f172a' }}>
                        <div>[INFO] Initializing Session for {name || 'Agent'}...</div>
                        {chatHistory.map((m, idx) => (
                          <div key={idx} style={{ marginTop: '6px' }}>
                            {m.role === 'user' ? (
                              <div style={{ color: '#fff' }}>[USER] {m.content}</div>
                            ) : (
                              <div>[AGENT] Responded with state: {m.status?.toUpperCase() || 'UNKNOWN'}</div>
                            )}
                          </div>
                        ))}
                        <div ref={wizardLogsEndRef} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>

            {/* Wizard Navigation */}
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
                  <span>{editingId ? 'Save Changes' : 'Register Agent'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Standalone Chat Modal */}
      {!isWizardOpen && activeChatAgent && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 7, 15, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
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
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MessageSquare size={18} className="text-cyan" />
                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Chat with {name}</span>
                <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{role}</span>
              </div>
              <button 
                onClick={() => setActiveChatAgent(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: '2fr 1fr', overflow: 'hidden' }}>
              {/* Chat Column */}
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border-color)', minHeight: 0 }}>
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(0,0,0,0.15)', minHeight: 0 }}>
                  {chatHistory.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '3rem', padding: '0 2rem' }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <Shield size={32} className="text-cyan" style={{ opacity: 0.5 }} />
                      </div>
                      <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', fontSize: '1.1rem' }}>Chat Interface: {name}</p>
                      <p style={{ fontStyle: 'italic', lineHeight: '1.5', fontSize: '0.9rem' }}>
                        I am your <strong>{role || 'General Assistant'}</strong>. 
                        {assignedSkills.length > 0 
                          ? ` I have been equipped with the following skills: ${assignedSkills.join(', ')}.` 
                          : ' I currently have no specific skills assigned.'}
                      </p>
                      <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>How can I help you today?</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                        {msg.role === 'agent' && (
                          <div className="agent-bubble" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                            <Cpu size={14} className="text-cyan" />
                          </div>
                        )}
                        <div style={{ 
                          backgroundColor: msg.role === 'user' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)', 
                          color: msg.role === 'user' ? '#fff' : (msg.status === 'error' ? 'var(--accent-red)' : 'var(--text-secondary)'),
                          padding: '10px 14px', borderRadius: '12px', fontSize: '0.85rem',
                          borderBottomRightRadius: msg.role === 'user' ? '2px' : '12px',
                          borderTopLeftRadius: msg.role === 'agent' ? '2px' : '12px',
                          border: msg.role === 'agent' ? (msg.status === 'error' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.05)') : 'none',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {msg.role === 'agent' && msg.status && (
                            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: msg.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: '6px', textTransform: 'uppercase' }}>
                              [{msg.status}] ReAct Engine
                            </div>
                          )}
                          {msg.content.split('**').map((part, index) => index % 2 === 1 ? <strong key={index} style={{ color: msg.role === 'agent' ? 'var(--text-primary)' : 'inherit' }}>{part}</strong> : part)}
                        </div>
                      </div>
                    ))
                  )}
                  {testLoading && (
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div className="agent-bubble" style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Settings size={14} className="text-cyan spin-animation" />
                      </div>
                      <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '12px', borderTopLeftRadius: '2px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Agent is reasoning and executing tools...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', backgroundColor: 'transparent', alignItems: 'flex-end' }}>
                  <textarea 
                    className="form-control"
                    placeholder="Ask a question or provide a task... (Press Ctrl+Enter to send)"
                    value={testQuery}
                    onChange={e => setTestQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !testLoading) {
                        e.preventDefault();
                        handleRunTest();
                      }
                    }}
                    rows={2}
                    style={{ 
                      flexGrow: 1,
                      resize: 'vertical',
                      minHeight: '44px',
                      maxHeight: '120px',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                    disabled={testLoading}
                  />
                  <button 
                    className="btn btn-primary" 
                    onClick={handleRunTest} 
                    disabled={testLoading || !testQuery.trim()}
                    style={{ height: '44px', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Play size={16} />
                    Send
                  </button>
                </div>
              </div>

              {/* Right Column: Persona & Logs */}
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capabilities</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '1rem' }}>
                    {assignedSkills.length > 0 ? assignedSkills.map(skill => (
                      <span key={skill} className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>{skill}</span>
                    )) : <span className="text-muted" style={{ fontSize: '0.75rem' }}>No skills assigned</span>}
                  </div>
                  
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Instructions</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                    {instructions || 'No specific instructions provided.'}
                  </div>
                </div>
                
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '0.75rem 1.5rem', backgroundColor: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    System Trace (Live Execution)
                  </div>
                  <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1rem 1.5rem', fontSize: '0.7rem', color: 'var(--accent-cyan)', fontFamily: 'monospace', backgroundColor: '#0f172a' }}>
                    <div>[INFO] Initializing Session for {name}...</div>
                    {chatHistory.map((msg, idx) => (
                      <div key={idx} style={{ marginTop: '8px' }}>
                        {msg.role === 'user' ? (
                          <div style={{ color: '#fff' }}>[USER] {msg.content}</div>
                        ) : (
                          <div>[AGENT] Responded with state: {msg.status?.toUpperCase() || 'UNKNOWN'}</div>
                        )}
                      </div>
                    ))}
                    <div ref={standaloneLogsEndRef} />
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
