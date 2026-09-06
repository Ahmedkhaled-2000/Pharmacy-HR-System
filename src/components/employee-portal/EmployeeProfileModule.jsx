import React, { useState } from 'react';
import { fmt, getEmpDisplayName } from '../../utils/formatters';
import { getJobsList } from '../../utils/jobsHelper';
import { compressImage } from '../../utils/imageCompressor';

export default function EmployeeProfileModule({
  emp,
  state,
  setState,
  saveState,
  showToast
}) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Profile editable fields state (STRICTLY RESTRICTED TO: Phones, Photo, Address, Marital Status)
  const [phones, setPhones] = useState(() => {
    if (Array.isArray(emp?.phones) && emp.phones.length > 0) {
      return emp.phones.map(p => ({ id: p.id || Math.random().toString(), number: p.number || '', type: p.type || 'mobile' }));
    }
    if (emp?.phone) {
      return [{ id: '1', number: emp.phone, type: 'mobile' }];
    }
    return [{ id: '1', number: '', type: 'mobile' }];
  });
  const [address, setAddress] = useState(emp?.address || '');
  const [maritalStatus, setMaritalStatus] = useState(emp?.maritalStatus || 'أعزب');
  const [photoUrl, setPhotoUrl] = useState(emp?.photoUrl || emp?.photo || '');
  const [requestNotes, setRequestNotes] = useState('');

  if (!emp) return null;

  const branches = state?.branches || [];
  const jobs = getJobsList(state);
  const mainBranch = branches.find(b => String(b.id) === String(emp.branchId)) || null;
  const jobInfo = jobs.find(j => j.title?.trim() === emp.jobTitle?.trim()) || null;

  // Handle Image Upload for Profile Photo
  const handlePhotoUpload = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast?.('⚠️ حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 10 ميجابايت');
      return;
    }

    try {
      const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.8 });
      setPhotoUrl(compressed);
      showToast?.('📸 تم تحميل وضغط الصورة بنجاح');
    } catch {
      showToast?.('❌ حدث خطأ أثناء معالجة الصورة');
    }
  };

  // Submit Profile Update Request (Routes to Senior Management / Admin)
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const cleanPhones = phones.filter(p => p.number && p.number.trim());
      if (cleanPhones.length === 0) {
        showToast?.('⚠️ يرجى إدخال رقم هاتف واحد على الأقل');
        setIsSubmitting(false);
        return;
      }

      const reqId = 'req_prof_' + Date.now();
      const newRequest = {
        id: reqId,
        type: 'profile_update',
        title: `طلب تحديث بيانات شخصية: ${emp.name}`,
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.name,
        branchId: emp.branchId,
        branchName: mainBranch?.name || '',
        status: 'pending_admin',
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        notes: requestNotes.trim(),
        proposedChanges: {
          phones: cleanPhones,
          address: address.trim(),
          maritalStatus,
          photoUrl
        },
        currentData: {
          phones: Array.isArray(emp.phones) ? emp.phones : (emp.phone ? [emp.phone] : []),
          address: emp.address || '',
          maritalStatus: emp.maritalStatus || 'أعزب',
          photoUrl: emp.photoUrl || ''
        },
        // Display summary for admin review
        summary: `طلب تحديث: ${cleanPhones.length} أرقام تواصل، العنوان: ${address || '—'}، الحالة: ${maritalStatus}`
      };

      // Notification for Admin
      const newNotification = {
        id: 'notif_' + Date.now(),
        type: 'profile_update_request',
        targetRole: 'admin',
        title: `👤 طلب تحديث بيانات شخصية جديد`,
        message: `الموظف ${emp.name} (كود ${emp.code}) تقدم بطلب لتحديث بياناته الشخصية (أرقام الهاتف / العنوان / الحالة الاجتماعية).`,
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.code,
        requestId: reqId,
        linkTab: 'requests',
        date: new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        read: false
      };

      const updatedRequests = [newRequest, ...(state?.requests || [])];
      const updatedNotifications = [newNotification, ...(state?.notifications || [])];
      const updatedState = {
        ...state,
        requests: updatedRequests,
        notifications: updatedNotifications
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('✅ تم إرسال طلب التحديث بنجاح إلى الإدارة للمراجعة والاعتماد');
      setShowEditModal(false);
    } catch {
      showToast?.('❌ حدث خطأ أثناء إرسال الطلب');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Branches details breakdown
  const branchesList = Array.isArray(emp.branchesDetails) && emp.branchesDetails.length > 0
    ? emp.branchesDetails
    : [
        {
          branchId: emp.branchId || '',
          salary: emp.salary || 0,
          workHours: emp.workHours || emp.workHoursPerDay || 8,
          workDays: emp.workDays || emp.workDaysPerMonth || 26,
          breakHours: emp.breakHours || emp.defaultBreakHours || 0
        }
      ];

  // Calculations per branch according to the approved formula:
  const computedBranches = branchesList.map((bd, idx) => {
    const bObj = branches.find((b) => String(b.id) === String(bd.branchId));
    const bName = bObj ? bObj.name : (bd.branchName || (idx === 0 && mainBranch ? mainBranch.name : `فرع ${idx + 1}`));
    const hourlyRateInput = parseFloat(bd.salary) || 0; // سعر الساعة الشهري المدخل
    const workHours = parseFloat(bd.workHours) || 8;
    const workDays = parseFloat(bd.workDays) || 26;
    const breakHours = parseFloat(bd.breakHours) || 0;
    const netHours = Math.max(0, workHours - breakHours);
    const effectiveHours = netHours > 0 ? netHours : workHours;

    // تطبيق نفس معادلة تفاصيل الراتب في الإدارة:
    // 1. سعر اليوم = (سعر الساعة الشهري * ساعات العمل) / أيام العمل
    const dayRate = workDays > 0 ? Math.round(((hourlyRateInput * workHours) / workDays) * 100) / 100 : 0;
    // 2. سعر الساعة اليومي الصافي = سعر اليوم / صافي ساعات العمل الفعلية
    const hourRate = effectiveHours > 0 ? Math.round((dayRate / effectiveHours) * 100) / 100 : 0;
    // 3. الراتب الأساسي الشهري = سعر الساعة الشهري * ساعات العمل
    const basicSalary = Math.round(hourlyRateInput * workHours * 100) / 100;

    return {
      branchId: bd.branchId,
      branchName: bName,
      branchCode: bObj?.branchCode || bd.branchCode || '',
      hourlyRateInput,
      basicSalary,
      workHours,
      workDays,
      breakHours,
      netHours,
      dayRate,
      hourRate
    };
  });

  const totalBasicSalary = computedBranches.reduce((acc, b) => acc + b.basicSalary, 0);

  const mgmtAllowance = parseFloat(emp.managementAllowance || emp.managementBonus) || 0;
  const transportAllowance = parseFloat(emp.transportAllowance) || 0;
  const dailyAttendanceAllowance = parseFloat(emp.dailyAttendanceAllowance) || 0;
  const customAllowances = Array.isArray(emp.customAllowances) ? emp.customAllowances : [];
  const totalCustomAllowances = customAllowances.reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
  const totalFixedAllowances = mgmtAllowance + transportAllowance + totalCustomAllowances;
  const totalMonthlyPackage = totalBasicSalary + totalFixedAllowances;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px', margin: '0 auto' }}>
      
      {/* ── SECTION 1: HERO HEADER & QUICK PROFILE CARD ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: '16px',
          border: '1.5px solid #e2e8f0',
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid #10b981',
              boxShadow: '0 4px 12px rgba(16,185,129,0.2)',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {emp.photoUrl || emp.photo ? (
              <img
                src={emp.photoUrl || emp.photo}
                alt={emp.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: '38px', color: '#94a3b8' }}>👤</span>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                {getEmpDisplayName(emp)}
              </h2>
              <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 800 }}>
                كود: {emp.code || '—'}
              </span>
              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 800 }}>
                {emp.status || 'على رأس العمل'}
              </span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', color: '#475569', fontSize: '13.5px', flexWrap: 'wrap' }}>
              <span>💼 <strong>{emp.jobTitle || 'موظف'}</strong></span>
              <span>•</span>
              <span>🏢 {emp.department || 'القسم غير محدد'}</span>
              <span>•</span>
              <span>📍 {mainBranch?.name || 'الفرع الرئيسي'}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-start"
          onClick={() => setShowEditModal(true)}
          style={{
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            padding: '10px 22px',
            fontSize: '13.5px',
            fontWeight: 800,
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(13,148,136,0.25)'
          }}
        >
          <span>✏️</span> طلب تحديث بيانات شخصية
        </button>
      </div>

      {/* ── SECTION 2: PERSONAL & CONTRACT DATA GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Personal Details Card */}
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '10px' }}>
            <span>👤</span> البيانات الشخصية
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>الرقم القومي:</span>
              <strong style={{ color: '#0f172a' }}>{emp.nationalId || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>تاريخ الميلاد:</span>
              <strong style={{ color: '#0f172a' }}>{emp.dob || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>الحالة الاجتماعية:</span>
              <strong style={{ color: '#0f172a' }}>{emp.maritalStatus || 'أعزب'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>هاتف الطوارئ / الأقارب:</span>
              <strong style={{ color: '#0f172a' }}>{emp.relativePhone || emp.emergencyPhone || '—'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '4px' }}>أرقام الهواتف المسجلة:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {Array.isArray(emp.phones) && emp.phones.length > 0 ? (
                  emp.phones.map((p, idx) => (
                    <span key={idx} style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, color: '#0369a1' }}>
                      📱 {p.number}
                    </span>
                  ))
                ) : (
                  <span style={{ color: '#0f172a', fontWeight: 700 }}>{emp.phone || '—'}</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
              <span style={{ color: '#64748b' }}>العنوان السكني:</span>
              <strong style={{ color: '#0f172a', maxWidth: '65%', textAlign: 'left' }}>{emp.address || '—'}</strong>
            </div>
          </div>
        </div>

        {/* Contract & Employment Card */}
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '10px' }}>
            <span>📝</span> بيانات التعاقد والوظيفة
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>المسمى الوظيفي:</span>
              <strong style={{ color: '#0f766e' }}>💼 {emp.jobTitle || 'موظف'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>القسم التابع له:</span>
              <strong style={{ color: '#0f172a' }}>🏢 {emp.department || 'عام'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>نوع العقد:</span>
              <strong style={{ color: '#0f172a' }}>{emp.contractType || 'دوام كامل'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>تاريخ بداية العمل:</span>
              <strong style={{ color: '#0f172a' }}>{emp.hireDate || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>رصيد الإجازات السنوية:</span>
              <strong style={{ color: '#15803d' }}>🏖️ {emp.annualLeaveBalance || 21} يوم / سنة</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
              <span style={{ color: '#64748b' }}>الفروع المكلف بها:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end' }}>
                {branchesList.map((bd, idx) => {
                  const bObj = branches.find(b => String(b.id) === String(bd.branchId));
                  return (
                    <span key={idx} style={{ background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                      📍 {bObj?.name || bd.branchName || `فرع ${idx + 1}`}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: JOB DESCRIPTION & RESPONSIBILITIES (Linked dynamically to Jobs Table) ── */}
      <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '20px' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📋</span> الوصف والمهام الوظيفية المعتمدة لوظيفة ({emp.jobTitle || 'موظف'})
        </h3>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '16px',
          color: '#334155',
          fontSize: '14px',
          lineHeight: '1.8'
        }}>
          {jobInfo?.description ? (
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{jobInfo.description}</p>
          ) : (
            <p style={{ margin: 0, color: '#94a3b8', fontStyle: 'italic' }}>
              لا يوجد وصف وظيفي محدد مسبقاً لهذه الوظيفة في هيكل الوظائف المعتمد. يمكنك التواصل مع الإدارة للاستفسار عن المهام التفصيلية.
            </p>
          )}
        </div>
      </div>

      {/* ── SECTION 4: FINANCIAL PACKAGE BREAKDOWN (Read-Only) ── */}
      <div style={{ background: '#fff', border: '1.5px solid #10b981', borderRadius: '14px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💵</span> الباقة المالية والتعاقدية المعتمدة
          </h3>
          <span style={{ fontSize: '12px', background: '#ecfdf5', color: '#047857', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>
            🔒 قراءة فقط (وفقاً للعقد المعتمد)
          </span>
        </div>

        {/* Big Total Monthly Package Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            borderRadius: '14px',
            padding: '16px 20px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            boxShadow: '0 4px 14px rgba(4,120,87,0.25)'
          }}
        >
          <div>
            <span style={{ fontSize: '12.5px', opacity: 0.9, display: 'block' }}>إجمالي الباقة التعاقدية الشهرية الثابتة</span>
            <div style={{ fontSize: '24px', fontWeight: 900, marginTop: '2px' }}>
              {fmt(totalMonthlyPackage)} <span style={{ fontSize: '14px', fontWeight: 600 }}>ج.م / شهرياً</span>
            </div>
          </div>
          <div style={{ textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.25)', paddingRight: '16px' }}>
            <div style={{ fontSize: '12px', opacity: 0.85 }}>الأساسي: {fmt(totalBasicSalary)} ج.م</div>
            <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '2px' }}>البدلات: {fmt(totalFixedAllowances)} ج.م</div>
          </div>
        </div>

        {/* 1. Branch Salaries & Hourly Rates Table */}
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏢</span> تفاصيل الراتب وساعات العمل حسب الفروع ({computedBranches.length})
          </h4>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>الفرع</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>سعر الساعة الشهري</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>الراتب الأساسي</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>ساعات / يوم</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>أيام / شهر</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>سعر اليوم</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>سعر الساعة الصافي</th>
                </tr>
              </thead>
              <tbody>
                {computedBranches.map((b, idx) => (
                  <tr key={b.branchId || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }}>
                      📍 {b.branchName}
                      {b.branchCode && <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>({b.branchCode})</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#4f46e5', whiteSpace: 'nowrap' }}>
                      {fmt(b.hourlyRateInput)} ج.م
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800, color: '#047857', whiteSpace: 'nowrap' }}>
                      {fmt(b.basicSalary)} ج.م
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <strong>{b.workHours}</strong> س
                      {b.breakHours > 0 && <span style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>({b.breakHours}س بريك)</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {b.workDays} يوم
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#0369a1', whiteSpace: 'nowrap' }}>
                      {fmt(b.dayRate)} ج.م
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800, color: '#b45309', whiteSpace: 'nowrap' }}>
                      {fmt(b.hourRate)} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Allowances Breakdown Grid */}
        <div>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🎁</span> البدلات والمخصصات التعاقدية
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>بدل الإدارة (شهري)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: mgmtAllowance > 0 ? '#15803d' : '#94a3b8', marginTop: '2px' }}>
                {mgmtAllowance > 0 ? `${fmt(mgmtAllowance)} ج.م` : 'غير مخصص'}
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>بدل الانتقال (شهري)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: transportAllowance > 0 ? '#0369a1' : '#94a3b8', marginTop: '2px' }}>
                {transportAllowance > 0 ? `${fmt(transportAllowance)} ج.م` : 'غير مخصص'}
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>بدل الحضور اليومي (بالبصمة)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: dailyAttendanceAllowance > 0 ? '#b45309' : '#94a3b8', marginTop: '2px' }}>
                {dailyAttendanceAllowance > 0 ? `${fmt(dailyAttendanceAllowance)} ج.م / يوم` : 'غير مخصص'}
              </div>
            </div>

            {customAllowances.map((ca, cIdx) => (
              <div key={ca.id || cIdx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', color: '#64748b' }}>{ca.title || `بدل إضافي ${cIdx + 1}`}</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                  {fmt(parseFloat(ca.amount) || 0)} ج.م
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MODAL: REQUEST PROFILE DATA UPDATE (STRICT FIELD RESTRICTION) ── */}
      {showEditModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div
            className="modal-card fade-in"
            style={{
              maxWidth: '620px',
              width: '95%',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '16px',
              border: '2px solid #0d9488',
              padding: '24px',
              background: '#fff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✏️</span> طلب تحديث بيانات شخصية
              </h3>
              <button type="button" className="icon-btn" onClick={() => setShowEditModal(false)}>✕</button>
            </div>

            {/* Strict Notice */}
            <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', color: '#92400e', fontSize: '12.5px', lineHeight: '1.6' }}>
              <strong>⚠️ سياسة النظام:</strong> يُسمح للموظف بتقديم طلب تحديث محصور فقط في: <strong>(أرقام الهواتف، الصورة الشخصية، العنوان، الحالة الاجتماعية)</strong>.
              يتم مراجعة الطلب واعتماده من قبل الإدارة العليا قبل تطبيقه رسمياً في ملفك.
            </div>

            <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Photo Upload */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>الصورة الشخصية:</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0d9488', background: '#f1f5f9' }}>
                    {photoUrl ? (
                      <img src={photoUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '24px' }}>👤</div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* Phone Numbers */}
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>أرقام الهواتف والتواصل *</label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '12px', padding: '2px 8px' }}
                    onClick={() => setPhones([...phones, { id: Math.random().toString(), number: '', type: 'mobile' }])}
                  >
                    ➕ إضافة رقم هاتف
                  </button>
                </div>
                {phones.map((p, idx) => (
                  <div key={p.id || idx} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input
                      type="tel"
                      value={p.number}
                      placeholder="رقم الهاتف (مثال: 01012345678)"
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setPhones(phones.map((item, i) => i === idx ? { ...item, number: val } : item));
                      }}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      required={idx === 0}
                    />
                    {phones.length > 1 && (
                      <button
                        type="button"
                        className="del-btn"
                        style={{ padding: '6px 10px' }}
                        onClick={() => setPhones(phones.filter((_, i) => i !== idx))}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Marital Status */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>الحالة الاجتماعية:</label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                >
                  <option value="أعزب">أعزب</option>
                  <option value="متزوج">متزوج</option>
                  <option value="متزوج ويعول">متزوج ويعول</option>
                  <option value="مطلق">مطلق</option>
                  <option value="أرمل">أرمل</option>
                </select>
              </div>

              {/* Address */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>العنوان السكني الجديد:</label>
                <input
                  type="text"
                  value={address}
                  placeholder="اكتب العنوان بالتفصيل..."
                  onChange={(e) => setAddress(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              {/* Request Notes */}
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>ملاحظات إضافية للإدارة (اختياري):</label>
                <textarea
                  rows="2"
                  value={requestNotes}
                  placeholder="سبب التحديث أو أي تفاصيل توضيحية..."
                  onChange={(e) => setRequestNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowEditModal(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-start"
                  disabled={isSubmitting}
                  style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', padding: '9px 24px' }}
                >
                  {isSubmitting ? 'جاري الإرسال...' : '🚀 إرسال طلب التحديث للإدارة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
