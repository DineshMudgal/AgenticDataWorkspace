import React, { useState, useEffect } from 'react';
import { 
  Home, 
  Layers, 
  Briefcase, 
  Cpu, 
  Wrench, 
  Share2, 
  Activity, 
  HelpCircle, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Sliders, 
  Users, 
  Play,
  Terminal,
  Calendar,
  Settings
} from 'lucide-react';
import type { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {
  const isWorkbenchTab = ['tools', 'skills', 'agents', 'workflows', 'orchestration', 'orchestration-schedules', 'orchestration-history', 'history'].includes(activeTab);
  const [workbenchExpanded, setWorkbenchExpanded] = useState(true);

  // Auto-expand workbench sub-menu if one of its tabs is active
  useEffect(() => {
    if (isWorkbenchTab) {
      setWorkbenchExpanded(true);
    }
  }, [activeTab]);

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon">A</div>
          {!collapsed && <span className="logo-text">AgenticData</span>}
        </div>
        <button className="sidebar-toggle-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <ul className="sidebar-menu">
        {/* Dashboard */}
        <li 
          className={`sidebar-item ${activeTab === 'home' ? 'active' : ''}`} 
          onClick={() => setActiveTab('home')}
          title={collapsed ? 'Dashboard' : undefined}
        >
          <Home size={18} />
          {!collapsed && <span className="sidebar-item-text">Dashboard</span>}
          {activeTab === 'home' && !collapsed && <span className="sidebar-active-dot" />}
        </li>

        {/* Data Products */}
        <li 
          className={`sidebar-item ${activeTab === 'products' ? 'active' : ''}`} 
          onClick={() => setActiveTab('products')}
          title={collapsed ? 'Data Products' : undefined}
        >
          <Layers size={18} />
          {!collapsed && <span className="sidebar-item-text">Data Products</span>}
          {activeTab === 'products' && !collapsed && <span className="sidebar-active-dot" />}
        </li>

        {/* Data Projects */}
        <li 
          className={`sidebar-item ${activeTab === 'projects' ? 'active' : ''}`} 
          onClick={() => setActiveTab('projects')}
          title={collapsed ? 'Data Projects' : undefined}
        >
          <Briefcase size={18} />
          {!collapsed && <span className="sidebar-item-text">Data Projects</span>}
          {activeTab === 'projects' && !collapsed && <span className="sidebar-active-dot" />}
        </li>

        {/* Agent Workbench (Collapsible Parent) */}
        <li 
          className={`sidebar-item ${isWorkbenchTab ? 'active' : ''}`}
          onClick={() => {
            setWorkbenchExpanded(!workbenchExpanded);
            if (collapsed) {
              setCollapsed(false);
            }
            // Navigate to first subtab if none active
            if (!isWorkbenchTab) {
              setActiveTab('tools');
            }
          }}
          title={collapsed ? 'Agent Workbench' : undefined}
        >
          <Cpu size={18} />
          {!collapsed && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="sidebar-item-text">Agent Workbench</span>
              {workbenchExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          )}
        </li>

        {/* Subtabs nested under Agent Workbench */}
        {workbenchExpanded && !collapsed && (
          <div className="sidebar-sub-menu" style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '4px', margin: '4px 0' }}>
            <div 
              className={`sidebar-sub-item ${activeTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('tools')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: activeTab === 'tools' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                backgroundColor: activeTab === 'tools' ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
              }}
            >
              <Wrench size={14} />
              <span>Tool Studio</span>
            </div>

            <div 
              className={`sidebar-sub-item ${activeTab === 'skills' ? 'active' : ''}`}
              onClick={() => setActiveTab('skills')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: activeTab === 'skills' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                backgroundColor: activeTab === 'skills' ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
              }}
            >
              <Sliders size={14} />
              <span>Skill Studio</span>
            </div>

            <div 
              className={`sidebar-sub-item ${activeTab === 'agents' ? 'active' : ''}`}
              onClick={() => setActiveTab('agents')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: activeTab === 'agents' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                backgroundColor: activeTab === 'agents' ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
              }}
            >
              <Users size={14} />
              <span>Agent Studio</span>
            </div>

            <div 
              className={`sidebar-sub-item ${activeTab === 'workflows' ? 'active' : ''}`}
              onClick={() => setActiveTab('workflows')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: activeTab === 'workflows' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                backgroundColor: activeTab === 'workflows' ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
              }}
            >
              <Play size={14} />
              <span>Workflow Studio</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, marginTop: '8px' }}>
              <Cpu size={14} />
              <span>Orchestration Studio</span>
            </div>
            
            <div 
              className={`sidebar-sub-item ${activeTab === 'orchestration' ? 'active' : ''}`}
              onClick={() => setActiveTab('orchestration')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px 6px 32px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                color: activeTab === 'orchestration' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                backgroundColor: activeTab === 'orchestration' ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
              }}
            >
              <Terminal size={14} />
              <span>Execution Workspace</span>
            </div>

            <div 
              className={`sidebar-sub-item ${activeTab === 'orchestration-schedules' ? 'active' : ''}`}
              onClick={() => setActiveTab('orchestration-schedules')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px 6px 32px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                color: activeTab === 'orchestration-schedules' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                backgroundColor: activeTab === 'orchestration-schedules' ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
              }}
            >
              <Calendar size={14} />
              <span>Scheduled Workflows</span>
            </div>

            <div 
              className={`sidebar-sub-item ${activeTab === 'orchestration-history' ? 'active' : ''}`}
              onClick={() => setActiveTab('orchestration-history')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px 6px 32px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                color: activeTab === 'orchestration-history' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                backgroundColor: activeTab === 'orchestration-history' ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
              }}
            >
              <Activity size={14} />
              <span>Execution History</span>
            </div>
          </div>
        )}

        {/* Artifact Nexus */}
        <li 
          className={`sidebar-item ${activeTab === 'nexus' ? 'active' : ''}`} 
          onClick={() => setActiveTab('nexus')}
          title={collapsed ? 'Artifact Nexus' : undefined}
        >
          <Share2 size={18} />
          {!collapsed && <span className="sidebar-item-text">Artifact Nexus</span>}
          {activeTab === 'nexus' && !collapsed && <span className="sidebar-active-dot" />}
        </li>

        {/* Observability */}
        <li 
          className={`sidebar-item ${activeTab === 'observability' ? 'active' : ''}`} 
          onClick={() => setActiveTab('observability')}
          title={collapsed ? 'Observability' : undefined}
        >
          <Activity size={18} />
          {!collapsed && <span className="sidebar-item-text">Observability</span>}
          {activeTab === 'observability' && !collapsed && <span className="sidebar-active-dot" />}
        </li>

        {/* Settings & Credentials */}
        <li 
          className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`} 
          onClick={() => setActiveTab('settings')}
          title={collapsed ? 'Settings & Secrets' : undefined}
        >
          <Settings size={18} />
          {!collapsed && <span className="sidebar-item-text">Settings & Secrets</span>}
          {activeTab === 'settings' && !collapsed && <span className="sidebar-active-dot" />}
        </li>
      </ul>

      <div className="sidebar-footer">
        <div
          className={`sidebar-item ${activeTab === 'help' ? 'active' : ''}`}
          onClick={() => setActiveTab('help')}
          title={collapsed ? 'Help & Onboarding' : undefined}
          style={{ cursor: 'pointer', marginBottom: 0 }}
        >
          <HelpCircle size={18} />
          {!collapsed && <span className="sidebar-item-text">Help & Onboarding</span>}
        </div>
        {!collapsed && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            AgenticDataWorkspace<br />v1.0.0 · Databricks App
          </div>
        )}
      </div>
    </div>
  );
};
