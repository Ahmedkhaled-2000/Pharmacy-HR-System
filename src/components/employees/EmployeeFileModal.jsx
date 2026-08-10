import React, { useState, useEffect } from 'react';

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
  const [relativePhone, setRelativePhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('أعزب');

  // 2. Job Data
  const [code, setCode] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('الصيدلية');
  const [branchId, setBranchId] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [contractType, setContractType] = useState('دوام كامل');
  const [status, setStatus] = useState('على رأس العمل'); // 'على رأس العمل' | 'تم الاستقالة'
  const [password, setPassword] = useState('123');

  // 3. Financial & Schedule
  const [salary, setSalary] = useState('4000');
  const [workHours, setWorkHours] = useState('8');
  const [workDays, setWorkDays] = useState('26');
  const [annualLeaveBalance, setAnnualLeaveBalance] = useState('21');

  // 4. Documents Data (Array of { id, title, fileUrl, fileType, uploadedAt })
  const [documents, setDocuments] = useState([]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('الرقم القومي');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    if (editingEmp) {
      setName(editingEmp.name || '');
      setPhone(editingEmp.phone || '');
      setRelativePhone(editingEmp.relativePhone || editingEmp.emergencyPhone || '');
      setNationalId(editingEmp.nationalId || '');
      setDob(editingEmp.dob || '');
      setAddress(editingEmp.address || '');
      setPhotoUrl(editingEmp.photoUrl || '');
      setMaritalStatus(editingEmp.maritalStatus || 'أعزب');

      setCode(editingEmp.code || '');
      setJobTitle(editingEmp.jobTitle || '');
      setDepartment(editingEmp.department || 'الصيدلية');
      setBranchId(editingEmp.branchId || (branches[0]?.id || ''));
      setHireDate(editingEmp.hireDate || '');
      setContractType(editingEmp.contractType || 'دوام كامل');
      setStatus(editingEmp.status || 'على رأس العمل');
      setPassword(editingEmp.password || '123');

      setSalary(String(editingEmp.salary || '4000'));
      setWorkHours(String(editingEmp.workHoursPerDay || editingEmp.workHours || '8'));
      setWorkDays(String(editingEmp.workDaysPerMonth || editingEmp.workDays || '26'));
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
      setBranchId(branches[0]?.id || '');
      setHireDate(new Date().toISOString().slice(0, 10));
      setContractType('دوام كامل');
      setStatus('على رأس العمل');
      setPassword('123');

      setSalary('4000');
      setWorkHours('8');
      setWorkDays('26');
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
      (e) => e.code.trim() === val.trim() && e.id !== editingEmp?.id
    );
    if (exists) {
      setCodeError('❌ كود الموظف مستخدم بالفعل لملف آخر. يرجى إدخال كود فريد.');
    } else {
      setCodeError('');
    }
  };

  const handleAddCustomDocument = () => {
    const title = newDocTitle.trim() || selectedDocType;
    if (!title) return;
    const newDoc = {
      id: `doc_${Date.now()}`,
      title,
      fileUrl: '',
      fileType: 'image'
    };
    setDocuments([...documents, newDoc]);
    setNewDocTitle('');
  };

  const handleDocFileUpload = (e, docId) => {
    const file = e.target.files[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf';
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === docId
            ? { ...doc, fileUrl: dataUrl, fileType: isPdf ? 'pdf' : 'image', fileName: file.name }
            : doc
        )
      );
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (codeError) {
      alert('لا يمكن الحفظ: كود الموظف مكرر!');
      return;
    }
    if (!name.trim()) {
      alert('يرجى إدخال اسم الموظف');
      return;
    }

    const employeeData = {
      id: editingEmp ? editingEmp.id : `emp_${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
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
      branchId,
      hireDate,
      contractType,
      status,
      password,
      salary: parseFloat(salary) || 4000,
      workHoursPerDay: parseFloat(workHours) || 8,
      workDaysPerMonth: parseFloat(workDays) || 26,
      annualLeaveBalance: parseFloat(annualLeaveBalance) || 21,
      documents,
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
                  <label>رقم الهاتف الشخصي</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" />
                </div>
                <div className="field">
                  <label>رقم هاتف قريب من الدرجة الأولى (للطوارئ)</label>
                  <input type="text" value={relativePhone} onChange={(e) => setRelativePhone(e.target.value)} placeholder="01112345678 (الأب / الزوجة / الأخ)" />
                </div>
                <div className="field">
                  <label>الرقم القومي (14 رقم)</label>
                  <input type="text" value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="29901010123456" />
                </div>
                <div className="field">
                  <label>تاريخ الميلاد</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>العنوان السكني</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="المدينة - الشارع - رقم المبنى" />
                </div>
                <div className="field">
                  <label>الحالة الاجتماعية</label>
                  <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)}>
                    <option value="أعزب">أعزب</option>
                    <option value="متزوج">متزوج</option>
                    <option value="غير ذلك">غير ذلك</option>
                  </select>
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

              <div className="field">
                <label>الفرع الذي يعمل به</label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">-- اختر الفرع --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.branchCode})
                    </option>
                  ))}
                </select>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label>سعر الساعة الشهري / الراتب الأساسي (ج.م)</label>
                <input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="4000" required />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  * يتم حساب سعر الساعة في نظام الأجور بـ: الراتب الأساسي ÷ (عدد أيام العمل × عدد ساعات اليوم)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="field">
                  <label>عدد أيام العمل الشهرية (يوم)</label>
                  <input type="number" value={workDays} onChange={(e) => setWorkDays(e.target.value)} placeholder="26" required />
                </div>
                <div className="field">
                  <label>عدد ساعات العمل اليومية (ساعة/شيفت)</label>
                  <input type="number" value={workHours} onChange={(e) => setWorkHours(e.target.value)} placeholder="8" required />
                </div>
              </div>
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
