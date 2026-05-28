import React, { useState, useEffect } from 'react';
import { 
  Share2, 
  Download, 
  Copy, 
  FileText, 
  Eye, 
  Check, 
  Filter,
  Search,
  X,
  Code,
  FileJson,
  FileCode2,
  Database
} from 'lucide-react';
import type { DataProduct, DataProject, Artifact } from '../types';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ArtifactNexusProps {
  products: DataProduct[];
  projects: DataProject[];
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
}

export const ArtifactNexus: React.FC<ArtifactNexusProps> = ({
  products,
  projects,
  selectedProjectId,
  setSelectedProjectId,
}) => {
  const [filterProductId, setFilterProductId] = useState<number | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sync project filters
  useEffect(() => {
    if (selectedProjectId) {
      const proj = projects.find(p => p.id === selectedProjectId);
      if (proj) {
        setFilterProductId(proj.data_product_id);
      }
    }
  }, [selectedProjectId, projects]);

  const fetchArtifacts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/artifacts`);
      if (res.ok) {
        setArtifacts(await res.json());
      }
    } catch (e) {
      console.error("Nexus fetch error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtifacts();
  }, []);

  const handleCopy = () => {
    if (!selectedArtifact) return;
    navigator.clipboard.writeText(selectedArtifact.content);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownload = () => {
    if (!selectedArtifact) return;
    const blob = new Blob([selectedArtifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedArtifact.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredProjects = filterProductId 
    ? projects.filter(p => p.data_product_id === filterProductId)
    : projects;

  const filteredArtifacts = artifacts.filter(art => {
    if (selectedProjectId && art.data_project_id !== selectedProjectId) return false;
    if (filterProductId && !selectedProjectId) {
      const proj = projects.find(p => p.id === art.data_project_id);
      if (!proj || proj.data_product_id !== filterProductId) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return art.name.toLowerCase().includes(q) || art.type.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const getArtifactIcon = (type: string) => {
    if (type.includes('Code') || type.includes('SQL')) return <Code size={14} className="text-purple" />;
    if (type.includes('Schema')) return <Database size={14} className="text-cyan" />;
    if (type.includes('Spec')) return <FileJson size={14} className="text-blue" />;
    return <FileCode2 size={14} className="text-green" />;
  };

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Share2 size={22} /></div>
          <div>
            <h1 className="page-title">Artifact Nexus</h1>
            <p className="page-subtitle">Central repository for all AI-generated code, schemas, and specifications.</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Domain:</span>
            <select 
              className="form-select"
              style={{ border: 'none', background: 'transparent', padding: '2px 24px 2px 4px', fontSize: '0.8rem', height: 'auto', minWidth: '120px' }}
              value={filterProductId}
              onChange={e => {
                setFilterProductId(e.target.value ? Number(e.target.value) : '');
                setSelectedProjectId(null);
              }}
            >
              <option value="">All Domains</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Workspace:</span>
            <select 
              className="form-select"
              style={{ border: 'none', background: 'transparent', padding: '2px 24px 2px 4px', fontSize: '0.8rem', height: 'auto', minWidth: '120px' }}
              value={selectedProjectId || ''}
              onChange={e => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All Workspaces</option>
              {filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 12px' }}>
            <Search size={16} className="text-muted" />
            <input 
              type="text" 
              placeholder="Search artifacts..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', padding: '4px 0', fontSize: '0.85rem', color: 'var(--text-primary)', width: '150px', outline: 'none' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="nexus-grid-container" style={{ flex: 1, minHeight: 0 }}>
        
        {/* Column 1: Artifact Ledger */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
            <span>Artifact Ledger</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Showing {filteredArtifacts.length} files</span>
          </div>

          <div style={{ flexGrow: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading artifacts...</div>
            ) : filteredArtifacts.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Share2 size={32} style={{ margin: '0 auto 10px auto', opacity: 0.3 }} />
                <p>No generated artifacts match the current filters.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: 'var(--text-muted)', width: '30px' }}></th>
                    <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>File Name</th>
                    <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Project</th>
                    <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Type</th>
                    <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArtifacts.map(art => {
                    const proj = projects.find(p => p.id === art.data_project_id);
                    const isSelected = selectedArtifact?.id === art.id;
                    return (
                      <tr 
                        key={art.id} 
                        style={{ 
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s'
                        }}
                        onClick={() => setSelectedArtifact(art)}
                        className="hover-bg-secondary"
                      >
                        <td style={{ padding: '12px 16px' }}>{getArtifactIcon(art.type)}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {art.name}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {proj?.name || `Project ${art.data_project_id}`}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {art.type}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(art.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Column 2: Code Viewer Panel */}
        <div className="nexus-side-panel">
          {selectedArtifact ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* Header */}
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
                  {getArtifactIcon(selectedArtifact.type)}
                  <span style={{ letterSpacing: '0.5px' }}>{selectedArtifact.type.toUpperCase()}</span>
                </div>
                <h3 style={{ fontSize: '1.15rem', margin: '4px 0 0 0', wordBreak: 'break-all' }}>{selectedArtifact.name}</h3>
              </div>

              {/* Info */}
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '15px' }}>
                <span>Created: {new Date(selectedArtifact.created_at).toLocaleString()}</span>
                <span>Status: <strong className="text-cyan">{selectedArtifact.status}</strong></span>
              </div>

              {/* Viewer */}
              <div className="code-editor-viewer" style={{ marginTop: '1rem', flexGrow: 1, overflowY: 'auto', padding: '0.5rem' }}>
                {selectedArtifact.type.toLowerCase().includes('report') || selectedArtifact.type.toLowerCase().includes('test') || selectedArtifact.name.endsWith('.md') ? (
                  <div className="markdown-preview" style={{ color: 'var(--text-primary)', lineHeight: 1.6, fontSize: '0.9rem' }}>
                    <ReactMarkdown
                      components={{
                        code({node, inline, className, children, ...props}: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline ? (
                            <SyntaxHighlighter
                              style={vscDarkPlus as any}
                              language={match ? match[1] : 'text'}
                              PreTag="div"
                              {...props}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }} {...props}>
                              {children}
                            </code>
                          );
                        },
                        table({children}) {
                          return <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', marginBottom: '1rem' }}>{children}</table>;
                        },
                        th({children}) {
                          return <th style={{ border: '1px solid var(--border-color)', padding: '8px', backgroundColor: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>{children}</th>;
                        },
                        td({children}) {
                          return <td style={{ border: '1px solid var(--border-color)', padding: '8px' }}>{children}</td>;
                        }
                      }}
                    >
                      {selectedArtifact.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <SyntaxHighlighter
                    language={selectedArtifact.type.toLowerCase().includes('sql') ? 'sql' : selectedArtifact.type.toLowerCase().includes('python') || selectedArtifact.type.toLowerCase().includes('pyspark') ? 'python' : 'json'}
                    style={vscDarkPlus as any}
                    customStyle={{ background: 'transparent', padding: 0, margin: 0, fontSize: '0.85rem' }}
                  >
                    {selectedArtifact.content}
                  </SyntaxHighlighter>
                )}
              </div>

              {/* Export Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button className="btn btn-secondary" style={{ flexGrow: 1 }} onClick={handleCopy}>
                  {copySuccess ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                  {copySuccess ? 'Copied!' : 'Copy Code'}
                </button>
                <button className="btn btn-primary" style={{ flexGrow: 1 }} onClick={handleDownload}>
                  <Download size={14} />
                  Download File
                </button>
              </div>

            </div>
          ) : (
            <div 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100%', 
                color: 'var(--text-muted)',
                textAlign: 'center'
              }}
            >
              <Eye size={36} style={{ marginBottom: '0.75rem', opacity: 0.2 }} />
              <h4>Select Artifact to View</h4>
              <p style={{ fontSize: '0.75rem', maxWidth: '220px' }}>Click any row in the artifact ledger to preview the generated code, schemas, or specifications.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
