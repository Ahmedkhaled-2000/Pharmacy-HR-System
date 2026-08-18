import React, { useState, useEffect } from 'react';
import { compressImage } from '../../utils/imageCompressor';

export default function EmployeeFileModal({
  isOpen,
  onClose,
  editingEmp,
  branches = [],
  allEmployees = [],
  onSave,
  handleFileUpload
}) {
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'job' | 'financial' | 'documents'

  // 1. Personal Data
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phones, setPhones] = useState([
    { id: '1', number: '', type: 'mobile' }
  ]);
  const [email, setEmail] = useState('');
  const [relativePhone, setRelativePhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('أعزب');

  // Phone list handlers
  const handleAddPhoneField = () => {
    setPhones([
      ...phones,
      { id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4), number: '', type: 'mobile' }
    ]);
  };

  const handlePhoneChange = (id, field, value) => {
    setPhones(phones.map(p => {
      if (p.id === id) {
        if (field === 'number') {
          // Numbers only validation
          const numericOnly = value.replace(/\D/g, '');
          return { ...p, number: numericOnly };
        }
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const handleRemovePhoneField = (id) => {
    if (phones.length <= 1) {
      setPhones([{ id: '1', number: '', type: 'mobile' }]);
      return;
    }
    setPhones(phones.filter(p => p.id !== id));
  };

  // 2. Job Data
  const [code, setCode] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('الصيدلية');
  
  // 3. Financial & Branches & Schedule (Multi-Branch Support)
  const [branchesDetails, setBranchesDetails] = useState([
    { id: Date.now().toString(), branchId: '', salary: '4000', workHours: '8', workDays: '26' }
  ]);

  const [hireDate, setHireDate] = useState('');
  const [contractType, setContractType] = useState('دوام كامل');
  const [status, setStatus] = useState('على رأس العمل'); // 'على رأس العمل' | 'تم الاستقالة'
  const [terminationReason, setTerminationReason] = useState('');
  const [password, setPassword] = useState('123');
  const [annualLeaveBalance, setAnnualLeaveBalance] = useState('21');

  // 4. Documents Data (Array of { id, title, fileUrl, fileType, uploadedAt })
  const [documents, setDocuments] = useState([]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('الرقم القومي');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    if (editingEmp) {
      if (Array.isArray(editingEmp.phones) && editingEmp.phones.length > 0) {
        setPhones(editingEmp.phones.map(p => ({
          id: p.id || Math.random().toString(),
          number: p.number ? String(p.number).replace(/\D/g, '') : '',
          type: p.type || 'mobile'
        })));
      } else if (editingEmp.phone && String(editingEmp.phone).trim()) {
        setPhones([
          { id: '1', number: String(editingEmp.phone).replace(/\D/g, ''), type: 'mobile' }
        ]);
      } else {
        setPhones([
          { id: '1', number: '', type: 'mobile' }
        ]);
      }

      setName(editingEmp.name || '');
      setPhone(editingEmp.phone || '');
      setEmail(editingEmp.email || '');
      setRelativePhone(String(editingEmp.relativePhone || editingEmp.emergencyPhone || '').replace(/\D/g, ''));
      setNationalId(String(editingEmp.nationalId || '').replace(/\D/g, ''));
      setDob(editingEmp.dob || '');
      setAddress(editingEmp.address || '');
      setPhotoUrl(editingEmp.photoUrl || '');
      setMaritalStatus(editingEmp.maritalStatus || 'أعزب');

      setCode(editingEmp.code || '');
      setJobTitle(editingEmp.jobTitle || '');
      setDepartment(editingEmp.department || 'الصيدلية');
      
      // Load branchesDetails if they exist, otherwise fallback to legacy fields
      if (editingEmp.branchesDetails && editingEmp.branchesDetails.length > 0) {
        setBranchesDetails(editingEmp.branchesDetails.map(bd => ({
          id: Math.random().toString(),
          branchId: bd.branchId || '',
          salary: String(bd.salary || '4000'),
          workHours: String(bd.workHoursPerDay || bd.workHours || '8'),
          workDays: String(bd.workDaysPerMonth || bd.workDays || '26')
        })));
      } else {
        setBranchesDetails([
          { 
            id: Math.random().toString(),
            branchId: editingEmp.branchId || (branches[0]?.id || ''),
            salary: String(editingEmp.salary || '4000'),
            workHours: String(editingEmp.workHoursPerDay || editingEmp.workHours || '8'),
            workDays: String(editingEmp.workDaysPerMonth || editingEmp.workDays || '26')
          }
        ]);
      }

      setHireDate(editingEmp.hireDate || '');
      setContractType(editingEmp.contractType || 'دوام كامل');
      const rawStatus = editingEmp.status || (editingEmp.is_active === false ? 'تم الاستقالة' : 'على رأس العمل');
      const isActuallyActive = editingEmp.is_active !== false && rawStatus === 'على رأس العمل';
      setStatus(isActuallyActive ? 'على رأس العمل' : 'تم الاستقالة');
      setTerminationReason(editingEmp.suspension_reason || '');
      setPassword(editingEmp.password || '123');

      setAnnualLeaveBalance(String(editingEmp.annualLeaveBalance !== undefined ? editingEmp.annualLeaveBalance : '21'));

      setDocuments(editingEmp.documents || [
        { id: 'doc_1', title: 'الرقم القومي', fileUrl: '', fileType: 'image' },
        { id: 'doc_2', title: 'شهادة التخرج', fileUrl: '', fileType: 'image' },
        { id: 'doc_3', title: 'كارنيه النقابة', fileUrl: '', fileType: 'image' },
        { id: 'doc_4', title: 'العقد', fileUrl: '', fileType: 'image' }
      ]);
    } else {
      setName('');
      setPhone('');
      setPhones([
        { id: '1', number: '', type: 'mobile' }
      ]);
      setRelativePhone('');
      setNationalId('');
      setDob('');
      setAddress('');
      setPhotoUrl('');
      setMaritalStatus('أعزب');

      const nextCode = String(100 + (allEmployees.length + 1));
      setCode(nextCode);
      setJobTitle('مساعد صيدلي');
      setDepartment('الصيدلية');
      
      setBranchesDetails([
        { id: Math.random().toString(), branchId: branches[0]?.id || '', salary: '4000', workHours: '8', workDays: '26' }
      ]);
      
      setHireDate(new Date().toISOString().slice(0, 10));
      setContractType('دوام كامل');
      setStatus('على رأس العمل');
      setTerminationReason('');
      setPassword('123');

      setAnnualLeaveBalance('21');

      setDocuments([
        { id: 'doc_1', title: 'الرقم القومي', fileUrl: '', fileType: 'image' },
        { id: 'doc_2', title: 'شهادة التخرج', fileUrl: '', fileType: 'image' },
        { id: 'doc_3', title: 'كارنيه النقابة', fileUrl: '', fileType: 'image' },
        { id: 'doc_4', title: 'العقد', fileUrl: '', fileType: 'image' }
      ]);
    }
    setCodeError('');
  }, [editingEmp, isOpen]);

  if (!isOpen) return null;

  // Handle unique code verification
  const handleCodeChange = (val) => {
    setCode(val);
    const exists = allEmployees.some(
      (e) => (e.code.trim() === val.trim() || (e.username && e.username.trim() === val.trim())) && 
             e.id !== (editingEmp ? editingEmp.id : null)
    );
    if (exists && val.trim() !== '') {
      setCodeError('⚠️ هذا الكود مستخدم بالفعل لموظف آخر');
    } else {
      setCodeError('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('يرجى إدخال اسم الموظف');
      return;
    }
    if (!code.trim()) {
      alert('يرجى إدخال كود الموظف');
      return;
    }

    if (codeError) {
      alert('لا يمكن الحفظ: ' + codeError);
      return;
    }

    // Filter valid branches details
    const validBranchesDetails = branchesDetails
      .filter((bd) => bd.branchId)
      .map((bd) => ({
        branchId: bd.branchId,
        salary: parseFloat(bd.salary) || 0,
        workHoursPerDay: parseFloat(bd.workHours) || 8,
        workDaysPerMonth: parseFloat(bd.workDays) || 26
      }));

    if (validBranchesDetails.length === 0) {
      alert('يرجى اختيار فرع واحد على الأقل للموظف وتحديد بيانات الراتب وساعات العمل');
      return;
    }

    const isTerminated = status === 'تم الاستقالة';
    if (isTerminated && !terminationReason.trim()) {
      alert('يرجى إدخال سبب الاستقالة / إنهاء الخدمة');
      return;
    }

    const validPhones = phones.filter(p => p.number && p.number.trim());
    const primaryPhone = validPhones[0]?.number || '';

    const employeeData = {
      id: editingEmp ? editingEmp.id : `emp_${Date.now()}`,
      name: name.trim(),
      phone: primaryPhone,
      phones: validPhones,
      email: email.trim(),
      relativePhone: relativePhone.trim(),
      emergencyPhone: relativePhone.trim(),
      nationalId: nationalId.trim(),
      dob,
      address,
      photoUrl,
      maritalStatus,
      code,
      username: code,
      jobTitle,
      department,
      // For backwards compatibility and main branch logic, use the first branch's details
      branchId: validBranchesDetails[0].branchId,
      salary: validBranchesDetails[0].salary,
      workHoursPerDay: validBranchesDetails[0].workHoursPerDay,
      workDaysPerMonth: validBranchesDetails[0].workDaysPerMonth,
      // Store all branches details here
      branchesDetails: validBranchesDetails,
      
      hireDate,
      contractType,
      status: isTerminated ? 'تم الاستقالة' : 'على رأس العمل',
      is_active: !isTerminated,
      fingerprint_active: !isTerminated,
      suspension_reason: isTerminated ? terminationReason.trim() : '',
      password,
      annualLeaveBalance: parseFloat(annualLeaveBalance) || 21,
      documents,
      updatedAt: new Date().toISOString(),
      createdAt: editingEmp ? editingEmp.createdAt : new Date().toISOString()
    };

    onSave(employeeData);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '780px', width: '95%' }}>
        <h3 style={{ fontFamily: 'Cairo', textAlign: 'center', margin: '0 0 16px 0' }}>
          {editingEmp ? `📄 ملف الموظف: ${editingEmp.name}` : '👤 إضافة ملف موظف جديد'}
        </h3>

        {/* Tab Header Navigation */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--border)', marginBottom: '20px' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'personal' ? 'btn-start' : 'btn-ghost'}`}
            style={{ fontSize: '13px', borderRadius: '10px 10px 0 0' }}
            onClick={() => setActiveTab('personal')}
          >
            1️⃣ البيانات الشخصية
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'job' ? 'btn-start' : 'btn-ghost'}`}
            style={{ fontSize: '13px', borderRadius: '10px 10px 0 0' }}
            onClick={() => setActiveTab('job')}
          >
            2️⃣ بيانات الوظيفة
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'financial' ? 'btn-start' : 'btn-ghost'}`}
            style={{ fontSize: '13px', borderRadius: '10px 10px 0 0' }}
            onClick={() => setActiveTab('financial')}
          >
            3️⃣ البيانات المالية وساعات العمل
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'documents' ? 'btn-start' : 'btn-ghost'}`}
            style={{ fontSize: '13px', borderRadius: '10px 10px 0 0' }}
            onClick={() => setActiveTab('documents')}
          >
            4️⃣ المستندات والوثائق
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* TAB 1: Personal Data */}
          {activeTab === 'personal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px dashed var(--primary)' }}>
                  {photoUrl ? (
                    <img src={photoUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '32px' }}>👤</span>
                  )}
                </div>
                <div>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: '13px' }}>
                    📷 رفع صورة الموظف
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileUpload(e, (url) => setPhotoUrl(url))}
                    />
                  </label>
                  {photoUrl && (
                    <button type="button" className="del-btn" style={{ marginLeft: '8px', fontSize: '12px' }} onClick={() => setPhotoUrl('')}>
                      حذف الصورة
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="field">
                  <label>الاسم بالكامل</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="اسم الموظف الثلاثي" />
                </div>

                <div className="field">
                  <label>البريد الإلكتروني الشخصي (Gmail التنبيهات)</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@gmail.com" />
                </div>

                {/* Multiple Phone Numbers Section */}
                <div className="field" style={{ gridColumn: 'span 2', background: 'var(--surface-muted)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ fontWeight: 800, margin: 0 }}>📞 أرقام الهواتف الشخصية والتواصل</label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleAddPhoneField}
                      style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontWeight: 'bold' }}
                    >
                      ➕ إضافة رقم هاتف آخر
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {phones.map((p, idx) => (
                      <div key={p.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                          value={p.type || 'mobile'}
                          onChange={(e) => handlePhoneChange(p.id, 'type', e.target.value)}
                          style={{ width: '130px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '12.5px', fontWeight: 'bold' }}
                        >
                          <option value="mobile">📱 محمول</option>
                          <option value="whatsapp">💬 واتساب</option>
                          <option value="landline">☎️ خط أرضي</option>
                        </select>

                        <input
                          type="text"
                          placeholder="أرقام فقط (مثال: 01012345678)"
                          value={p.number}
                          onChange={(e) => handlePhoneChange(p.id, 'number', e.target.value)}
                          style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '13px', direction: 'ltr', textAlign: 'right' }}
                        />

                        {phones.length > 1 && (
                          <button
                            type="button"
                            className="del-btn"
                            onClick={() => handleRemovePhoneField(p.id)}
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            title="حذف هذا الرقم"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                    * تقبل أرقام الهواتف الأرقام فقط (0-9). يمكنك تحديد نوع الرقم (محمول / واتساب / أرضي).
                  </div>
                </div>

                <div className="field">
                  <label>رقم هاتف قريب من الدرجة الأولى (للطوارئ)</label>
                  <input
                    type="text"
                    value={relativePhone}
                    onChange={(e) => setRelativePhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="01112345678 (أرقام فقط)"
                  />
                </div>

                <div className="field">
                  <label>الرقم القومي (14 رقم)</label>
                  <input
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                    placeholder="29901010123456 (أرقام فقط)"
                  />
                </div>

                <div className="field">
                  <label>تاريخ الميلاد</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>

                <div className="field">
                  <label>الحالة الاجتماعية</label>
                  <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)}>
                    <option value="أعزب">أعزب</option>
                    <option value="متزوج">متزوج</option>
                    <option value="غير ذلك">غير ذلك</option>
                  </select>
                </div>

                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>العنوان السكني</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="المدينة - الشارع - رقم المبنى" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Job Data */}
          {activeTab === 'job' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>كود الموظف (موحد وغير قابل للتكرار)</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder="101"
                  required
                />
                {codeError && <span style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 'bold' }}>{codeError}</span>}
              </div>

              <div className="field">
                <label>المسمى الوظيفي</label>
                <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="صيدلي / مساعد صيدلي" required />
              </div>

              <div className="field">
                <label>القسم</label>
                <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="الصيدلية / الإدارة" />
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>الفروع المعين بها (متعدد الفروع)</label>
                  <button 
                    type="button" 
                    className="btn btn-ghost" 
                    style={{ fontSize: '12px' }}
                    onClick={() => {
                      setBranchesDetails([...branchesDetails, { id: Math.random().toString(), branchId: '', salary: '4000', workHours: '8', workDays: '26' }]);
                    }}
                  >
                    ➕ إضافة فرع آخر
                  </button>
                </div>
                
                {branchesDetails.map((bd, idx) => (
                  <div key={bd.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <select 
                      value={bd.branchId} 
                      onChange={(e) => {
                        const newBd = [...branchesDetails];
                        newBd[idx].branchId = e.target.value;
                        setBranchesDetails(newBd);
                      }}
                      style={{ flex: 1 }}
                    >
                      <option value="">-- اختر الفرع --</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.branchCode})
                        </option>
                      ))}
                    </select>
                    {branchesDetails.length > 1 && (
                      <button 
                        type="button" 
                        className="del-btn" 
                        style={{ padding: '6px' }}
                        onClick={() => {
                          const newBd = branchesDetails.filter((_, i) => i !== idx);
                          setBranchesDetails(newBd);
                        }}
                      >
                        ❌
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="field">
                <label>تاريخ التعيين</label>
                <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </div>

              <div className="field">
                <label>نوع العقد</label>
                <select value={contractType} onChange={(e) => setContractType(e.target.value)}>
                  <option value="دوام كامل">دوام كامل (Full-Time)</option>
                  <option value="دوام جزئي">دوام جزئي (Part-Time)</option>
                  <option value="مؤقت">عقد مؤقت</option>
                </select>
              </div>

              <div className="field">
                <label>حالة الموظف</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="على رأس العمل">🟢 على رأس العمل</option>
                  <option value="تم الاستقالة">🔴 تم الاستقالة / إنهاء الخدمة</option>
                </select>
              </div>

              {status === 'تم الاستقالة' && (
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label style={{ color: 'var(--danger-dark)', fontWeight: 'bold' }}>سبب الإيقاف / إنهاء الخدمة</label>
                  <textarea
                    value={terminationReason}
                    onChange={(e) => setTerminationReason(e.target.value)}
                    placeholder="اكتب سبب تغيير الحالة وإيقاف الحساب"
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--danger-light)', minHeight: '60px' }}
                  />
                </div>
              )}

              <div className="field">
                <label>رصيد الإجازات السنوية (يوم)</label>
                <input
                  type="number"
                  min="0"
                  value={annualLeaveBalance}
                  onChange={(e) => setAnnualLeaveBalance(e.target.value)}
                  placeholder="21"
                />
              </div>

              {/* ── قسم تعيين نظام الدخول للموظف ── */}
              <div
                style={{
                  gridColumn: 'span 2',
                  marginTop: '10px',
                  padding: '16px',
                  background: 'var(--primary-tint)',
                  borderRadius: '12px',
                  border: '1px solid var(--primary-dark)'
                }}
              >
                <h4 style={{ margin: '0 0 8px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
                  🔑 تعيين نظام الدخول والحساب للموظف
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                  يستخدم الموظف الكود الموحد الخاص به وكلمة المرور لتسجيل الدخول إلى صفحة الموظف وبوابة الحضور والبصمة.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label>اسم المستخدم للدخول (كود الموظف)</label>
                    <input
                      type="text"
                      value={code}
                      readOnly
                      style={{ background: 'var(--surface)', fontWeight: 'bold' }}
                    />
                  </div>

                  <div className="field">
                    <label>كلمة المرور الخاصة بالمواصفة</label>
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="123"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Financial & Work Schedule */}
          {activeTab === 'financial' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)', background: 'var(--surface)', padding: '12px 14px', borderRadius: '10px', lineHeight: '1.7', border: '1px solid var(--border)' }}>
                ✨ <strong>معادلة احتساب أجر الموظف وسعر اليوم المعتمدة:</strong>
                <br />
                1. <strong>سعر اليوم</strong> = (سعر الساعة الشهري × عدد ساعات العمل المدخلة) ÷ عدد أيام العمل المدخلة.
                <br />
                2. <strong>سعر الساعة اليومي</strong> = سعر اليوم ÷ عدد ساعات العمل المدخلة.
                <br />
                3. <strong>احتساب أجر اليوم / الوردية</strong> = سعر الساعة اليومي × عدد الساعات الموضوعة في الجدول الشهري / الفعلية.
              </div>
              
              {branchesDetails.map((bd, idx) => {
                const branchName = branches.find(b => b.id === bd.branchId)?.name || `فرع غير محدد (${idx + 1})`;
                const rateVal = parseFloat(bd.salary) || 0;
                const daysVal = parseFloat(bd.workDays) || 26;
                const hoursVal = parseFloat(bd.workHours) || 8;
                const calcDailyRate = daysVal > 0 ? (rateVal * hoursVal) / daysVal : 0;
                const calcDailyHourlyRate = hoursVal > 0 ? calcDailyRate / hoursVal : (daysVal > 0 ? rateVal / daysVal : rateVal);
                const calcMonthlySalary = calcDailyRate * daysVal;

                return (
                  <div key={bd.id} style={{ background: 'var(--primary-tint)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary-dark)', fontFamily: 'Cairo' }}>💰 بيانات وأجور: {branchName}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                      <div className="field">
                        <label>سعر الساعة الشهري (الراتب الأساسي)</label>
                        <input type="number" value={bd.salary} onChange={(e) => {
                          const newBd = [...branchesDetails];
                          newBd[idx].salary = e.target.value;
                          setBranchesDetails(newBd);
                        }} placeholder="650" required />
                      </div>

                      <div className="field">
                        <label>ساعات العمل اليومية المدخلة</label>
                        <input type="number" value={bd.workHours} onChange={(e) => {
                          const newBd = [...branchesDetails];
                          newBd[idx].workHours = e.target.value;
                          setBranchesDetails(newBd);
                        }} placeholder="10" required />
                      </div>

                      <div className="field">
                        <label>أيام العمل الشهرية المدخلة</label>
                        <input type="number" value={bd.workDays} onChange={(e) => {
                          const newBd = [...branchesDetails];
                          newBd[idx].workDays = e.target.value;
                          setBranchesDetails(newBd);
                        }} placeholder="26" required />
                      </div>
                    </div>

                    <div style={{ marginTop: '10px', padding: '8px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', color: '#166534', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <span>📅 سعر اليوم: <strong>{calcDailyRate.toLocaleString()} ج.م / يوم</strong> (({rateVal} × {hoursVal}) ÷ {daysVal})</span>
                      <span>💵 سعر الساعة اليومي: <strong>{calcDailyHourlyRate.toLocaleString()} ج.م / ساعة</strong></span>
                      <span>💰 الراتب الأساسي الشهري: <strong>{calcMonthlySalary.toLocaleString()} ج.م</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: Documents & Attachments */}
          {activeTab === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                * يمكنك إرفاق مستندات الموظف (صور أو ملفات PDF) ومعاينتها في أي وقت. لا يشترط تواجدها لحفظ الملف.
              </p>

              {/* Add Custom Document Form */}
              <div style={{ display: 'flex', gap: '10px', background: 'var(--primary-tint)', padding: '12px', borderRadius: '12px' }}>
                <input
                  type="text"
                  placeholder="اسم مستند جديد (مثال: فيش وتشبيه / شهادة المعاملة)"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-start" onClick={handleAddCustomDocument}>
                  ➕ إضافة مستند
                </button>
              </div>

              {/* Documents Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px'
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>📄 {doc.title}</span>
                      {doc.fileName && (
                        <span style={{ fontSize: '12px', color: 'var(--muted)', marginRight: '8px' }}>
                          ({doc.fileName})
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: '12px' }}>
                        {doc.fileUrl ? '🔄 استبدال' : '📤 رفع مستند'}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => handleDocFileUpload(e, doc.id)}
                        />
                      </label>

                      {doc.fileUrl && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '12px', color: 'var(--primary)' }}
                          onClick={() => setPreviewDoc(doc)}
                        >
                          👁️ معاينة
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="modal-actions" style={{ justifyContent: 'center', marginTop: '24px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-start" style={{ minWidth: '160px' }}>
              💾 حفظ ملف الموظف
            </button>
          </div>
        </form>

        {/* Inner Document Preview Modal */}
        {previewDoc && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="doc-preview-modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontFamily: 'Cairo' }}>👁️ معاينة: {previewDoc.title}</h4>
                <button type="button" className="del-btn" onClick={() => setPreviewDoc(null)}>
                  ✖ إغلاق
                </button>
              </div>

              {previewDoc.fileType === 'pdf' ? (
                <iframe src={previewDoc.fileUrl} className="doc-preview-frame" title="PDF Preview" />
              ) : (
                <img src={previewDoc.fileUrl} alt={previewDoc.title} className="doc-preview-frame" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
