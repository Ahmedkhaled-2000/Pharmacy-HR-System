import React, { useState, useMemo } from 'react';
import { getResolvedEmployeeRoster, DEFAULT_ROSTER_SCHEDULE } from '../roster/RosterModule';
import { getEmpDisplayName, isEmployeeActive, getRealTodayStr, arabicMonthLabel } from '../../utils/formatters';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../../utils/excelExport';

const monthLabel = (monthStr) => {
  return { arabic: arabicMonthLabel(monthStr), raw: monthStr };
};

const DAYS_OF_WEEK = [
  { key: 'saturday', label: 'السبت', short: 'سبت' },
  { key: 'sunday', label: 'الأحد', short: 'أحد' },
  { key: 'monday', label: 'الاثنين', short: 'اثنين' },
  { key: 'tuesday', label: 'الثلاثاء', short: 'ثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء', short: 'أربعاء' },
  { key: 'thursday', label: 'الخميس', short: 'خميس' },
  { key: 'friday', label: 'الجمعة', short: 'جمعة' }
];

export default function BranchMonthlyRosterModule({
  state,
  initialBranchId = '',
  onNavigateTab,
  onSwitchSubTab
}) {
  const branches = state.branches || [];
  const employees = state.employees || [];

  // Active state
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    if (initialBranchId && branches.some(b => String(b.id) === String(initialBranchId))) {
      return String(initialBranchId);
    }
    return branches[0] ? String(branches[0].id) : '';
  });

  const [selectedMonth, setSelectedMonth] = useState(() => getRealTodayStr().slice(0, 7));
  const [viewMode, setViewMode] = useState('board'); // 'board' | 'matrix' | 'calendar'
  const [jobFilter, setJobFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Selected Branch Object
  const currentBranch = useMemo(() => {
    return branches.find(b => String(b.id) === String(selectedBranchId)) || branches[0] || null;
  }, [branches, selectedBranchId]);

  // Branch Employees (primary branch or secondary branchDetails)
  const branchEmployees = useMemo(() => {
    if (!currentBranch) return [];
    const bIdStr = String(currentBranch.id);
    return employees.filter(emp => {
      if (!isEmployeeActive(emp)) return false;
      const isPrimary = String(emp.branchId || '') === bIdStr;
      const isSecondary = Array.isArray(emp.branchesDetails) && emp.branchesDetails.some(bd => String(bd.branchId) === bIdStr);
      return isPrimary || isSecondary;
    });
  }, [employees, currentBranch]);

  // Filtered Branch Employees by Search & Job
  const filteredEmployees = useMemo(() => {
    return branchEmployees.filter(emp => {
      if (jobFilter !== 'all') {
        const title = (emp.jobTitle || '').toLowerCase();
        if (jobFilter === 'pharmacist' && !title.includes('صيدل')) return false;
        if (jobFilter === 'assistant' && !title.includes('مساعد') && !title.includes('فني')) return false;
        if (jobFilter === 'cashier' && !title.includes('كاشير') && !title.includes('محاسب')) return false;
        if (jobFilter === 'other' && (title.includes('صيدل') || title.includes('مساعد') || title.includes('كاشير'))) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (emp.name || '').toLowerCase().includes(q);
        const nickMatch = (emp.nickname || '').toLowerCase().includes(q);
        const codeMatch = String(emp.code || '').toLowerCase().includes(q);
        const jobMatch = (emp.jobTitle || '').toLowerCase().includes(q);
        if (!nameMatch && !nickMatch && !codeMatch && !jobMatch) return false;
      }
      return true;
    });
  }, [branchEmployees, jobFilter, searchQuery]);

  // Map each employee to their resolved schedule for this branch and month
  const staffSchedules = useMemo(() => {
    if (!currentBranch) return [];
    return filteredEmployees.map(emp => {
      const rosterObj = getResolvedEmployeeRoster(emp, currentBranch.id, state, selectedMonth);
      const schedule = rosterObj?.schedule || DEFAULT_ROSTER_SCHEDULE;

      // Calculate total weekly hours and work days
      let totalWeeklyHours = 0;
      let workDaysCount = 0;
      DAYS_OF_WEEK.forEach(d => {
        const dayInfo = schedule[d.label] || { type: 'off' };
        if (dayInfo.type === 'shift' && dayInfo.start && dayInfo.end) {
          workDaysCount++;
          // Compute hours between start and end
          const [sh, sm] = dayInfo.start.split(':').map(Number);
          const [eh, em] = dayInfo.end.split(':').map(Number);
          let h = eh - sh + (em - sm) / 60;
          if (h <= 0) h += 24; // Overnight shift
          totalWeeklyHours += h;
        }
      });

      return {
        employee: emp,
        rosterObj,
        schedule,
        totalWeeklyHours: Math.round(totalWeeklyHours * 10) / 10,
        workDaysCount
      };
    });
  }, [filteredEmployees, currentBranch, state, selectedMonth]);

  // Day-by-Day Roster Structure
  const dayRosterMap = useMemo(() => {
    const map = {};
    DAYS_OF_WEEK.forEach(day => {
      const workingStaff = [];
      const offStaff = [];

      staffSchedules.forEach(({ employee, schedule }) => {
        const dayInfo = schedule[day.label] || { type: 'off', start: '', end: '' };
        if (dayInfo.type === 'shift' && dayInfo.start && dayInfo.end) {
          const shiftKey = `${dayInfo.start} - ${dayInfo.end}`;
          const [sh, sm] = dayInfo.start.split(':').map(Number);
          const [eh, em] = dayInfo.end.split(':').map(Number);
          let h = eh - sh + (em - sm) / 60;
          if (h <= 0) h += 24;

          workingStaff.push({
            employee,
            shiftKey,
            start: dayInfo.start,
            end: dayInfo.end,
            hours: Math.round(h * 10) / 10,
            isPharmacist: (employee.jobTitle || '').includes('صيدل')
          });
        } else {
          offStaff.push({
            employee,
            isOff: true,
            isPharmacist: (employee.jobTitle || '').includes('صيدل')
          });
        }
      });

      // Group working staff by exact shift interval
      const shiftGroups = {};
      workingStaff.forEach(st => {
        if (!shiftGroups[st.shiftKey]) {
          shiftGroups[st.shiftKey] = {
            shiftKey: st.shiftKey,
            start: st.start,
            end: st.end,
            hours: st.hours,
            staff: []
          };
        }
        shiftGroups[st.shiftKey].staff.push(st);
      });

      // Sort shift groups chronologically by start time
      const sortedShiftGroups = Object.values(shiftGroups).sort((a, b) => a.start.localeCompare(b.start));

      map[day.key] = {
        day,
        totalWorking: workingStaff.length,
        totalOff: offStaff.length,
        hasPharmacist: workingStaff.some(s => s.isPharmacist),
        shiftGroups: sortedShiftGroups,
        workingStaff,
        offStaff
      };
    });
    return map;
  }, [staffSchedules]);

  // Overall Branch Metrics
  const branchMetrics = useMemo(() => {
    const totalStaff = branchEmployees.length;
    let totalWeeklyScheduledHours = 0;
    let totalShiftsCount = 0;
    Object.values(dayRosterMap).forEach(d => {
      totalShiftsCount += d.totalWorking;
      d.workingStaff.forEach(s => {
        totalWeeklyScheduledHours += s.hours;
      });
    });

    const avgHoursPerEmp = totalStaff > 0 ? Math.round((totalWeeklyScheduledHours / totalStaff) * 10) / 10 : 0;
    const daysWithPharmacist = Object.values(dayRosterMap).filter(d => d.hasPharmacist).length;

    return {
      totalStaff,
      totalWeeklyScheduledHours: Math.round(totalWeeklyScheduledHours * 10) / 10,
      totalMonthlyEstimatedHours: Math.round(totalWeeklyScheduledHours * 4.2),
      avgHoursPerEmp,
      daysWithPharmacist
    };
  }, [branchEmployees, dayRosterMap]);

  // Calendar dates generator for selected month
  const calendarDays = useMemo(() => {
    if (!selectedMonth) return [];
    const [y, m] = selectedMonth.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    const days = [];
    while (date.getMonth() === m - 1) {
      const dateStr = date.toISOString().slice(0, 10);
      const dayIndex = date.getDay(); // 0 = Sunday, 6 = Saturday
      const dayMapIndex = [
        DAYS_OF_WEEK[1], // Sunday
        DAYS_OF_WEEK[2], // Monday
        DAYS_OF_WEEK[3], // Tuesday
        DAYS_OF_WEEK[4], // Wednesday
        DAYS_OF_WEEK[5], // Thursday
        DAYS_OF_WEEK[6], // Friday
        DAYS_OF_WEEK[0]  // Saturday
      ][dayIndex];

      days.push({
        dayNum: date.getDate(),
        dateStr,
        dayInfo: dayMapIndex,
        rosterData: dayRosterMap[dayMapIndex.key]
      });
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [selectedMonth, dayRosterMap]);

  // Export to Excel handler using ExcelJS
  const handleExportExcel = async () => {
    if (!currentBranch) return;
    try {
      const Excel = await loadExcelJS();
      const wb = new Excel.Workbook();

      // Sheet 1: مصفوفة موظفي الفرع
      const wsMatrix = wb.addWorksheet('مصفوفة موظفي الفرع', {
        views: [{ rightToLeft: true, showGridLines: true }]
      });

      mergedTitle(wsMatrix, 1, `جدول تشغيل فرع ${currentBranch.name} — شهر ${monthLabel(selectedMonth).arabic}`, 11, 'FF0F766E', 14, 28);

      const matrixHeaders = [
        'كود الموظف',
        'اسم الموظف',
        'المسمى الوظيفي',
        ...DAYS_OF_WEEK.map(d => d.label),
        'إجمالي ساعات الأسبوع',
        'أيام العمل'
      ];
      tableHeaderRow(wsMatrix, 2, matrixHeaders);

      staffSchedules.forEach((item, idx) => {
        const rowVals = [
          item.employee.code,
          getEmpDisplayName(item.employee),
          item.employee.jobTitle || '—',
          ...DAYS_OF_WEEK.map(d => {
            const dInfo = item.schedule[d.label];
            return (dInfo && dInfo.type === 'shift' && dInfo.start && dInfo.end)
              ? `${dInfo.start} إلى ${dInfo.end}`
              : 'راحة أسبوعية';
          }),
          item.totalWeeklyHours,
          item.workDaysCount
        ];
        dataRow(wsMatrix, 3 + idx, rowVals);
      });

      wsMatrix.columns.forEach(col => {
        col.width = 18;
      });

      // Sheet 2: ملخص الورديات اليومية
      const wsShifts = wb.addWorksheet('ملخص الورديات اليومية', {
        views: [{ rightToLeft: true, showGridLines: true }]
      });

      mergedTitle(wsShifts, 1, `ملخص الورديات والتواجد المتزامن — فرع ${currentBranch.name}`, 5, 'FF134E4A', 14, 28);
      tableHeaderRow(wsShifts, 2, ['اليوم', 'توقيت الوردية', 'المدة (ساعات)', 'عدد الكادر', 'الموظفون المكلفون']);

      let sRow = 3;
      DAYS_OF_WEEK.forEach(d => {
        const dData = dayRosterMap[d.key];
        dData.shiftGroups.forEach(sg => {
          dataRow(wsShifts, sRow++, [
            d.label,
            `${sg.start} - ${sg.end}`,
            sg.hours,
            sg.staff.length,
            sg.staff.map(s => `${s.employee.name} (${s.employee.jobTitle || 'موظف'})`).join(' | ')
          ]);
        });
        if (dData.offStaff.length > 0) {
          dataRow(wsShifts, sRow++, [
            d.label,
            'راحة أسبوعية',
            0,
            dData.offStaff.length,
            dData.offStaff.map(s => `${s.employee.name} (${s.employee.jobTitle || 'موظف'})`).join(' | ')
          ]);
        }
      });

      wsShifts.columns.forEach(col => {
        col.width = 22;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `جدول_تشغيل_فرع_${currentBranch.name.replace(/\s+/g, '_')}_${selectedMonth}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel export error:', err);
      alert('⚠️ حدث خطأ أثناء تصدير ملف الإكسل.');
    }
  };

  return (
    <div className="branch-monthly-roster-module" style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl', fontFamily: 'Cairo, Tajawal, sans-serif' }}>
      
      {/* ── Top Header & Sub-Nav Tabs ── */}
      <div style={{ background: 'var(--surface)', padding: '18px 24px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🏢</span>
              <h2 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '20px', fontWeight: 800 }}>
                منظومة الفروع: الجدول التشغيلي الشهري للفرع
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13.5px' }}>
              استعراض خريطة حضور وتوزيع موظفي كل فرع على الورديات والراحات اليومية والتغطيات المتزامنة
            </p>
          </div>

          {/* Sub-Nav Toggle Tabs */}
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0', gap: '4px' }}>
            <button
              type="button"
              onClick={() => onSwitchSubTab ? onSwitchSubTab('list') : (onNavigateTab && onNavigateTab('branches'))}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🏢</span> إدارة وبيانات الفروع
            </button>
            <button
              type="button"
              style={{
                border: 'none',
                background: '#ffffff',
                color: '#0f766e',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: 'default',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>📅</span> الجدول الشهري للفرع
            </button>
          </div>
        </div>

        {/* Filters & Control Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '14px', borderTop: '1px dashed #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            
            {/* Branch Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>📍 اختر الفرع:</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--primary-light, #bfdbfe)',
                  background: '#f8fafc',
                  color: 'var(--text)',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({employees.filter(e => isEmployeeActive(e) && (String(e.branchId) === String(b.id) || (e.branchesDetails && e.branchesDetails.some(bd => String(bd.branchId) === String(b.id))))).length} موظف)
                  </option>
                ))}
              </select>
            </div>

            {/* Month Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>🗓️ الشهر:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border)',
                  background: '#fff',
                  fontSize: '13px',
                  fontWeight: 700
                }}
              />
            </div>

            {/* Job Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>💼 التخصص:</label>
              <select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border)',
                  background: '#fff',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                <option value="all">جميع الوظائف ({branchEmployees.length})</option>
                <option value="pharmacist">💊 صيادلة فقط</option>
                <option value="assistant">🩺 مساعدين وفنيين</option>
                <option value="cashier">💵 كاشير ومحاسبين</option>
                <option value="other">⚙️ وظائف أخرى</option>
              </select>
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 بحث باسم الموظف أو الكود..."
                style={{
                  padding: '7px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border)',
                  fontSize: '13px',
                  width: '190px'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', left: '8px', top: '7px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* View Modes & Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            
            {/* View Mode Toggle */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                style={{
                  border: 'none',
                  background: viewMode === 'board' ? 'var(--primary, #0d9488)' : 'transparent',
                  color: viewMode === 'board' ? '#fff' : '#64748b',
                  padding: '5px 12px',
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="عرض خريطة الورديات الأسبوعية"
              >
                📊 خريطة الورديات
              </button>
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                style={{
                  border: 'none',
                  background: viewMode === 'matrix' ? 'var(--primary, #0d9488)' : 'transparent',
                  color: viewMode === 'matrix' ? '#fff' : '#64748b',
                  padding: '5px 12px',
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="عرض مصفوفة الموظفين"
              >
                📋 مصفوفة الموظفين
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                style={{
                  border: 'none',
                  background: viewMode === 'calendar' ? 'var(--primary, #0d9488)' : 'transparent',
                  color: viewMode === 'calendar' ? '#fff' : '#64748b',
                  padding: '5px 12px',
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="عرض التقويم الشهري"
              >
                🗓️ تقويم الشهر
              </button>
            </div>

            {/* Print Button */}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsPrintModalOpen(true)}
              style={{
                background: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="طباعة جدول تشغيل الفرع A4"
            >
              🖨️ طباعة الجدول A4
            </button>

            {/* Excel Export Button */}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleExportExcel}
              style={{
                background: '#f0fdf4',
                color: '#166534',
                border: '1px solid #86efac',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="تصدير جدول الفرع إلى إكسيل"
            >
              📥 تصدير Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Branch KPI Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            👥
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>إجمالي قوة موظفي الفرع</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0369a1', marginTop: '2px' }}>
              {branchMetrics.totalStaff} موظف
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            ⏱️
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>ساعات التغطية الأسبوعية</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
              {branchMetrics.totalWeeklyScheduledHours} ساعة / أسبوع
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            📈
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>متوسط ساعات عمل الموظف</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
              {branchMetrics.avgHoursPerEmp} س / أسبوع
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: branchMetrics.daysWithPharmacist === 7 ? '#dcfce7' : '#fee2e2', color: branchMetrics.daysWithPharmacist === 7 ? '#15803d' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            💊
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>تغطية وجود الصيدلي القانوني</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: branchMetrics.daysWithPharmacist === 7 ? '#15803d' : '#dc2626', marginTop: '2px' }}>
              {branchMetrics.daysWithPharmacist} من 7 أيام
            </div>
          </div>
        </div>
      </div>

      {/* ── Empty State ── */}
      {branchEmployees.length === 0 ? (
        <div style={{ background: '#fff', padding: '48px 24px', borderRadius: '16px', border: '2px dashed #cbd5e1', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏢</div>
          <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>لا يوجد موظفون معينون بهذا الفرع حالياً</h3>
          <p style={{ margin: 0, fontSize: '14px', maxWidth: '460px', marginInline: 'auto' }}>
            يرجى تعيين موظفين في فرع <strong>"{currentBranch?.name}"</strong> من خلال شاشة ملفات الموظفين أو إضافة فرع إضافي لهم لعرض جدولهم التشغيلي هنا.
          </p>
        </div>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {/* MODE 1: WEEKLY SHIFTS BOARD (خريطة الورديات الأسبوعية)                         */}
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {viewMode === 'board' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'start' }}>
              {DAYS_OF_WEEK.map(day => {
                const dayData = dayRosterMap[day.key];
                const isFriday = day.key === 'friday';

                return (
                  <div
                    key={day.key}
                    style={{
                      background: 'var(--surface)',
                      borderRadius: '16px',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Day Header */}
                    <div
                      style={{
                        padding: '12px 16px',
                        background: isFriday ? 'linear-gradient(135deg, #fef3c7, #fde68a)' : 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                        borderBottom: '1.5px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{isFriday ? '🕌' : '🗓️'}</span>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: isFriday ? '#92400e' : '#166534' }}>
                          يوم {day.label}
                        </h4>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{ fontSize: '11px', background: '#fff', color: '#166534', padding: '2px 8px', borderRadius: '99px', fontWeight: 700, border: '1px solid #bbf7d0' }}>
                          🟢 {dayData.totalWorking} حضور
                        </span>
                        {dayData.totalOff > 0 && (
                          <span style={{ fontSize: '11px', background: '#fff', color: '#b45309', padding: '2px 8px', borderRadius: '99px', fontWeight: 700, border: '1px solid #fde68a' }}>
                            🏖️ {dayData.totalOff} راحة
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Day Body Content */}
                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      
                      {/* Active Shifts Groups */}
                      {dayData.shiftGroups.length === 0 ? (
                        <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', border: '1px dashed #cbd5e1' }}>
                          🚫 لا توجد ورديات عمل مجدولة في هذا اليوم
                        </div>
                      ) : (
                        dayData.shiftGroups.map((group, gIdx) => {
                          const isConcurrent = group.staff.length > 1;

                          return (
                            <div
                              key={gIdx}
                              style={{
                                background: '#f8fafc',
                                border: isConcurrent ? '1.5px solid #6ee7b7' : '1px solid #e2e8f0',
                                borderRadius: '12px',
                                overflow: 'hidden'
                              }}
                            >
                              {/* Shift Timing Header */}
                              <div
                                style={{
                                  padding: '8px 12px',
                                  background: isConcurrent ? '#ecfdf5' : '#f1f5f9',
                                  borderBottom: '1px solid #e2e8f0',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '14px' }}>⏱️</span>
                                  <span style={{ fontSize: '13px', fontWeight: 800, color: isConcurrent ? '#047857' : '#334155' }}>
                                    {group.start} إلى {group.end}
                                  </span>
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>({group.hours} س)</span>
                                </div>

                                {isConcurrent ? (
                                  <span style={{ fontSize: '11px', background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: '6px', fontWeight: 800 }}>
                                    👥 تواجد متزامن ({group.staff.length})
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: '6px', fontWeight: 700 }}>
                                    👤 موظف واحد
                                  </span>
                                )}
                              </div>

                              {/* Staff in this shift */}
                              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {group.staff.map(st => {
                                  const isPharm = (st.employee.jobTitle || '').includes('صيدل');
                                  return (
                                    <div
                                      key={st.employee.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: '#fff',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {st.employee.photoUrl ? (
                                          <img
                                            src={st.employee.photoUrl}
                                            alt=""
                                            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                                          />
                                        ) : (
                                          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: isPharm ? '#dcfce7' : '#e0f2fe', color: isPharm ? '#15803d' : '#0369a1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>
                                            {st.employee.name.trim().charAt(0)}
                                          </span>
                                        )}
                                        <div>
                                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                                            {getEmpDisplayName(st.employee)}
                                          </div>
                                          <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                                            {st.employee.jobTitle || 'موظف'} (كود: {st.employee.code})
                                          </div>
                                        </div>
                                      </div>

                                      {isPharm ? (
                                        <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                          💊 صيدلي
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: '10.5px', background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                          🩺 كادر
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* Days Off List */}
                      {dayData.offStaff.length > 0 && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '8px 10px' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#92400e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🏖️</span>
                            <span>راحة أسبوعية ({dayData.offStaff.length} موظف):</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {dayData.offStaff.map(st => (
                              <span
                                key={st.employee.id}
                                style={{
                                  fontSize: '11.5px',
                                  background: '#fff',
                                  color: '#78350f',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #fde68a',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <span>👤 {getEmpDisplayName(st.employee)}</span>
                                <span style={{ fontSize: '9.5px', color: '#a16207' }}>({st.employee.jobTitle || 'موظف'})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {/* MODE 2: STAFF MATRIX VIEW (مصفوفة الموظفين الأفقية)                           */}
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {viewMode === 'matrix' && (
            <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table className="bylaws-table" style={{ margin: 0, fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ minWidth: '180px' }}>الموظف والتخصص</th>
                    {DAYS_OF_WEEK.map(d => (
                      <th key={d.key} style={{ textAlign: 'center', minWidth: '130px' }}>
                        {d.label}
                      </th>
                    ))}
                    <th style={{ textAlign: 'center', minWidth: '110px' }}>إجمالي الأسبوع</th>
                  </tr>
                </thead>
                <tbody>
                  {staffSchedules.map(({ employee, schedule, totalWeeklyHours, workDaysCount }) => {
                    const isPharm = (employee.jobTitle || '').includes('صيدل');

                    return (
                      <tr key={employee.id}>
                        {/* Employee Details Column */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {employee.photoUrl ? (
                              <img src={employee.photoUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: isPharm ? '#dcfce7' : '#e0f2fe', color: isPharm ? '#15803d' : '#0369a1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                                {employee.name.trim().charAt(0)}
                              </span>
                            )}
                            <div>
                              <div style={{ fontWeight: 800, color: 'var(--text)' }}>
                                {getEmpDisplayName(employee)}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {employee.jobTitle || 'موظف'} | كود: {employee.code}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 7 Days Columns */}
                        {DAYS_OF_WEEK.map(d => {
                          const dInfo = schedule[d.label];
                          const isShift = dInfo && dInfo.type === 'shift' && dInfo.start && dInfo.end;

                          return (
                            <td key={d.key} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                              {isShift ? (
                                <div
                                  style={{
                                    background: '#f0fdf4',
                                    border: '1px solid #86efac',
                                    borderRadius: '8px',
                                    padding: '6px 4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '2px'
                                  }}
                                >
                                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#166534', direction: 'ltr' }}>
                                    {dInfo.start} - {dInfo.end}
                                  </span>
                                  <span style={{ fontSize: '10px', color: '#15803d', fontWeight: 600 }}>
                                    🟢 وردية عمل
                                  </span>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    background: '#fffbeb',
                                    border: '1px solid #fde68a',
                                    borderRadius: '8px',
                                    padding: '6px 4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '2px'
                                  }}
                                >
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>
                                    🏖️ راحة
                                  </span>
                                  <span style={{ fontSize: '10px', color: '#b45309' }}>
                                    إجازة أسبوعية
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Weekly Totals */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 800, color: 'var(--primary-dark)', fontSize: '14px' }}>
                            {totalWeeklyHours} ساعة
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                            ({workDaysCount} أيام عمل)
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {/* MODE 3: MONTHLY CALENDAR VIEW (التقويم الشهري الكامل)                          */}
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {viewMode === 'calendar' && (
            <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '16px', fontWeight: 800 }}>
                  🗓️ روزنامة تشغيل فرع {currentBranch?.name} لشهر {monthLabel(selectedMonth).arabic}
                </h4>
                <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  توزيع المناوبات والورديات اليومية على مدار كامل أيام الشهر ({calendarDays.length} يوم)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                {calendarDays.map(cd => {
                  const isFriday = cd.dayInfo.key === 'friday';
                  const data = cd.rosterData;

                  return (
                    <div
                      key={cd.dateStr}
                      style={{
                        background: '#f8fafc',
                        border: isFriday ? '1.5px solid #fde68a' : '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: isFriday ? '#b45309' : '#0f766e' }}>
                            {cd.dayNum}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                            {cd.dayInfo.label}
                          </span>
                        </div>
                        <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          {data.totalWorking} موظف
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                        {data.shiftGroups.map((sg, idx) => (
                          <div key={idx} style={{ background: '#fff', padding: '4px 6px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                            <div style={{ fontWeight: 800, color: '#0369a1', fontSize: '10.5px' }}>
                              ⏱️ {sg.start} - {sg.end} ({sg.staff.length})
                            </div>
                            <div style={{ color: '#334155', fontSize: '10px', marginTop: '1px' }}>
                              {sg.staff.map(s => s.employee.name).join('، ')}
                            </div>
                          </div>
                        ))}
                        {data.offStaff.length > 0 && (
                          <div style={{ fontSize: '10px', color: '#92400e', background: '#fef3c7', padding: '3px 6px', borderRadius: '4px' }}>
                            🏖️ راحة: {data.offStaff.map(s => s.employee.name.split(' ')[0]).join('، ')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── High-Res Print Modal ── */}
      {isPrintModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content card" style={{ maxWidth: '1100px', width: '96%', padding: '24px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #0f766e', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f766e' }}>
                  🖨️ معاينة وطباعة جدول تشغيل الفرع A4
                </h3>
                <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  الفرع: <strong>{currentBranch?.name}</strong> | الشهر: <strong>{monthLabel(selectedMonth).arabic}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-start"
                  onClick={() => window.print()}
                  style={{ fontSize: '13px', padding: '6px 16px' }}
                >
                  🖨️ طباعة الآن (Print)
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsPrintModalOpen(false)}
                  style={{ fontSize: '13px' }}
                >
                  ✕ إغلاق
                </button>
              </div>
            </div>

            {/* Printable Schedule Table */}
            <div id="printable-branch-schedule" style={{ direction: 'rtl', padding: '10px' }}>
              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
                  جدول مواعيد وورديات العمل الرسمية — فرع {currentBranch?.name}
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#475569' }}>
                  فترة تشغيل شهر: {monthLabel(selectedMonth).arabic} | تاريخ الاعتماد: {new Date().toLocaleDateString('ar-EG')}
                </p>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #cbd5e1', padding: '6px', width: '16%' }}>الموظف / الوظيفة</th>
                    {DAYS_OF_WEEK.map(d => (
                      <th key={d.key} style={{ border: '1px solid #cbd5e1', padding: '6px', width: '11%' }}>
                        {d.label}
                      </th>
                    ))}
                    <th style={{ border: '1px solid #cbd5e1', padding: '6px', width: '7%' }}>ساعات</th>
                  </tr>
                </thead>
                <tbody>
                  {staffSchedules.map(({ employee, schedule, totalWeeklyHours }) => (
                    <tr key={employee.id}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>
                        <div>{employee.name}</div>
                        <div style={{ fontSize: '9.5px', color: '#64748b' }}>{employee.jobTitle || 'موظف'} ({employee.code})</div>
                      </td>
                      {DAYS_OF_WEEK.map(d => {
                        const dInfo = schedule[d.label];
                        const isShift = dInfo && dInfo.type === 'shift' && dInfo.start && dInfo.end;
                        return (
                          <td key={d.key} style={{ border: '1px solid #cbd5e1', padding: '4px', background: isShift ? '#f0fdf4' : '#fffbeb' }}>
                            {isShift ? (
                              <div style={{ fontWeight: 'bold', color: '#166534', direction: 'ltr' }}>
                                {dInfo.start} - {dInfo.end}
                              </div>
                            ) : (
                              <div style={{ color: '#92400e', fontWeight: 'bold' }}>
                                راحة
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', fontWeight: 'bold', color: '#0f766e' }}>
                        {totalWeeklyHours} س
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', fontSize: '11px', color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                <div>توقيع مدير الفرع: ........................................</div>
                <div>اعتماد الإدارة العليا والموارد البشرية: ........................................</div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
