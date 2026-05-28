import React, { useEffect, useState } from 'react';
import { Activity, Clock, Search, X, CheckCircle2, AlertTriangle, PlayCircle } from 'lucide-react';
import type { DataProject, Workflow, ActiveTab } from '../types';

interface AgentHistoryProps {
  projects: DataProject[];
  setSelectedProjectId: (id: number | null) => void;
  onNavigate: (tab: ActiveTab) => void;
  isEmbedded?: boolean;
}

export const AgentHistory: React.FC<AgentHistoryProps> = ({ projects, setSelectedProjectId, onNavigate, isEmbedded }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchWorkflows = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/workflows');
        if (res.ok) setWorkflows(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkflows();
  }, []);

  const historyWorkflows = workflows
    .filter(w => w.status !== 'Idle' || w.last_run_at)
    .filter(w => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const proj = projects.find(p => p.id === w.data_project_id);
      return w.name.toLowerCase().includes(q) || (proj?.name || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const dateA = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
      const dateB = b.last_run_at ? new Date(b.last_run_at).getTime() : 0;
      return dateB - dateA;
    });

  const content = (
    <>
      {!isEmbedded && (
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="page-header-icon"><Activity size={22} /></div>
            <div>
              <h1 className="page-title">Execution History</h1>
              <p className="page-subtitle">Global audit log of all orchestrated pipeline executions and their statuses.</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 12px' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search history..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', padding: '4px 0', fontSize: '0.85rem', color: 'var(--text-primary)', width: '250px', outline: 'none' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card card-compact" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{workflows.length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Registered Pipelines</div>
        </div>
        <div className="card card-compact" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-green)' }}>{workflows.filter(w => w.status === 'Completed').length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Successful Executions</div>
        </div>
        <div className="card card-compact" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-amber)' }}>{workflows.filter(w => w.status === 'Running' || w.status === 'Blocked').length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>In-Progress / Blocked</div>
        </div>
        <div className="card card-compact" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{historyWorkflows.length}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Logged Runs</div>
        </div>
      </div>

      <div className="card" style={{ padding: '0', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} className="text-purple" />
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>Global Orchestration Ledger</span>
        </div>
        
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading ledger data...</div>
        ) : historyWorkflows.length > 0 ? (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pipeline Name</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Workspace</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Node</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Last Execution</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyWorkflows.map(wf => {
                  const project = projects.find(p => p.id === wf.data_project_id);
                  return (
                    <tr key={wf.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge ${wf.status === 'Completed' ? 'badge-success' : wf.status === 'Blocked' ? 'badge-warning' : wf.status === 'Failed' ? 'badge-error' : 'badge-info'}`}>
                          {wf.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {wf.name}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {project?.name || `Project ID ${wf.data_project_id}`}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {wf.current_agent ? wf.current_agent.split(' ')[0] : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {wf.last_run_at ? new Date(wf.last_run_at).toLocaleString() : 'Never'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => {
                            setSelectedProjectId(wf.data_project_id);
                            onNavigate('orchestration');
                          }}
                        >
                          <PlayCircle size={14} /> View Traces
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Activity size={32} style={{ margin: '0 auto 10px auto', opacity: 0.3 }} />
            <p>No workflows have been executed yet.</p>
          </div>
        )}
      </div>
    </>
  );

  if (isEmbedded) {
    return <div style={{ width: '100%' }}>{content}</div>;
  }

  return <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>{content}</div>;
};
