import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Send, Bot, User, CheckSquare, Square, BookOpen, MessageCircle } from 'lucide-react';

const FAQ = [
  { q: 'What is AgenticDataWorkspace?', a: 'AgenticDataWorkspace is an AI-powered data engineering platform that uses a team of specialized LangGraph agents to automate the full lifecycle of building Databricks data pipelines — from requirements gathering to deployed PySpark code.' },
  { q: 'How do I start my first pipeline?', a: '1. Register a Data Product (a business domain). 2. Create a Data Project under it with your Databricks workspace settings. 3. Go to Studio Workbench, select the project, and click "Trigger Multi-Agent". The AI agents will guide you through the rest.' },
  { q: 'What are Data Products vs Data Projects?', a: 'A Data Product is a high-level business domain (e.g. "Finance"). A Data Project is a specific engineering project inside that domain (e.g. "ERP Migration"). Projects inherit the catalog and schema settings you configure.' },
  { q: 'What are Skills in Tool Studio?', a: 'Skills are plain-English instructions you teach to agents. Each skill defines what the agent should do and what input parameters it needs. Agents execute skills when they run their stage of the pipeline.' },
  { q: 'What does "Blocked" status mean?', a: 'When a workflow is Blocked, an agent has paused because it needs more information from you. The Studio Workbench will show the missing parameters — just fill them in and click "Submit & Resume".' },
  { q: 'How does AI Suggest work on input fields?', a: 'Fields marked with a ✨ sparkle icon provide AI-powered suggestions as you type. After 2+ characters, suggestions appear in a dropdown. Press Tab or click a suggestion to accept it.' },
  { q: 'Where are generated artifacts stored?', a: 'All generated artifacts (schemas, specifications, PySpark code) are stored in the database and visible in the Artifact Nexus tab, organized by project.' },
  { q: 'Can I reset a workflow?', a: 'Yes. In Studio Workbench, select your project and click the "Reset" button. This clears all agent state and deletes generated artifacts for that project so you can start fresh.' },
  { q: 'How do I connect to my real Databricks workspace?', a: 'In Data Projects, open your project settings and enter your Databricks workspace URL, Unity Catalog name, schema, and table prefix. These values will be used in all generated PySpark code.' },
  { q: 'Is there a way to see agent reasoning?', a: 'Yes — the Studio Workbench shows a live "Reasoning Execution Console" with step-by-step logs from each agent. For full audit trails, visit the Observability & Logs tab.' },
];

const ONBOARDING = [
  { id: 'product', label: 'Register your first Data Product', link: 'products' },
  { id: 'project', label: 'Create a Data Project with Databricks settings', link: 'projects' },
  { id: 'skill', label: 'Author at least one skill in Tool Studio', link: 'tools' },
  { id: 'workflow', label: 'Trigger your first multi-agent workflow', link: 'studio' },
  { id: 'artifact', label: 'Review generated artifacts in Artifact Nexus', link: 'nexus' },
  { id: 'logs', label: 'Inspect agent logs in Observability', link: 'observability' },
];

interface ChatMsg { role: 'user' | 'bot'; text: string; }

const botReply = (q: string): string => {
  const lower = q.toLowerCase();
  const match = FAQ.find(f => f.q.toLowerCase().split(' ').some(w => w.length > 4 && lower.includes(w)));
  if (match) return match.a;
  if (lower.includes('hello') || lower.includes('hi')) return 'Hello! I\'m the AgenticDataWorkspace assistant. Ask me anything about how to use the platform.';
  if (lower.includes('agent')) return 'The platform uses 7 specialized agents: Requirement Gathering, Discovery, Data Modelling, Spec Creation, Pipeline Generation, Pipeline Running, and Testing Agent — all coordinated by a Supervisor.';
  if (lower.includes('databricks')) return 'Databricks settings (URL, catalog, schema, prefix) are configured per-project in the Data Projects tab. All generated code uses these values automatically.';
  return 'I\'m not sure about that specific question. Try browsing the FAQ above, or check the documentation at /docs/USER_GUIDE.md in your project.';
};

interface Props { onNavigate?: (tab: string) => void; }

