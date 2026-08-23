import React, { useState } from 'react';
import { DEFAULT_JOBS, getJobsList, DEFAULT_DEPARTMENTS, getDepartmentsList } from '../../utils/jobsHelper';

export default function JobsDepartmentsModule({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard
}) {
  const jobsList = getJobsList(state);
  const departmentsList = getDepartmentsList(state);

  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [jobTitleInput, setJobTitleInput] = useState('');
  const [jobDeptInput, setJobDeptInput] = useState('');
  const [jobIsMgmtInput, setJobIsMgmtInput] = useState(false);
  const [jobDescInput, setJobDescInput] = useState('');
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [jobDeptFilter, setJobDeptFilter] = useState('all');

  // Departments Management State
  const [showDeptSection, setShowDeptSection] = useState(false);
  const [newDeptInput, setNewDeptInput] = useState('');
  const [editingDeptName, setEditingDeptName] = useState(null);
  const [renameDeptInput, setRenameDeptInput] = useState('');

  const allEmps = state.employees || [];
  const totalJobs = jobsList.length;
  const mgmtJobs = jobsList.filter(j => j.isManagement || j.isAdminRole).length;
  const operationalJobs = totalJobs - mgmtJobs;

  return (
    <div className="fade-in" style={{ width: '100%', fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Header & Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--primary-dark)', fontFamily: 'Cairo', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💼</span>
              <span>دليل الوظائف والأقسام وهيكلة الكوادر</span>
            </h3>
            <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13.5px' }}>
              تعريف وتنسيق المسميات الوظيفية والأقسام وتصنيف الوظائف القيادية الإدارية المستحقة لبدل الإدارة.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${showDeptSection ? 'btn-start' : 'btn-ghost'}`}
              onClick={() => setShowDeptSection(!showDeptSection)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
            >
              <span>🏢</span>
              <span>إدارة الأقسام ({departmentsList.length})</span>
              <span>{showDeptSection ? '▲' : '▼'}</span>
            </button>
            <button
              type="button"
              className="btn btn-start"
              style={{ fontWeight: 'bold' }}
              onClick={() => {
                setEditingJob(null);
                setJobTitleInput('');
                setJobDeptInput(departmentsList[0] || 'الصيدلية');
                setJobIsMgmtInput(false);
                setJobDescInput('');
                setShowJobModal(true);
              }}
            >
              ➕ إضافة وظيفة جديدة
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                if (window.confirm('هل تريد استعادة قائمة الوظائف والأقسام القياسية الافتراضية؟')) {
                  const performRestore = async () => {
                    const updatedState = { ...state, jobs: DEFAULT_JOBS, departments: DEFAULT_DEPARTMENTS };
                    setState(updatedState);
                    if (saveState) await saveState(updatedState);
                    showToast?.('🔄 تمت استعادة قائمة الوظائف والأقسام الافتراضية بنجاح');
                  };

                  if (executeWithOwnerGuard) {
                    executeWithOwnerGuard({
                      lockKey: 'lockManageJobs',
                      actionTitle: 'استعادة دليل الوظائف والأقسام الافتراضي',
                      actionDetails: 'إعادة ضبط الوظائف والأقسام للافتراضي',
                      onExecute: performRestore
                    });
                  } else {
                    await performRestore();
                  }
                }
              }}
            >
              🔄 استعادة الافتراضي
            </button>
          </div>
        </div>

        {/* Quick Statistics Banner */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>إجمالي الأقسام المعرفة</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--primary-dark)', marginTop: '4px' }}>
              🏢 {departmentsList.length} قسم
            </div>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>إجمالي الوظائف المعرفة</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--primary-dark)', marginTop: '4px' }}>
              💼 {totalJobs} وظيفة
            </div>
          </div>

          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px' }}>
            <span style={{ fontSize: '12px', color: '#166534' }}>👔 وظائف إدارية (بدل إدارة)</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>
              {mgmtJobs} وظيفة
            </div>
          </div>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '14px' }}>
            <span style={{ fontSize: '12px', color: '#1e40af' }}>🏬 كوادر تشغيلية وفنية</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1d4ed8', marginTop: '4px' }}>
              {operationalJobs} كادر
            </div>
          </div>

          <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '14px' }}>
            <span style={{ fontSize: '12px', color: '#6b21a8' }}>👥 الموظفون المسجلون</span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#7e22ce', marginTop: '4px' }}>
              {allEmps.length} موظف
            </div>
          </div>
        </div>

        {/* Collapsible Departments Management Card */}
        {showDeptSection && (
          <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, color: '#166534', fontFamily: 'Cairo', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🏢</span> إدارة وهيكلة الأقسام بالصيدلية
                </h4>
                <p style={{ margin: '4px 0 0 0', color: '#15803d', fontSize: '12.5px' }}>
                  أضف أو عدل أو احذف الأقسام لتظهر في القوائم المنسدلة عند تسجيل الوظائف وملفات الموظفين.
                </p>
              </div>

              {/* Add New Department Form */}
              <div style={{ display: 'flex', gap: '8px', flex: '1', maxWidth: '400px', minWidth: '260px' }}>
                <input
                  type="text"
                  placeholder="اسم القسم الجديد (مثال: التسويق)"
                  value={newDeptInput}
                  onChange={(e) => setNewDeptInput(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac', background: '#fff' }}
                />
                <button
                  type="button"
                  className="btn btn-start"
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                  onClick={async () => {
                    if (!newDeptInput.trim()) {
                      showToast?.('⚠️ يرجى كتابة اسم القسم');
                      return;
                    }
                    const cleanName = newDeptInput.trim();
                    if (departmentsList.includes(cleanName)) {
                      showToast?.('⚠️ هذا القسم موجود بالفعل');
                      return;
                    }

                    const performAddDept = async () => {
                      const updatedDepts = [...departmentsList, cleanName];
                      const updatedState = { ...state, departments: updatedDepts };
                      setState(updatedState);
                      setNewDeptInput('');
                      showToast?.(`✅ تمت إضافة قسم (${cleanName}) بنجاح`);
                      if (saveState) await saveState(updatedState);
                    };

                    if (executeWithOwnerGuard) {
                      executeWithOwnerGuard({
                        lockKey: 'lockManageJobs',
                        actionTitle: 'إضافة قسم جديد',
                        actionDetails: `اسم القسم: ${cleanName}`,
                        onExecute: performAddDept
                      });
                    } else {
                      await performAddDept();
                    }
                  }}
                >
                  ➕ إضافة قسم
                </button>
              </div>
            </div>

            {/* Department Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px', marginTop: '6px' }}>
              {departmentsList.map((dept) => {
                const linkedJobs = jobsList.filter(j => j.department === dept);
                const linkedEmps = (state.employees || []).filter(e => e.department === dept);
                const isEditing = editingDeptName === dept;

                return (
                  <div
                    key={dept}
                    style={{
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          value={renameDeptInput}
                          onChange={(e) => setRenameDeptInput(e.target.value)}
                          style={{ flex: 1, padding: '4px 8px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--primary)' }}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="btn btn-start"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={async () => {
                            const cleanRename = renameDeptInput.trim();
                            if (!cleanRename) return;
                            if (cleanRename === dept) {
                              setEditingDeptName(null);
                              return;
                            }
                            if (departmentsList.includes(cleanRename)) {
                              showToast?.('⚠️ يوجد قسم آخر بهذا الاسم');
                              return;
                            }

                            const performRenameDept = async () => {
                              const updatedDepts = departmentsList.map(d => d === dept ? cleanRename : d);
                              const updatedJobs = jobsList.map(j => j.department === dept ? { ...j, department: cleanRename } : j);
                              const updatedEmps = (state.employees || []).map(e => e.department === dept ? { ...e, department: cleanRename } : e);
                              const updatedState = { ...state, departments: updatedDepts, jobs: updatedJobs, employees: updatedEmps };
                              setState(updatedState);
                              setEditingDeptName(null);
                              showToast?.(`✅ تم تعديل اسم القسم إلى (${cleanRename})`);
                              if (saveState) await saveState(updatedState);
                            };

                            if (executeWithOwnerGuard) {
                              executeWithOwnerGuard({
                                lockKey: 'lockManageJobs',
                                actionTitle: 'تعديل اسم القسم',
                                actionDetails: `الاسم القديم: ${dept} -> الجديد: ${cleanRename}`,
                                onExecute: performRenameDept
                              });
                            } else {
                              await performRenameDept();
                            }
                          }}
                        >
                          حفظ
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => setEditingDeptName(null)}
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--primary-dark)', fontSize: '14px' }}>
                          🏢 {dept}
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '2px 6px', fontSize: '11px' }}
                            onClick={() => {
                              setEditingDeptName(dept);
                              setRenameDeptInput(dept);
                            }}
                            title="تعديل اسم القسم"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="del-btn"
                            style={{ padding: '2px 6px', fontSize: '11px' }}
                            onClick={async () => {
                              if (linkedJobs.length > 0 || linkedEmps.length > 0) {
                                const confirmed = window.confirm(
                                  `⚠️ تنبيه: يوجد (${linkedJobs.length}) وظيفة و (${linkedEmps.length}) موظف مسجلين بقسم (${dept}). هل أنت متأكد من حذف هذا القسم؟`
                                );
                                if (!confirmed) return;
                              } else {
                                if (!window.confirm(`هل أنت متأكد من حذف قسم (${dept})؟`)) return;
                              }

                              const performDeleteDept = async () => {
                                const updatedDepts = departmentsList.filter(d => d !== dept);
                                const updatedState = { ...state, departments: updatedDepts };
                                setState(updatedState);
                                showToast?.(`🗑️ تم حذف قسم (${dept})`);
                                if (saveState) await saveState(updatedState);
                              };

                              if (executeWithOwnerGuard) {
                                executeWithOwnerGuard({
                                  lockKey: 'lockManageJobs',
                                  actionTitle: 'حذف قسم',
                                  actionDetails: `القسم: ${dept}`,
                                  onExecute: performDeleteDept
                                });
                              } else {
                                await performDeleteDept();
                              }
                            }}
                            title="حذف القسم"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', fontSize: '11.5px', color: 'var(--muted)' }}>
                      <span>💼 {linkedJobs.length} وظيفة</span>
                      <span>•</span>
                      <span>👥 {linkedEmps.length} موظف</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Department Filter Bar */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الوظيفة أو الوصف..."
            value={jobSearchQuery}
            onChange={(e) => setJobSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', margin: 0 }}>🏢 تصفية بالقسم:</label>
            <select
              value={jobDeptFilter}
              onChange={(e) => setJobDeptFilter(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 'bold', fontSize: '13px' }}
            >
              <option value="all">كل الأقسام ({jobsList.length})</option>
              {departmentsList.map(d => (
                <option key={d} value={d}>
                  {d} ({jobsList.filter(j => j.department === d).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Jobs Table */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px' }}>#</th>
                <th style={{ padding: '12px' }}>المسمى الوظيفي</th>
                <th style={{ padding: '12px' }}>القسم التابع له</th>
                <th style={{ padding: '12px' }}>تصنيف الوظيفة</th>
                <th style={{ padding: '12px' }}>الوصف والمهام</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>الموظفون الحاليون</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {jobsList
                .filter(j => {
                  const matchSearch = !jobSearchQuery || j.title.toLowerCase().includes(jobSearchQuery.toLowerCase()) || (j.description && j.description.toLowerCase().includes(jobSearchQuery.toLowerCase()));
                  const matchDept = jobDeptFilter === 'all' || j.department === jobDeptFilter;
                  return matchSearch && matchDept;
                })
                .map((j, idx) => {
                  const isMgmt = Boolean(j.isManagement || j.isAdminRole);
                  const assignedEmps = (state.employees || []).filter(e => e.jobTitle?.trim() === j.title?.trim());

                  return (
                    <tr key={j.id || idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)' }}>
                      <td style={{ padding: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--primary-dark)', fontSize: '14px' }}>
                        💼 {j.title}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🏢 {j.department || 'عام / غير محدد'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {isMgmt ? (
                          <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            👔 وظيفة إدارية (تمنح بدل إدارة)
                          </span>
                        ) : (
                          <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            🏬 كادر تشغيلي / فني
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--muted)', fontSize: '12.5px', maxWidth: '280px' }}>
                        {j.description || '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ background: assignedEmps.length > 0 ? '#e0f2fe' : '#f1f5f9', color: assignedEmps.length > 0 ? '#0369a1' : '#94a3b8', padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                          {assignedEmps.length} موظف
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => {
                              setEditingJob(j);
                              setJobTitleInput(j.title);
                              setJobDeptInput(j.department || departmentsList[0] || 'الصيدلية');
                              setJobIsMgmtInput(Boolean(j.isManagement || j.isAdminRole));
                              setJobDescInput(j.description || '');
                              setShowJobModal(true);
                            }}
                            title="تعديل الوظيفة"
                          >
                            ✏️ تعديل
                          </button>
                          <button
                            type="button"
                            className="del-btn"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={async () => {
                              if (assignedEmps.length > 0) {
                                const confirmed = window.confirm(`⚠️ تنبيه: يوجد عدد (${assignedEmps.length}) موظف مسجلين حالياً على وظيفة (${j.title}). هل أنت متأكد من حذف هذه الوظيفة من قائمة الخيارات؟`);
                                if (!confirmed) return;
                              } else {
                                if (!window.confirm(`هل أنت متأكد من حذف وظيفة (${j.title})؟`)) return;
                              }

                              const performDeleteJob = async () => {
                                const updatedJobs = jobsList.filter(item => item.id !== j.id && item.title !== j.title);
                                const updatedState = { ...state, jobs: updatedJobs };
                                setState(updatedState);
                                showToast?.(`🗑️ تم حذف وظيفة (${j.title}) بنجاح`);
                                if (saveState) {
                                  saveState(updatedState).catch(err => console.error('Delete job error:', err));
                                }
                              };

                              if (executeWithOwnerGuard) {
                                executeWithOwnerGuard({
                                  lockKey: 'lockManageJobs',
                                  actionTitle: 'حذف مسمى وظيفي',
                                  actionDetails: `الوظيفة: ${j.title}`,
                                  onExecute: performDeleteJob
                                });
                              } else {
                                await performDeleteJob();
                              }
                            }}
                            title="حذف الوظيفة"
                          >
                            🗑️ حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Add / Edit Job Modal */}
        {showJobModal && (
          <div className="modal-backdrop" style={{ zIndex: 1100 }}>
            <div className="modal-content card" style={{ maxWidth: '540px', width: '92%', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, color: 'var(--primary-dark)', fontFamily: 'Cairo' }}>
                  {editingJob ? '✏️ تعديل بيانات الوظيفة' : '➕ إضافة مسمى وظيفي جديد'}
                </h3>
                <button className="btn btn-ghost" onClick={() => setShowJobModal(false)}>✕</button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!jobTitleInput.trim()) {
                    showToast?.('⚠️ يرجى إدخال اسم المسمى الوظيفي');
                    return;
                  }

                  const cleanTitle = jobTitleInput.trim();
                  const isExisting = jobsList.some(j => j.title.toLowerCase() === cleanTitle.toLowerCase() && j.id !== editingJob?.id);
                  if (isExisting) {
                    showToast?.('⚠️ هذا المسمى الوظيفي موجود بالفعل في القائمة');
                    return;
                  }

                  const selectedDept = jobDeptInput || departmentsList[0] || 'الصيدلية';

                  const performSaveJob = async () => {
                    let updatedJobs;
                    let updatedEmployees = [...(state.employees || [])];

                    if (editingJob) {
                      // Update existing job
                      updatedJobs = jobsList.map(j => {
                        if (j.id === editingJob.id || j.title === editingJob.title) {
                          return {
                            ...j,
                            title: cleanTitle,
                            department: selectedDept,
                            isManagement: jobIsMgmtInput,
                            isAdminRole: jobIsMgmtInput,
                            description: jobDescInput.trim()
                          };
                        }
                        return j;
                      });

                      // Update jobTitle & department in employees if title changed
                      if (editingJob.title !== cleanTitle) {
                        updatedEmployees = updatedEmployees.map(emp => {
                          if (emp.jobTitle === editingJob.title) {
                            return { ...emp, jobTitle: cleanTitle };
                          }
                          return emp;
                        });
                      }
                    } else {
                      // Add new job
                      const newJobObj = {
                        id: 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        title: cleanTitle,
                        department: selectedDept,
                        isManagement: jobIsMgmtInput,
                        isAdminRole: jobIsMgmtInput,
                        description: jobDescInput.trim()
                      };
                      updatedJobs = [...jobsList, newJobObj];
                    }

                    const updatedState = { ...state, jobs: updatedJobs, employees: updatedEmployees };
                    setState(updatedState);
                    setShowJobModal(false);
                    showToast?.(editingJob ? `✅ تم تعديل وظيفة (${cleanTitle}) بنجاح` : `✅ تمت إضافة وظيفة (${cleanTitle}) بنجاح`);

                    if (saveState) {
                      saveState(updatedState).catch(err => console.error('Save job error:', err));
                    }
                  };

                  if (executeWithOwnerGuard) {
                    executeWithOwnerGuard({
                      lockKey: 'lockManageJobs',
                      actionTitle: editingJob ? 'تعديل بيانات الوظيفة' : 'إضافة مسمى وظيفي جديد',
                      actionDetails: `المسمى: ${cleanTitle}`,
                      onExecute: performSaveJob
                    });
                  } else {
                    performSaveJob();
                  }
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
              >
                <div className="field">
                  <label style={{ fontWeight: 'bold' }}>المسمى الوظيفي *</label>
                  <input
                    type="text"
                    value={jobTitleInput}
                    onChange={(e) => setJobTitleInput(e.target.value)}
                    placeholder="مثال: صيدلي أول / مدير فرع / مسؤول تسويق"
                    required
                    autoFocus
                  />
                </div>

                <div className="field">
                  <label style={{ fontWeight: 'bold' }}>القسم التابع له المسمى الوظيفي *</label>
                  <select
                    value={jobDeptInput}
                    onChange={(e) => setJobDeptInput(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 'bold' }}
                    required
                  >
                    {departmentsList.map((dept) => (
                      <option key={dept} value={dept}>
                        🏢 {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 'bold' }}>تصنيف طبيعة الوظيفة</label>
                  <div style={{ background: jobIsMgmtInput ? '#f0fdf4' : '#f8fafc', border: `1px solid ${jobIsMgmtInput ? '#86efac' : '#cbd5e1'}`, padding: '12px 14px', borderRadius: '10px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={jobIsMgmtInput}
                        onChange={(e) => setJobIsMgmtInput(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 'bold', fontSize: '13.5px', color: jobIsMgmtInput ? '#166534' : 'var(--text)' }}>
                        👔 هذه الوظيفة مصنفة كـ (وظيفة إدارية / إشرافية)
                      </span>
                    </label>
                    <p style={{ margin: '6px 0 0 28px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>
                      تفعيل هذا الخيار يمنح صاحب هذه الوظيفة أحقية استحقاق <strong>(بدل الإدارة)</strong> في تبويب البيانات المالية للموظف، وتظهر شارة إدارية بملفه.
                    </p>
                  </div>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 'bold' }}>الوصف الوظيفي والمسؤوليات الأساسية</label>
                  <textarea
                    value={jobDescInput}
                    onChange={(e) => setJobDescInput(e.target.value)}
                    placeholder="اكتب نبذة مختصرة عن المهام والواجبات المطلوبة من شاغل هذه الوظيفة..."
                    rows={3}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" className="btn btn-start" style={{ flex: 1, padding: '10px', fontSize: '14px', fontWeight: 'bold' }}>
                    💾 {editingJob ? 'حفظ التعديلات' : 'إضافة المسمى الوظيفي'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowJobModal(false)}>
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
