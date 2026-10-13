import React from 'react';

export function Card({ children, primary, style, className = '' }) {
  return (
    <article
      className={`card${primary ? ' primary-card' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      {children}
    </article>
  );
}

export function SectionLabel({ children, style }) {
  return (
    <div className="eyebrow" style={{ marginBottom: '.5rem', ...style }}>
      {children}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'default', disabled, style, small, title }) {
  const variantClass = {
    default:   'secondary',
    primary:   'primary',
    danger:    'danger-outline',
    success:   'primary',
    amber:     'warning',
    ghost:     'secondary',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`button ${variantClass}${small ? ' compact' : ''}`}
      style={style}
    >
      {children}
    </button>
  );
}

export function Badge({ children, color = 'default' }) {
  const colorClass = {
    default: '',
    green:   'success',
    red:     'danger',
    amber:   'warning',
    blue:    'info',
    purple:  'info',
  }[color];
  return <span className={`badge ${colorClass}`}>{children}</span>;
}

export function Divider() {
  return <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1rem 0' }} />;
}
