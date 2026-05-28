import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { DataProducts } from './components/DataProducts';
import { DataProjects } from './components/DataProjects';
import { ToolStudio } from './components/ToolStudio';
import { SkillStudio } from './components/SkillStudio';
import { AgentStudio } from './components/AgentStudio';
import { WorkflowStudio } from './components/WorkflowStudio';
import { OrchestrationStudio } from './components/OrchestrationStudio';
import { AgentHistory } from './components/AgentHistory';
import { ArtifactNexus } from './components/ArtifactNexus';
import { ObservabilityLogs } from './components/ObservabilityLogs';
import { HelpCenter } from './components/HelpCenter';
import { Settings } from './components/Settings';
import type { ActiveTab, DataProduct, DataProject } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [collapsed, setCollapsed] = useState(false);
  const [products, setProducts] = useState<DataProduct[]>([]);
  const [projects, setProjects] = useState<DataProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const fetchAll = async () => {
    try {
      const [pRes, prRes] = await Promise.all([fetch('/api/products'), fetch('/api/projects')]);
      if (pRes.ok) setProducts(await pRes.json());
      if (prRes.ok) {
        const prs: DataProject[] = await prRes.json();
        setProjects(prs);
        if (prs.length > 0 && !selectedProjectId) setSelectedProjectId(prs[0].id);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchAll(); }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <Dashboard products={products} projects={projects} onNavigate={setActiveTab} setSelectedProjectId={setSelectedProjectId} />;
      case 'products': return <DataProducts products={products} projects={projects} onRefresh={fetchAll} />;
      case 'projects': return <DataProjects products={products} projects={projects} onRefresh={fetchAll} />;
      case 'tools': return <ToolStudio />;
      case 'skills': return <SkillStudio />;
      case 'agents': return <AgentStudio />;
      case 'workflows': return <WorkflowStudio products={products} projects={projects} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} onRefresh={fetchAll} />;
      case 'orchestration': return <OrchestrationStudio activeTab="execution" products={products} projects={projects} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} onRefresh={fetchAll} onNavigate={setActiveTab} />;
      case 'orchestration-schedules': return <OrchestrationStudio activeTab="schedules" products={products} projects={projects} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} onRefresh={fetchAll} onNavigate={setActiveTab} />;
      case 'orchestration-history': return <OrchestrationStudio activeTab="history" products={products} projects={projects} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} onRefresh={fetchAll} onNavigate={setActiveTab} />;
      case 'history': return <AgentHistory projects={projects} setSelectedProjectId={setSelectedProjectId} onNavigate={setActiveTab} />;
      case 'nexus': return <ArtifactNexus products={products} projects={projects} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} />;
      case 'observability': return <ObservabilityLogs projects={projects} />;
      case 'settings': return <Settings />;
      case 'help': return <HelpCenter onNavigate={(tab) => setActiveTab(tab as ActiveTab)} />;
      default: return <div>View not found.</div>;
    }
  };

  return (
    <div className={`app-container ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} collapsed={collapsed} setCollapsed={setCollapsed} />
      
      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
