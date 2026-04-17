import React from 'react';

export function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '1rem 1.25rem',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--text3)',
      marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'default', disabled, style, small }) {
  const variants = {
    default: { background: 'var(--bg4)', border: '1px solid var(--border2)', color: 'var(--text)' },
    primary: { background: 'var(--blue-bg)', border: '1px solid var(--blue-border)', color: 'var(--blue)' },
    danger:  { background: 'var(--red-bg)',  border: '1px solid var(--red-border)',  color: 'var(--red)' },
    success: { background: 'var(--green-bg)',border: '1px solid var(--green-border)',color: 'var(--green)' },
    amber:   { background: 'var(--amber-bg)',border: '1px solid var(--amber-border)',color: 'var(--amber)' },
    ghost:   { background: 'transparent',    border: '1px solid var(--border)',      color: 'var(--text2)' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        borderRadius: 'var(--radius)',
        padding: small ? '4px 10px' : '7px 14px',
        fontSize: small ? 12 : 13,
        fontWeight: 500,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.15s',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ children, color = 'default' }) {
  const colors = {
    default: { background: 'var(--bg4)', color: 'var(--text2)' },
    green:   { background: 'var(--green-bg)', color: 'var(--green)' },
    red:     { background: 'var(--red-bg)',   color: 'var(--red)' },
    amber:   { background: 'var(--amber-bg)', color: 'var(--amber)' },
    blue:    { background: 'var(--blue-bg)',  color: 'var(--blue)' },
    purple:  { background: 'var(--purple-bg)',color: 'var(--purple)' },
  };
  return (
    <span style={{
      ...colors[color],
      fontSize: 11,
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: 20,
      display: 'inline-block',
    }}>
      {children}
    </span>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />;
}
