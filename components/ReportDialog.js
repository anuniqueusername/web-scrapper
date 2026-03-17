'use client';

import { useState, useEffect, useRef } from 'react';

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
    border: '1px solid rgba(216, 180, 254, 0.15)',
    borderRadius: '12px',
    backdropFilter: 'blur(10px)',
    boxShadow:
      '0 25px 50px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    width: '100%',
    maxWidth: '480px',
    padding: '28px',
    position: 'relative',
    color: '#e2e8f0',
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '18px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px 6px',
    borderRadius: '6px',
    transition: 'color 0.2s ease, background 0.2s ease',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '24px',
  },
  titleIcon: {
    fontSize: '20px',
    color: '#d8b4fe',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    background: 'linear-gradient(135deg, #e0e7ff 0%, #d8b4fe 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  fieldGroup: {
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#c7d2fe',
  },
  input: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(216, 180, 254, 0.15)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '14px',
    padding: '10px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease, background 0.2s ease',
  },
  textarea: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(216, 180, 254, 0.15)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '14px',
    padding: '10px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: '100px',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s ease, background 0.2s ease',
  },
  actions: {
    display: 'flex',
    gap: '10px',
    marginTop: '24px',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '14px',
    fontWeight: 500,
    padding: '10px 18px',
    cursor: 'pointer',
    transition: 'background 0.2s ease, border-color 0.2s ease',
  },
  submitBtn: {
    background: 'linear-gradient(135deg, rgba(192, 132, 252, 0.2) 0%, rgba(216, 180, 254, 0.15) 100%)',
    border: '1px solid rgba(216, 180, 254, 0.35)',
    borderRadius: '8px',
    color: '#d8b4fe',
    fontSize: '14px',
    fontWeight: 600,
    padding: '10px 20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
  },
  submitBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  successMsg: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '8px',
    color: '#86efac',
    fontSize: '14px',
    fontWeight: 500,
    padding: '12px 16px',
    marginTop: '16px',
  },
  errorMsg: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#fca5a5',
    fontSize: '14px',
    fontWeight: 500,
    padding: '12px 16px',
    marginTop: '16px',
  },
};

export default function ReportDialog({ onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const firstInputRef = useRef(null);

  // Focus the first input on mount
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Auto-close 2 seconds after a successful submission
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => onClose(), 2000);
    return () => clearTimeout(timer);
  }, [success, onClose]);

  // Close on Escape key
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      const json = await res.json();

      if (json.success) {
        setSuccess(true);
      } else {
        setError(json.message || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleInputFocus(e) {
    e.target.style.borderColor = 'rgba(216, 180, 254, 0.4)';
    e.target.style.background = 'rgba(15, 23, 42, 0.8)';
  }

  function handleInputBlur(e) {
    e.target.style.borderColor = 'rgba(216, 180, 254, 0.15)';
    e.target.style.background = 'rgba(15, 23, 42, 0.6)';
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div style={styles.overlay} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-labelledby="report-dialog-title">
      <div style={styles.modal}>
        {/* Close button */}
        <button
          style={styles.closeBtn}
          onClick={onClose}
          aria-label="Close dialog"
          onMouseEnter={e => {
            e.currentTarget.style.color = '#e2e8f0';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
            e.currentTarget.style.background = 'none';
          }}
        >
          <i className="fas fa-times"></i>
        </button>

        {/* Title */}
        <div style={styles.titleRow}>
          <i className="fas fa-bug" style={styles.titleIcon}></i>
          <h2 id="report-dialog-title" style={styles.title}>
            Report Issue / Suggest Improvement
          </h2>
        </div>

        {success ? (
          <div style={styles.successMsg}>
            <i className="fas fa-circle-check" style={{ fontSize: '18px' }}></i>
            <span>Report sent! Thank you.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Name */}
            <div style={styles.fieldGroup}>
              <label htmlFor="report-name" style={styles.label}>Name</label>
              <input
                ref={firstInputRef}
                id="report-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                style={styles.input}
                placeholder="Your name"
                required
                disabled={loading}
              />
            </div>

            {/* Email */}
            <div style={styles.fieldGroup}>
              <label htmlFor="report-email" style={styles.label}>Email</label>
              <input
                id="report-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                style={styles.input}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            {/* Message */}
            <div style={styles.fieldGroup}>
              <label htmlFor="report-message" style={styles.label}>Message</label>
              <textarea
                id="report-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                style={styles.textarea}
                placeholder="Describe the issue or improvement you'd like to suggest..."
                rows={4}
                required
                disabled={loading}
              />
            </div>

            {/* Error message */}
            {error && (
              <div style={styles.errorMsg}>
                <i className="fas fa-circle-exclamation" style={{ fontSize: '16px' }}></i>
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div style={styles.actions}>
              <button
                type="button"
                style={styles.cancelBtn}
                onClick={onClose}
                disabled={loading}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                style={{
                  ...styles.submitBtn,
                  ...(loading ? styles.submitBtnDisabled : {}),
                }}
                disabled={loading}
                onMouseEnter={e => {
                  if (!loading) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(192, 132, 252, 0.3) 0%, rgba(216, 180, 254, 0.25) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(216, 180, 254, 0.55)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(216, 180, 254, 0.15)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(192, 132, 252, 0.2) 0%, rgba(216, 180, 254, 0.15) 100%)';
                  e.currentTarget.style.borderColor = 'rgba(216, 180, 254, 0.35)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? (
                  <>
                    <i className="fas fa-circle-notch fa-spin"></i>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane"></i>
                    Send Report
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
