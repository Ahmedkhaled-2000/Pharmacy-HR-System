import React, { useState, useMemo } from 'react';
import BranchSalesEntryModal from './BranchSalesEntryModal';
import BranchBatchSalesModal from './BranchBatchSalesModal';
import BranchSalesTargetModal from './BranchSalesTargetModal';
import {
  calculateBranchSalesMetrics,
  getSalesLeaderboard,
  exportBranchSalesToExcel
} from '../../utils/salesEngine';
import { triggerDirectPrint } from '../../utils/printHelper';

/**
 * BranchSalesModule.jsx
 * الشاشة المتكاملة لمبيعات الفروع والتارجت، الرصد اليومي، وتحفيز المتصدرين
 */
export default function BranchSalesModule({
  state,
  setState,
  saveState,
  showToast,
  onSwitchSubTab
}) {
  // ── Modals State ──
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // ── Active View Tab ──
  // 'targets' | 'log' | 'leaderboard'
  const [activeView, setActiveView] = useState('targets');

  // ── Filter States ──
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dateFilterMode, setDateFilterMode] = useState('month'); // 'today' | 'yesterday' | 'month' | 'custom'
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [targetStatusFilter, setTargetStatusFilter] = useState('all'); // 'all' | 'achieved' | 'on_track' | 'lagging'
  const [searchQuery, setSearchQuery] = useState('');

  // ── Leaderboard Settings (User customizable Top N) ──
  const [leaderboardMode, setLeaderboardMode] = useState('month'); // 'month' | 'day' | 'achievement'
  const [leaderboardTopN, setLeaderboardTopN] = useState('3'); // '3' | '5' | '10' | 'all' | 'custom'
  const [customTopN, setCustomTopN] = useState(3);

  // Raw data from state
  const branches = state?.branches || [];
  const branchSales = state?.branchSales || [];
  const branchSalesTargets = state?.branchSalesTargets || {};
  const branchSalesSettings = state?.branchSalesSettings || {
    allowBranchManagersEntry: false,
    topN: 3
  };

  const allowBranchManagersEntry = Boolean(branchSalesSettings.allowBranchManagersEntry);

  // ── Effective Date for Daily Metrics ──
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);

  // ── Calculate Metrics via Sales Engine ──
  const metrics = useMemo(() => {
    return calculateBranchSalesMetrics({
      branchSales,
      branchSalesTargets,
      branches,
      selectedMonth,
      selectedDate: todayStr
    });
  }, [branchSales, branchSalesTargets, branches, selectedMonth, todayStr]);

  // ── Filtered Sales for the Daily Log ──
  const filteredSalesLog = useMemo(() => {
    return branchSales.filter((sale) => {
      if (!sale || !sale.date) return false;

      // 1. Branch Filter
      if (selectedBranchId !== 'all' && String(sale.branchId) !== String(selectedBranchId)) {
        return false;
      }

      // 2. Date Filter
      if (dateFilterMode === 'today') {
        if (sale.date !== todayStr) return false;
      } else if (dateFilterMode === 'yesterday') {
        if (sale.date !== yesterdayStr) return false;
      } else if (dateFilterMode === 'month') {
        if (sale.date.slice(0, 7) !== selectedMonth) return false;
      } else if (dateFilterMode === 'custom') {
        if (customFromDate && sale.date < customFromDate) return false;
        if (customToDate && sale.date > customToDate) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const bName = (sale.branchName || '').toLowerCase();
        const mgr = (sale.shiftManager || '').toLowerCase();
        const notes = (sale.notes || '').toLowerCase();
        if (!bName.includes(q) && !mgr.includes(q) && !notes.includes(q)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [branchSales, selectedBranchId, dateFilterMode, todayStr, yesterdayStr, selectedMonth, customFromDate, customToDate, searchQuery]);

  // ── Filtered Branch Summaries for Target Dashboard ──
  const filteredSummaries = useMemo(() => {
    let list = metrics.branchSummaries;

    if (selectedBranchId !== 'all') {
      list = list.filter((b) => String(b.branchId) === String(selectedBranchId));
    }

    if (targetStatusFilter !== 'all') {
      list = list.filter((b) => b.status === targetStatusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((b) => (b.branchName || '').toLowerCase().includes(q));
    }

    return list;
  }, [metrics.branchSummaries, selectedBranchId, targetStatusFilter, searchQuery]);

  // ── Leaderboard Data with Custom Top N ──
  const effectiveTopNValue = leaderboardTopN === 'custom'
    ? Math.max(1, parseInt(customTopN, 10) || 3)
    : leaderboardTopN;

  const leaderboard = useMemo(() => {
    return getSalesLeaderboard({
      branchSummaries: metrics.branchSummaries,
      branchSales,
      branches,
      mode: leaderboardMode,
      topN: effectiveTopNValue
    });
  }, [metrics.branchSummaries, branchSales, branches, leaderboardMode, effectiveTopNValue]);

  // Today's best branch
  const bestBranchToday = useMemo(() => {
    const todayRanked = [...metrics.branchSummaries].sort((a, b) => b.dateTotal - a.dateTotal);
    return todayRanked[0]?.dateTotal > 0 ? todayRanked[0] : null;
  }, [metrics.branchSummaries]);

  // Month's best branch
  const bestBranchMonth = useMemo(() => {
    const monthRanked = [...metrics.branchSummaries].sort((a, b) => b.monthTotal - a.monthTotal);
    return monthRanked[0]?.monthTotal > 0 ? monthRanked[0] : null;
  }, [metrics.branchSummaries]);

  // ── Handlers: Save Single Sale ──
  const handleSaveSale = async (newSale) => {
    const existingIndex = branchSales.findIndex((s) => s.id === newSale.id);
    let updatedList;
    if (existingIndex >= 0) {
      updatedList = [...branchSales];
      updatedList[existingIndex] = newSale;
    } else {
      updatedList = [newSale, ...branchSales];
    }

    const updatedState = {
      ...state,
      branchSales: updatedList
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(`✅ تم حفظ مبيعات ${newSale.branchName} (${newSale.date}) بنجاح`);
  };

  // ── Handlers: Save Batch Sales ──
  const handleSaveBatchSales = async (batchList) => {
    const map = {};
    branchSales.forEach((s) => {
      if (s && s.id) map[s.id] = s;
    });
    batchList.forEach((s) => {
      map[s.id] = s;
    });

    const updatedList = Object.values(map);
    const updatedState = {
      ...state,
      branchSales: updatedList
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(`✅ تم حفظ مبيعات ${batchList.length} فرع بنجاح`);
  };

  // ── Handlers: Delete Sale ──
  const handleDeleteSale = async (saleId) => {
    const target = branchSales.find((s) => s.id === saleId);
    if (!target) return;
    const conf = window.confirm(`هل أنت متأكد من حذف حركة مبيعات ${target.branchName} بتاريخ ${target.date} بقيمة ${target.totalSales} ج.م؟`);
    if (!conf) return;

    const updatedList = branchSales.filter((s) => s.id !== saleId);
    const deletedIds = new Set(state._deletedIds || []);
    deletedIds.add(saleId);

    const updatedState = {
      ...state,
      branchSales: updatedList,
      _deletedIds: Array.from(deletedIds).slice(-3000)
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف حركة المبيعات بنجاح');
  };

  // ── Handlers: Save Targets ──
  const handleSaveTargets = async (monthKey, targetsMap) => {
    const updatedTargets = {
      ...branchSalesTargets,
      [monthKey]: targetsMap
    };
    const updatedState = {
      ...state,
      branchSalesTargets: updatedTargets
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(`✅ تم حفظ أهداف تارجت شهر (${monthKey}) بنجاح`);
  };

  // ── Handlers: Toggle Branch Manager Entry Permission ──
  const handleToggleManagerEntry = async () => {
    const nextVal = !allowBranchManagersEntry;
    const updatedSettings = {
      ...branchSalesSettings,
      allowBranchManagersEntry: nextVal
    };
    const updatedState = {
      ...state,
      branchSalesSettings: updatedSettings
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(
      nextVal
        ? '🔓 تم تفعيل صلاحية تسجيل المبيعات لمديري الفروع بنجاح'
        : '🔒 تم إيقاف صلاحية تسجيل المبيعات لمديري الفروع (مقتصرة على الإدارة فقط)'
    );
  };

  // ── Handlers: Excel Export ──
  const handleExportExcel = () => {
    exportBranchSalesToExcel({
      branchSales,
      branchSummaries: metrics.branchSummaries,
      branches,
      selectedMonth,
      selectedBranchId,
      showToast
    });
  };

  // ── Handlers: Direct Print Report ──
  const handlePrintOfficialReport = () => {
    const reportHtml = `
      <div style="direction: rtl; font-family: 'Cairo', 'Tajawal', sans-serif; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 16px;">
          <div>
            <h2 style="margin: 0; color: #0f766e;">🏢 تقرير مبيعات الفروع والتارجت المعتمد</h2>
            <div style="color: #475569; font-size: 13px; margin-top: 4px;">لشهر (${selectedMonth}) — تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}</div>
          </div>
          <div style="text-align: left; font-size: 13px; color: #334155;">
            <div>إجمالي تارجت المجموعة: <strong>${metrics.totalMonthlyTarget.toLocaleString('ar-EG')} ج.م</strong></div>
            <div>إجمالي المبيعات المحققة: <strong style="color: #0f766e;">${metrics.monthTotal.toLocaleString('ar-EG')} ج.م</strong></div>
            <div>نسبة الإنجاز الإجمالية: <strong>${metrics.overallAchievementRate}%</strong></div>
          </div>
        </div>

        <h3 style="margin: 14px 0 8px; color: #1e293b;">📊 ملخص أداء وتارجت الصيدليات</h3>
        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 12px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #0f766e; color: #ffffff;">
              <th style="padding: 8px; border: 1px solid #cbd5e1;">الترتيب</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">الفرع</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">التارجت (ج.م)</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">المبيعات المحققة (ج.م)</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">نسبة التحقيق</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">المتبقي (ج.م)</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">المتوقع بنهاية الشهر</th>
            </tr>
          </thead>
          <tbody>
            ${metrics.branchSummaries.sort((a, b) => b.monthTotal - a.monthTotal).map((b, idx) => `
              <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${b.branchName}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1;">${b.target.toLocaleString('ar-EG')}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f766e;">${b.monthTotal.toLocaleString('ar-EG')}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${b.achievementRate}%</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1;">${b.remaining.toLocaleString('ar-EG')}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1;">${b.projectedTotal.toLocaleString('ar-EG')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 10px; border-top: 1px solid #94a3b8; font-size: 13px;">
          <div>توقيع مدير المبيعات: ____________________</div>
          <div>توقيع المدير العام: ____________________</div>
          <div>اعتماد مجلس الإدارة: ____________________</div>
        </div>
      </div>
    `;

    triggerDirectPrint(reportHtml, `تقرير-مبيعات-الفروع-${selectedMonth}`);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>
      
      {/* ── 1. Page Header & Navigation Bar ── */}
      <div className="card settings-card" style={{
        padding: '20px 24px',
        background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
        color: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(15, 118, 110, 0.3)',
        border: 'none'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '28px', background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '12px' }}>📈</span>
              <div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#ffffff', letterSpacing: '0.3px' }}>
                  مبيعات الفروع والتارجت
                </h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: 'rgba(255,255,255,0.85)' }}>
                  رصد ومتابعة المبيعات اليومية والشهرية، أهداف التارجت ونسب الإنجاز، وتكريم الفرع المتصدر
                </p>
              </div>
            </div>
          </div>

          {/* Quick Subtab Switcher */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onSwitchSubTab && onSwitchSubTab('list')}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.3)',
                fontSize: '13px',
                fontWeight: '700',
                padding: '6px 14px',
                borderRadius: '10px'
              }}
            >
              🏢 بيانات الفروع
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onSwitchSubTab && onSwitchSubTab('roster')}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.3)',
                fontSize: '13px',
                fontWeight: '700',
                padding: '6px 14px',
                borderRadius: '10px'
              }}
            >
              📅 الجداول الشهرية
            </button>
            <button
              type="button"
              style={{
                background: '#ffffff',
                color: '#0f766e',
                border: 'none',
                fontSize: '13px',
                fontWeight: '900',
                padding: '6px 14px',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              📈 مبيعات الفروع (الحالي)
            </button>
          </div>
        </div>

        {/* Manager Permission Toggle Banner */}
        <div style={{
          marginTop: '16px',
          padding: '10px 16px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛡️</span>
            <span>
              صلاحية تسجيل المبيعات لمدير الفرع: 
              <strong style={{ margin: '0 6px', color: allowBranchManagersEntry ? '#86efac' : '#fca5a5' }}>
                {allowBranchManagersEntry ? 'مفعلة (يمكن لمدير الفرع تسجيل مبيعات فرعه اليومية)' : 'معطلة (مقتصرة على الإدارة فقط)'}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleManagerEntry}
            style={{
              background: allowBranchManagersEntry ? '#dc2626' : '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '5px 14px',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {allowBranchManagersEntry ? '🔒 إيقاف صلاحية مدير الفرع' : '🔓 تفعيل صلاحية مدير الفرع'}
          </button>
        </div>
      </div>

      {/* ── 2. Top Live Stats Bar (KPIs) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px'
      }}>
        {/* Card 1: Today Sales */}
        <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>مبيعات اليوم ({todayStr})</span>
            <span style={{ fontSize: '20px', background: '#ecfdf5', padding: '6px', borderRadius: '10px' }}>💰</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f766e', marginTop: '6px' }}>
            {metrics.todayTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '13px', fontWeight: 'normal' }}>ج.م</span>
          </div>
          <div style={{ fontSize: '12px', marginTop: '6px', color: metrics.dayGrowthPct !== null ? (parseFloat(metrics.dayGrowthPct) >= 0 ? '#16a34a' : '#dc2626') : 'var(--muted)', fontWeight: '700' }}>
            {metrics.dayGrowthPct !== null
              ? `${parseFloat(metrics.dayGrowthPct) >= 0 ? '▲ +' : '▼ '}${metrics.dayGrowthPct}% مقارنة بأمس`
              : 'مبيعات أمس: ' + metrics.yesterdayTotal.toLocaleString('ar-EG') + ' ج.م'}
          </div>
        </div>

        {/* Card 2: MTD Sales */}
        <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>مبيعات الشهر الحالي (MTD)</span>
            <span style={{ fontSize: '20px', background: '#eff6ff', padding: '6px', borderRadius: '10px' }}>📅</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#1e40af', marginTop: '6px' }}>
            {metrics.monthTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '13px', fontWeight: 'normal' }}>ج.م</span>
          </div>
          <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--muted)' }}>
            أيام العمل المنقضية: <strong>{metrics.daysElapsed}</strong> من أصل {metrics.daysInMonth} يوم
          </div>
        </div>

        {/* Card 3: Target Achievement % */}
        <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>تحقيق التارجت الإجمالي</span>
            <span style={{ fontSize: '20px', background: '#fef3c7', padding: '6px', borderRadius: '10px' }}>🎯</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: metrics.overallAchievementRate >= 100 ? '#16a34a' : (metrics.overallAchievementRate >= 70 ? '#0284c7' : '#b45309'), marginTop: '6px' }}>
            {metrics.overallAchievementRate}%
          </div>
          <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--muted)' }}>
            المستهدف: {metrics.totalMonthlyTarget.toLocaleString('ar-EG')} ج.م
          </div>
        </div>

        {/* Card 4: Run-Rate Projection */}
        <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>المبيعات المتوقعة لنهاية الشهر</span>
            <span style={{ fontSize: '20px', background: '#faf5ff', padding: '6px', borderRadius: '10px' }}>🔮</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#7e22ce', marginTop: '6px' }}>
            {metrics.projectedMonthTotal.toLocaleString('ar-EG')} <span style={{ fontSize: '13px', fontWeight: 'normal' }}>ج.م</span>
          </div>
          <div style={{ fontSize: '12px', marginTop: '6px', color: '#6b21a8', fontWeight: '700' }}>
            توقع إنجاز: {metrics.projectedAchievementRate}% من التارجت
          </div>
        </div>

        {/* Card 5: Best Branch Highlight */}
        <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1.5px solid #fde047', background: 'linear-gradient(135deg, #fefce8, #fef9c3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: '#854d0e', fontWeight: '800' }}>🏆 الفرع المتصدر</span>
            <span style={{ fontSize: '20px' }}>🥇</span>
          </div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: '#713f12', marginTop: '6px' }}>
            {bestBranchToday ? bestBranchToday.branchName : (bestBranchMonth ? bestBranchMonth.branchName : 'لم تسجل حركات')}
          </div>
          <div style={{ fontSize: '12px', marginTop: '4px', color: '#a16207', fontWeight: '700' }}>
            {bestBranchToday
              ? `متصدر اليوم: ${bestBranchToday.dateTotal.toLocaleString('ar-EG')} ج.م`
              : (bestBranchMonth ? `متصدر الشهر: ${bestBranchMonth.monthTotal.toLocaleString('ar-EG')} ج.م` : '—')}
          </div>
        </div>
      </div>

      {/* ── 3. Actions Toolbar & View Switcher ── */}
      <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          
          {/* View Switcher Tabs */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setActiveView('targets')}
              style={{
                border: 'none',
                background: activeView === 'targets' ? '#ffffff' : 'transparent',
                color: activeView === 'targets' ? '#0f766e' : '#475569',
                fontWeight: activeView === 'targets' ? '900' : '700',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '13.5px',
                cursor: 'pointer',
                boxShadow: activeView === 'targets' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🎯</span> لوحة التارجت والأداء
            </button>

            <button
              type="button"
              onClick={() => setActiveView('log')}
              style={{
                border: 'none',
                background: activeView === 'log' ? '#ffffff' : 'transparent',
                color: activeView === 'log' ? '#0f766e' : '#475569',
                fontWeight: activeView === 'log' ? '900' : '700',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '13.5px',
                cursor: 'pointer',
                boxShadow: activeView === 'log' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>📝</span> سجل المبيعات اليومية
              <span style={{ fontSize: '11px', background: activeView === 'log' ? '#0f766e' : '#94a3b8', color: '#ffffff', padding: '2px 7px', borderRadius: '10px' }}>
                {filteredSalesLog.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('leaderboard')}
              style={{
                border: 'none',
                background: activeView === 'leaderboard' ? '#ffffff' : 'transparent',
                color: activeView === 'leaderboard' ? '#0f766e' : '#475569',
                fontWeight: activeView === 'leaderboard' ? '900' : '700',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '13.5px',
                cursor: 'pointer',
                boxShadow: activeView === 'leaderboard' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🥇</span> منصة التتويج والمتصدرين
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-start"
              onClick={() => {
                setEditingSale(null);
                setIsEntryModalOpen(true);
              }}
              style={{ padding: '8px 16px', fontSize: '13px', background: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>➕</span> تسجيل مبيعات فرع
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsBatchModalOpen(true)}
              style={{ padding: '8px 16px', fontSize: '13px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>⚡</span> إدخال مجمع سريع
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsTargetModalOpen(true)}
              style={{ padding: '8px 14px', fontSize: '13px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>🎯</span> ضبط تارجت الشهر
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleExportExcel}
              style={{ padding: '8px 14px', fontSize: '13px', background: '#f8fafc', border: '1px solid #cbd5e1', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>📊</span> تصدير Excel
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handlePrintOfficialReport}
              style={{ padding: '8px 14px', fontSize: '13px', background: '#f8fafc', border: '1px solid #cbd5e1', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>🖨️</span> طباعة
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div style={{
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Branch Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--muted)' }}>الفرع:</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: '700' }}
            >
              <option value="all">🏢 كافة الفروع ({branches.length})</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name || b.branchName || `فرع ${b.id}`}</option>
              ))}
            </select>
          </div>

          {/* Month Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--muted)' }}>الشهر:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: '700' }}
            />
          </div>

          {/* Date Filter Mode (for log) */}
          {activeView === 'log' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--muted)' }}>الفترة:</label>
                <select
                  value={dateFilterMode}
                  onChange={(e) => setDateFilterMode(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: '700' }}
                >
                  <option value="month">📅 شهر كامل ({selectedMonth})</option>
                  <option value="today">اليوم ({todayStr})</option>
                  <option value="yesterday">أمس ({yesterdayStr})</option>
                  <option value="custom">📆 نطاق مخصص (من - إلى)</option>
                </select>
              </div>

              {dateFilterMode === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                  <span>إلى</span>
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(e) => setCustomToDate(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                  />
                </div>
              )}
            </>
          )}

          {/* Target Status Filter (for targets view) */}
          {activeView === 'targets' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--muted)' }}>حالة التارجت:</label>
              <select
                value={targetStatusFilter}
                onChange={(e) => setTargetStatusFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: '700' }}
              >
                <option value="all">كافة الحالات</option>
                <option value="achieved">🏆 تم تحقيق التارجت (100%+)</option>
                <option value="on_track">🟢 على المسار المطلوب</option>
                <option value="lagging">⚠️ متأخر عن التارجت</option>
                <option value="no_target">لم يحدد تارجت</option>
              </select>
            </div>
          )}

          {/* Leaderboard Configurable Top N (Requested by User) */}
          {activeView === 'leaderboard' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: '#fefce8', padding: '4px 10px', borderRadius: '8px', border: '1px solid #fef08a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#854d0e' }}>🥇 عرض المتصدرين:</label>
                <select
                  value={leaderboardTopN}
                  onChange={(e) => setLeaderboardTopN(e.target.value)}
                  style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #fde047', fontSize: '12.5px', fontWeight: '800', color: '#713f12' }}
                >
                  <option value="3">أفضل 3 فروع</option>
                  <option value="5">أفضل 5 فروع</option>
                  <option value="10">أفضل 10 فروع</option>
                  <option value="all">كافة الفروع</option>
                  <option value="custom">✏️ تحديد يدوي للعدد...</option>
                </select>
              </div>

              {leaderboardTopN === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700' }}>عدد الفروع:</label>
                  <input
                    type="number"
                    min="1"
                    max={branches.length || 50}
                    value={customTopN}
                    onChange={(e) => setCustomTopN(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{ width: '60px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #fde047', fontSize: '12.5px', textAlign: 'center', fontWeight: '800' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Search Input */}
          <div style={{ flex: 1, minWidth: '180px' }}>
            <input
              type="text"
              placeholder="🔍 بحث باسم الفرع أو المسؤول..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
            />
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── VIEW 1: TARGET DASHBOARD & PROGRESS CARDS ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeView === 'targets' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredSummaries.length === 0 ? (
            <div className="card" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '10px' }}>🎯</span>
              لا توجد فروع تطابق خيارات التصفية أو لم يتم إدخال بيانات لهذا الشهر.
            </div>
          ) : (
            filteredSummaries.map((b) => {
              const achPct = b.achievementRate;
              const barWidth = Math.min(100, Math.max(0, achPct));
              const isAchieved = achPct >= 100;

              return (
                <div
                  key={b.branchId}
                  className="card settings-card"
                  style={{
                    padding: '20px',
                    borderRadius: '16px',
                    border: isAchieved ? '1.5px solid #22c55e' : '1px solid #e2e8f0',
                    background: isAchieved ? 'linear-gradient(135deg, #f0fdf4, #ffffff)' : '#ffffff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                    position: 'relative'
                  }}
                >
                  {/* Top Header inside card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>
                        🏢 {b.branchName}
                      </h3>
                      {b.branchCode && (
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>كود: {b.branchCode}</span>
                      )}
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      padding: '3px 10px',
                      borderRadius: '8px',
                      background: b.status === 'achieved' ? '#dcfce7' : (b.status === 'on_track' ? '#e0f2fe' : (b.status === 'lagging' ? '#fee2e2' : '#f1f5f9')),
                      color: b.status === 'achieved' ? '#15803d' : (b.status === 'on_track' ? '#0369a1' : (b.status === 'lagging' ? '#b91c1c' : '#475569'))
                    }}>
                      {b.status === 'achieved' ? 'محقق 🏆' : (b.status === 'on_track' ? 'على المسار 🟢' : (b.status === 'lagging' ? 'متأخر ⚠️' : 'بدون تارجت'))}
                    </span>
                  </div>

                  {/* Numbers Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', marginBottom: '14px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>مبيعات الشهر (MTD)</span>
                      <span style={{ fontSize: '16px', fontWeight: '900', color: '#0f766e' }}>
                        {b.monthTotal.toLocaleString('ar-EG')} <span style={{ fontSize: '11px' }}>ج.م</span>
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>التارجت المستهدف</span>
                      <span style={{ fontSize: '16px', fontWeight: '800', color: '#334155' }}>
                        {b.target > 0 ? `${b.target.toLocaleString('ar-EG')} ج.م` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {b.target > 0 ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px', fontWeight: '700' }}>
                        <span style={{ color: isAchieved ? '#16a34a' : '#0f766e' }}>
                          نسبة الإنجاز: <strong>{achPct}%</strong>
                        </span>
                        <span style={{ color: 'var(--muted)' }}>
                          المتبقي: {b.remaining.toLocaleString('ar-EG')} ج.م
                        </span>
                      </div>

                      <div style={{ height: '9px', background: '#e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${barWidth}%`,
                          height: '100%',
                          background: isAchieved ? 'linear-gradient(90deg, #16a34a, #22c55e)' : (b.status === 'on_track' ? 'linear-gradient(90deg, #0d9488, #14b8a6)' : 'linear-gradient(90deg, #f59e0b, #ef4444)'),
                          borderRadius: '8px',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      {/* Daily Required & Projection */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--muted)', marginTop: '8px' }}>
                        <span>مطلوب يومياً: <strong style={{ color: '#0f172a' }}>{b.requiredDaily.toLocaleString('ar-EG')} ج.م</strong></span>
                        <span>المتوقع: <strong style={{ color: '#7e22ce' }}>{b.projectedTotal.toLocaleString('ar-EG')} ج.م</strong></span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '8px', color: 'var(--muted)', fontSize: '12px' }}>
                      لم يتم تحديد تارجت شهري لهذا الفرع بعد.
                    </div>
                  )}

                  {/* Card Bottom Quick Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      مبيعات اليوم: <strong style={{ color: '#0f766e' }}>{b.dateTotal.toLocaleString('ar-EG')} ج.م</strong>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingSale({ branchId: b.branchId, branchName: b.branchName });
                        setIsEntryModalOpen(true);
                      }}
                      className="btn btn-ghost"
                      style={{ fontSize: '12px', padding: '4px 10px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontWeight: '800' }}
                    >
                      ➕ تسجيل مبيعات
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── VIEW 2: DAILY SALES LOG TABLE ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeView === 'log' && (
        <div className="card settings-card" style={{ padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>
              📝 سجل حركات المبيعات اليومية التفصيلي
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              إجمالي الحركات المعروضة: <strong>{filteredSalesLog.length}</strong> حركة
            </span>
          </div>

          <div className="table-responsive" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="bylaws-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
              <thead>
                <tr style={{ background: '#0f766e', color: '#ffffff', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>م</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>التاريخ</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px', textAlign: 'right' }}>الفرع</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>💵 كاش (ج.م)</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>💳 فيزا (ج.م)</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>🛵 دليفري (ج.م)</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px', background: '#115e59' }}>💎 الإجمالي (ج.م)</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>🧾 الفواتير</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>متوسط الفاتورة</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>المسؤول والملاحظات</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>Z-Report</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalesLog.length === 0 ? (
                  <tr>
                    <td colSpan="12" style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>
                      لا توجد سجلات مبيعات تطابق الفلاتر المحددة.
                    </td>
                  </tr>
                ) : (
                  filteredSalesLog.map((sale, idx) => (
                    <tr key={sale.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 'bold', fontSize: '12px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 6px', fontSize: '12.5px', fontWeight: '700', whiteSpace: 'nowrap' }}>{sale.date}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', fontSize: '13px' }}>
                        {sale.branchName || `فرع ${sale.branchId}`}
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: '12.5px', color: '#15803d', fontWeight: '700' }}>
                        {(parseFloat(sale.cashSales) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: '12.5px', color: '#1d4ed8', fontWeight: '700' }}>
                        {(parseFloat(sale.visaSales) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: '12.5px', color: '#b45309', fontWeight: '700' }}>
                        {(parseFloat(sale.deliverySales) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '8px 8px', fontSize: '13.5px', fontWeight: '900', color: '#0f766e', background: '#f0fdf4' }}>
                        {(parseFloat(sale.totalSales) || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: '12.5px', fontWeight: '600' }}>
                        {sale.receiptsCount || '—'}
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: '12px', fontWeight: '700' }}>
                        {parseFloat(sale.averageBasket) > 0 ? `${sale.averageBasket} ج.م` : '—'}
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: '12px', textAlign: 'right', maxWidth: '160px' }}>
                        <div style={{ fontWeight: '700', color: '#334155' }}>{sale.shiftManager || '—'}</div>
                        {sale.notes && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{sale.notes}</div>}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        {sale.attachment ? (
                          <button
                            type="button"
                            onClick={() => setPreviewAttachment(sale.attachment)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' }}
                            title="معاينة تقرير Z-Report"
                          >
                            📷
                          </button>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSale(sale);
                              setIsEntryModalOpen(true);
                            }}
                            className="btn btn-ghost"
                            style={{ padding: '3px 8px', fontSize: '11.5px', border: '1px solid #cbd5e1' }}
                            title="تعديل"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSale(sale.id)}
                            className="btn btn-ghost"
                            style={{ padding: '3px 8px', fontSize: '11.5px', color: 'var(--danger)', border: '1px solid #fee2e2' }}
                            title="حذف"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── VIEW 3: LEADERBOARD & PODIUM ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeView === 'leaderboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Sub-toggle: Month vs Day vs Target Achievement */}
          <div className="card settings-card" style={{ padding: '14px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b' }}>
              🥇 معيار ترتيب وتتويج الفروع:
            </span>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setLeaderboardMode('month')}
                style={{
                  border: 'none',
                  background: leaderboardMode === 'month' ? '#0f766e' : '#f1f5f9',
                  color: leaderboardMode === 'month' ? '#ffffff' : '#475569',
                  fontWeight: '800',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                📅 إجمالي مبيعات الشهر ({selectedMonth})
              </button>

              <button
                type="button"
                onClick={() => setLeaderboardMode('day')}
                style={{
                  border: 'none',
                  background: leaderboardMode === 'day' ? '#0f766e' : '#f1f5f9',
                  color: leaderboardMode === 'day' ? '#ffffff' : '#475569',
                  fontWeight: '800',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ☀️ أعلى مبيعات اليوم ({todayStr})
              </button>

              <button
                type="button"
                onClick={() => setLeaderboardMode('achievement')}
                style={{
                  border: 'none',
                  background: leaderboardMode === 'achievement' ? '#0f766e' : '#f1f5f9',
                  color: leaderboardMode === 'achievement' ? '#ffffff' : '#475569',
                  fontWeight: '800',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                🎯 أعلى نسبة تحقيق للتارجت %
              </button>
            </div>
          </div>

          {/* Podium for Top 3 */}
          {leaderboard.topBranches.length > 0 && (
            <div className="card settings-card" style={{
              padding: '30px 20px',
              borderRadius: '20px',
              background: 'linear-gradient(180deg, #fefce8 0%, #ffffff 100%)',
              border: '1.5px solid #fef08a',
              textAlign: 'center'
            }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: '900', color: '#854d0e' }}>
                🏆 منصة تتويج أفضل الصيدليات مبيعاً
              </h2>
              <p style={{ margin: '0 0 24px', color: '#a16207', fontSize: '13px' }}>
                تكريم الفروع المتصدرة وفقاً لـ {leaderboardMode === 'month' ? 'إجمالي مبيعات الشهر' : (leaderboardMode === 'day' ? 'مبيعات اليوم' : 'نسبة تحقيق التارجت')}
              </p>

              {/* Podium Display (2nd, 1st, 3rd) */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                gap: '16px',
                flexWrap: 'wrap',
                maxWidth: '750px',
                margin: '0 auto'
              }}>
                {/* 2nd Place (Silver) */}
                {leaderboard.topBranches[1] && (
                  <div style={{
                    flex: 1,
                    minWidth: '180px',
                    background: '#f8fafc',
                    borderRadius: '16px 16px 0 0',
                    border: '2px solid #cbd5e1',
                    padding: '20px 14px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ fontSize: '32px' }}>🥈</div>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', marginTop: '4px' }}>المركز الثاني</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#1e293b', marginTop: '6px' }}>
                      {leaderboard.topBranches[1].branchName}
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: '900', color: '#0f766e', marginTop: '6px' }}>
                      {leaderboardMode === 'achievement'
                        ? `${leaderboard.topBranches[1].achievementRate}%`
                        : (leaderboardMode === 'day' ? `${leaderboard.topBranches[1].dateTotal.toLocaleString('ar-EG')} ج.م` : `${leaderboard.topBranches[1].monthTotal.toLocaleString('ar-EG')} ج.م`)}
                    </div>
                  </div>
                )}

                {/* 1st Place (Gold Champion) */}
                {leaderboard.topBranches[0] && (
                  <div style={{
                    flex: 1.2,
                    minWidth: '200px',
                    background: 'linear-gradient(180deg, #fef9c3 0%, #fef08a 100%)',
                    borderRadius: '20px 20px 0 0',
                    border: '3px solid #eab308',
                    padding: '30px 16px',
                    boxShadow: '0 10px 25px -5px rgba(234, 179, 8, 0.4)',
                    transform: 'translateY(-12px)'
                  }}>
                    <div style={{ fontSize: '42px', animation: 'bounce 2s infinite' }}>🥇</div>
                    <div style={{ fontSize: '13px', fontWeight: '900', color: '#854d0e', marginTop: '4px' }}>👑 بطل المتصدرين (المركز الأول)</div>
                    <div style={{ fontSize: '18px', fontWeight: '900', color: '#713f12', marginTop: '8px' }}>
                      {leaderboard.topBranches[0].branchName}
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f766e', marginTop: '8px' }}>
                      {leaderboardMode === 'achievement'
                        ? `${leaderboard.topBranches[0].achievementRate}%`
                        : (leaderboardMode === 'day' ? `${leaderboard.topBranches[0].dateTotal.toLocaleString('ar-EG')} ج.م` : `${leaderboard.topBranches[0].monthTotal.toLocaleString('ar-EG')} ج.م`)}
                    </div>
                  </div>
                )}

                {/* 3rd Place (Bronze) */}
                {leaderboard.topBranches[2] && (
                  <div style={{
                    flex: 1,
                    minWidth: '180px',
                    background: '#fff7ed',
                    borderRadius: '16px 16px 0 0',
                    border: '2px solid #fdba74',
                    padding: '16px 14px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ fontSize: '30px' }}>🥉</div>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#c2410c', marginTop: '4px' }}>المركز الثالث</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#1e293b', marginTop: '6px' }}>
                      {leaderboard.topBranches[2].branchName}
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: '900', color: '#0f766e', marginTop: '6px' }}>
                      {leaderboardMode === 'achievement'
                        ? `${leaderboard.topBranches[2].achievementRate}%`
                        : (leaderboardMode === 'day' ? `${leaderboard.topBranches[2].dateTotal.toLocaleString('ar-EG')} ج.م` : `${leaderboard.topBranches[2].monthTotal.toLocaleString('ar-EG')} ج.م`)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Full Ranked List for Top N Branches */}
          <div className="card settings-card" style={{ padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>
                📋 قائمة الفروع المتصدرة (أفضل {leaderboard.topBranches.length} فرع)
              </h3>
              <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                العدد المحدد للعرض: <strong>{effectiveTopNValue}</strong> فرع
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {leaderboard.topBranches.map((b) => (
                <div
                  key={b.branchId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    background: b.rank === 1 ? '#fefce8' : (b.rank === 2 ? '#f8fafc' : (b.rank === 3 ? '#fff7ed' : '#ffffff'))
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: b.rank === 1 ? '#eab308' : (b.rank === 2 ? '#94a3b8' : (b.rank === 3 ? '#f97316' : '#0f766e')),
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '900',
                      fontSize: '14px'
                    }}>
                      {b.rank}
                    </span>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '14.5px', color: '#1e293b' }}>
                        {b.branchName}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                        التارجت: {b.target > 0 ? `${b.target.toLocaleString('ar-EG')} ج.م` : 'غير محدد'} | نسبة الإنجاز: {b.achievementRate}%
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '17px', fontWeight: '900', color: '#0f766e' }}>
                      {leaderboardMode === 'achievement'
                        ? `${b.achievementRate}%`
                        : (leaderboardMode === 'day' ? `${b.dateTotal.toLocaleString('ar-EG')} ج.م` : `${b.monthTotal.toLocaleString('ar-EG')} ج.م`)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {leaderboardMode === 'day' ? 'مبيعات اليوم' : 'إجمالي مبيعات الشهر'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Image Preview Modal (Z-Report) ── */}
      {previewAttachment && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewAttachment(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '20px'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewAttachment(null)}
              style={{
                position: 'absolute',
                top: '-15px',
                right: '-15px',
                background: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
              }}
            >
              ✕
            </button>
            <img
              src={previewAttachment}
              alt="تقرير Z-Report"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', objectFit: 'contain' }}
            />
          </div>
        </div>
      )}

      {/* ── Single Entry Modal ── */}
      <BranchSalesEntryModal
        isOpen={isEntryModalOpen}
        onClose={() => {
          setIsEntryModalOpen(false);
          setEditingSale(null);
        }}
        onSave={handleSaveSale}
        branches={branches}
        editingSale={editingSale}
        preselectedBranchId={editingSale?.branchId || (selectedBranchId !== 'all' ? selectedBranchId : null)}
      />

      {/* ── Batch Quick Entry Modal ── */}
      <BranchBatchSalesModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        onSaveBatch={handleSaveBatchSales}
        branches={branches}
        existingSales={branchSales}
      />

      {/* ── Monthly Target Setting Modal ── */}
      <BranchSalesTargetModal
        isOpen={isTargetModalOpen}
        onClose={() => setIsTargetModalOpen(false)}
        onSaveTargets={handleSaveTargets}
        branches={branches}
        currentTargets={branchSalesTargets}
        initialMonth={selectedMonth}
      />
    </div>
  );
}
