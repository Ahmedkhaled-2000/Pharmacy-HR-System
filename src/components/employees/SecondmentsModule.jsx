import React, { useState, useMemo } from 'react';
import { getRealTodayStr, fmt } from '../../utils/formatters';
import { getActiveSecondment, formatSecondmentPeriodText, calculateSecondmentBranchEarnings } from '../../utils/secondmentEngine';

export default function SecondmentsModule({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard
}) {
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, ACTIVE, OPEN_ENDED, EXPIRED, TRANSFERRED
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [recallTargetSec, setRecallTargetSec] = useState(null);
  const [extendTargetSec, setExtendTargetSec] = useState(null);
  const [selectedInspectSec, setSelectedInspectSec] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State for New Secondment / Transfer
  const [formData, setFormData] = useState({
    employeeId: '',
    targetBranchId: '',
    assignmentType: 'temporary', // 'temporary' | 'open_ended' | 'permanent_transfer'
    startDate: getRealTodayStr(),
    endDate: '',
    scheduleType: 'variable', // 'variable' | 'fixed'
    shiftStart: '09:00',
    shiftEnd: '17:00',
    shiftHours: 8,
    hourlyRate: '',
    secondmentAllowance: '',
    allowanceType: 'monthly',
    reason: '',
    notes: '',
    autoDispatchBiometrics: true
  });

  const employees = useMemo(() => state.employees || [], [state.employees]);
  const branches = useMemo(() => state.branches || [], [state.branches]);
  const secondments = useMemo(() => state.secondments || [], [state.secondments]);
  const todayStr = getRealTodayStr();

  // Statistics
  const stats = useMemo(() => {
    let active = 0;
    let expiringSoon = 0;
    let openEnded = 0;
    let transferred = 0;

    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const threeDaysLaterStr = threeDaysLater.toISOString().slice(0, 10);

    secondments.forEach((s) => {
      if (!s) return;
      if (s.status === 'TRANSFERRED' || s.assignmentType === 'permanent_transfer') {
        transferred++;
      } else if (s.status === 'ACTIVE') {
        active++;
        if (s.assignmentType === 'open_ended' || !s.endDate) {
          openEnded++;
        } else if (s.endDate >= todayStr && s.endDate <= threeDaysLaterStr) {
          expiringSoon++;
        }
      }
    });

    return { total: secondments.length, active, expiringSoon, openEnded, transferred };
  }, [secondments, todayStr]);

  // Filtered List
  const filteredSecondments = useMemo(() => {
    return secondments.filter((sec) => {
      if (!sec) return false;

      // Status Filter
      if (filterStatus === 'ACTIVE' && sec.status !== 'ACTIVE') return false;
      if (filterStatus === 'OPEN_ENDED' && (sec.status !== 'ACTIVE' || sec.assignmentType !== 'open_ended')) return false;
      if (filterStatus === 'EXPIRED' && sec.status !== 'EXPIRED' && sec.status !== 'RECALLED') return false;
      if (filterStatus === 'TRANSFERRED' && sec.status !== 'TRANSFERRED' && sec.assignmentType !== 'permanent_transfer') return false;

      // Branch Filter
      if (selectedBranchFilter) {
        const matchHome = String(sec.homeBranchId) === String(selectedBranchFilter);
        const matchTarget = String(sec.targetBranchId) === String(selectedBranchFilter);
        if (!matchHome && !matchTarget) return false;
      }

      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (sec.employeeName || '').toLowerCase().includes(q);
        const matchCode = (sec.employeeCode || '').toLowerCase().includes(q);
        const matchReason = (sec.reason || '').toLowerCase().includes(q);
        const matchTargetB = (sec.targetBranchName || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchReason && !matchTargetB) return false;
      }

      return true;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [secondments, filterStatus, selectedBranchFilter, searchQuery]);

  // ── Handlers ──

  const handleOpenCreateModal = (presetEmp = null) => {
    setFormData({
      employeeId: presetEmp ? String(presetEmp.id) : (employees[0]?.id ? String(employees[0].id) : ''),
      targetBranchId: branches[0]?.id ? String(branches[0].id) : '',
      assignmentType: 'temporary',
      startDate: getRealTodayStr(),
      endDate: '',
      scheduleType: 'variable',
      shiftStart: '09:00',
      shiftEnd: '17:00',
      shiftHours: 8,
      hourlyRate: '',
      secondmentAllowance: '',
      allowanceType: 'monthly',
      reason: '',
      notes: '',
      autoDispatchBiometrics: true
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateSecondmentSubmit = async (e) => {
    e?.preventDefault();
    if (!formData.employeeId) {
      showToast?.('يرجى اختيار الموظف أولاً');
      return;
    }
    if (!formData.targetBranchId) {
      showToast?.('يرجى اختيار الفرع المنتدب إليه');
      return;
    }

    const emp = employees.find((x) => String(x.id) === String(formData.employeeId));
    if (!emp) {
      showToast?.('الموظف غير موجود');
      return;
    }

    if (String(emp.branchId) === String(formData.targetBranchId)) {
      showToast?.('الموظف مسجل بالفعل في هذا الفرع كفرع أساسي');
      return;
    }

    if (formData.assignmentType === 'temporary' && !formData.endDate) {
      showToast?.('يرجى تحديد تاريخ انتهاء الانتداب أو اختياره كـ "فترة مفتوحة"');
      return;
    }

    if (formData.endDate && formData.endDate < formData.startDate) {
      showToast?.('تاريخ الانتهاء لا يمكن أن يسبق تاريخ البدء');
      return;
    }

    setIsSubmitting(true);
    try {
      // إرسال للـ Backend API لأتمتة البصمات وتحديث السيرفر
      const payload = {
        employeeId: emp.id,
        homeBranchId: emp.branchId,
        targetBranchId: formData.targetBranchId,
        assignmentType: formData.assignmentType,
        startDate: formData.startDate,
        endDate: formData.assignmentType === 'open_ended' ? null : (formData.endDate || null),
        scheduleType: formData.scheduleType,
        schedule: formData.scheduleType === 'fixed' ? generateFixedSchedule(formData) : null,
        hourlyRate: parseFloat(formData.hourlyRate) || 0,
        secondmentAllowance: parseFloat(formData.secondmentAllowance) || 0,
        allowanceType: formData.allowanceType,
        reason: formData.reason,
        notes: formData.notes,
        autoDispatchBiometrics: formData.autoDispatchBiometrics
      };

      const res = await fetch('/api/secondments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => null);

      let serverResult = null;
      if (res && res.ok) {
        serverResult = await res.json().catch(() => null);
      }

      // تحديث الحالة المحلية التفاعلية فورياً
      const targetB = branches.find((b) => String(b.id) === String(formData.targetBranchId));
      const homeB = branches.find((b) => String(b.id) === String(emp.branchId));
      const secId = serverResult?.secondment?.id || `sec_${Date.now()}_${emp.id}`;

      let updatedEmployees = [...employees];
      let updatedSecondments = [...(state.secondments || [])];
      let updatedRosters = [...(state.rosters || [])];

      if (formData.assignmentType === 'permanent_transfer') {
        updatedEmployees = updatedEmployees.map((e) => {
          if (String(e.id) === String(emp.id)) {
            return {
              ...e,
              branchId: formData.targetBranchId,
              branchName: targetB?.name || e.branchName,
              transferredAt: new Date().toISOString()
            };
          }
          return e;
        });
      }

      const newSecItem = serverResult?.secondment || {
        id: secId,
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.name,
        homeBranchId: emp.branchId,
        homeBranchName: homeB?.name || emp.branchName || 'الفرع الأساسي',
        targetBranchId: formData.targetBranchId,
        targetBranchName: targetB?.name || 'الفرع المنتدب إليه',
        assignmentType: formData.assignmentType,
        startDate: formData.startDate,
        endDate: formData.assignmentType === 'open_ended' ? null : (formData.endDate || null),
        scheduleType: formData.scheduleType,
        schedule: formData.scheduleType === 'fixed' ? generateFixedSchedule(formData) : null,
        hourlyRate: parseFloat(formData.hourlyRate) || 0,
        secondmentAllowance: parseFloat(formData.secondmentAllowance) || 0,
        allowanceType: formData.allowanceType,
        reason: formData.reason,
        notes: formData.notes,
        status: formData.assignmentType === 'permanent_transfer' ? 'TRANSFERRED' : 'ACTIVE',
        biometricSynced: formData.autoDispatchBiometrics,
        createdAt: new Date().toISOString()
      };

      updatedSecondments = [newSecItem, ...updatedSecondments.filter((s) => s.id !== secId)];

      // إذا كان جدول ثابت، نضيفه للروستر
      if (formData.scheduleType === 'fixed' && newSecItem.schedule) {
        const monthKey = formData.startDate.slice(0, 7);
        const rId = `roster_sec_${emp.id}_${formData.targetBranchId}_${monthKey}`;
        const secRoster = {
          id: rId,
          employeeId: emp.id,
          employeeCode: emp.code,
          employeeName: emp.name,
          branchId: formData.targetBranchId,
          branchName: targetB?.name || '',
          month: monthKey,
          isSecondmentRoster: true,
          secondmentId: secId,
          schedule: newSecItem.schedule,
          status: 'approved',
          adminApproved: true,
          updatedAt: new Date().toISOString()
        };
        updatedRosters = [secRoster, ...updatedRosters.filter((r) => r.id !== rId)];
      }

      const updatedState = {
        ...state,
        employees: updatedEmployees,
        secondments: updatedSecondments,
        rosters: updatedRosters
      };

      setState(updatedState);
      if (saveState) await saveState(updatedState, { entityType: 'secondments' });

      showToast?.(
        formData.assignmentType === 'permanent_transfer'
          ? `تم نقل الموظف نهائياً إلى ${targetB?.name || 'الفرع'} بنجاح`
          : `تم تسجيل انتداب الموظف إلى ${targetB?.name || 'الفرع'} وإرسال البصمة للجهاز بنجاح`
      );
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast?.('حدث خطأ أثناء حفظ الانتداب: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // استدعاء مبكر / إنهاء الانتداب
  const handleRecallConfirm = async (recallReason) => {
    if (!recallTargetSec) return;
    setIsSubmitting(true);
    try {
      await fetch('/api/secondments/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secondmentId: recallTargetSec.id, recallReason })
      }).catch(() => null);

      const updatedSecondments = (state.secondments || []).map((s) => {
        if (s.id === recallTargetSec.id) {
          return {
            ...s,
            status: 'RECALLED',
            recalledAt: new Date().toISOString(),
            recallReason: recallReason || 'استدعاء إداري مبكر'
          };
        }
        return s;
      });

      const updatedState = { ...state, secondments: updatedSecondments };
      setState(updatedState);
      if (saveState) await saveState(updatedState, { entityType: 'secondments' });

      showToast?.(`تم استدعاء الموظف بنجاح وإرسال أمر إيقاف البصمة لجهاز الفرع`);
      setRecallTargetSec(null);
    } catch (e) {
      showToast?.('فشل استدعاء الموظف: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // تمديد فترة الانتداب
  const handleExtendConfirm = async (newEndDate, extendReason) => {
    if (!extendTargetSec || !newEndDate) return;
    setIsSubmitting(true);
    try {
      await fetch('/api/secondments/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secondmentId: extendTargetSec.id, newEndDate, extendReason })
      }).catch(() => null);

      const updatedSecondments = (state.secondments || []).map((s) => {
        if (s.id === extendTargetSec.id) {
          return {
            ...s,
            endDate: newEndDate,
            assignmentType: 'temporary',
            status: 'ACTIVE',
            notes: (s.notes ? s.notes + ' | ' : '') + `تم التمديد حتى ${newEndDate} (${extendReason || 'قرار إداري'})`,
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      });

      const updatedState = { ...state, secondments: updatedSecondments };
      setState(updatedState);
      if (saveState) await saveState(updatedState, { entityType: 'secondments' });

      showToast?.(`تم تمديد الانتداب بنجاح حتى ${newEndDate}`);
      setExtendTargetSec(null);
    } catch (e) {
      showToast?.('فشل تمديد الانتداب: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // طباعة قرار الانتداب الرسمي
  const handlePrintDecision = (sec) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast?.('يرجى السماح بالنوافذ المنبثقة لطباعة القرار');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>قرار إداري - انتداب موظف</title>
        <style>
          body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; padding: 40px; color: #1e293b; line-height: 1.8; background: #fff; }
          .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { margin: 0; color: #0369a1; font-size: 24px; }
          .header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
          .decision-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; margin-bottom: 30px; }
          .decision-title { font-size: 18px; font-weight: bold; color: #0f172a; margin-bottom: 15px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; }
          .data-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 15px; }
          .data-label { font-weight: bold; color: #475569; width: 35%; }
          .data-value { width: 65%; color: #0f172a; }
          .articles { margin: 30px 0; font-size: 15px; }
          .article { margin-bottom: 15px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 60px; padding: 0 40px; }
          .signature-box { text-align: center; font-weight: bold; }
          .stamp-box { margin-top: 40px; border: 2px dashed #94a3b8; width: 140px; height: 70px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 12px; margin-left: auto; margin-right: auto; }
          @media print { body { padding: 20px; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>مجموعة صيدليات الإدارة الطبية</h1>
          <p>إدارة الموارد البشرية وشؤون الموظفين | قطاع العمليات والتشغيل</p>
        </div>

        <div style="text-align: center; margin-bottom: 25px;">
          <h2 style="margin: 0; color: #0f172a; font-size: 20px; text-decoration: underline;">قـرار إداري رقم (${sec.id.replace('sec_', 'ADM-')})</h2>
          <p style="margin: 5px 0 0; color: #64748b; font-size: 13px;">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}</p>
        </div>

        <div class="decision-box">
          <div class="decision-title">📋 بيانات القرار والموظف المنتدب:</div>
          <div class="data-row"><div class="data-label">اسم الموظف:</div><div class="data-value">${sec.employeeName} (كود: ${sec.employeeCode || '—'})</div></div>
          <div class="data-row"><div class="data-label">الفرع الأساسي (المُعير):</div><div class="data-value">${sec.homeBranchName}</div></div>
          <div class="data-row"><div class="data-label">الفرع المنتدب إليه (المُستضيف):</div><div class="data-value"><strong>${sec.targetBranchName}</strong></div></div>
          <div class="data-row"><div class="data-label">فترة الانتداب:</div><div class="data-value">${formatSecondmentPeriodText(sec)}</div></div>
          <div class="data-row"><div class="data-label">نظام الدوام:</div><div class="data-value">${sec.scheduleType === 'variable' ? 'مواعيد متغيرة (احتساب بالساعات الفعلية المنجزة)' : 'جدول ورديات محدد'}</div></div>
          ${sec.secondmentAllowance > 0 ? `<div class="data-row"><div class="data-label">بدل الانتداب المقرر:</div><div class="data-value">${sec.secondmentAllowance} ج.م (${sec.allowanceType === 'monthly' ? 'شهرياً' : 'مقطوع'})</div></div>` : ''}
          <div class="data-row"><div class="data-label">سبب الانتداب:</div><div class="data-value">${sec.reason || 'مصلحة العمل وحاجة التشغيل'}</div></div>
        </div>

        <div class="articles">
          <div class="article"><strong>المادة الأولى:</strong> يُنتدب السيد المذكور أعلاه للعمل بفرع (${sec.targetBranchName}) اعتباراً من تاريخ (${sec.startDate})، ويخضع لتعليمات وإشراف إدارة الفرع المنتدب إليه.</div>
          <div class="article"><strong>المادة الثانية:</strong> يتم إدراج الموظف في جهاز بصمة الفرع المنتدب إليه لحصر ساعات الحضور والانصراف بدقة واحتساب مستحقاته في مسير الرواتب الموحد.</div>
          <div class="article"><strong>المادة الثالثة:</strong> على كافة الجهات والإدارات المعنية ومديري الفروع تنفيذ هذا القرار كلٌ فيما يخصه.</div>
        </div>

        <div class="signatures">
          <div class="signature-box">مدير الفرع الأصلي<div class="stamp-box">التوقيع</div></div>
          <div class="signature-box">مدير الفرع المنتدب إليه<div class="stamp-box">التوقيع</div></div>
          <div class="signature-box">مدير عام الموارد البشرية<div class="stamp-box">الاعتماد والختم</div></div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 40px;">
          <button onclick="window.print()" style="padding: 10px 25px; background: #0284c7; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 15px;">🖨️ طباعة القرار الآن</button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Helper to generate schedule for fixed type
  function generateFixedSchedule(data) {
    if (!data.startDate) return {};
    const schedule = {};
    const start = new Date(data.startDate);
    const end = data.endDate ? new Date(data.endDate) : new Date(data.startDate);

    // Limit to 60 days max to prevent large payloads
    const diffDays = Math.min(60, Math.max(1, Math.round((end - start) / (1000 * 3600 * 24)) + 1));

    for (let i = 0; i < diffDays; i++) {
      const cur = new Date(start);
      cur.setDate(cur.getDate() + i);
      const curStr = cur.toISOString().slice(0, 10);
      schedule[curStr] = {
        type: 'shift',
        isOff: false,
        start: data.shiftStart || '09:00',
        end: data.shiftEnd || '17:00',
        hours: parseFloat(data.shiftHours) || 8,
        branchId: data.targetBranchId,
        label: 'وردية انتداب'
      };
    }
    return schedule;
  }

  const selectedEmpForForm = useMemo(() => {
    return employees.find((e) => String(e.id) === String(formData.employeeId));
  }, [employees, formData.employeeId]);

  return (
    <div className="secondments-module-container fade-in" style={{ padding: '20px', width: '100%', boxSizing: 'border-box' }}>
      
      {/* ── Top Header & Hero ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '15px',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
        padding: '20px 25px',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
        marginBottom: '25px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>🔀</span>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#f8fafc' }}>
              إدارة الانتدابات والنقل بين الفروع
            </h1>
            <span style={{
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              مزامنة بيومترية تلقائية (IoT ADMS)
            </span>
          </div>
          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' }}>
            انتداب الموظفين مؤقتاً أو مفتوحاً، وتحديد نظام الدوام (متغير أو ثابت)، وتوليد البصمة بالأجهزة آلياً وحساب الساعات الفعلية
          </p>
        </div>

        <button
          onClick={() => handleOpenCreateModal()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <span style={{ fontSize: '16px' }}>➕</span>
          <span>قرار انتداب / نقل موظف</span>
        </button>
      </div>

      {/* ── Statistics Cards Bar ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '15px',
        marginBottom: '25px'
      }}>
        {/* Card 1: Active */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(10px)',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>🟢</div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#10b981' }}>{stats.active}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>انتداب نشط حالياً</div>
          </div>
        </div>

        {/* Card 2: Expiring Soon */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(10px)',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>⏳</div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#f59e0b' }}>{stats.expiringSoon}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>تنتهي خلال 72 ساعة</div>
          </div>
        </div>

        {/* Card 3: Open Ended */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(10px)',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '10px',
            background: 'rgba(59, 130, 246, 0.15)',
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>♾️</div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#3b82f6' }}>{stats.openEnded}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>انتداب مفتوح المدة</div>
          </div>
        </div>

        {/* Card 4: Transferred */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(10px)',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(168, 85, 247, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '10px',
            background: 'rgba(168, 85, 247, 0.15)',
            color: '#c084fc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>🏢</div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#c084fc' }}>{stats.transferred}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>نقل دائم للفروع</div>
          </div>
        </div>
      </div>

      {/* ── Filters & Search Toolbar ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'rgba(30, 41, 59, 0.6)',
        padding: '14px 18px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        marginBottom: '20px'
      }}>
        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', label: `الكل (${stats.total})` },
            { id: 'ACTIVE', label: `النشطة (${stats.active})` },
            { id: 'OPEN_ENDED', label: `المفتوحة (${stats.openEnded})` },
            { id: 'TRANSFERRED', label: `النقل الدائم (${stats.transferred})` },
            { id: 'EXPIRED', label: 'المنتهية والمستدعاة' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              style={{
                background: filterStatus === tab.id ? 'rgba(2, 132, 199, 0.25)' : 'transparent',
                color: filterStatus === tab.id ? '#38bdf8' : '#94a3b8',
                border: filterStatus === tab.id ? '1px solid #0284c7' : '1px solid transparent',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: filterStatus === tab.id ? '700' : '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Branch Select */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '13px',
              outline: 'none'
            }}
          >
            <option value="">جميع الفروع (المُعارة والمُستضيفة)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '13px',
              minWidth: '220px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* ── Secondments List / Data Table ── */}
      {filteredSecondments.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'rgba(15, 23, 42, 0.4)',
          borderRadius: '14px',
          border: '1px dashed rgba(255, 255, 255, 0.12)',
          color: '#94a3b8'
        }}>
          <span style={{ fontSize: '42px', display: 'block', marginBottom: '12px' }}>📭</span>
          <h3 style={{ margin: '0 0 6px', color: '#cbd5e1' }}>لا توجد سجلات انتداب مطابقة للفلتر المحدد</h3>
          <p style={{ margin: 0, fontSize: '13px' }}>يمكنك إنشاء أول قرار انتداب بالضغط على زر "قرار انتداب / نقل موظف" أعلاه</p>
        </div>
      ) : (
        <div style={{
          background: 'rgba(15, 23, 42, 0.8)',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(30, 41, 59, 0.9)', color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '14px 16px' }}>الموظف</th>
                  <th style={{ padding: '14px 16px' }}>مسار الانتداب</th>
                  <th style={{ padding: '14px 16px' }}>الفترة الزمنية</th>
                  <th style={{ padding: '14px 16px' }}>نظام الدوام والأجور</th>
                  <th style={{ padding: '14px 16px' }}>الحالة</th>
                  <th style={{ padding: '14px 16px' }}>البصمة</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSecondments.map((sec) => {
                  const emp = employees.find((e) => String(e.id) === String(sec.employeeId));
                  const isSecActive = sec.status === 'ACTIVE';
                  const isPermTransfer = sec.status === 'TRANSFERRED' || sec.assignmentType === 'permanent_transfer';
                  const isExpired = sec.status === 'EXPIRED';
                  const isRecalled = sec.status === 'RECALLED';

                  return (
                    <tr
                      key={sec.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Employee Column */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: '#0284c7',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '14px'
                          }}>
                            {(sec.employeeName || 'م').charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: '#f8fafc' }}>{sec.employeeName}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                              كود: {sec.employeeCode || emp?.code || '—'} {emp?.jobTitle ? `| ${emp.jobTitle}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Path Column */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#94a3b8' }}>{sec.homeBranchName}</span>
                          <span style={{ color: '#38bdf8' }}>➡️</span>
                          <span style={{ fontWeight: '700', color: '#38bdf8' }}>{sec.targetBranchName}</span>
                        </div>
                        {sec.reason && (
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                            سبب: {sec.reason}
                          </div>
                        )}
                      </td>

                      {/* Period Column */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ color: '#e2e8f0', fontWeight: '600' }}>
                          {formatSecondmentPeriodText(sec)}
                        </div>
                        {isSecActive && sec.endDate && (
                          <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>
                            متبقي: {Math.max(0, Math.ceil((new Date(sec.endDate) - new Date(todayStr)) / (1000 * 3600 * 24)))} يوم
                          </div>
                        )}
                      </td>

                      {/* Schedule & Pay Column */}
                      <td style={{ padding: '14px 16px' }}>
                        <div>
                          {sec.scheduleType === 'variable' ? (
                            <span style={{
                              background: 'rgba(14, 165, 233, 0.15)',
                              color: '#38bdf8',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              ⏱️ مواعيد متغيرة (ساعات فعلية)
                            </span>
                          ) : (
                            <span style={{
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: '#818cf8',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              📅 جدول محدد ({Object.keys(sec.schedule || {}).length} يوم)
                            </span>
                          )}
                        </div>
                        {sec.secondmentAllowance > 0 && (
                          <div style={{ fontSize: '11px', color: '#34d399', marginTop: '4px' }}>
                            + بدل انتداب: {sec.secondmentAllowance} ج.م
                          </div>
                        )}
                      </td>

                      {/* Status Column */}
                      <td style={{ padding: '14px 16px' }}>
                        {isSecActive && (
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            🟢 نشط
                          </span>
                        )}
                        {isPermTransfer && (
                          <span style={{
                            background: 'rgba(168, 85, 247, 0.15)',
                            color: '#c084fc',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            🏢 نقل دائم
                          </span>
                        )}
                        {isExpired && (
                          <span style={{
                            background: 'rgba(148, 163, 184, 0.15)',
                            color: '#94a3b8',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            ⚪ منتهي المدة
                          </span>
                        )}
                        {isRecalled && (
                          <span style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '700'
                          }}>
                            🔴 تم الاستدعاء
                          </span>
                        )}
                      </td>

                      {/* Biometric Status */}
                      <td style={{ padding: '14px 16px' }}>
                        {isSecActive || isPermTransfer ? (
                          <span style={{ color: '#10b981', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>✓</span>
                            <span>بالجهاز</span>
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '12px' }}>
                            معطل
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {/* Print Decision */}
                          <button
                            title="طباعة القرار الإداري الرسمي"
                            onClick={() => handlePrintDecision(sec)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              color: '#f8fafc',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 9px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            🖨️
                          </button>

                          {isSecActive && (
                            <>
                              {/* Extend Button */}
                              <button
                                title="تمديد فترة الانتداب"
                                onClick={() => setExtendTargetSec(sec)}
                                style={{
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}
                              >
                                🔄 تمديد
                              </button>

                              {/* Recall Button */}
                              <button
                                title="استدعاء فوري وإنهاء الانتداب مع إيقاف البصمة بالجهاز"
                                onClick={() => setRecallTargetSec(sec)}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600'
                                }}
                              >
                                🛑 استدعاء
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Create New Secondment / Transfer ── */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '25px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            color: '#f8fafc'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🔀</span>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>
                  {formData.assignmentType === 'permanent_transfer' ? 'قرار نقل موظف نهائي' : 'قرار انتداب موظف لفرع آخر'}
                </h2>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >✕</button>
            </div>

            <form onSubmit={handleCreateSecondmentSubmit}>
              {/* Type Selector (Tabs) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                background: '#1e293b',
                padding: '5px',
                borderRadius: '10px',
                marginBottom: '20px'
              }}>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, assignmentType: 'temporary' })}
                  style={{
                    background: formData.assignmentType === 'temporary' ? '#0284c7' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  ⏱️ انتداب محدد المدة
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, assignmentType: 'open_ended', endDate: '' })}
                  style={{
                    background: formData.assignmentType === 'open_ended' ? '#0284c7' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  ♾️ انتداب مفتوح المدة
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, assignmentType: 'permanent_transfer', endDate: '' })}
                  style={{
                    background: formData.assignmentType === 'permanent_transfer' ? '#9333ea' : 'transparent',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  🏢 نقل دائم ونهائي
                </button>
              </div>

              {/* Employee & Target Branch Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                    الموظف المراد انتدابه / نقله *
                  </label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  >
                    <option value="">-- اختر الموظف --</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} (كود: {e.code || '—'}) - فرع: {e.branchName || 'الرئيسي'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                    الفرع المنتدب إليه (المُستضيف) *
                  </label>
                  <select
                    value={formData.targetBranchId}
                    onChange={(e) => setFormData({ ...formData, targetBranchId: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  >
                    <option value="">-- اختر الفرع --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: formData.assignmentType === 'temporary' ? '1fr 1fr' : '1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                    تاريخ بدء الانتداب / النقل *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {formData.assignmentType === 'temporary' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                      تاريخ انتهاء الانتداب *
                    </label>
                    <input
                      type="date"
                      value={formData.endDate}
                      min={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        background: '#1e293b',
                        color: '#f8fafc',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Schedule Type Selection (فكرة عبقرية ومطلوبة بدقة) */}
              {formData.assignmentType !== 'permanent_transfer' && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '10px',
                  padding: '15px',
                  marginBottom: '15px'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8', marginBottom: '10px' }}>
                    ⚙️ سياسة الجداول والورديات بالفرع المنتدب إليه:
                  </div>

                  <div style={{ display: 'flex', gap: '20px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="radio"
                        name="scheduleType"
                        value="variable"
                        checked={formData.scheduleType === 'variable'}
                        onChange={() => setFormData({ ...formData, scheduleType: 'variable' })}
                      />
                      <span><strong>بدون جدول (مواعيد متغيرة):</strong> حساب الراتب بالساعات الفعلية المنفذة</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="radio"
                        name="scheduleType"
                        value="fixed"
                        checked={formData.scheduleType === 'fixed'}
                        onChange={() => setFormData({ ...formData, scheduleType: 'fixed' })}
                      />
                      <span><strong>جدول ورديات محدد:</strong> إلزام بمواعيد شفت محددة</span>
                    </label>
                  </div>

                  {formData.scheduleType === 'fixed' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>وقت بدء الوردية</label>
                        <input
                          type="time"
                          value={formData.shiftStart}
                          onChange={(e) => setFormData({ ...formData, shiftStart: e.target.value })}
                          style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 8px', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>وقت انتهاء الوردية</label>
                        <input
                          type="time"
                          value={formData.shiftEnd}
                          onChange={(e) => setFormData({ ...formData, shiftEnd: e.target.value })}
                          style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 8px', fontSize: '12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>عدد الساعات اليومية</label>
                        <input
                          type="number"
                          value={formData.shiftHours}
                          onChange={(e) => setFormData({ ...formData, shiftHours: e.target.value })}
                          style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '6px 8px', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Financial & Allowances */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                    أجر الساعة بالفرع (ج.م) [اختياري - يترك فارغاً لاعتماد الأجر الأساسي]
                  </label>
                  <input
                    type="number"
                    placeholder="افتراضي الموظف"
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                    بدل انتداب إضافي (ج.م)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={formData.secondmentAllowance}
                    onChange={(e) => setFormData({ ...formData, secondmentAllowance: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Reason & Notes */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                  سبب الانتداب / النقل
                </label>
                <input
                  type="text"
                  placeholder="مثال: سد عجز صيدلي، افتتاح فرع، تغطية إجازات سنوية..."
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    color: '#f8fafc',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Biometric Push Toggle */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <input
                  type="checkbox"
                  id="biometricToggle"
                  checked={formData.autoDispatchBiometrics}
                  onChange={(e) => setFormData({ ...formData, autoDispatchBiometrics: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="biometricToggle" style={{ fontSize: '13px', color: '#a7f3d0', cursor: 'pointer' }}>
                  <strong>تزامن البصمة الحيوية الفوري:</strong> إرسال بيانات وبصمة الموظف تلقائياً لجهاز البصمة بالفرع المستهدف
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#cbd5e1',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    background: formData.assignmentType === 'permanent_transfer'
                      ? 'linear-gradient(135deg, #9333ea, #7e22ce)'
                      : 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
                  }}
                >
                  {isSubmitting ? 'جاري الحفظ والتزامن...' : (formData.assignmentType === 'permanent_transfer' ? 'تأكيد النقل النهائي' : 'اعتماد قرار الانتداب')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Recall Employee Early ── */}
      {recallTargetSec && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            padding: '25px',
            color: '#f8fafc'
          }}>
            <h3 style={{ margin: '0 0 10px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🛑</span>
              <span>استدعاء فوري وإنهاء الانتداب</span>
            </h3>
            <p style={{ margin: '0 0 15px', color: '#94a3b8', fontSize: '13px', lineHeight: '1.6' }}>
              هل أنت متأكد من إنهاء انتداب الموظف <strong>{recallTargetSec.employeeName}</strong> وعودته إلى فرعه الأساسي (<strong>{recallTargetSec.homeBranchName}</strong>)؟
              <br />
              <span style={{ color: '#fbbf24' }}>⚠️ سيتم إرسال أمر فوري لجهاز بصمة الفرع المستضيف لإلغاء صلاحية البصمة وتعطيلها.</span>
            </p>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>سبب الاستدعاء المبكر:</label>
              <input
                id="recallReasonInput"
                type="text"
                placeholder="انتهاء المهمة، حاجة الفرع الأساسي..."
                defaultValue="انتهاء مهمة الانتداب والعودة للفرع الأساسي"
                style={{ width: '100%', background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '8px', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setRecallTargetSec(null)}
                style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer' }}
              >
                تراجع
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => {
                  const val = document.getElementById('recallReasonInput')?.value;
                  handleRecallConfirm(val);
                }}
                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontWeight: '700', cursor: 'pointer' }}
              >
                {isSubmitting ? 'جاري الاستدعاء...' : 'تأكيد الاستدعاء وإيقاف البصمة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Extend Secondment ── */}
      {extendTargetSec && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            padding: '25px',
            color: '#f8fafc'
          }}>
            <h3 style={{ margin: '0 0 10px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔄</span>
              <span>تمديد فترة الانتداب</span>
            </h3>
            <p style={{ margin: '0 0 15px', color: '#94a3b8', fontSize: '13px' }}>
              تمديد انتداب الموظف <strong>{extendTargetSec.employeeName}</strong> لدى <strong>{extendTargetSec.targetBranchName}</strong>
            </p>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>تاريخ الانتهاء الجديد *</label>
              <input
                id="extendNewEndDate"
                type="date"
                defaultValue={extendTargetSec.endDate || todayStr}
                min={extendTargetSec.startDate || todayStr}
                style={{ width: '100%', background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '8px', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>سبب التمديد:</label>
              <input
                id="extendReasonInput"
                type="text"
                placeholder="استمرار حاجة العمل بالفرع..."
                defaultValue="استمرار حاجة العمل بالفرع المستضيف"
                style={{ width: '100%', background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '8px', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setExtendTargetSec(null)}
                style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer' }}
              >
                إلغاء
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => {
                  const d = document.getElementById('extendNewEndDate')?.value;
                  const r = document.getElementById('extendReasonInput')?.value;
                  handleExtendConfirm(d, r);
                }}
                style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', fontWeight: '700', cursor: 'pointer' }}
              >
                {isSubmitting ? 'جاري التمديد...' : 'حفظ التمديد'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
