import React, { useState, useMemo } from 'react';
import { getEmpDisplayName, normalizeState, isEmployeeActive } from '../../utils/formatters';
import { emitRevokeSession } from '../../utils/socketClient';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../../utils/excelExport';

export default function EmployeeCredentialsModal({
  isOpen = true,
  onClose,
  employees = [],
  branches = [],
  state,
  setState,
  saveState,
  showToast,
  openEditEmpModal
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [passwordTypeFilter, setPasswordTypeFilter] = useState('all'); // 'all' | 'default' | 'custom'
  const [showAllPasswords, setShowAllPasswords] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);

  // ── Quick Edit State ──
  const [editingEmp, setEditingEmp] = useState(null);
  const [editCode, setEditCode] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editShowPassword, setEditShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const cleanDigits = (numStr) => String(numStr || '').replace(/\D/g, '');

  // ── Copy Helper ──
  const handleCopy = (text, key, label = 'النص') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    if (showToast) showToast(`تم نسخ ${label} بنجاح 📋`);
  };

  // ── Toggle Password Visibility for Single Employee ──
  const toggleSinglePassword = (empId) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [empId]: !prev[empId]
    }));
  };

  // ── Toggle All Passwords ──
  const handleToggleAllPasswords = () => {
    const nextState = !showAllPasswords;
    setShowAllPasswords(nextState);
    if (!nextState) {
      setVisiblePasswords({});
    }
  };

  // ── Generate Random Secure Password (e.g. 6 digits or friendly alphanumeric) ──
  const generateRandomPassword = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let pass = '';
    // 6 random friendly chars
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setEditPassword(pass);
    setEditShowPassword(true);
  };

  // ── Open Quick Edit ──
  const startEditing = (emp) => {
    setEditingEmp(emp);
    setEditCode(emp.code || '');
    setEditUsername(emp.username || '');
    setEditPassword(emp.password || '123');
    setEditShowPassword(true);
    setSaveError('');
  };

  // ── Save Quick Edit with Instant Session Revocation ──
  const handleSaveEdit = async () => {
    if (!editingEmp) return;
    setSaveError('');

    const targetCode = String(editCode || '').trim();
    const targetUsername = String(editUsername || '').trim();
    const targetPassword = String(editPassword || '').trim();

    if (!targetCode) {
      setSaveError('يرجى تحديد كود الموظف (اسم المستخدم الرئيسي)');
      return;
    }
    if (!targetPassword) {
      setSaveError('يرجى تحديد كلمة المرور الخاصة بحساب الموظف');
      return;
    }

    // Check code duplication
    const allEmps = state?.employees || employees || [];
    const duplicate = allEmps.find(
      (e) => String(e.id) !== String(editingEmp.id) &&
        String(e.code || '').trim().toLowerCase() === targetCode.toLowerCase()
    );
    if (duplicate) {
      setSaveError(`الكود "${targetCode}" مستخدم بالفعل لموظف آخر (${duplicate.name || 'موظف'})`);
      return;
    }

    setIsSaving(true);
    try {
      const oldPass = String(editingEmp.password || '123').trim();
      const oldCode = String(editingEmp.code || '').trim();
      const isPasswordChanged = oldPass !== targetPassword;
      const isCodeChanged = oldCode !== targetCode;

      // 1. Calculate new session version
      const currentVer = Number(editingEmp.sessionVersion || 0);
      const nextSessionVer = (isPasswordChanged || isCodeChanged) ? currentVer + 1 : currentVer;

      // 2. Prepare updated employee data
      const updatedEmps = allEmps.map((e) => {
        if (String(e.id) === String(editingEmp.id)) {
          return {
            ...e,
            code: targetCode,
            username: targetUsername || e.username || '',
            password: targetPassword,
            sessionVersion: nextSessionVer,
            passwordChangedAt: isPasswordChanged ? new Date().toISOString() : (e.passwordChangedAt || null),
            updatedAt: new Date().toISOString()
          };
        }
        return e;
      });

      // 3. Update unified access credentials if present
      let updatedOrgSettings = state?.orgSettings ? { ...state.orgSettings } : null;
      if (updatedOrgSettings?.employeeUnifiedAccess) {
        const uAccessMap = { ...updatedOrgSettings.employeeUnifiedAccess };
        const key = uAccessMap[editingEmp.id] ? editingEmp.id : (uAccessMap[oldCode] ? oldCode : null);
        if (key && uAccessMap[key]) {
          uAccessMap[key] = {
            ...uAccessMap[key],
            credentials: {
              ...(uAccessMap[key].credentials || {}),
              username: targetUsername || targetCode,
              password: targetPassword
            }
          };
          updatedOrgSettings.employeeUnifiedAccess = uAccessMap;
        }
      }

      // 4. Update state
      const updatedState = normalizeState({
        ...(state || {}),
        employees: updatedEmps,
        ...(updatedOrgSettings ? { orgSettings: updatedOrgSettings } : {})
      });

      if (setState) setState(updatedState);

      // 5. Emit Real-time Session Revocation (instant < 10ms logout for employee across all devices)
      if (isPasswordChanged || isCodeChanged) {
        // Emit for old code / id
        emitRevokeSession({
          role: 'employee',
          targetId: editingEmp.id,
          targetCode: oldCode,
          sessionVersion: nextSessionVer,
          reason: 'employee_password_changed'
        });

        // Also emit for new code if changed
        if (isCodeChanged && targetCode) {
          emitRevokeSession({
            role: 'employee',
            targetId: editingEmp.id,
            targetCode: targetCode,
            sessionVersion: nextSessionVer,
            reason: 'employee_password_changed'
          });
        }
      }

      // 6. Persist to server / database
      if (saveState) {
        await saveState(updatedState);
      }

      // 7. Toast feedback
      if (showToast) {
        if (isPasswordChanged) {
          showToast(`🔒 تم تعديل كلمة مرور (${getEmpDisplayName(editingEmp)}) بنجاح وتم إنهاء كافة الجلسات النشطة فوراً للأمان.`);
        } else {
          showToast(`✅ تم تحديث بيانات دخول (${getEmpDisplayName(editingEmp)}) بنجاح.`);
        }
      }

      setEditingEmp(null);
    } catch (err) {
      console.error('[EmployeeCredentialsModal] Error saving credentials:', err);
      setSaveError(err.message || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setIsSaving(false);
    }
  };

  // ── WhatsApp Message Generator ──
  const handleCopyWhatsApp = (emp) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const loginUser = emp.code || emp.username || '';
    const loginPass = emp.password || '123';
    const empName = getEmpDisplayName(emp);

    const msg = `مرحباً د/ ${empName} 🌸\nإليك بيانات دخولك الرسمية لبوابة الموظفين الخاصة بالمنظومة:\n\n🌐 رابط البوابة:\n${origin}/#portal\n\n👤 اسم المستخدم / كود الدخول:\n${loginUser}\n\n🔑 كلمة المرور:\n${loginPass}\n\n(يرجى تسجيل الدخول والاحتفاظ ببياناتك سرية). بالتوفيق دائماً! ✨`;

    handleCopy(msg, `wa_${emp.id}`, 'رسالة الدخول للواتساب');
  };

  // ── Pre-process employee list ──
  const processedEmployees = useMemo(() => {
    const allEmps = state?.employees || employees || [];
    return allEmps.map((emp) => {
      // Branch display
      let branchNames = [];
      if (emp.branchesDetails && emp.branchesDetails.length > 0) {
        branchNames = emp.branchesDetails.map((bd) => {
          const b = branches.find((br) => String(br.id) === String(bd.branchId));
          return b ? b.name : `فرع ${bd.branchId}`;
        });
      } else if (emp.branchId) {
        const b = branches.find((br) => String(br.id) === String(emp.branchId));
        if (b) branchNames.push(b.name);
      }
      const branchDisplay = branchNames.length > 0 ? branchNames.join(' · ') : 'غير محدد';

      const isActive = isEmployeeActive(emp);
      const pass = emp.password || '123';
      const isDefaultPass = pass === '123';

      // Unified access check
      const uAccess = state?.orgSettings?.employeeUnifiedAccess?.[emp.id] ||
        state?.orgSettings?.employeeUnifiedAccess?.[emp.code] ||
        emp.unifiedAccess;
      const hasUnifiedAccess = Boolean(uAccess && uAccess.isEnabled);

      return {
        ...emp,
        branchDisplay,
        isActive,
        effectivePassword: pass,
        isDefaultPass,
        hasUnifiedAccess
      };
    });
  }, [state?.employees, employees, branches, state?.orgSettings?.employeeUnifiedAccess]);

  // ── Statistics ──
  const stats = useMemo(() => {
    const total = processedEmployees.length;
    const activeCount = processedEmployees.filter((e) => e.isActive).length;
    const defaultPassCount = processedEmployees.filter((e) => e.isDefaultPass).length;
    const customPassCount = total - defaultPassCount;
    return { total, activeCount, defaultPassCount, customPassCount };
  }, [processedEmployees]);

  // ── Filtered Employees ──
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return processedEmployees.filter((emp) => {
      // Status filter
      if (statusFilter === 'active' && !emp.isActive) return false;

      // Branch filter
      if (branchFilter !== 'all') {
        const isInBranch = (emp.branchId && String(emp.branchId) === String(branchFilter)) ||
          (emp.branchesDetails && emp.branchesDetails.some((bd) => String(bd.branchId) === String(branchFilter)));
        if (!isInBranch) return false;
      }

      // Password type filter
      if (passwordTypeFilter === 'default' && !emp.isDefaultPass) return false;
      if (passwordTypeFilter === 'custom' && emp.isDefaultPass) return false;

      // Search Query
      if (q) {
        const matches = (
          (emp.name && emp.name.toLowerCase().includes(q)) ||
          (emp.nickname && emp.nickname.toLowerCase().includes(q)) ||
          (emp.code && emp.code.toLowerCase().includes(q)) ||
          (emp.username && emp.username.toLowerCase().includes(q)) ||
          (emp.jobTitle && emp.jobTitle.toLowerCase().includes(q)) ||
          (emp.branchDisplay && emp.branchDisplay.toLowerCase().includes(q)) ||
          (emp.phone && cleanDigits(emp.phone).includes(q))
        );
        if (!matches) return false;
      }

      return true;
    });
  }, [processedEmployees, searchQuery, branchFilter, statusFilter, passwordTypeFilter]);

  // ── Export To Excel ──
  const handleExportExcel = async () => {
    try {
      if (showToast) showToast('جاري تصدير كشف يوزريات وكلمات مرور الموظفين...');
      const ExcelJS = await loadExcelJS(showToast);
      const wb = new ExcelJS.Workbook();
      wb.creator = state?.orgSettings?.name || 'Pharmacy HR System';

      const ws = wb.addWorksheet('يوزريات_الموظفين', {
        views: [{ rightToLeft: true, showGridLines: true }]
      });

      // 1. Title Banner
      mergedTitle(
        ws,
        1,
        `كشف حسابات ويوزريات دخول الموظفين - ${state?.orgSettings?.name || 'إدارة الموارد البشرية'}`,
        9,
        'FF1E293B',
        14,
        35
      );

      // 2. Headers
      const headers = [
        'م',
        'اسم الموظف',
        'الاسم الحركي',
        'الفرع',
        'الوظيفة',
        'كود الدخول (اليوزر)',
        'اسم مستخدم مخصص',
        'كلمة المرور',
        'حالة كلمة السر',
        'الحالة'
      ];
      tableHeaderRow(ws, 2, headers);

      // 3. Data Rows
      filteredEmployees.forEach((emp, idx) => {
        const rowVals = [
          idx + 1,
          getEmpDisplayName(emp),
          emp.nickname || '-',
          emp.branchDisplay || 'غير محدد',
          emp.jobTitle || 'موظف',
          emp.code || '-',
          emp.username || '-',
          emp.effectivePassword,
          emp.isDefaultPass ? 'افتراضية (123)' : 'مخصصة ومعدلة',
          emp.isActive ? 'على رأس العمل' : 'مستقيل'
        ];
        dataRow(ws, idx + 3, rowVals);
      });

      // Auto-fit column widths
      ws.columns.forEach((col) => {
        let maxLen = 12;
        col.eachCell({ includeEmpty: true }, (cell) => {
          const val = cell.value ? String(cell.value) : '';
          if (val.length > maxLen) maxLen = Math.min(val.length + 4, 35);
        });
        col.width = maxLen;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كشف_يوزريات_دخول_الموظفين_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      if (showToast) showToast('تم تنزيل كشف الإكسل بنجاح 📗');
    } catch (e) {
      console.error('[ExportExcel Error]:', e);
      if (showToast) showToast('حدث خطأ أثناء تصدير ملف الإكسل');
    }
  };

  // ── Printable Report ──
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=950,height=700');
    if (!printWindow) {
      if (showToast) showToast('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    const orgName = state?.orgSettings?.name || 'منظومة إدارة الموارد البشرية';
    const dateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>كشف يوزريات وكلمات سر الموظفين - ${orgName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
          body {
            font-family: 'Cairo', Tahoma, sans-serif;
            margin: 20px;
            color: #0f172a;
            direction: rtl;
            background: #ffffff;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .header h1 { margin: 0 0 6px 0; font-size: 20px; color: #1e293b; }
          .header p { margin: 0; font-size: 13px; color: #64748b; }
          .stats-bar {
            display: flex;
            justifyContent: space-around;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 8px 14px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 12px;
            font-weight: bold;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            text-align: center;
          }
          th {
            background-color: #f1f5f9;
            color: #1e293b;
            font-weight: 700;
          }
          tr:nth-child(even) { background-color: #f8fafc; }
          .code-cell {
            font-family: monospace;
            font-size: 13px;
            font-weight: bold;
            background: #e0f2fe;
            color: #0369a1;
            padding: 3px 6px;
            border-radius: 4px;
          }
          .pass-cell {
            font-family: monospace;
            font-size: 13px;
            font-weight: bold;
            background: #fef3c7;
            color: #92400e;
            padding: 3px 6px;
            border-radius: 4px;
          }
          .footer {
            margin-top: 30px;
            display: flex;
            justifyContent: space-between;
            font-size: 12px;
            color: #475569;
            border-top: 1px dashed #cbd5e1;
            padding-top: 14px;
          }
          @media print {
            body { margin: 10mm; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🔐 كشف بيانات دخول ويوزريات الموظفين</h1>
          <p>${orgName} · تاريخ الاستخراج: ${dateStr}</p>
        </div>

        <div class="stats-bar">
          <span>إجمالي المعروضين: ${filteredEmployees.length} موظف</span>
          <span>كلمات مرور مخصصة: ${filteredEmployees.filter(e => !e.isDefaultPass).length}</span>
          <span>كلمات مرور افتراضية (123): ${filteredEmployees.filter(e => e.isDefaultPass).length}</span>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px;">م</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>الوظيفة</th>
              <th>اسم الدخول (الكود)</th>
              <th>اسم مستخدم مخصص</th>
              <th>كلمة المرور</th>
              <th>حالة الحساب</th>
            </tr>
          </thead>
          <tbody>
            ${filteredEmployees.map((emp, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td style="text-align: right; font-weight: bold;">${getEmpDisplayName(emp)}</td>
                <td>${emp.branchDisplay || '-'}</td>
                <td>${emp.jobTitle || '-'}</td>
                <td><span class="code-cell">${emp.code || '-'}</span></td>
                <td>${emp.username || '-'}</td>
                <td><span class="pass-cell">${emp.effectivePassword}</span></td>
                <td>${emp.isActive ? '🟢 على رأس العمل' : '🔴 مستقيل'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>توقيع مسؤول الموارد البشرية: ..............................</div>
          <div>اعتماد الإدارة العامة: ..............................</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 1150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        position: 'fixed',
        inset: 0,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '1100px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface, #ffffff)',
          borderRadius: '18px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border, #e2e8f0)',
          overflow: 'hidden'
        }}
      >
        {/* ── Modal Header ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 24px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.04) 0%, rgba(99, 102, 241, 0.08) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
              }}
            >
              🔐
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text, #1e293b)', fontFamily: 'Cairo' }}>
                  سجل بيانات دخول ويوزريات الموظفين
                </h3>
                <span
                  style={{
                    background: '#e0e7ff',
                    color: '#3730a3',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}
                >
                  {filteredEmployees.length} حساب
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--muted, #64748b)' }}>
                إدارة أسماء المستخدمين، وكلمات المرور، وإبطال الجلسات النشطة فورياً عند أي تعديل لضمان الأمان
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleExportExcel}
              style={{
                background: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px'
              }}
              title="تصدير جدول اليوزريات إلى Excel"
            >
              <span>📗</span> تصدير Excel
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handlePrint}
              style={{
                background: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px'
              }}
              title="طباعة كشف معتمد باليوزريات"
            >
              <span>🖨️</span> طباعة الكشف
            </button>

            <button
              type="button"
              className="btn btn-ghost modal-close-btn"
              onClick={onClose}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                padding: 0,
                color: 'var(--muted, #64748b)',
                border: '1px solid var(--border, #e2e8f0)'
              }}
              title="إغلاق"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Security & Stats Quick Bar ── */}
        <div
          style={{
            padding: '10px 24px',
            background: 'var(--surface-muted, #f8fafc)',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text, #334155)' }}>
              👥 إجمالي الموظفين: <strong>{stats.total}</strong>
            </span>
            <span style={{ color: '#16a34a' }}>
              🟢 النشطون: <strong>{stats.activeCount}</strong>
            </span>
            <span style={{ color: '#d97706' }}>
              🔑 كلمات مرور افتراضية (123): <strong>{stats.defaultPassCount}</strong>
            </span>
            <span style={{ color: '#4f46e5' }}>
              🛡️ كلمات مرور مخصصة: <strong>{stats.customPassCount}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#059669', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>⚡</span> طرد وإنهاء الجلسات فور تغيير الباسورد: <strong>مفعل لحظياً</strong>
            </span>
            <button
              type="button"
              onClick={handleToggleAllPasswords}
              style={{
                background: showAllPasswords ? '#fee2e2' : '#e0e7ff',
                color: showAllPasswords ? '#b91c1c' : '#4338ca',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span>{showAllPasswords ? '🙈' : '👁️'}</span>
              <span>{showAllPasswords ? 'إخفاء كافة كلمات السر' : 'إظهار كافة كلمات السر'}</span>
            </button>
          </div>
        </div>

        {/* ── Search & Filter Controls ── */}
        <div
          style={{
            padding: '14px 24px 10px',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'center',
            background: 'var(--surface, #ffffff)'
          }}
        >
          {/* Search Input */}
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 ابحث بالاسم، الكود، اليوزر، المسمى الوظيفي، أو الفرع..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ep-input"
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border, #cbd5e1)',
                fontSize: '13px'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted, #94a3b8)',
                  fontSize: '14px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Branch Filter */}
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="ep-input"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid var(--border, #cbd5e1)',
              fontSize: '12.5px',
              background: 'var(--surface, #ffffff)',
              color: 'var(--text, #334155)'
            }}
          >
            <option value="all">🏢 جميع الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ep-input"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid var(--border, #cbd5e1)',
              fontSize: '12.5px',
              background: 'var(--surface, #ffffff)',
              color: 'var(--text, #334155)'
            }}
          >
            <option value="active">🟢 على رأس العمل فقط</option>
            <option value="all">🌐 كافة الموظفين (بما فيهم المستقيلين)</option>
          </select>

          {/* Password Filter */}
          <select
            value={passwordTypeFilter}
            onChange={(e) => setPasswordTypeFilter(e.target.value)}
            className="ep-input"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid var(--border, #cbd5e1)',
              fontSize: '12.5px',
              background: 'var(--surface, #ffffff)',
              color: 'var(--text, #334155)'
            }}
          >
            <option value="all">🔑 كافة كلمات المرور</option>
            <option value="default">⚠️ الافتراضية (123) فقط</option>
            <option value="custom">🛡️ المخصصة والمعدلة فقط</option>
          </select>
        </div>

        {/* ── Table Content Area ── */}
        <div
          className="modal-card-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 24px 20px',
            minHeight: 0
          }}
        >
          {filteredEmployees.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--muted, #64748b)',
                background: 'var(--surface-muted, #f8fafc)',
                borderRadius: '14px',
                border: '1px dashed var(--border, #e2e8f0)',
                margin: '10px 0'
              }}
            >
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>🔍</div>
              <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--text, #1e293b)' }}>
                لا توجد نتائج مطابقة لمعايير البحث
              </h4>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                جرب البحث باسم آخر أو تغيير فلاتر الفروع والحالة
              </p>
            </div>
          ) : (
            <div
              style={{
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '13px',
                  textAlign: 'right'
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: 'var(--surface-muted, #f1f5f9)',
                      borderBottom: '1px solid var(--border, #cbd5e1)',
                      color: 'var(--text, #334155)'
                    }}
                  >
                    <th style={{ padding: '12px 14px', width: '45px', textAlign: 'center' }}>#</th>
                    <th style={{ padding: '12px 14px' }}>الموظف</th>
                    <th style={{ padding: '12px 14px' }}>الفرع والوظيفة</th>
                    <th style={{ padding: '12px 14px' }}>اسم المستخدم للدخول</th>
                    <th style={{ padding: '12px 14px' }}>كلمة المرور</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>الحالة</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>إجراءات الحساب</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp, idx) => {
                    const isPassVisible = showAllPasswords || Boolean(visiblePasswords[emp.id]);
                    const passText = emp.effectivePassword;
                    const isCopiedUser = copiedKey === `user_${emp.id}`;
                    const isCopiedPass = copiedKey === `pass_${emp.id}`;
                    const isCopiedWA = copiedKey === `wa_${emp.id}`;

                    return (
                      <tr
                        key={emp.id}
                        style={{
                          borderBottom: '1px solid var(--border, #f1f5f9)',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(238, 242, 255, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)';
                        }}
                      >
                        {/* Index */}
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--muted, #94a3b8)', fontSize: '12px' }}>
                          {idx + 1}
                        </td>

                        {/* Employee Name & Avatar */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: emp.isActive
                                  ? 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)'
                                  : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                                color: emp.isActive ? '#4338ca' : '#b91c1c',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '13px',
                                flexShrink: 0
                              }}
                            >
                              {emp.photoUrl ? (
                                <img
                                  src={emp.photoUrl}
                                  alt={getEmpDisplayName(emp)}
                                  style={{ width: '100%', height: '100%', borderRadius: '10px', objectFit: 'cover' }}
                                />
                              ) : (
                                <span>{getEmpDisplayName(emp)?.charAt(0) || 'م'}</span>
                              )}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text, #1e293b)', fontSize: '13.5px' }}>
                                  {getEmpDisplayName(emp)}
                                </span>
                                {emp.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                                  <span style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>
                                    ({emp.nickname})
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', marginTop: '2px' }}>
                                كود: <strong style={{ color: 'var(--text, #334155)' }}>{emp.code}</strong>
                                {emp.phone && ` · هاتف: ${emp.phone}`}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Branch & Job Title */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text, #334155)' }}>
                            💼 {emp.jobTitle || 'موظف'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)', marginTop: '2px' }}>
                            📍 {emp.branchDisplay}
                          </div>
                        </td>

                        {/* Username (Code / Custom Username) */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '13px',
                                background: '#f1f5f9',
                                color: '#0f172a',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                letterSpacing: '0.5px'
                              }}
                            >
                              {emp.code}
                            </span>
                            {emp.username && emp.username !== emp.code && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: '#4338ca',
                                  background: '#e0e7ff',
                                  padding: '2px 6px',
                                  borderRadius: '4px'
                                }}
                                title="اسم مستخدم مخصص"
                              >
                                {emp.username}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCopy(emp.code, `user_${emp.id}`, 'اسم المستخدم')}
                              style={{
                                border: 'none',
                                background: isCopiedUser ? '#dcfce7' : '#f8fafc',
                                color: isCopiedUser ? '#15803d' : '#64748b',
                                padding: '3px 6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                transition: 'all 0.15s ease'
                              }}
                              title="نسخ اسم المستخدم"
                            >
                              {isCopiedUser ? '✅ تم النسخ' : '📋 نسخ'}
                            </button>
                          </div>
                        </td>

                        {/* Password */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: emp.isDefaultPass ? '#fffbeb' : '#f0fdf4',
                                border: emp.isDefaultPass ? '1px solid #fde68a' : '1px solid #bbf7d0',
                                padding: '3px 8px',
                                borderRadius: '6px'
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: isPassVisible ? 'monospace' : 'inherit',
                                  fontWeight: 800,
                                  fontSize: isPassVisible ? '13px' : '14px',
                                  color: emp.isDefaultPass ? '#b45309' : '#15803d',
                                  letterSpacing: isPassVisible ? '1px' : '3px'
                                }}
                              >
                                {isPassVisible ? passText : '••••••••'}
                              </span>

                              <button
                                type="button"
                                onClick={() => toggleSinglePassword(emp.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '0 2px',
                                  fontSize: '13px',
                                  color: 'var(--muted, #64748b)'
                                }}
                                title={isPassVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                              >
                                {isPassVisible ? '🙈' : '👁️'}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCopy(passText, `pass_${emp.id}`, 'كلمة المرور')}
                              style={{
                                border: 'none',
                                background: isCopiedPass ? '#dcfce7' : '#f1f5f9',
                                color: isCopiedPass ? '#15803d' : '#64748b',
                                padding: '3px 6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                transition: 'all 0.15s ease'
                              }}
                              title="نسخ كلمة السر"
                            >
                              {isCopiedPass ? '✅ تم النسخ' : '📋 نسخ'}
                            </button>

                            {emp.isDefaultPass ? (
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  color: '#b45309',
                                  background: '#fef3c7',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}
                                title="كلمة مرور افتراضية لم يتم تغييرها بعد"
                              >
                                افتراضية
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  color: '#15803d',
                                  background: '#dcfce7',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}
                                title="تم تغييرها وتخصيصها"
                              >
                                مخصصة
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {emp.isActive ? (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#166534',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                display: 'inline-block'
                              }}
                            >
                              نشط
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#fee2e2',
                                color: '#991b1b',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                display: 'inline-block'
                              }}
                            >
                              مستقيل
                            </span>
                          )}
                          {emp.hasUnifiedAccess && (
                            <div style={{ marginTop: '3px' }}>
                              <span
                                style={{
                                  background: '#fae8ff',
                                  color: '#86198f',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px'
                                }}
                              >
                                👑 حساب موحد
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {/* Quick Edit Button */}
                            <button
                              type="button"
                              onClick={() => startEditing(emp)}
                              style={{
                                background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                color: '#ffffff',
                                border: 'none',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)'
                              }}
                              title="تعديل اسم الدخول أو كلمة المرور وإنهاء الجلسات فوراً"
                            >
                              <span>✏️</span> تعديل
                            </button>

                            {/* WhatsApp Copy Template */}
                            <button
                              type="button"
                              onClick={() => handleCopyWhatsApp(emp)}
                              style={{
                                background: isCopiedWA ? '#22c55e' : '#ecfdf5',
                                color: isCopiedWA ? '#ffffff' : '#047857',
                                border: '1px solid #a7f3d0',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease'
                              }}
                              title="نسخ رسالة جاهزة لإرسال بيانات الدخول للموظف عبر الواتساب"
                            >
                              <span>💬</span>
                              <span>{isCopiedWA ? 'تم النسخ' : 'واتساب'}</span>
                            </button>
                            {/* Full Employee Dossier Edit */}
                            {openEditEmpModal && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  openEditEmpModal(emp);
                                }}
                                style={{
                                  background: '#f8fafc',
                                  color: '#475569',
                                  border: '1px solid #cbd5e1',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="فتح ملف الموظف الكامل لتعديل كافة التفاصيل"
                              >
                                <span>📁</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface-muted, #f8fafc)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>
            💡 نصيحة أمان: عند تعديل أي كلمة مرور، يتم فوراً طرد الجلسات النشطة للموظف لضمان عدم بقاء أي دخول غير مصرح به.
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{
              padding: '6px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              background: '#e2e8f0',
              color: '#334155'
            }}
          >
            إغلاق النافذة
          </button>
        </div>
      </div>

      {/* ── Sub-Modal: Quick Edit Credentials ── */}
      {editingEmp && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => !isSaving && setEditingEmp(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '480px',
              width: '100%',
              background: 'var(--surface, #ffffff)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--border, #e2e8f0)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>✏️</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text, #1e293b)' }}>
                    تعديل بيانات دخول الموظف
                  </h4>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                    {getEmpDisplayName(editingEmp)} ({editingEmp.jobTitle || 'موظف'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSaving && setEditingEmp(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: 'var(--muted, #64748b)'
                }}
              >
                ✕
              </button>
            </div>

            {saveError && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  marginBottom: '14px',
                  fontWeight: 600
                }}
              >
                ⚠️ {saveError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Employee Code / Primary Username */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text, #334155)', marginBottom: '5px' }}>
                  كود الموظف (اسم الدخول الرئيسي للبوابة) *
                </label>
                <input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="ep-input"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #cbd5e1)',
                    fontSize: '13.5px',
                    fontFamily: 'monospace',
                    fontWeight: 700
                  }}
                  placeholder="مثال: 101 أو emp_101"
                />
              </div>

              {/* Custom Username (optional) */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text, #334155)', marginBottom: '5px' }}>
                  اسم مستخدم مخصص (اختياري)
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="ep-input"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border, #cbd5e1)',
                    fontSize: '13px'
                  }}
                  placeholder="اسم مستخدم إضافي للدخول إن وُجد"
                />
              </div>

              {/* Password Input with Generate and Toggle */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text, #334155)' }}>
                    كلمة المرور الجديدة *
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    style={{
                      background: '#f0fdf4',
                      color: '#15803d',
                      border: '1px solid #bbf7d0',
                      borderRadius: '5px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="توليد كلمة سر عشوائية قوية للموظف"
                  >
                    🎲 توليد كلمة سر
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type={editShowPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="ep-input"
                    style={{
                      width: '100%',
                      padding: '9px 36px 9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border, #cbd5e1)',
                      fontSize: '13.5px',
                      fontFamily: editShowPassword ? 'monospace' : 'inherit',
                      fontWeight: 700
                    }}
                    placeholder="أدخل كلمة المرور"
                  />
                  <button
                    type="button"
                    onClick={() => setEditShowPassword(!editShowPassword)}
                    style={{
                      position: 'absolute',
                      left: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: 'var(--muted, #64748b)'
                    }}
                  >
                    {editShowPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {/* Security Warning Notice */}
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#92400e',
                  lineHeight: 1.5,
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start'
                }}
              >
                <span style={{ fontSize: '16px', flexShrink: 0 }}>🔒</span>
                <div>
                  <strong>تنبيه أمان فوري:</strong> عند حفظ كلمة المرور أو كود الموظف، سيتم تلقائياً <strong>إنهاء كافة جلسات الموظف النشطة</strong> على جميع الهواتف والمتصفحات لحظياً، ولن يتمكن من الدخول إلا بالبيانات الجديدة.
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setEditingEmp(null)}
                disabled={isSaving}
                className="btn btn-ghost"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving}
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 10px rgba(79, 70, 229, 0.3)'
                }}
              >
                {isSaving ? (
                  <>
                    <span>⏳</span> جاري الحفظ وإنهاء الجلسات...
                  </>
                ) : (
                  <>
                    <span>💾</span> حفظ وإنهاء الجلسات النشطة
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
