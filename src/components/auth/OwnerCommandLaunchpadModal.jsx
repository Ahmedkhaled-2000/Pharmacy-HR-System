import React, { useState, useEffect, useMemo } from 'react';
import { outstockGetBranches, outstockGetProcurementTeam } from '../../utils/outstockApiClient';

export default function OwnerCommandLaunchpadModal({
  isOpen,
  onClose,
  ownerName = 'سيف',
  onSelectSystem,
  isGateMode = false,
  branches = [],
  employees = []
}) {
  const [liveBranches, setLiveBranches] = useState(branches || []);
  const [procurementTeam, setProcurementTeam] = useState([]);
  const [isLoadingAsyncData, setIsLoadingAsyncData] = useState(false);

  // States for interactive launchers
  const [selectedBranchOutstock, setSelectedBranchOutstock] = useState('');
  const [selectedBranchManager, setSelectedBranchManager] = useState('');
  const [selectedProcurementTarget, setSelectedProcurementTarget] = useState('procurement_manager');

  // Update live branches if props change
  useEffect(() => {
    if (branches && branches.length > 0) {
      setLiveBranches(branches);
    }
  }, [branches]);

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // منع تمرير خلفية الصفحة أثناء فتح النافذة
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Fetch OutStock branches & Procurement team on mount
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchAsyncData = async () => {
      setIsLoadingAsyncData(true);
      try {
        const [branchRes, teamRes] = await Promise.allSettled([
          outstockGetBranches(),
          outstockGetProcurementTeam()
        ]);

        if (isMounted) {
          if (branchRes.status === 'fulfilled' && branchRes.value?.success && branchRes.value.branches?.length > 0) {
            setLiveBranches(prev => {
              // Merge existing branches with outstock branches to ensure all are present
              const existingIds = new Set(prev.map(b => String(b.id || b.branchCode)));
              const newBranches = branchRes.value.branches.filter(b => !existingIds.has(String(b.id || b.branchCode)));
              return [...prev, ...newBranches];
            });
          }

          if (teamRes.status === 'fulfilled' && teamRes.value?.success && teamRes.value.team) {
            setProcurementTeam(teamRes.value.team.filter(m => m.username !== 'admin-stock'));
          }
        }
      } catch (err) {
        console.warn('Notice: Could not load some launchpad async data:', err);
      } finally {
        if (isMounted) setIsLoadingAsyncData(false);
      }
    };

    fetchAsyncData();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Deduplicate and sort branches
  const sanitizedBranches = useMemo(() => {
    const list = Array.isArray(liveBranches) ? liveBranches : [];
    const unique = [];
    const seen = new Set();
    for (const b of list) {
      if (!b) continue;
      const bKey = String(b.id || b.code || b.branchCode || b.name);
      if (!seen.has(bKey)) {
        seen.add(bKey);
        unique.push(b);
      }
    }
    return unique;
  }, [liveBranches]);

  // Build procurement members list including employees with outstock permissions
  const { cosmeticsOfficers, generalOfficers } = useMemo(() => {
    const cosmetics = [];
    const general = [];
    const seen = new Set();

    // 1. From procurement team API
    (procurementTeam || []).forEach(m => {
      const idKey = String(m.id || m.username);
      if (seen.has(idKey)) return;
      seen.add(idKey);

      const p = m.permissions || {};
      const isCosmetics = m.role === 'cosmetics_officer' || p.category_scope === 'cosmetics';
      const isManager = m.role === 'procurement_manager' || p.can_manage_team === true;

      if (!isManager) {
        if (isCosmetics) cosmetics.push(m);
        else general.push(m);
      }
    });

    // 2. From HR employees with outstock permissions
    (employees || []).forEach(e => {
      const outPerm = e.permissions?.outstockHandling;
      if (!outPerm?.enabled) return;
      const idKey = String(e.id || e.code);
      if (seen.has(idKey)) return;

      if (outPerm.role === 'cosmetics_officer') {
        seen.add(idKey);
        cosmetics.push({
          id: e.id,
          name: e.name,
          role: 'cosmetics_officer',
          category_scope: 'cosmetics'
        });
      } else if (outPerm.role === 'procurement_team' || outPerm.role === 'procurement_officer') {
        seen.add(idKey);
        general.push({
          id: e.id,
          name: e.name,
          role: 'procurement_officer'
        });
      }
    });

    return { cosmeticsOfficers: cosmetics, generalOfficers: general };
  }, [procurementTeam, employees]);

  if (!isOpen) return null;

  // 4 Core Sovereign Systems
  const coreSystems = [
    {
      id: 'hr',
      title: 'منظومة الموارد البشرية (HR)',
      icon: '🏢',
      desc: 'الموظفون، البصمات، الورديات، والرواتب',
      badge: 'المنظومة الرئيسية',
      gradient: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
      lightBg: 'rgba(13, 148, 136, 0.07)',
      borderColor: 'rgba(13, 148, 136, 0.3)',
      actionText: 'دخول HR'
    },
    {
      id: 'outstock',
      title: 'نظام النواقص (OutStock)',
      icon: '💊',
      desc: 'المتابعة الشاملة لنواقص وتوريد الفروع',
      badge: 'نواقص المالك',
      gradient: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
      lightBg: 'rgba(234, 88, 12, 0.07)',
      borderColor: 'rgba(234, 88, 12, 0.3)',
      actionText: 'فتح النواقص'
    },
    {
      id: 'accounts',
      title: 'منظومة الحسابات العامة (ERP)',
      icon: '🏛️',
      desc: 'شجرة الحسابات، القيود اليومية، والقوائم المالية',
      badge: 'المالية',
      gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      lightBg: 'rgba(37, 99, 235, 0.07)',
      borderColor: 'rgba(37, 99, 235, 0.3)',
      actionText: 'فتح الحسابات'
    },
    {
      id: 'permissions',
      title: 'صلاحيات وهوية النظام',
      icon: '👑',
      desc: 'إدارة المالكين، وتثبيت الهوية الموحدة',
      badge: 'إدارة سيادية',
      gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
      lightBg: 'rgba(217, 119, 6, 0.07)',
      borderColor: 'rgba(217, 119, 6, 0.3)',
      actionText: 'إدارة الهوية'
    }
  ];

  // Handler for OutStock Pharmacy Launch
  const handleLaunchOutstockPharmacy = () => {
    if (!selectedBranchOutstock) return;
    const branchObj = sanitizedBranches.find(b => String(b.id) === String(selectedBranchOutstock) || String(b.code) === String(selectedBranchOutstock)) || { id: selectedBranchOutstock, name: `فرع ${selectedBranchOutstock}` };
    onSelectSystem({
      type: 'outstock_pharmacy',
      branch: branchObj
    });
  };

  // Handler for Branch Manager Launch
  const handleLaunchBranchManager = () => {
    if (!selectedBranchManager) return;
    const branchObj = sanitizedBranches.find(b => String(b.id) === String(selectedBranchManager) || String(b.code) === String(selectedBranchManager)) || { id: selectedBranchManager, name: `فرع ${selectedBranchManager}` };
    onSelectSystem({
      type: 'branch_manager',
      branch: branchObj
    });
  };

  // Handler for Procurement Team Member Launch
  const handleLaunchProcurementMember = () => {
    if (!selectedProcurementTarget) return;

    if (selectedProcurementTarget === 'procurement_manager') {
      onSelectSystem({
        type: 'procurement_member',
        role: 'procurement_manager',
        member: {
          id: 'manager',
          name: 'مدير المشتريات العام',
          role: 'procurement_manager',
          allBranchesAccess: true
        }
      });
      return;
    }

    // Check cosmetics officers
    const cosm = cosmeticsOfficers.find(m => String(m.id || m.username) === selectedProcurementTarget);
    if (cosm) {
      onSelectSystem({
        type: 'procurement_member',
        role: 'cosmetics_officer',
        member: cosm
      });
      return;
    }

    // Check general officers
    const gen = generalOfficers.find(m => String(m.id || m.username) === selectedProcurementTarget);
    if (gen) {
      onSelectSystem({
        type: 'procurement_member',
        role: 'procurement_officer',
        member: gen
      });
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.78)',
      backdropFilter: 'blur(8px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      direction: 'rtl',
      fontFamily: "'Cairo', 'Tajawal', sans-serif",
      overscrollBehavior: 'contain'
    }}>
      <div style={{
        background: 'var(--surface, #ffffff)',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '1060px',
        maxHeight: '94vh',
        overflowY: 'auto',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        border: '1px solid var(--border, #e2e8f0)',
        padding: '20px 26px',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overscrollBehavior: 'contain'
      }}>

        {/* ── Header (Ultra Compact) ── */}
        <div style={{ textAlign: 'center', marginBottom: '14px', position: 'relative' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#fef3c7',
            color: '#92400e',
            border: '1px solid #fde68a',
            padding: '2px 14px',
            borderRadius: '99px',
            fontSize: '11px',
            fontWeight: 800,
            marginBottom: '4px'
          }}>
            <span>👑</span>
            <span>بوابة قيادة المالك المركزية · Central Command Launchpad</span>
          </div>

          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: 'var(--text, #0f172a)' }}>
            أهلاً بك يا {ownerName}، إلى أي منظومة ترغب بالدخول؟
          </h2>
          <p style={{ margin: '3px auto 0', fontSize: '12.5px', color: 'var(--muted, #64748b)', maxWidth: '680px' }}>
            بصفتك مالك المنظومة، لديك وصول سيادي غير مشروط لكافة الأنظمة، والتبديل اللحظي بين الفروع وأعضاء الإدارة.
          </p>

          <button
            type="button"
            onClick={onClose}
            title={isGateMode ? "إلغاء الدخول والعودة لشاشة الدخول" : "إغلاق"}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              background: 'var(--surface-muted, #f1f5f9)',
              border: 'none',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              fontSize: '15px',
              cursor: 'pointer',
              color: 'var(--muted, #64748b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-muted, #f1f5f9)'; e.currentTarget.style.color = 'var(--muted, #64748b)'; }}
          >
            ✕
          </button>
        </div>

        {/* ── Section 1: المنظومات السيادية الرئيسية (4 Core Cards in 1 Row) ── */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ✦ المنظومات السيادية العامة (Sovereign Systems)
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border, #e2e8f0)' }}></div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px'
          }}>
            {coreSystems.map((sys) => (
              <div
                key={sys.id}
                onClick={() => onSelectSystem(sys.id)}
                style={{
                  background: sys.lightBg,
                  border: `1.5px solid ${sys.borderColor}`,
                  borderRadius: '14px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '94px',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
                  e.currentTarget.style.borderColor = 'currentColor';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = sys.borderColor;
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: sys.gradient,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '17px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
                    }}>
                      {sys.icon}
                    </div>
                    <span style={{
                      background: 'var(--surface, #fff)',
                      padding: '2px 7px',
                      borderRadius: '5px',
                      fontSize: '10px',
                      fontWeight: 800,
                      border: '1px solid var(--border, #e2e8f0)',
                      color: 'var(--text, #334155)'
                    }}>
                      {sys.badge}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 3px', fontSize: '13.5px', fontWeight: 800, color: 'var(--text, #0f172a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sys.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted, #64748b)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {sys.desc}
                  </p>
                </div>

                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{
                    background: sys.gradient,
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span>{sys.actionText}</span>
                    <span>←</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 2: بوابات المحاكاة والتشغيل الميداني المباشر (3 Interactive Cards in 1 Row) ── */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ⚡ بوابات المحاكاة والتشغيل الميداني المباشر (Operational Fast-Launchers)
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border, #e2e8f0)' }}></div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px'
          }}>

            {/* ── Card 1: صيدلية نواقص لفرع (OutStock Pharmacy) ── */}
            <div style={{
              background: 'rgba(225, 29, 72, 0.05)',
              border: '1.5px solid rgba(225, 29, 72, 0.3)',
              borderRadius: '16px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              minHeight: '160px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      boxShadow: '0 3px 8px rgba(225, 29, 72, 0.25)'
                    }}>
                      💊
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 900, color: '#be123c' }}>
                        صيدلية نواقص محددة
                      </h4>
                      <span style={{ fontSize: '10.5px', color: '#881337', fontWeight: 600 }}>نظام OutStock للفرع</span>
                    </div>
                  </div>
                  <span style={{
                    background: '#fff',
                    color: '#be123c',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    border: '1px solid rgba(225, 29, 72, 0.2)'
                  }}>
                    صيدلية فرع
                  </span>
                </div>

                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  اختر الفرع المطلوب للدخول كصيدلية:
                </label>
                <select
                  value={selectedBranchOutstock}
                  onChange={(e) => setSelectedBranchOutstock(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1.5px solid rgba(225, 29, 72, 0.35)',
                    background: '#ffffff',
                    color: 'var(--text, #0f172a)',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">-- اختر الفرع الميداني --</option>
                  {sanitizedBranches.map((b) => (
                    <option key={`outstock-branch-${b.id || b.code}`} value={b.id || b.code}>
                      📍 {b.name || b.branchName || `فرع ${b.id}`} {b.code ? `(${b.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleLaunchOutstockPharmacy}
                disabled={!selectedBranchOutstock}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  background: selectedBranchOutstock ? 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)' : '#cbd5e1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: selectedBranchOutstock ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: selectedBranchOutstock ? '0 3px 10px rgba(225, 29, 72, 0.3)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <span>دخول صيدلية الفرع</span>
                <span>⚡</span>
              </button>
            </div>

            {/* ── Card 2: لوحة مدير فرع (Branch Manager View) ── */}
            <div style={{
              background: 'rgba(124, 58, 237, 0.05)',
              border: '1.5px solid rgba(124, 58, 237, 0.3)',
              borderRadius: '16px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              minHeight: '160px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      boxShadow: '0 3px 8px rgba(124, 58, 237, 0.25)'
                    }}>
                      🏢
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 900, color: '#6d28d9' }}>
                        لوحة مدير الفرع
                      </h4>
                      <span style={{ fontSize: '10.5px', color: '#4c1d95', fontWeight: 600 }}>إدارة الشفتات والعمليات</span>
                    </div>
                  </div>
                  <span style={{
                    background: '#fff',
                    color: '#6d28d9',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    border: '1px solid rgba(124, 58, 237, 0.2)'
                  }}>
                    مدير فرع
                  </span>
                </div>

                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  اختر الفرع لعرض لوحة مديره:
                </label>
                <select
                  value={selectedBranchManager}
                  onChange={(e) => setSelectedBranchManager(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1.5px solid rgba(124, 58, 237, 0.35)',
                    background: '#ffffff',
                    color: 'var(--text, #0f172a)',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">-- اختر الفرع الإداري --</option>
                  {sanitizedBranches.map((b) => (
                    <option key={`mgr-branch-${b.id || b.code}`} value={b.id || b.code}>
                      🏢 {b.name || b.branchName || `فرع ${b.id}`} {b.code ? `(${b.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleLaunchBranchManager}
                disabled={!selectedBranchManager}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  background: selectedBranchManager ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' : '#cbd5e1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: selectedBranchManager ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: selectedBranchManager ? '0 3px 10px rgba(124, 58, 237, 0.3)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <span>فتح لوحة مدير الفرع</span>
                <span>⚡</span>
              </button>
            </div>

            {/* ── Card 3: إدارة المشتريات والتجميل (Procurement & Cosmetics Team) ── */}
            <div style={{
              background: 'rgba(5, 150, 105, 0.05)',
              border: '1.5px solid rgba(5, 150, 105, 0.3)',
              borderRadius: '16px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              minHeight: '160px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      boxShadow: '0 3px 8px rgba(5, 150, 105, 0.25)'
                    }}>
                      🛒
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 900, color: '#047857' }}>
                        إدارة المشتريات والتجميل
                      </h4>
                      <span style={{ fontSize: '10.5px', color: '#064e3b', fontWeight: 600 }}>فريق التوريد والأصناف</span>
                    </div>
                  </div>
                  <span style={{
                    background: '#fff',
                    color: '#047857',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    border: '1px solid rgba(5, 150, 105, 0.2)'
                  }}>
                    فريق المشتريات
                  </span>
                </div>

                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  اختر المسؤول / العضو المراد تقمصه:
                </label>
                <select
                  value={selectedProcurementTarget}
                  onChange={(e) => setSelectedProcurementTarget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1.5px solid rgba(5, 150, 105, 0.35)',
                    background: '#ffffff',
                    color: 'var(--text, #0f172a)',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box'
                  }}
                >
                  <optgroup label="👑 قيادة المشتريات العامة">
                    <option value="procurement_manager">
                      🌐 مدير المشتريات العام (كافة الفروع والموردين)
                    </option>
                  </optgroup>

                  {cosmeticsOfficers.length > 0 && (
                    <optgroup label="💄 مسؤولو مستحضرات التجميل والعناية">
                      {cosmeticsOfficers.map(m => (
                        <option key={`cosm-${m.id || m.username}`} value={String(m.id || m.username)}>
                          💄 {m.name || m.username} (مسؤول تجميل)
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {generalOfficers.length > 0 && (
                    <optgroup label="📦 أخصائيو وفريق المشتريات">
                      {generalOfficers.map(m => (
                        <option key={`gen-${m.id || m.username}`} value={String(m.id || m.username)}>
                          📦 {m.name || m.username} (أخصائي مشتريات)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <button
                type="button"
                onClick={handleLaunchProcurementMember}
                disabled={!selectedProcurementTarget}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  background: selectedProcurementTarget ? 'linear-gradient(135deg, #10b981 0%, #047857 100%)' : '#cbd5e1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: selectedProcurementTarget ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: selectedProcurementTarget ? '0 3px 10px rgba(5, 150, 105, 0.3)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <span>دخول بصلاحية العضو</span>
                <span>⚡</span>
              </button>
            </div>

          </div>
        </div>

        {/* ── Footer Button ── */}
        <div style={{ textAlign: 'center', paddingTop: '8px', borderTop: '1px solid var(--border, #e2e8f0)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: isGateMode ? '#fee2e2' : 'none',
              border: isGateMode ? '1px solid #fca5a5' : 'none',
              color: isGateMode ? '#dc2626' : 'var(--muted, #64748b)',
              padding: isGateMode ? '6px 16px' : '4px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isGateMode ? (
              <>
                <span>✕</span>
                <span>إلغاء الدخول والعودة لشاشة تسجيل الدخول</span>
              </>
            ) : (
              <span>العودة للشاشة السابقة ↩</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
