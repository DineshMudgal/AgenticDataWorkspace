import React, { useState, useEffect } from 'react';
import { Save, Shield, Server, Cpu, Database, Cloud, Key, CheckCircle2, AlertTriangle } from 'lucide-react';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, string>>({
    DEPLOYMENT_MODE: 'docker',
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-2.5-flash',
    DATABRICKS_HOST: '',
    DATABRICKS_TOKEN: '',
    DATABRICKS_LLM_ENDPOINT_NAME: 'databricks-meta-llama-3-1-70b-instruct',
    DATABRICKS_LLM_EXPERIMENT_ID: '',
    AZURE_OPENAI_API_KEY: '',
    AZURE_OPENAI_ENDPOINT: '',
    AZURE_OPENAI_DEPLOYMENT_NAME: '',
    AZURE_FOUNDRY_API_KEY: '',
    AZURE_FOUNDRY_ENDPOINT: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch current settings on load
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Failed to retrieve current settings from backend.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'All settings and credentials saved and synced successfully!' });
        fetchSettings(); // Refresh settings to show updated masks
      } else {
        const err = await res.text();
        setMessage({ type: 'error', text: `Failed to save settings: ${err}` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Network connection failed while updating settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ marginBottom: '1rem', width: '32px', height: '32px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-cyan)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <span>Loading settings registry...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1.5rem', overflowY: 'auto' }}>
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Shield size={24} style={{ color: 'var(--accent-cyan)' }} />
            Settings & Secrets Manager
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            Configure global deployments, LLM serving credentials, and workspace connection environments.
          </p>
        </div>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="btn btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem' }}
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {message && (
        <div 
          className={message.type === 'success' ? 'info-box' : 'error-box'} 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            marginBottom: '1rem', 
            borderColor: message.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
            backgroundColor: message.type === 'success' ? 'rgba(52, 211, 153, 0.05)' : 'rgba(248, 113, 113, 0.05)',
            color: message.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)'
          }}
        >
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span style={{ fontSize: '0.85rem' }}>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        
        {/* Left Column: Deployment & LLM Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Card 1: Core System Deployment */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <Server size={14} />
              <span>Deployment Mode</span>
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Active Deployment Target</label>
              <select 
                className="form-select" 
                value={settings.DEPLOYMENT_MODE} 
                onChange={e => handleChange('DEPLOYMENT_MODE', e.target.value)}
              >
                <option value="docker">Docker Container (Standalone Host)</option>
                <option value="databricks">Databricks Lakehouse App (Native Cluster)</option>
              </select>
              <p className="form-hint" style={{ marginTop: '6px' }}>
                Selects the active orchestration platform configuration. Databricks mode utilizes native Unity Catalog workspaces.
              </p>
            </div>
          </div>

          {/* Card 2: Global Orchestrator LLM Selection */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <Cpu size={14} />
              <span>Global LLM Provider</span>
            </div>
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Orchestration LLM Engine</label>
              <select 
                className="form-select" 
                value={settings.LLM_PROVIDER} 
                onChange={e => handleChange('LLM_PROVIDER', e.target.value)}
              >
                <option value="gemini">Google Gemini AI</option>
                <option value="databricks">Databricks Served Endpoint</option>
                <option value="azure_openai">Azure OpenAI Services</option>
                <option value="azure_ai_foundry">Azure AI Foundry Models</option>
              </select>
              <p className="form-hint" style={{ marginTop: '6px' }}>
                Determines the LLM engine for supervisor task planning, DDL schema creation, and ReAct loops.
              </p>
            </div>
          </div>

          {/* Card 3: Google Gemini Configurations */}
          {settings.LLM_PROVIDER === 'gemini' && (
            <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-green)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                <Cloud size={14} />
                <span>Google Gemini API Settings</span>
              </div>
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Gemini API Key</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={settings.GEMINI_API_KEY} 
                  onChange={e => handleChange('GEMINI_API_KEY', e.target.value)}
                  placeholder="AIzaSy..." 
                />
                {settings.GEMINI_API_KEY && settings.GEMINI_API_KEY.includes('...') && (
                  <p className="form-hint" style={{ color: 'var(--accent-green)' }}>Masked Secret: <code>{settings.GEMINI_API_KEY}</code></p>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Gemini Model Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={settings.GEMINI_MODEL} 
                  onChange={e => handleChange('GEMINI_MODEL', e.target.value)}
                  placeholder="gemini-2.5-flash" 
                />
              </div>
            </div>
          )}

          {/* Card 4: Databricks Foundation Serving Configurations */}
          {settings.LLM_PROVIDER === 'databricks' && (
            <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                <Database size={14} />
                <span>Databricks LLM Serving Settings</span>
              </div>
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Databricks Serving Endpoint</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={settings.DATABRICKS_LLM_ENDPOINT_NAME} 
                  onChange={e => handleChange('DATABRICKS_LLM_ENDPOINT_NAME', e.target.value)}
                  placeholder="e.g. databricks-meta-llama-3-1-70b-instruct" 
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">MLflow Tracking Experiment ID</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={settings.DATABRICKS_LLM_EXPERIMENT_ID} 
                  onChange={e => handleChange('DATABRICKS_LLM_EXPERIMENT_ID', e.target.value)}
                  placeholder="e.g. 1928372" 
                />
              </div>
            </div>
          )}

          {/* Card 5: Azure OpenAI Configurations */}
          {settings.LLM_PROVIDER === 'azure_openai' && (
            <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                <Cloud size={14} />
                <span>Azure OpenAI Settings</span>
              </div>
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Azure OpenAI API Key</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={settings.AZURE_OPENAI_API_KEY} 
                  onChange={e => handleChange('AZURE_OPENAI_API_KEY', e.target.value)}
                  placeholder="e.g. 23fa8c9..." 
                />
                {settings.AZURE_OPENAI_API_KEY && settings.AZURE_OPENAI_API_KEY.includes('...') && (
                  <p className="form-hint" style={{ color: 'var(--accent-purple)' }}>Masked Secret: <code>{settings.AZURE_OPENAI_API_KEY}</code></p>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Azure OpenAI Endpoint Resource URL</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={settings.AZURE_OPENAI_ENDPOINT} 
                  onChange={e => handleChange('AZURE_OPENAI_ENDPOINT', e.target.value)}
                  placeholder="https://your-resource.openai.azure.com" 
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Deployment Name (Model Deployment)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={settings.AZURE_OPENAI_DEPLOYMENT_NAME} 
                  onChange={e => handleChange('AZURE_OPENAI_DEPLOYMENT_NAME', e.target.value)}
                  placeholder="e.g. gpt-4o or my-custom-model" 
                />
              </div>
            </div>
          )}

          {/* Card 6: Azure AI Foundry Configurations */}
          {settings.LLM_PROVIDER === 'azure_ai_foundry' && (
            <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-amber)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                <Cloud size={14} />
                <span>Azure AI Foundry Model Settings</span>
              </div>
              
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Foundry Inference API Key</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={settings.AZURE_FOUNDRY_API_KEY} 
                  onChange={e => handleChange('AZURE_FOUNDRY_API_KEY', e.target.value)}
                  placeholder="Azure Foundry key" 
                />
                {settings.AZURE_FOUNDRY_API_KEY && settings.AZURE_FOUNDRY_API_KEY.includes('...') && (
                  <p className="form-hint" style={{ color: 'var(--accent-amber)' }}>Masked Secret: <code>{settings.AZURE_FOUNDRY_API_KEY}</code></p>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Inference Endpoint URL</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={settings.AZURE_FOUNDRY_ENDPOINT} 
                  onChange={e => handleChange('AZURE_FOUNDRY_ENDPOINT', e.target.value)}
                  placeholder="https://foundry-inference.eastus.models.ai.azure.com" 
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Connection Credentials (Databricks settings) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Card 7: Databricks Workspace Integration */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <Key size={14} />
              <span>Workspace Access Credentials</span>
            </div>
            
            <p className="form-hint" style={{ marginBottom: '1.25rem' }}>
              Define the global host URL and personal access token (PAT) for orchestrating files and SQL commands to Unity Catalog.
            </p>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Databricks Workspace Host URL</label>
              <input 
                type="text" 
                className="form-control" 
                value={settings.DATABRICKS_HOST} 
                onChange={e => handleChange('DATABRICKS_HOST', e.target.value)}
                placeholder="https://your-workspace.cloud.databricks.com" 
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Databricks Access Token (PAT)</label>
              <input 
                type="password" 
                className="form-control" 
                value={settings.DATABRICKS_TOKEN} 
                onChange={e => handleChange('DATABRICKS_TOKEN', e.target.value)}
                placeholder="dapi..." 
              />
              {settings.DATABRICKS_TOKEN && settings.DATABRICKS_TOKEN.includes('...') && (
                <p className="form-hint" style={{ color: 'var(--accent-cyan)' }}>Masked Secret: <code>{settings.DATABRICKS_TOKEN}</code></p>
              )}
            </div>

            <div className="info-box" style={{ marginTop: '2rem', borderLeftWidth: '3px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Security Guidelines:</span>
              Secrets are stored fully encrypted in the database settings registry. They are never exposed in log outputs or execution trace files. They will be displayed with partial characters in the UI configuration fields once saved.
            </div>
          </div>
        </div>

      </form>
    </div>
  );
};
