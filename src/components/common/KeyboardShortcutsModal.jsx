import React, { useEffect, useState, useMemo } from 'react';
import {
  getActiveShortcuts,
  formatShortcutDisplay,
  formatShortcutFallback
} from '../../utils/shortcutsConfig';

/**
 * دليل اختصارات لوحة المفاتيح الفاخر لنظام Pharmacy ERP
 * يظهر عند الضغط على F1 أو Alt+H أو زر الاختصارات العلوي
 * ويعرض كافة اختصارات النظام النشطة مع إمكانية البحث والفلترة والانتقال للتخصيص
 */
export default function KeyboardShortcutsModal({ isOpen, onClose, customShortcuts }) {
  const [activeList, setActiveList] = useState(() => getActiveShortcuts(customShortcuts));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

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

  const handleLaunchShortcut = (item) => {
    if (item.id === 'kioskMode') {
      onClose?.();
      const targetUrl = window.location.origin + '/kiosk';
      try {
        const link = document.createElement('a');
        link.href = targetUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const filteredShortcuts = useMemo(() => {
    return activeList.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (!searchTerm.trim()) return true;
      const q = searchTerm.trim().toLowerCase();
      const primaryDisp = formatShortcutDisplay(item).toLowerCase();
      const fallbackDisp = formatShortcutFallback(item).toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        primaryDisp.includes(q) ||
        fallbackDisp.includes(q)
      );
    });
  }, [activeList, selectedCategory, searchTerm]);

  if (!isOpen) return null;

  const systemItems = filteredShortcuts.filter((s) => s.category === 'system');
  const generalItems = filteredShortcuts.filter((s) => s.category === 'general');
  const actionItems = filteredShortcuts.filter((s) => s.category === 'actions');
  const navItems = filteredShortcuts.filter((s) => s.category === 'nav');

  const shortcutGroups = [
    { id: 'system', title: '🔒 أمان وقفل والتحكم بالنظام', icon: '🛡️', items: systemItems },
    { id: 'general', title: '⚡ اختصارات عامة والتنقل بالقوائم والبحث', icon: '🪟', items: generalItems },
    { id: 'actions', title: '📝 الإدخال والعمليات وحفظ البيانات', icon: '💾', items: actionItems },
    { id: 'nav', title: '🧭 التنقل السريع بين الأقسام الرئيسية', icon: '🚀', items: navItems }
  ].filter((g) => g.items.length > 0);

  const handleOpenSettingsShortcuts = () => {
    onClose?.();
    window.dispatchEvent(
      new CustomEvent('app:navigate-tab', {
        detail: { targetTab: 'settings', targetSubTab: 'shortcuts' }
      })
    );
  };

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
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          maxWidth: '840px',
          width: '100%',
          maxHeight: '90vh',
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
            <span style={{ fontSize: '28px' }}>⌨️</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.22rem', fontWeight: '800' }}>
                  دليل اختصارات لوحة المفاتيح (Keyboard Shortcuts)
                </h3>
                <span
                  style={{
                    background: 'rgba(255,255,255,0.22)',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    padding: '2px 8px',
                    borderRadius: '99px'
                  }}
                >
                  {activeList.length} اختصار نشط
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', opacity: 0.9 }}>
                تحكم كامل وسريع بالنظام دون لمس الفأرة مع حماية تامة من اعتراض المتصفح
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

        {/* Filter and Search Bar */}
        <div
          style={{
            padding: '14px 24px 10px',
            background: 'var(--surface-alt, #f8fafc)',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'الكل' },
              { id: 'system', label: '🔒 أمان وتحكم' },
              { id: 'general', label: '⚡ عامة وبحث' },
              { id: 'actions', label: '📝 إدخال وعمليات' },
              { id: 'nav', label: '🧭 تنقل سريع' }
            ].map((tab) => {
              const active = selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '8px',
                    border: active ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                    background: active ? '#ccfbf1' : '#ffffff',
                    color: active ? '#0f766e' : '#475569',
                    fontSize: '0.82rem',
                    fontWeight: active ? '800' : '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div style={{ minWidth: '220px', flex: '1 1 auto', maxWidth: '300px' }}>
            <input
              type="search"
              placeholder="🔍 بحث في اسم الإجراء أو المفتاح..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '0.84rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '22px'
          }}
        >
          {shortcutGroups.length === 0 ? (
            <div
              style={{
                padding: '36px 16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '0.95rem'
              }}
            >
              لم يتم العثور على أي اختصار يطابق بحثك: &quot;{searchTerm}&quot;
            </div>
          ) : (
            shortcutGroups.map((group) => (
              <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                  <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 'normal' }}>
                    ({group.items.length})
                  </span>
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {group.items.map((item) => {
                    const fallbackDisplay = formatShortcutFallback(item);
                    return (
                      <div
                        key={item.id}
                        onClick={() => item.id === 'kioskMode' && handleLaunchShortcut(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '9px 14px',
                          background: item.id === 'kioskMode' ? '#f0fdf4' : 'var(--bg, #f8fafc)',
                          border: item.id === 'kioskMode' ? '1.5px solid #86efac' : '1px solid var(--border, #f1f5f9)',
                          borderRadius: '10px',
                          gap: '16px',
                          cursor: item.id === 'kioskMode' ? 'pointer' : 'default',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ flex: '1 1 auto' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text, #1e293b)', fontWeight: '700' }}>
                              {item.name}
                            </span>
                            {item.id === 'kioskMode' && (
                              <span
                                style={{
                                  background: '#16a34a',
                                  color: '#ffffff',
                                  fontSize: '0.68rem',
                                  fontWeight: '800',
                                  padding: '2px 8px',
                                  borderRadius: '6px'
                                }}
                              >
                                نشط وشغال ⚡
                              </span>
                            )}
                            {item.isFixed && item.id !== 'kioskMode' && (
                              <span
                                style={{
                                  background: '#e2e8f0',
                                  color: '#475569',
                                  fontSize: '0.68rem',
                                  fontWeight: '700',
                                  padding: '1px 6px',
                                  borderRadius: '4px'
                                }}
                              >
                                ثابت للنظام
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                            {item.desc}
                          </div>
                        </div>

                        {/* Keys Display */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {item.id === 'kioskMode' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunchShortcut(item);
                              }}
                              style={{
                                background: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '5px 12px',
                                fontSize: '0.78rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)'
                              }}
                              title="فتح كشك البصمة السريع فوراً"
                            >
                              <span>فتح الآن</span>
                              <span>↗</span>
                            </button>
                          )}

                          <kbd
                            style={{
                              background: '#ffffff',
                              border: '1.5px solid #cbd5e1',
                              borderRadius: '6px',
                              boxShadow: '0 2px 0 #94a3b8',
                              padding: '4px 9px',
                              fontSize: '0.84rem',
                              fontWeight: '800',
                              fontFamily: 'monospace',
                              color: '#0f172a'
                            }}
                          >
                            {formatShortcutDisplay(item)}
                          </kbd>

                          {fallbackDisplay && (
                            <>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>أو</span>
                              <kbd
                                style={{
                                  background: '#f8fafc',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  fontSize: '0.78rem',
                                  fontWeight: '700',
                                  fontFamily: 'monospace',
                                  color: '#475569'
                                }}
                              >
                                {fallbackDisplay}
                              </kbd>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            background: 'var(--bg, #f8fafc)',
            borderTop: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              💡 يمكنك تعديل وتخصيص أي اختصار بحسب رغبتك من صفحة الإعدادات.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleOpenSettingsShortcuts}
              style={{
                border: '1px solid var(--primary, #0f766e)',
                color: '#0f766e',
                fontSize: '0.84rem',
                fontWeight: '700',
                padding: '6px 14px',
                borderRadius: '8px'
              }}
            >
              ⚙️ تخصيص الاختصارات في الإعدادات
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClose}
              style={{ minWidth: '100px', fontWeight: '800' }}
            >
              فهمت ذلك
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
