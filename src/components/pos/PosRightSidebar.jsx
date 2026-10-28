import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { arabicWeekday } from '../../utils/formatters';
import {
  Clock,
  Building2,
  User,
  ShieldCheck,
  Keyboard,
  Zap
} from 'lucide-react';

export default function PosRightSidebar() {
  const { currentShift, openNewSalesWindow } = usePOS();
  const { currentBranch, currentEmpUser } = useAuth?.() || {};
  const { state } = useData?.() || {};

  const orgLogo = state?.orgSettings?.logo || localStorage.getItem('app_org_logo') || null;
  const terminalCode = localStorage.getItem('app_pos_terminal') || 'POS-01';
  const safeNumber = localStorage.getItem('app_pos_safe_number') || 'خزينة 1';
  const branchName = currentBranch?.name || localStorage.getItem('app_pos_branch_name') || 'الفرع الرئيسي';
  const cashierName = currentEmpUser?.name || currentShift?.cashierName || 'صيدلي الكاشير';
  const cashierCode = currentEmpUser?.code || '101';

  // ── الساعة الرقمية اللحظية بتصميم فاتح أنيق خالي من الخلفيات الداكنة ──
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeHours = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const timeSeconds = String(currentTime.getSeconds()).padStart(2, '0');
  const dateFormatted = currentTime.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const dayName = arabicWeekday(currentTime.toISOString().slice(0, 10));

  // جدول اختصارات النظام الـ 16 كاملة
  const systemShortcuts = [
    { key: 'F1', label: 'شاشة بيع جديدة', color: '#059669' },
    { key: 'F2', label: 'البدائل الذكية', color: '#0284c7' },
    { key: 'F3 أو /', label: 'البحث والباركود', color: '#0d9488' },
    { key: 'F4', label: 'مركز التقارير', color: '#4f46e5' },
    { key: 'F5', label: 'كاش بالريسيت', color: '#059669' },
    { key: 'F6', label: 'دفع متعدد/فيزا', color: '#2563eb' },
    { key: 'F7', label: 'تتبع الدليفري', color: '#7c3aed' },
    { key: 'F8', label: 'الأصناف السريعة', color: '#d97706' },
    { key: 'F9', label: 'مرتجع مبيعات', color: '#e11d48' },
    { key: 'F10', label: 'بورصة الرواكد', color: '#ca8a04' },
    { key: 'F11', label: 'مركز الواتساب', color: '#16a34a' },
    { key: 'F12', label: 'تسوية الوردية', color: '#475569' },
    { key: 'Shift+↵', label: 'كاش فوري سريع', color: '#0d9488' },
    { key: 'Ctrl+1..4', label: 'نوع الفاتورة', color: '#0891b2' },
    { key: 'Ctrl+M', label: 'صنف غير مكود', color: '#ea580c' },
    { key: 'Esc', label: 'إلغاء الفاتورة', color: '#dc2626' }
  ];

  return (
    <aside
      className="pos-right-command-sidebar"
      style={{
        width: '365px',
        minWidth: '365px',
        maxWidth: '365px',
        height: '100%',
        background: '#ffffff',
        borderLeft: '1.5px solid #cbd5e1',
        display: 'flex',
        flexDirection: 'column',
        direction: 'rtl',
        boxSizing: 'border-box',
        zIndex: 20,
        boxShadow: '-3px 0 18px rgba(15, 23, 42, 0.05)',
        userSelect: 'none',
        overflow: 'hidden',
        padding: '10px 12px',
        gap: '8px'
      }}
    >
      {/* ── 1. ترويسة الشعار واسم الصيدلية المدمجة ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)',
          border: '1px solid rgba(13, 148, 136, 0.25)',
          borderRadius: '12px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        {orgLogo ? (
          <img
            src={orgLogo}
            alt="Logo"
            style={{
              height: '36px',
              maxWidth: '80px',
              objectFit: 'contain'
            }}
          />
        ) : (
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '18px',
              boxShadow: '0 2px 6px rgba(13, 148, 136, 0.3)'
            }}
          >
            💊
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '13.5px',
              fontWeight: 900,
              color: '#0f172a',
              letterSpacing: '-0.3px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            مجموعة صيدليات المروة
          </div>
          <div style={{ fontSize: '10.5px', color: '#0d9488', fontWeight: 800 }}>
            نظام نقاط البيع الذكي • PharmaOS POS
          </div>
        </div>
      </div>

      {/* ── 2. ساعة بتصميم احترافي ناصع مشرق (إزالة أي خلفيات داكنة) ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%)',
          borderRadius: '12px',
          padding: '8px 12px',
          color: '#0f766e',
          boxShadow: '0 2px 8px rgba(13, 148, 136, 0.06)',
          border: '1.5px solid #99f6e4',
          position: 'relative'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '2px'
          }}
        >
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 800,
              color: '#0f766e',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Clock size={12} color="#0d9488" />
            التوقيت الرسمي المعتمد
          </span>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)'
            }}
          />
        </div>

        {/* الوقت الرقمي بلون زمردي تيل عالي الوضوح والتباين بدون أي سواد */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', direction: 'ltr', justifyContent: 'center' }}>
          <span
            style={{
              fontFamily: "'Courier New', Consolas, monospace",
              fontSize: '26px',
              fontWeight: 900,
              color: '#0f766e',
              letterSpacing: '1px',
              lineHeight: 1
            }}
          >
            {timeHours}
          </span>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 900,
              color: '#d97706',
              fontFamily: 'monospace'
            }}
          >
            :{timeSeconds}
          </span>
        </div>

        {/* التاريخ واليوم */}
        <div
          style={{
            marginTop: '4px',
            paddingTop: '4px',
            borderTop: '1px dashed #a7f3d0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '10.5px',
            color: '#475569',
            fontWeight: 700
          }}
        >
          <span style={{ fontWeight: 800, color: '#0f766e' }}>{dayName}</span>
          <span style={{ color: '#64748b' }}>{dateFormatted}</span>
        </div>
      </div>

      {/* ── 3. كارت مدمج: بيانات الفرع + مسؤول الدرج + الخزينة ── */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Building2 size={13} color="#16a34a" />
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b' }}>الفرع:</span>
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#0f172a' }}>{branchName}</span>
          </div>
          <span style={{ fontSize: '9.5px', color: '#16a34a', fontWeight: 800, background: '#dcfce7', padding: '1px 6px', borderRadius: '4px' }}>
            متصل
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <User size={13} color="#0284c7" />
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a' }}>{cashierName}</span>
            <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: 900 }}>#{cashierCode}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 800, color: '#b45309' }}>
            <ShieldCheck size={12} />
            <span>{safeNumber} • {terminalCode}</span>
          </div>
        </div>
      </div>

      {/* ── 4. جدول اختصارات النظام الـ 16 كاملة في شبكة مزدوجة بدون تمرير نهائياً (Zero-Scroll Grid) ── */}
      <div
        style={{
          flex: 1,
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        }}
      >
        <div
          style={{
            padding: '6px 10px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Keyboard size={13} color="#0d9488" />
            <span style={{ fontSize: '11px', fontWeight: 900, color: '#0f172a' }}>
              جدول اختصارات النظام (16)
            </span>
          </div>
          <span
            style={{
              fontSize: '9.5px',
              padding: '1px 5px',
              borderRadius: '4px',
              background: '#f0fdfa',
              color: '#0d9488',
              fontWeight: 800,
              border: '1px solid #99f6e4'
            }}
          >
            Zero-Mouse
          </span>
        </div>

        {/* شبكة الاختصارات الثنائية المدمجة التي تظهر الـ 16 اختصاراً بخط عريض وواضح جداً ومريح للعين */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            padding: '8px 10px',
            overflowY: 'hidden',
            alignContent: 'stretch'
          }}
        >
          {systemShortcuts.map((sc) => (
            <div
              key={sc.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                borderRadius: '8px',
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                transition: 'all 0.15s ease'
              }}
            >
              <kbd
                style={{
                  padding: '2px 7px',
                  borderRadius: '6px',
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderBottom: '2.5px solid #94a3b8',
                  fontSize: '11.5px',
                  fontWeight: 900,
                  color: sc.color,
                  fontFamily: "Consolas, 'Courier New', monospace",
                  direction: 'ltr',
                  display: 'inline-block',
                  letterSpacing: '0.2px'
                }}
              >
                {sc.key}
              </kbd>
              <span
                style={{
                  fontWeight: 800,
                  color: '#0f172a',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginRight: '6px'
                }}
                title={sc.label}
              >
                {sc.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* زر فتح شاشة بيع جديدة فوري */}
      <button
        type="button"
        onClick={() => openNewSalesWindow()}
        style={{
          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '10px',
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: 900,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          boxShadow: '0 3px 10px rgba(5, 150, 105, 0.25)',
          flexShrink: 0
        }}
      >
        <Zap size={14} />
        <span>شاشة بيع جديدة [F1]</span>
      </button>
    </aside>
  );
}
