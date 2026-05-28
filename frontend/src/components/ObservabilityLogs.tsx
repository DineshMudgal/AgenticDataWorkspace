import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ShieldAlert, RefreshCw, Eye, Hash, Activity, Server } from 'lucide-react';
import type { DataProject, SystemLog } from '../types';

interface ObservabilityLogsProps {
  projects: DataProject[];
}

export const ObservabilityLogs: React.FC<ObservabilityLogsProps> = ({ projects }) => {
  const [viewMode, setViewMode] = useState<'audit' | 'server'>('audit');
  
  // Audit Logs State
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterAgent, setFilterAgent] = useState<string>('ALL');
  const [filterProjectId, setFilterProjectId] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Server Logs State
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      let query = '';
      const params = [];
      if (filterLevel !== 'ALL') params.push(`level=${filterLevel}`);
      if (filterAgent !== 'ALL') params.push(`agent_name=${filterAgent}`);
      if (filterProjectId !== 'ALL') params.push(`project_id=${filterProjectId}`);
      
      if (params.length > 0) {
        query = '?' + params.join('&');
      }
      
      const res = await fetch(`/api/logs${query}`);
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (e) {
      console.error("Failed to load logs", e);
    } finally {
      setLoading(false);
    }
  };

  // Setup Server-Sent Events for streaming backend logs
  useEffect(() => {
    let eventSource: EventSource | null = null;
    
    if (viewMode === 'server') {
      setServerLogs([]); // clear on connect
      eventSource = new EventSource('/api/system/server-logs/stream');
      
      eventSource.onmessage = (event) => {
        setServerLogs(prev => {
          const updated = [...prev, event.data];
          // Keep only the last 1000 lines to prevent memory issues
          return updated.slice(-1000);
        });
      };
      
      eventSource.onerror = () => {
        console.error("EventSource failed. Reconnecting...");
      };
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [viewMode]);

  // Auto-scroll logic for Server Logs
  useEffect(() => {
    if (viewMode === 'server' && autoScroll.current && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [serverLogs, viewMode]);

  const handleTerminalScroll = () => {
    if (terminalRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
      // If user scrolls up (more than 10px from bottom), pause auto-scroll
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
      autoScroll.current = isAtBottom;
    }
  };

  const refreshData = () => {
    if (viewMode === 'audit') fetchAuditLogs();
  };

  useEffect(() => {
    if (viewMode === 'audit') {
      fetchAuditLogs();
    }
    setSelectedLog(null);
  }, [filterLevel, filterAgent, filterProjectId, viewMode]);

  const uniqueAgents = [
    "Requirement Gathering Agent",
    "Discovery Agent",
    "Data Modelling Agent",
    "Spec Creation Agent",
    "Pipeline Generation Agent",
    "Pipeline Running Agent",
    "Testing Agent",
    "Orchestration Agent (Supervisor)"
  ];

  return (
    <div className="page-container" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="page-header-icon"><Terminal size={22} /></div>
          <div>
            <h1 className="page-title">Observability & Logs</h1>
            <p className="page-subtitle">Monitor multi-agent execution paths, metadata events, and backend server performance.</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <button
              style={{
                background: viewMode === 'audit' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                border: 'none', padding: '4px 12px', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.8rem',
                color: viewMode === 'audit' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
              }}
              onClick={() => setViewMode('audit')}
            >
              <ShieldAlert size={14} /> Audit Trails
            </button>
            <button
              style={{
                background: viewMode === 'server' ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                border: 'none', borderLeft: '1px solid var(--border-color)', padding: '4px 12px', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.8rem',
                color: viewMode === 'server' ? 'var(--accent-purple)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
              }}
              onClick={() => setViewMode('server')}
            >
              <Server size={14} /> Server Logs
            </button>
          </div>

          {viewMode === 'audit' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Level:</span>
                <select 
                  className="form-select"
                  style={{ border: 'none', background: 'transparent', padding: '2px 24px 2px 4px', fontSize: '0.8rem', height: 'auto' }}
                  value={filterLevel}
                  onChange={e => setFilterLevel(e.target.value)}
                >
                  <option value="ALL">ALL LEVELS</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                  <option value="SUCCESS">SUCCESS</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Agent:</span>
                <select 
                  className="form-select"
                  style={{ border: 'none', background: 'transparent', padding: '2px 24px 2px 4px', fontSize: '0.8rem', height: 'auto', maxWidth: '120px' }}
                  value={filterAgent}
                  onChange={e => setFilterAgent(e.target.value)}
                >
                  <option value="ALL">ALL AGENTS</option>
                  {uniqueAgents.map((a, i) => (
                    <option key={i} value={a}>{a.split(' ')[0]}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px 4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Workspace:</span>
                <select 
                  className="form-select"
                  style={{ border: 'none', background: 'transparent', padding: '2px 24px 2px 4px', fontSize: '0.8rem', height: 'auto', maxWidth: '120px' }}
                  value={filterProjectId}
                  onChange={e => setFilterProjectId(e.target.value)}
                >
                  <option value="ALL">ALL WORKSPACES</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <button className="btn btn-secondary" onClick={refreshData} disabled={loading} style={{ padding: '4px 10px' }}>
                <RefreshCw size={14} className={loading ? "spin-animation" : ""} />
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'audit' ? (
        <>
          {/* Main Console Layout */}
          <div className="nexus-grid-container" style={{ flex: 1, minHeight: 0 }}>
            
            {/* Logs Terminal */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1rem', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <Activity size={16} /> Live Audit Trails
                </div>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Showing {logs.length} entries</span>
              </div>

              <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0.5rem', backgroundColor: '#05070f' }}>
                {loading ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '6rem' }}>
                    Fetching telemetry...
                  </div>
                ) : logs.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '6rem' }}>
                    <Terminal size={32} style={{ margin: '0 auto 10px auto', opacity: 0.3 }} />
                    No matching system log entries found.
                  </div>
                ) : (
                  logs.map((log) => {
                    const projName = projects.find(p => p.id === log.project_id)?.name || 'Global';
                    const isSelected = selectedLog?.id === log.id;
                    
                    let levelColor = '#38bdf8'; // INFO
                    if (log.level === 'SUCCESS') levelColor = '#10b981';
                    else if (log.level === 'WARN') levelColor = '#f59e0b';
                    else if (log.level === 'ERROR') levelColor = '#ef4444';

                    return (
                      <div 
                        key={log.id} 
                        style={{ 
                          cursor: 'pointer', 
                          padding: '6px 10px', 
                          borderRadius: '6px',
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                          borderLeft: isSelected ? `2px solid ${levelColor}` : '2px solid transparent',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          marginBottom: '2px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                          transition: 'background-color 0.15s'
                        }}
                        onClick={() => setSelectedLog(log)}
                        className="hover-bg-secondary"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#64748b', fontSize: '0.75rem', minWidth: '70px' }}>
                              {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                            </span>
                            
                            <span style={{ 
                              color: levelColor, 
                              fontWeight: 700, 
                              fontSize: '0.7rem',
                              minWidth: '55px',
                              display: 'inline-block'
                            }}>
                              [{log.level}]
                            </span>
                            
                            {log.agent_name && (
                              <span style={{ color: '#a855f7', fontWeight: 600 }}>
                                {log.agent_name.split(' ')[0]}:
                              </span>
                            )}
                            
                            <span style={{ color: isSelected ? '#fff' : '#e2e8f0', lineHeight: 1.4 }}>
                              {log.message}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', flexShrink: 0, marginTop: '2px' }}>
                            <span style={{ fontSize: '0.7rem' }}>{projName}</span>
                            {isSelected && <Eye size={14} className="text-cyan" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Audit Details Panel */}
            <div className="nexus-side-panel">
              {selectedLog ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
                      <ShieldAlert size={12} />
                      <span>METADATA AUDIT TRACE</span>
                    </div>
                    <h3 style={{ fontSize: '1.1rem', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Hash size={16} className="text-muted" /> Event {selectedLog.id}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Timestamp:</strong> 
                      <span>{new Date(selectedLog.timestamp).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Agent:</strong> 
                      <span>{selectedLog.agent_name || 'System / REST API'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Level:</strong> 
                      <span className={`text-${selectedLog.level === 'ERROR' ? 'red' : selectedLog.level === 'WARN' ? 'amber' : selectedLog.level === 'SUCCESS' ? 'green' : 'cyan'}`}>
                        {selectedLog.level}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Message:</strong> 
                      <span>{selectedLog.message}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: '1.5rem', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Terminal size={14} className="text-purple" /> Stack Trace / State Payload:
                    </span>
                    <div className="code-editor-viewer" style={{ flexGrow: 1, overflowY: 'auto', backgroundColor: '#05070f' }}>
                      {selectedLog.details ? (
                        (() => {
                          try {
                            return JSON.stringify(JSON.parse(selectedLog.details), null, 2);
                          } catch (e) {
                            return selectedLog.details;
                          }
                        })()
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No environment state captured with this log entry.</span>
                      )}
                    </div>
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
                  <Terminal size={36} style={{ marginBottom: '0.75rem', opacity: 0.2 }} />
                  <h4>Select Log Entry</h4>
                  <p style={{ fontSize: '0.75rem', maxWidth: '200px' }}>Select any audit log row in the terminal console on the left to view deep trace details and state payloads.</p>
                </div>
              )}
            </div>

          </div>
        </>
      ) : (
        /* Server Logs View */
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a855f7' }}>
              <Server size={16} /> FastAPI & Uvicorn System Logs
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#10b981' }}>
                <span className="pulse-dot" style={{ backgroundColor: '#10b981', width: '8px', height: '8px', borderRadius: '50%' }}></span>
                Live Stream Active
              </span>
            </div>
          </div>

          <div 
            ref={terminalRef}
            onScroll={handleTerminalScroll}
            style={{ flexGrow: 1, overflowY: 'auto', backgroundColor: '#05070f', padding: '1rem', scrollBehavior: 'smooth' }}
          >
            {serverLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '6rem' }}>Waiting for stream data...</div>
            ) : (
              <pre style={{ 
                margin: 0, 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.8rem', 
                color: '#e2e8f0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {serverLogs.map((line, idx) => {
                  if (!line.trim()) return null; // skip empty
                  let color = '#e2e8f0';
                  if (line.includes('ERROR') || line.includes('Exception')) color = '#ef4444';
                  else if (line.includes('WARNING')) color = '#f59e0b';
                  else if (line.includes('INFO')) color = '#38bdf8';
                  
                  return (
                    <div key={idx} style={{ color, marginBottom: '2px', paddingLeft: '4px', borderLeft: '2px solid transparent', ':hover': { backgroundColor: 'rgba(255,255,255,0.02)' } } as any}>
                      {line}
                    </div>
                  );
                })}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
