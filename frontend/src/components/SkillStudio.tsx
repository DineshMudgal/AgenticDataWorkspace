import React, { useState, useEffect } from 'react';
import { 
  Brain, 
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
  Wrench,
  HelpCircle,
  Settings,
  MessageSquare
} from 'lucide-react';
import type { Skill, Tool, SkillParameter } from '../types';
import { ParameterBuilder } from './ParameterBuilder';
import { AISuggestInput } from './AISuggestInput';

export const SkillStudio: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
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
  const [instruction, setInstruction] = useState('');
  const [params, setParams] = useState<SkillParameter[]>([]);
  const [outputDef, setOutputDef] = useState('');
  const [assignedTools, setAssignedTools] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);

  // Test State (Inline)
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Quick Test Modal State (standalone, separate from edit wizard)
  const [quickTestModalOpen, setQuickTestModalOpen] = useState(false);
  const [quickTestSkill, setQuickTestSkill] = useState<Skill | null>(null);
  const [quickTestInputs, setQuickTestInputs] = useState<Record<string, string>>({});
  const [quickTestResult, setQuickTestResult] = useState<any>(null);
  const [quickTestLoading, setQuickTestLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [skRes, tlRes] = await Promise.all([
        fetch('/api/skills'),
        fetch('/api/tools')
      ]);
      if (skRes.ok) setSkills(await skRes.json());
      if (tlRes.ok) setTools(await tlRes.json());
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
    setDesc('');
    setInstruction('');
    setParams([]);
    setOutputDef('');
    setAssignedTools([]);
    setIsEnabled(true);
    setMsg(null);
    setWizardStep(1);
  };

  const handleOpenCreateWizard = () => {
    resetForm();
    setIsWizardOpen(true);
  };

  const handleEdit = (skill: Skill) => {
    setEditingId(skill.id);
    setName(skill.name);
    setDesc(skill.description || '');
    setInstruction(skill.instruction || '');
    let parsedParams: SkillParameter[] = [];
    try {
      parsedParams = typeof skill.parameters === 'string' ? JSON.parse(skill.parameters) : skill.parameters;
    } catch {
      parsedParams = [];
    }
    setParams(parsedParams || []);
    setOutputDef(skill.output_definition || '');
    
    // Parse assigned tools list
    let skTools: string[] = [];
    try {
      skTools = typeof skill.tools === 'string' ? JSON.parse(skill.tools) : skill.tools;
    } catch {
      skTools = skill.tools || [];
    }
    setAssignedTools(skTools || []);
    setIsEnabled(skill.is_enabled);
    setMsg(null);
    setWizardStep(1);
    setIsWizardOpen(true);
  };



  const handleNextStep = () => {
    if (wizardStep === 1) {
      if (!name.trim()) {
        setMsg({ type: 'error', text: 'Skill Name is required.' });
        return;
      }
      if (/\s/.test(name)) {
        setMsg({ type: 'error', text: 'Skill Name must not contain spaces.' });
        return;
      }
      setMsg(null);
    }
    if (wizardStep === 2) {
      if (!instruction.trim()) {
        setMsg({ type: 'error', text: 'Skill Instructions are required.' });
        return;
      }
      setMsg(null);
    }
    setWizardStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setWizardStep(prev => prev - 1);
  };

  const handleTest = (skill: Skill) => {
    handleEdit(skill);
    // Override the step 1 that was just set in handleEdit
    setWizardStep(3);
  };

  const handleToggleTool = (toolName: string) => {
    if (assignedTools.includes(toolName)) {
      setAssignedTools(assignedTools.filter(t => t !== toolName));
    } else {
      setAssignedTools([...assignedTools, toolName]);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setMsg(null);

    const payload = {
      name,
      description: desc,
      instruction,
      parameters: params,
      output_definition: outputDef,
      tools: assignedTools,
      is_enabled: isEnabled
    };

    try {
      const url = editingId ? `/api/skills/${editingId}` : '/api/skills';
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
        setMsg({ type: 'error', text: d.detail || 'Failed to save skill' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Network error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this skill configuration?')) return;
    try {
      const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStatus = async (skill: Skill) => {
    try {
      let parsedParams: SkillParameter[] = [];
      try {
        parsedParams = typeof skill.parameters === 'string' ? JSON.parse(skill.parameters) : skill.parameters;
      } catch {
        parsedParams = [];
      }
      let skTools: string[] = [];
      try {
        skTools = typeof skill.tools === 'string' ? JSON.parse(skill.tools) : skill.tools;
      } catch {
        skTools = skill.tools || [];
      }
      const res = await fetch(`/api/skills/${skill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: skill.name,
          description: skill.description,
          instruction: skill.instruction,
          parameters: parsedParams,
          tools: skTools,
          is_enabled: !skill.is_enabled
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Skill Testing handlers
  const handleRunTest = async () => {
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/skills/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instruction,
          tools: assignedTools,
          inputs: testInputs
        })
      });
      if (res.ok) {
        setTestResult(await res.json());
      } else {
        const errorData = await res.json();
        setTestResult({
          status: 'error',
          output: errorData.detail || 'Failed to execute skill.'
        });
      }
    } catch (e) {
      setTestResult({
        status: 'error',
        output: 'Network connection failed during execution.'
      });
    } finally {
      setTestLoading(false);
    }
  };

  // Auto-scroll chat history window
  React.useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSendChatMessage = async (customMessage?: string) => {
    if (!quickTestSkill) return;
    const textToSend = customMessage !== undefined ? customMessage : chatInput;
    if (!textToSend.trim()) return;

    setQuickTestLoading(true);
    
    // Add user message to history
    const newUserMessage = { role: 'user' as const, content: textToSend };
    const updatedHistory = [...chatMessages, newUserMessage];
    setChatMessages(updatedHistory);
    if (customMessage === undefined) {
      setChatInput('');
    }

    // Parse tools list
    let skTools: string[] = [];
    try {
      skTools = typeof quickTestSkill.tools === 'string' ? JSON.parse(quickTestSkill.tools) : quickTestSkill.tools;
    } catch {
      skTools = quickTestSkill.tools || [];
    }

    try {
      const historyPayload = updatedHistory.map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/skills/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: quickTestSkill.instruction,
          tools: skTools,
          inputs: quickTestInputs,
          history: historyPayload
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'success') {
          setChatMessages(prev => [...prev, { role: 'model', content: data.output }]);
        } else {
          setChatMessages(prev => [...prev, { role: 'model', content: `Error: ${data?.output || 'Failed to execute skill.'}` }]);
        }
      } else {
        const errorData = await res.json();
        setChatMessages(prev => [...prev, { role: 'model', content: `Error: ${errorData.detail || 'Server error.'}` }]);
      }
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'model', content: 'Connection failed.' }]);
    } finally {
      setQuickTestLoading(false);
    }
  };

  const startInitialChat = () => {
    const paramLines = Object.entries(quickTestInputs)
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join('\n');
    const msg = `Please execute this skill with the following initial input parameters:\n${paramLines || '_No parameters provided_'}`;
    handleSendChatMessage(msg);
  };

  const filteredSkills = skills.filter(skill => {
    const q = searchQuery.toLowerCase();
    return (
      skill.name.toLowerCase().includes(q) ||
      (skill.description || '').toLowerCase().includes(q) ||
      (skill.instruction || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Brain size={22} /></div>
          <div>
            <h1 className="page-title">Skill Studio</h1>
            <p className="page-subtitle">Configure plain-English AI rules, link execution tools, and map parameters</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 12px' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search skills..." 
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
            <span>Create Skill</span>
          </button>
        </div>
      </div>

      {/* Grid of Skill Cards */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Settings size={30} className="spin-animation text-cyan" />
          <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading Registered Skills...</p>
        </div>
      ) : (
        <div className="card-grid-2">
          {filteredSkills.map(skill => {
            let parsedParams: SkillParameter[] = [];
            try {
              parsedParams = typeof skill.parameters === 'string' ? JSON.parse(skill.parameters) : skill.parameters;
            } catch {
              parsedParams = [];
            }
            let skTools: string[] = [];
            try {
              skTools = typeof skill.tools === 'string' ? JSON.parse(skill.tools) : skill.tools;
            } catch {
              skTools = skill.tools || [];
            }

            return (
              <div key={skill.id} className={`card ${!skill.is_enabled ? 'opacity-60' : ''}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '240px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent-blue)', fontSize: '1rem' }}>{skill.name}</span>
                      {!skill.is_enabled && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>DISABLED</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => toggleStatus(skill)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title={skill.is_enabled ? 'Disable' : 'Enable'}
                      >
                        {skill.is_enabled ? <ToggleRight className="text-green" size={16} /> : <ToggleLeft className="text-muted" size={16} />}
                      </button>
                      <button 
                        onClick={() => handleEdit(skill)} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 6px' }}
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        onClick={() => handleDelete(skill.id)} 
                        className="btn btn-danger" 
                        style={{ padding: '4px 6px' }}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.4' }}>
                    {skill.description || 'No description provided.'}
                  </p>

                  <div style={{ marginTop: '0.75rem', backgroundColor: '#05070f', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', maxHeight: '70px', overflowY: 'auto' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Instructions</span>
                    <p style={{ fontSize: '0.75rem', color: '#e2e8f0', margin: 0, whiteSpace: 'pre-wrap' }}>{skill.instruction}</p>
                  </div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  {/* Parameter Tags */}
                  {parsedParams && parsedParams.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '0.5rem' }}>
                      {parsedParams.map((p, i) => (
                        <span key={i} className="param-tag" style={{ fontSize: '0.65rem' }}>
                          {p.name}: {p.type}{p.required ? ' *' : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tool constraints or autonomous choice */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
                    <Wrench size={12} className="text-cyan" />
                    {skTools && skTools.length > 0 ? (
                      <span style={{ color: 'var(--text-secondary)' }}>
                        <strong>Restricted Tools:</strong> {skTools.join(', ')}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--accent-green)', fontStyle: 'italic' }}>
                        Autonomous Selection (All active tools)
                      </span>
                    )}
                  </div>

                  <button 
                    onClick={() => {
                        const initialInputs: Record<string, string> = {};
                        let parsedParams: SkillParameter[] = [];
                        try {
                          parsedParams = typeof skill.parameters === 'string' ? JSON.parse(skill.parameters) : skill.parameters;
                        } catch {}
                        parsedParams.forEach(p => {
                          initialInputs[p.name] = '';
                        });
                        setQuickTestInputs(initialInputs);
                        setQuickTestResult(null);
                        setChatMessages([]);
                        setChatInput('');
                        setQuickTestSkill(skill);
                        setQuickTestModalOpen(true);
                      }}
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '8px' }}
                    disabled={!skill.is_enabled}
                  >
                    <MessageSquare size={16} />
                    <span>Test & Chat</span>
                  </button>
                </div>
              </div>
            );
          })}

          {filteredSkills.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              No skills match your search criteria. Create a new skill to get started.
            </div>
          )}
        </div>
      )}
      </div>

      {/* Multistep Create/Edit Wizard Modal */}
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

            <div className="card-header" style={{ marginBottom: '1rem' }}>
              <Plus size={16} className="text-cyan" />
              <span>{editingId ? 'Edit Skill Wizard' : 'Create Skill Wizard'}</span>
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

            {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: '1rem', flexShrink: 0 }}>{msg.text}</div>}

            <div style={{ flexGrow: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Step 1: Details & Tool Selection */}
              {wizardStep === 1 && (
                <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                  {/* Left Column: Details */}
                  <div className="form-stack" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
                    <div className="form-group" style={{ flexShrink: 0 }}>
                      <label className="form-label">Skill Name <span className="required">*</span></label>
                      <AISuggestInput 
                        value={name} 
                        onChange={setName} 
                        fieldContext="skill name" 
                        placeholder="e.g. MapDataSchema (no spaces)" 
                      />
                      <p className="form-hint">Must not contain any spaces. Format using PascalCase.</p>
                    </div>

                    <div className="form-group" style={{ flexShrink: 0 }}>
                      <label className="form-label">Short Description</label>
                      <AISuggestInput 
                        value={desc} 
                        onChange={setDesc} 
                        fieldContext="skill description" 
                        placeholder="Briefly describe what this skill accomplishes..." 
                        rows={4}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem', flexShrink: 0 }}>
                      <input 
                        type="checkbox" 
                        id="skill-enabled-check"
                        checked={isEnabled} 
                        onChange={e => setIsEnabled(e.target.checked)} 
                      />
                      <label htmlFor="skill-enabled-check" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                        Enable this skill for active agents
                      </label>
                    </div>
                  </div>

                  {/* Right Column: Tool Assignment */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Wrench size={13} />
                      <span>Associate Tooling Constraints</span>
                    </div>

                    <div className="info-box" style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
                      Select tools this skill is allowed to use. If empty, the agent decides dynamically.
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {tools.map(tool => (
                        <div key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px', borderRadius: '4px', cursor: 'pointer', backgroundColor: assignedTools.includes(tool.name) ? 'rgba(56, 189, 248, 0.05)' : 'transparent' }} onClick={() => handleToggleTool(tool.name)}>
                          <input 
                            type="checkbox"
                            checked={assignedTools.includes(tool.name)}
                            onChange={() => {}} 
                            style={{ cursor: 'pointer' }}
                          />
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {tool.name} <span className="badge badge-info" style={{ fontSize: '0.6rem', padding: '2px 4px' }}>{tool.type.toUpperCase()}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tool.description || 'No description.'}</div>
                          </div>
                        </div>
                      ))}
                      {tools.length === 0 && <div className="text-muted" style={{ padding: '10px', fontSize: '0.8rem' }}>No registered tools available.</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Instructions & Parameters (1/3 and 2/3 Split) */}
              {wizardStep === 2 && (
                <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                  {/* Left Column: Parameter Schema (1/3 width) */}
                  <div style={{ flex: '1 1 33.33%', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Settings size={13} />
                      <span>Input Parameter Schema</span>
                    </div>
                    <div className="info-box" style={{ marginBottom: '0.5rem', flexShrink: 0 }}>
                      Define required inputs/parameters for the reasoning engine.
                    </div>
                    <ParameterBuilder parameters={params} onChange={setParams} />
                  </div>

                  {/* Right Column: Plain-English Instructions & Expected Output (2/3 width) */}
                  <div style={{ flex: '2 2 66.67%', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'hidden', minHeight: 0 }}>
                    {/* Top: Instructions */}
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', flex: 1.2, margin: 0, minHeight: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Markdown / English Instructions <span className="required">*</span></label>
                      <p className="form-hint" style={{ marginTop: 0, marginBottom: '6px' }}>Provide clear step-by-step instructions to guide the AI when reasoning.</p>
                      <AISuggestInput 
                        value={instruction} 
                        onChange={setInstruction} 
                        fieldContext={`Instructions for the skill "${name}" that does "${desc}"`} 
                        placeholder="E.g. # Star Schema Instruction\n1. Identify fact tables\n2. Enforce primary key uniqueness constraints..." 
                        rows={8}
                        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', flexGrow: 1, resize: 'none' }}
                      />
                    </div>

                    {/* Bottom: Expected Output Definition */}
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', flex: 1, margin: 0, minHeight: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Expected Output Definition</label>
                      <p className="form-hint" style={{ marginTop: 0, marginBottom: '6px' }}>Define the exact output format or schema constraints the skill must yield.</p>
                      <AISuggestInput 
                        value={outputDef} 
                        onChange={setOutputDef} 
                        fieldContext={`Expected JSON output or action for the skill "${name}" that does "${desc}"`} 
                        placeholder="E.g. Expects a JSON array with formatted user records." 
                        rows={5}
                        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', flexGrow: 1, resize: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Review & Test (1/3 and 2/3 Split) */}
              {wizardStep === 3 && (
                <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0, paddingBottom: '0.5rem' }}>
                  
                  {/* Left Column: Review Details (1/3 width) */}
                  <div style={{ flex: '1 1 33.33%', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
                    <div className="review-card" style={{ margin: 0 }}>
                      <div className="review-section-title">Review Skill Details</div>

                      <div className="review-row">
                        <span className="review-label">Skill Name</span>
                        <span className="review-value">{name}</span>
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
                        <span className="review-label">Assigned Tools</span>
                        <span className="review-value">
                          {assignedTools.length === 0 ? (
                            <span style={{ color: 'var(--accent-green)', fontStyle: 'italic' }}>Autonomous Selection</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {assignedTools.map(t => (
                                <span key={t} className="badge badge-info" style={{ fontSize: '0.65rem' }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </span>
                      </div>

                      <div className="review-row">
                        <span className="review-label">Parameters</span>
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
                        <span className="review-label">Instructions</span>
                        <span className="review-value" style={{ whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {instruction}
                        </span>
                      </div>

                      <div className="review-row">
                        <span className="review-label">Expected Output</span>
                        <span className="review-value" style={{ whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {outputDef || <em style={{ color: 'var(--text-muted)' }}>None</em>}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Execution Testing (2/3 width) */}
                  <div style={{ flex: '2 2 66.67%', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(17, 24, 39, 0.9)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', minHeight: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
                      <Play size={13} />
                      <span>Execution Sandbox Testing</span>
                    </div>

                    <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: 0 }}>
                      {/* Sub-Column 1: Inputs */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          1. Test Inputs
                        </div>

                        {params.length === 0 ? (
                          <div className="info-box">No parameters required.</div>
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
                          style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.8rem' }}
                        >
                          <Play size={14} />
                          {testLoading ? 'Executing...' : 'Run Test'}
                        </button>
                      </div>

                      {/* Sub-Column 2: Output Result */}
                      <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          2. Output Result
                        </div>

                        <div className="terminal-window" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', flexShrink: 0 }}>
                            <span style={{ color: testResult?.status === 'success' ? 'var(--accent-green)' : (testResult?.status === 'error' ? 'var(--accent-red)' : 'var(--text-muted)'), fontWeight: 700, fontSize: '0.7rem' }}>
                              {testResult ? testResult.status.toUpperCase() : 'PENDING'}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Engine: Gemini ReAct</span>
                          </div>

                          <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', fontSize: '0.75rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)' }}>
                            {testResult ? testResult.output : <em style={{ color: 'var(--text-muted)' }}>Execution trace will appear here...</em>}
                          </div>
                        </div>
                      </div>

                      {/* Sub-Column 3: System Logs */}
                      <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          3. System Logs
                        </div>

                        <div className="terminal-window" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#0f172a' }}>
                          <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>Live Trace Logs</span>
                          </div>
                          <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', fontSize: '0.7rem', color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>
                            {testResult ? (
                              <>
                                <div>[INFO] Initializing Skill Sandbox...</div>
                                <div>[INFO] Request Inputs: {JSON.stringify(testInputs)}</div>
                                <div>[INFO] Assigned Tools: {assignedTools.length > 0 ? assignedTools.join(', ') : 'None'}</div>
                                <div>[INFO] Transmitting payload to Agent Engine...</div>
                                <div style={{ color: testResult.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)', marginTop: '8px' }}>
                                  [{testResult.status.toUpperCase()}] Execution sequence completed.
                                </div>
                              </>
                            ) : (
                              <em style={{ color: 'var(--text-muted)' }}>Execution logs will appear here...</em>
                            )}
                          </div>
                        </div>
                      </div>
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
                  <span>{editingId ? 'Save Changes' : 'Register Skill'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Standalone Quick Test Modal */}
      {quickTestModalOpen && quickTestSkill && (() => {
        let qtParams: SkillParameter[] = [];
        try {
          qtParams = typeof quickTestSkill.parameters === 'string' ? JSON.parse(quickTestSkill.parameters) : quickTestSkill.parameters;
        } catch {}
        qtParams = qtParams || [];

        let skTools: string[] = [];
        try {
          skTools = typeof quickTestSkill.tools === 'string' ? JSON.parse(quickTestSkill.tools) : quickTestSkill.tools;
        } catch {
          skTools = quickTestSkill.tools || [];
        }

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
                  <MessageSquare size={18} className="text-cyan" />
                  <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Chat with {quickTestSkill.name}</span>
                  <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Skill Studio</span>
                </div>
                <button 
                  onClick={() => setQuickTestModalOpen(false)} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: '2fr 1fr', overflow: 'hidden' }}>
                {/* Chat Column */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border-color)', minHeight: 0 }}>
                  <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(0,0,0,0.15)', minHeight: 0 }}>
                    {chatMessages.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '3rem', padding: '0 2rem' }}>
                        <div style={{ marginBottom: '1rem' }}>
                          <Brain size={32} className="text-cyan" style={{ opacity: 0.5 }} />
                        </div>
                        <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', fontSize: '1.1rem' }}>Chat Test Sandbox: {quickTestSkill.name}</p>
                        <p style={{ fontStyle: 'italic', lineHeight: '1.5', fontSize: '0.9rem' }}>
                          {quickTestSkill.description || 'Interactive testing conversation'}
                        </p>
                        <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Provide parameters on the right to set up the execution state, then type below or run to test the skill.
                        </p>
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          <div style={{
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                            textAlign: msg.role === 'user' ? 'right' : 'left',
                            fontWeight: 600,
                            textTransform: 'uppercase'
                          }}>
                            {msg.role === 'user' ? 'USER' : `SKILL ENGINE: ${quickTestSkill.name}`}
                          </div>
                          <div style={{
                            padding: '0.8rem 1rem',
                            borderRadius: '12px',
                            borderTopRightRadius: msg.role === 'user' ? '2px' : '12px',
                            borderTopLeftRadius: msg.role === 'user' ? '12px' : '2px',
                            backgroundColor: msg.role === 'user' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                            border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.05)',
                            color: msg.role === 'user' ? '#fff' : 'var(--text-secondary)',
                            fontSize: '0.85rem',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input Chat Box */}
                  <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', backgroundColor: 'transparent' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Type your message to test skill execution..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      disabled={quickTestLoading}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          handleSendChatMessage();
                        }
                      }}
                      style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => handleSendChatMessage()}
                      disabled={quickTestLoading || !chatInput.trim()}
                      style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>Send</span>
                      <Play size={12} />
                    </button>
                  </div>
                </div>

                {/* Right Column: Configuration & Telemetry */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1.0rem', overflowY: 'auto', flexGrow: 1, minHeight: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.75rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)' }}>
                      <Settings size={12} />
                      <span>Configuration Inputs</span>
                    </div>

                    {qtParams.length === 0 ? (
                      <div className="info-box" style={{ fontSize: '0.8rem' }}>No input parameters required for this skill.</div>
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
                              disabled={chatMessages.length > 0}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Linked Tools</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {skTools.length > 0 ? skTools.join(', ') : 'All active tools (Autonomous)'}
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                      {chatMessages.length === 0 ? (
                        <button 
                          className="btn btn-primary" 
                          onClick={startInitialChat} 
                          disabled={quickTestLoading}
                          style={{ fontSize: '0.8rem', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}
                        >
                          <Play size={14} />
                          {quickTestLoading ? 'Executing...' : 'Run Skill (Send Parameters)'}
                        </button>
                      ) : (
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => {
                            setChatMessages([]);
                            setChatInput('');
                          }}
                          style={{ fontSize: '0.8rem', padding: '8px 12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <Trash2 size={13} className="text-muted" />
                          <span>Reset Conversation</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Telemetry Logs section */}
                  <div style={{ display: 'flex', flexDirection: 'column', height: '220px', borderTop: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1.5rem', backgroundColor: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      Telemetry Logs
                    </div>
                    <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1rem 1.5rem', fontSize: '0.7rem', color: 'var(--accent-cyan)', fontFamily: 'monospace', backgroundColor: '#0f172a' }}>
                      {quickTestLoading ? (
                        <>
                          <div>[INFO] Transmitting chat sequence message payload...</div>
                          <div>[INFO] Link Tools: {skTools.length > 0 ? skTools.join(', ') : 'None'}</div>
                          <div style={{ color: 'var(--text-muted)' }}>[INFO] Waiting for agent reaction loop to complete...</div>
                        </>
                      ) : chatMessages.length > 0 ? (
                        <>
                          <div>[INFO] Conversation Active (History size: {chatMessages.length} messages)</div>
                          <div>[INFO] Sandbox Execution trace fully updated. Ready for next query.</div>
                        </>
                      ) : (
                        <em style={{ color: 'var(--text-muted)' }}>Waiting for chat session to start...</em>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
