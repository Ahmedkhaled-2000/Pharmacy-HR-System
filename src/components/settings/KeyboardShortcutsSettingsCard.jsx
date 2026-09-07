import React, { useState } from 'react';
import {
  DEFAULT_SHORTCUTS,
  STORAGE_SHORTCUTS_KEY,
  getActiveShortcuts,
  formatShortcutDisplay
} from '../../utils/shortcutsConfig';

/**
 * بطاقة إعدادات وتخصيص اختصارات لوحة المفاتيح
 * تتيح لمدير النظام معاينة وتعديل وحفظ اختصارات النظام بسهولة
 */
export default function KeyboardShortcutsSettingsCard({
  state,
  setState,
  saveState,
  showToast
}) {
  const orgCustomShortcuts = state?.orgSettings?.customShortcuts;
  const [shortcuts, setShortcuts] = useState(() => getActiveShortcuts(orgCustomShortcuts));
  const [recordingId, setRecordingId] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all'); // 'all' | 'general' | 'actions' | 'nav'
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Key Recording Listener
  const handleStartRecording = (id) => {
    setRecordingId(id);
  };

  const handleStopRecording = () => {
    setRecordingId(null);
  };

  const handleKeyDownRecording = (e, item) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore standalone modifier presses
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    const modifiers = [];
    if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');

    let key = e.key;
    if (key === 'Escape') key = 'Escape';
    else if (key.length === 1) key = key.toLowerCase();

    const updated = shortcuts.map((s) => {
      if (s.id === item.id) {
        return {
          ...s,
          modifiers,
          key
        };
      }
      return s;
    });

    setShortcuts(updated);
    setRecordingId(null);
    showToast?.(`⌨️ تم التقاط الاختصار: ${formatShortcutDisplay({ modifiers, key })}`);
  };

  // Manual Modifier & Key Select
  const handleModifierToggle = (itemId, modName) => {
    setShortcuts((prev) =>
      prev.map((s) => {
        if (s.id !== itemId) return s;
        const exists = s.modifiers.includes(modName);
        const newMods = exists
          ? s.modifiers.filter((m) => m !== modName)
          : [...s.modifiers, modName];
        return { ...s, modifiers: newMods };
      })
    );
  };

  const handleKeyChange = (itemId, newKey) => {
    setShortcuts((prev) =>
      prev.map((s) => {
        if (s.id !== itemId) return s;
        return { ...s, key: newKey.toLowerCase() };
      })
    );
  };

  // Reset single shortcut
  const handleResetSingle = (itemId) => {
    const def = DEFAULT_SHORTCUTS.find((d) => d.id === itemId);
    if (!def) return;
    setShortcuts((prev) =>
      prev.map((s) => (s.id === itemId ? { ...def } : s))
    );
    showToast?.('↺ تم استعادة الاختصار الافتراضي للبند المحدد');
  };

  // Reset ALL shortcuts to system defaults
  const handleResetAll = async () => {
    if (!window.confirm('هل أنت متأكد من استعادة كافة الاختصارات إلى القيم الافتراضية للنظام؟')) return;

    setShortcuts([...DEFAULT_SHORTCUTS]);
    try {
      localStorage.removeItem(STORAGE_SHORTCUTS_KEY);
    } catch {}

    const updatedOrgSettings = {
      ...(state?.orgSettings || {}),
      customShortcuts: DEFAULT_SHORTCUTS,
      updatedAt: Date.now()
    };
    const updatedState = { ...state, orgSettings: updatedOrgSettings };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    // Notify listeners
    window.dispatchEvent(
      new CustomEvent('app:shortcuts-updated', { detail: { shortcuts: DEFAULT_SHORTCUTS } })
    );

    showToast?.('✅ تم استعادة كافة الاختصارات إلى الوضع الافتراضي بنجاح');
  };

  // Save changes to state & localStorage
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      try {
        localStorage.setItem(STORAGE_SHORTCUTS_KEY, JSON.stringify(shortcuts));
      } catch {}

      const updatedOrgSettings = {
        ...(state?.orgSettings || {}),
        customShortcuts: shortcuts,
        updatedAt: Date.now()
      };
      const updatedState = { ...state, orgSettings: updatedOrgSettings };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      // Broadcast update event so UniversalShortcutsController updates immediately
      window.dispatchEvent(
        new CustomEvent('app:shortcuts-updated', { detail: { shortcuts } })
      );

      showToast?.('💾 تم حفظ مصفوفة اختصارات النظام بنجاح وتفعيلها فوراً في كامل الصفحات');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredShortcuts = shortcuts.filter((s) => {
    if (filterCategory !== 'all' && s.category !== filterCategory) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q) ||
        formatShortcutDisplay(s).toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div
      className="card"
      style={{
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: '16px',
        padding: '24px',
        direction: 'rtl',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid var(--border, #e2e8f0)',
          paddingBottom: '16px'
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '1.2rem',
              fontWeight: '800',
              color: 'var(--primary-dark, #0f766e)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <span>⌨️</span>
            <span>إدارة وتخصيص اختصارات لوحة المفاتيح (Custom Keyboard Shortcuts)</span>
          </h3>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted, #64748b)', fontSize: '0.88rem' }}>
            تعديل مفاتيح الوصول السريع وحفظها للتحكم بالنظام بالكامل ومنع تداخل متصفحات الويب
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleResetAll}
            style={{ border: '1px solid var(--border, #cbd5e1)', color: '#64748b', fontSize: '0.85rem' }}
          >
            ↺ استعادة الافتراضي
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveAll}
            disabled={isSaving}
            style={{ minWidth: '130px', fontWeight: '800' }}
          >
            {isSaving ? 'جارٍ الحفظ...' : '💾 حفظ الاختصارات'}
          </button>
        </div>
      </div>

      {/* Pro Info Box */}
      <div
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          border: '1px solid #86efac',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          color: '#166534',
          fontSize: '0.88rem',
          lineHeight: 1.5
        }}
      >
        <span style={{ fontSize: '24px' }}>🛡️</span>
        <div>
          <strong>حماية المتصفح والتوافق التام:</strong> تم برمجة النظام لمصادرة الأحداث ومنع متصفح Google Chrome و Edge من فتح نوافذ كروم أو إظهار "حفظ الصفحة" أو مساعدة كروم عند استخدام الاختصارات. يوصى باستخدام اختصارات تجمع <code>Alt</code> أو <code>Ctrl</code> لضمان أقصى سرعة واستقلالية.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'الكل' },
            { id: 'general', label: '⚡ عامة وإغلاق' },
            { id: 'actions', label: '📝 إدخال وحفظ وطباعة' },
            { id: 'nav', label: '🧭 تنقل بين الأقسام' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterCategory(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: filterCategory === tab.id ? '1.5px solid var(--primary, #0f766e)' : '1px solid var(--border, #e2e8f0)',
                background: filterCategory === tab.id ? 'var(--primary-light, #ccfbf1)' : 'transparent',
                color: filterCategory === tab.id ? 'var(--primary-dark, #0f766e)' : 'var(--text, #334155)',
                fontWeight: filterCategory === tab.id ? '800' : '500',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ minWidth: '240px', flex: '1 1 auto', maxWidth: '340px' }}>
          <input
            type="search"
            placeholder="بحث في أسماء الإجراءات أو المفاتيح..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border, #cbd5e1)',
              background: 'var(--bg, #f8fafc)',
              fontSize: '0.85rem'
            }}
          />
        </div>
      </div>

      {/* Shortcuts Grid / List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredShortcuts.map((item) => {
          const isRecording = recordingId === item.id;
          return (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                padding: '12px 18px',
                borderRadius: '12px',
                border: isRecording ? '2px solid #0f766e' : '1px solid var(--border, #e2e8f0)',
                background: isRecording ? '#f0fdfa' : 'var(--bg, #f8fafc)',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Info */}
              <div style={{ flex: '1 1 240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '0.92rem', color: 'var(--text, #0f172a)' }}>
                    {item.name}
                  </strong>
                  {item.isFixed && (
                    <span
                      style={{
                        background: '#e2e8f0',
                        color: '#475569',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}
                    >
                      ثابت للنظام
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                  {item.desc}
                </div>
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {item.isFixed ? (
                  <kbd
                    style={{
                      background: '#fff',
                      border: '1.5px solid #94a3b8',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.85rem',
                      fontWeight: '800',
                      boxShadow: '0 2px 0 #64748b'
                    }}
                  >
                    Esc
                  </kbd>
                ) : isRecording ? (
                  <div
                    tabIndex={0}
                    onKeyDown={(e) => handleKeyDownRecording(e, item)}
                    style={{
                      padding: '6px 14px',
                      background: '#fff',
                      border: '2px dashed #0d9488',
                      borderRadius: '8px',
                      color: '#0f766e',
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      outline: 'none',
                      cursor: 'pointer',
                      animation: 'pulse 1.5s infinite'
                    }}
                  >
                    ⏺️ اضغط أي مفتاح الآن لتحديده... (أو انقر بالخارج للإلغاء)
                  </div>
                ) : (
                  <>
                    {/* Modifiers Toggles */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['Ctrl', 'Alt', 'Shift'].map((mod) => {
                        const active = item.modifiers.includes(mod);
                        return (
                          <button
                            key={mod}
                            type="button"
                            onClick={() => handleModifierToggle(item.id, mod)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: active ? '1px solid #0f766e' : '1px solid #cbd5e1',
                              background: active ? '#0f766e' : '#fff',
                              color: active ? '#fff' : '#475569',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            {mod}
                          </button>
                        );
                      })}
                    </div>

                    {/* Key Input */}
                    <input
                      type="text"
                      maxLength={10}
                      value={item.key.toUpperCase()}
                      onChange={(e) => handleKeyChange(item.id, e.target.value)}
                      style={{
                        width: '54px',
                        textAlign: 'center',
                        fontWeight: '800',
                        fontSize: '0.85rem',
                        padding: '4px',
                        borderRadius: '6px',
                        border: '1.5px solid #cbd5e1',
                        background: '#fff'
                      }}
                      title="المفتاح الأساسي"
                    />

                    {/* Auto Record Button */}
                    <button
                      type="button"
                      onClick={() => handleStartRecording(item.id)}
                      style={{
                        padding: '4px 10px',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        color: '#334155'
                      }}
                      title="التقاط تلقائي للمفتاح"
                    >
                      🎯 التقاط
                    </button>

                    {/* Preview Badge */}
                    <kbd
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #94a3b8',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.85rem',
                        fontWeight: '800',
                        fontFamily: 'monospace',
                        color: '#0f172a',
                        boxShadow: '0 2px 0 #64748b'
                      }}
                    >
                      {formatShortcutDisplay(item)}
                    </kbd>

                    {/* Reset Button */}
                    <button
                      type="button"
                      onClick={() => handleResetSingle(item.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '2px 4px'
                      }}
                      title="استعادة الافتراضي لهذا البند"
                    >
                      ↺
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderTop: '1px solid var(--border, #e2e8f0)',
          paddingTop: '16px'
        }}
      >
        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
          💡 يمكنك تجربة أي اختصار فوراً بعد الحفظ في أي صفحة داخل النظام.
        </span>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSaveAll}
          disabled={isSaving}
          style={{ minWidth: '150px', fontWeight: '800' }}
        >
          {isSaving ? 'جارٍ الحفظ...' : '💾 حفظ وتطبيق الاختصارات'}
        </button>
      </div>
    </div>
  );
}
