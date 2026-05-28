import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  fieldContext: string; // e.g. "product name", "unity catalog owner"
  className?: string;
  rows?: number; // if set, renders textarea
  required?: boolean;
  style?: React.CSSProperties;
}

export const AISuggestInput: React.FC<Props> = ({ value, onChange, placeholder, fieldContext, className, rows, required, style }) => {
  const [showContextPopover, setShowContextPopover] = useState(false);
  const [contextInput, setContextInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const generateCustomSuggestions = async () => {
    if (!contextInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: fieldContext, context: contextInput, value: '' }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } else {
        throw new Error();
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowContextPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const inputProps = {
    className: className || 'form-control',
    value,
    placeholder,
    required,
    style,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };

  const isStretched = !!(style?.flexGrow || style?.flex || style?.height);

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', width: '100%', height: isStretched ? '100%' : undefined, minHeight: isStretched ? 0 : undefined }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', width: '100%', flexGrow: isStretched ? 1 : undefined, minHeight: isStretched ? 0 : undefined }}>
        <div style={{ flex: 1, display: isStretched ? 'flex' : undefined, flexDirection: isStretched ? 'column' : undefined, minHeight: isStretched ? 0 : undefined }}>
          {rows ? (
            <textarea {...inputProps} rows={rows} style={{ ...style, width: '100%', flexGrow: 1, resize: 'none', minHeight: 0 }} />
          ) : (
            <input {...inputProps} type="text" style={{ ...style, width: '100%' }} />
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setShowContextPopover(!showContextPopover);
            setContextInput('');
            setSuggestions([]);
          }}
          className="btn btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0.45rem 0.85rem',
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            color: 'var(--accent-cyan)',
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            height: rows ? '36px' : '36px',
            alignSelf: 'flex-start',
            cursor: 'pointer'
          }}
          title="Suggest with AI Context"
        >
          <Sparkles size={13} />
          <span>Suggest</span>
        </button>
      </div>

      {showContextPopover && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: '320px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--accent-cyan)',
            borderRadius: '8px',
            padding: '0.75rem',
            zIndex: 150,
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={11} className="text-cyan" />
            <span>Generate with AI context</span>
          </div>
          
          <input
            type="text"
            className="form-control"
            value={contextInput}
            onChange={e => setContextInput(e.target.value)}
            placeholder="e.g. SOX compliance, retail sales..."
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.775rem' }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                generateCustomSuggestions();
              }
            }}
            autoFocus
          />
          
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '2px 8px', fontSize: '0.7rem', height: 'auto' }}
              onClick={() => setShowContextPopover(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '2px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', height: 'auto' }}
              disabled={loading || !contextInput.trim()}
              onClick={generateCustomSuggestions}
            >
              {loading ? <Loader size={10} className="spin-animation" /> : null}
              <span>Generate</span>
            </button>
          </div>

          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>AI Suggestions (Click to apply):</div>
              {suggestions.map((s, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    onChange(s);
                    setShowContextPopover(false);
                  }}
                  style={{
                    padding: '0.4rem 0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    color: 'var(--text-primary)',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(56,189,248,0.08)';
                    e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
