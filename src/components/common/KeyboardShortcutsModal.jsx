import React, { useEffect, useState } from 'react';
import {
  getActiveShortcuts,
  formatShortcutDisplay
} from '../../utils/shortcutsConfig';

/**
 * دليل اختصارات لوحة المفاتيح الفاخر لنظام Pharmacy ERP
 * يظهر عند الضغط على F1 أو Alt+H أو Ctrl+/
 * ويعرض الاختصارات النشطة المخصصة لحظياً
 */
export default function KeyboardShortcutsModal({ isOpen, onClose, customShortcuts }) {
  const [activeList, setActiveList] = useState(() => getActiveShortcuts(customShortcuts));

  useEffect(() => {
    setActiveList(getActiveShortcuts(customShortcuts));
  }, [customShortcuts, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const generalItems = activeList.filter((s) => s.category === 'general');
  const actionItems = activeList.filter((s) => s.category === 'actions');
  const navItems = activeList.filter((s) => s.category === 'nav');

  const shortcutGroups = [
    { title: '⚡ اختصارات عامة والتحكم بالنوافذ', icon: '🪟', items: generalItems },
    { title: '📝 الإدخال والعمليات وحفظ البيانات', icon: '💾', items: actionItems },
    { title: '🧭 التنقل السريع بين الأقسام الرئيسية', icon: '🚀', items: navItems }
  ];

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(10px)',
        padding: '16px'
      }}
    >
      <div
        className="modal-card"
        style={{
          maxWidth: '780px',
          width: '100%',
          maxHeight: '88vh',
          background: 'var(--surface, #ffffff)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border, #e2e8f0)',
          direction: 'rtl'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
            color: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '26px' }}>⌨️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800' }}>
                دليل اختصارات لوحة المفاتيح (Keyboard Shortcuts)
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', opacity: 0.9 }}>
                تحكم كامل وسريع بالنظام دون لمس الفأرة مع منع تداخل المتصفح
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-circle-btn"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              transition: 'all 0.2s ease'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          {/* Pro Tip Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1px solid #bfdbfe',
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: '#1e40af',
              fontSize: '0.88rem',
              lineHeight: 1.5
            }}
          >
            <span style={{ fontSize: '22px' }}>💡</span>
            <div>
              <strong>تخصيص الاختصارات:</strong> يمكنك تعديل وتغيير أي اختصار من خلال شاشة <strong>الإعدادات ⚙️ › اختصارات لوحة المفاتيح</strong> بكل سهولة.
            </div>
          </div>

          {/* Groups */}
          {shortcutGroups.map((group, gIdx) => (
            <div key={gIdx} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4
                style={{
                  margin: 0,
                  fontSize: '0.95rem',
                  fontWeight: '800',
                  color: 'var(--primary, #0f766e)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderBottom: '1.5px solid var(--border, #e2e8f0)',
                  paddingBottom: '6px'
                }}
              >
                <span>{group.icon}</span>
                <span>{group.title}</span>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.items.map((item, iIdx) => (
                  <div
                    key={iIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--bg, #f8fafc)',
                      border: '1px solid var(--border, #f1f5f9)',
                      borderRadius: '8px',
                      gap: '16px'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.88rem', color: 'var(--text, #1e293b)', fontWeight: '700' }}>
                        {item.name}
                      </span>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {item.desc}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <kbd
                        style={{
                          background: '#ffffff',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '6px',
                          boxShadow: '0 2px 0 #94a3b8',
                          padding: '3px 8px',
                          fontSize: '0.82rem',
                          fontWeight: '800',
                          fontFamily: 'monospace',
                          color: '#0f172a'
                        }}
                      >
                        {formatShortcutDisplay(item)}
                      </kbd>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            background: 'var(--bg, #f8fafc)',
            borderTop: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            يمكنك إغلاق هذه النافذة في أي وقت بالضغط على <strong>Esc</strong> أو زر الإغلاق ✕.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{ minWidth: '100px' }}
          >
            فهمت ذلك
          </button>
        </div>
      </div>
    </div>
  );
}
