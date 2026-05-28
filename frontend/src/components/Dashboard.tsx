import React, { useEffect, useState } from 'react';
import { 
  Briefcase, 
  Layers, 
  Settings, 
  Cpu, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  PlayCircle,
  Wrench,
  Calendar,
  Share2,
  Clock,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';
import type { DataProduct, DataProject, Workflow, ActiveTab } from '../types';

interface DashboardProps {
  products: DataProduct[];
  projects: DataProject[];
  onNavigate: (tab: ActiveTab) => void;
  setSelectedProjectId: (id: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  products, 
  projects, 
  onNavigate,
  setSelectedProjectId
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [artifactCount, setArtifactCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [wfRes, artRes] = await Promise.all([
        fetch('/api/workflows'),
        fetch('/api/artifacts')
      ]);
      
      if (wfRes.ok) {
        const wfData = await wfRes.json();
        setWorkflows(wfData);
      }
      
      if (artRes.ok) {
        const artData = await artRes.json();
        setArtifactCount(artData.length);
      }
    } catch (e) {
      console.error("Dashboard fetch error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projects]);

  // Compute stats
  const activeSchedules = workflows.filter(w => w.schedule_enabled).length;
  const blockedWorkflows = workflows.filter(w => w.status === 'Blocked');
  const recentWorkflows = [...workflows]
    .filter(w => w.status !== 'Idle' || w.last_run_at)
    .sort((a, b) => {
      const dateA = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
      const dateB = b.last_run_at ? new Date(b.last_run_at).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Cpu size={22} /></div>
          <div>
            <h1 className="page-title">Workspace Dashboard</h1>
            <p className="page-subtitle">Command Center for Agentic Pipeline Operations</p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin-animation" : ""} /> Refresh
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Priority Action Required */}
      {blockedWorkflows.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent-amber)', backgroundColor: 'rgba(245, 158, 11, 0.05)', marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <AlertTriangle size={24} className="text-amber" style={{ marginTop: '2px' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Action Required: Interrupted Pipelines</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {blockedWorkflows.length} workflow{blockedWorkflows.length > 1 ? 's are' : ' is'} currently blocked awaiting human input or mandatory parameters.
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {blockedWorkflows.map(bw => (
                    <button 
                      key={bw.id}
                      className="btn btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: 'var(--accent-amber)', color: '#000', borderColor: 'var(--accent-amber)' }}
                      onClick={() => {
                        setSelectedProjectId(bw.data_project_id);
                        onNavigate('orchestration');
                      }}
                    >
                      Resolve {bw.name} <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Hub */}
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PlayCircle size={16} /> Quick Actions
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          
          <div className="card card-compact card-selectable" onClick={() => onNavigate('workflows')} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.25rem' }}>
            <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '10px', borderRadius: '8px', color: 'var(--accent-blue)' }}>
              <Cpu size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Design Pipeline</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Workflow Studio</div>
            </div>
          </div>

          <div className="card card-compact card-selectable" onClick={() => onNavigate('skills')} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.25rem' }}>
            <div style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', padding: '10px', borderRadius: '8px', color: 'var(--accent-purple)' }}>
              <Wrench size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Manage Skills</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Skill Studio</div>
            </div>
          </div>

          <div className="card card-compact card-selectable" onClick={() => onNavigate('orchestration')} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.25rem' }}>
            <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '8px', color: 'var(--accent-green)' }}>
              <Calendar size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Configure Schedules</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Orchestration Studio</div>
            </div>
          </div>

          <div className="card card-compact card-selectable" onClick={() => onNavigate('nexus')} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1.25rem' }}>
            <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '10px', borderRadius: '8px', color: 'var(--accent-amber)' }}>
              <Share2 size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Browse Artifacts</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Artifact Nexus</div>
            </div>
          </div>

        </div>
      </div>

      <div className="two-col-layout">
        {/* Global Telemetry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={16} /> Global Telemetry
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div className="card card-compact" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>{products.length}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={12} /> Data Products</div>
            </div>
            <div className="card card-compact" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-green)' }}>{activeSchedules}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> Active Schedules</div>
            </div>
            <div className="card card-compact" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-amber)' }}>{blockedWorkflows.length}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={12} /> Blocked Ops</div>
            </div>
            <div className="card card-compact" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-purple)' }}>{artifactCount}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Share2 size={12} /> Generated Artifacts</div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} /> Recent Activity
            </h3>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
              onClick={() => onNavigate('history')}
            >
              View Full Ledger
            </button>
          </div>

          <div className="card" style={{ padding: 0, flex: 1 }}>
            {recentWorkflows.length === 0 ? (
              <div className="empty-panel" style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Clock size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <span style={{ fontSize: '0.85rem' }}>No recent orchestrated activity.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recentWorkflows.map((wf, idx) => {
                  const proj = projects.find(p => p.id === wf.data_project_id);
                  return (
                    <div key={wf.id} style={{ 
                      padding: '1rem 1.25rem', 
                      borderBottom: idx < recentWorkflows.length - 1 ? '1px solid var(--border-color)' : 'none',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {wf.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Briefcase size={12} /> {proj?.name || `Project ${wf.data_project_id}`}
                          <span>·</span>
                          {wf.last_run_at ? new Date(wf.last_run_at).toLocaleString() : 'Never'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className={`badge ${wf.status === 'Completed' ? 'badge-success' : wf.status === 'Blocked' ? 'badge-warning' : wf.status === 'Failed' ? 'badge-error' : 'badge-info'}`}>
                          {wf.status}
                        </span>
                        <button 
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px' }}
                          title="View Execution Details"
                          onClick={() => {
                            setSelectedProjectId(wf.data_project_id);
                            onNavigate('history');
                          }}
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