export const HelpCenter: React.FC<Props> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'faq' | 'chat' | 'onboarding'>('onboarding');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: 'bot', text: 'Hi! I\'m your AgenticDataWorkspace guide. Ask me anything — about agents, workflows, skills, or how to get started!' }]);
  const [input, setInput] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMsg = () => {
    if (!input.trim()) return;
    const userMsg: ChatMsg = { role: 'user', text: input };
    const reply: ChatMsg = { role: 'bot', text: botReply(input) };
    setMessages(prev => [...prev, userMsg, reply]);
    setInput('');
  };

  const toggle = (id: string) => setChecked(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const progress = Math.round((checked.size / ONBOARDING.length) * 100);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-icon"><HelpCircle size={22} /></div>
        <div>
          <h1 className="page-title">Help & Onboarding</h1>
          <p className="page-subtitle">Get started quickly, find answers, and chat with your AI guide</p>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'onboarding' ? 'active' : ''}`} onClick={() => setActiveTab('onboarding')}><BookOpen size={15} /> Getting Started</button>
        <button className={`tab-btn ${activeTab === 'faq' ? 'active' : ''}`} onClick={() => setActiveTab('faq')}><HelpCircle size={15} /> FAQ</button>
        <button className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}><MessageCircle size={15} /> AI Guide Chat</button>
      </div>

      {activeTab === 'onboarding' && (
        <div className="two-col-layout" style={{ '--col-ratio': '3 2' } as React.CSSProperties}>
          <div className="card">
            <div className="card-header"><BookOpen size={16} className="text-cyan" /><span>Onboarding Checklist</span></div>
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                <span>{checked.size} of {ONBOARDING.length} steps completed</span>
                <span>{progress}%</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))', borderRadius: '3px', transition: 'width 0.4s ease' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {ONBOARDING.map((item, i) => (
                <div key={item.id} className={`card card-compact card-selectable ${checked.has(item.id) ? 'selected' : ''}`} onClick={() => toggle(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  {checked.has(item.id) ? <CheckSquare size={18} style={{ color: 'var(--accent-green)', flexShrink: 0 }} /> : <Square size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: '0.875rem', color: checked.has(item.id) ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: checked.has(item.id) ? 'line-through' : 'none' }}>
                      Step {i + 1}: {item.label}
                    </span>
                  </div>
                  {onNavigate && !checked.has(item.id) && (
                    <button className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '3px 10px', flexShrink: 0 }} onClick={e => { e.stopPropagation(); onNavigate(item.link); }}>Go →</button>
                  )}
                </div>
              ))}
            </div>
            {progress === 100 && (
              <div className="alert alert-success" style={{ marginTop: '1rem' }}>🎉 All onboarding steps complete! You're ready to run your first AI pipeline.</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card card-compact">
              <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--accent-cyan)' }}>Quick Reference</div>
              {[
                { label: 'Data Products', desc: 'High-level business domains that group related projects' },
                { label: 'Data Projects', desc: 'Specific engineering projects with Databricks settings' },
                { label: 'Tool Studio', desc: 'Author plain-English skills and assign them to agents' },
                { label: 'Studio Workbench', desc: 'Trigger and monitor multi-agent LangGraph workflows' },
                { label: 'Artifact Nexus', desc: 'Browse and export all AI-generated schemas and code' },
                { label: 'Observability', desc: 'Full audit trail of every agent action and log' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '0.5rem 0', borderBottom: i < 5 ? '1px solid var(--border-color)' : 'none' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'faq' && (
        <div className="card" style={{ maxWidth: '800px' }}>
          <div className="card-header"><HelpCircle size={16} className="text-cyan" /><span>Frequently Asked Questions</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{ borderBottom: i < FAQ.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', background: 'none', border: 'none', padding: '1rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '1rem', textAlign: 'left' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{item.q}</span>
                  {openFaq === i ? <ChevronUp size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                </button>
                {openFaq === i && (
                  <div style={{ padding: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="card" style={{ maxWidth: '720px', display: 'flex', flexDirection: 'column', height: '600px' }}>
          <div className="card-header"><Bot size={16} className="text-cyan" /><span>AI Guide</span><span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--accent-green)' }}>● Online</span></div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.25rem 0 1rem' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: m.role === 'bot' ? 'rgba(56,189,248,0.15)' : 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {m.role === 'bot' ? <Bot size={14} style={{ color: 'var(--accent-cyan)' }} /> : <User size={14} style={{ color: 'var(--accent-purple)' }} />}
                </div>
                <div style={{ maxWidth: '78%', padding: '0.65rem 0.9rem', borderRadius: m.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px', background: m.role === 'bot' ? 'rgba(255,255,255,0.04)' : 'rgba(139,92,246,0.1)', border: '1px solid var(--border-color)', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEnd} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
            <input className="form-control" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()} placeholder="Ask anything about the platform..." style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={sendMsg} disabled={!input.trim()} style={{ padding: '0.5rem 0.9rem' }}><Send size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
};
