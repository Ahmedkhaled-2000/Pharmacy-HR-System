import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught runtime error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '28px',
          margin: '20px auto',
          maxWidth: '750px',
          background: '#fff',
          borderRadius: '16px',
          border: '1px solid #fecaca',
          boxShadow: '0 4px 14px rgba(239, 68, 68, 0.08)',
          textAlign: 'center',
          fontFamily: 'Cairo, sans-serif'
        }}>
          <div style={{ fontSize: '42px', marginBottom: '10px' }}>⚠️</div>
          <h3 style={{ color: '#b91c1c', margin: '0 0 8px', fontSize: '18px', fontWeight: 'bold' }}>
            {this.props.fallbackTitle || 'تعذر عرض هذا القسم بشكل مؤقت'}
          </h3>
          <p style={{ color: '#64748b', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 20px' }}>
            تم استدراك الخطأ بنجاح لحماية النظام من التوقف. يمكنك محاولة إعادة تحميل الصفحة أو الرجوع للشاشة السابقة.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReload}
              style={{
                background: '#0d9488',
                color: '#fff',
                border: 'none',
                padding: '9px 22px',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '13.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🔄 إعادة محاولة العرض
            </button>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '9px 18px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13.5px'
              }}
            >
              🏠 العودة للرئيسية
            </button>
          </div>

          {this.state.error && (
            <details style={{ marginTop: '20px', textAlign: 'left', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', direction: 'ltr' }}>
              <summary style={{ cursor: 'pointer', color: '#64748b', fontWeight: 'bold' }}>Technical Details</summary>
              <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
