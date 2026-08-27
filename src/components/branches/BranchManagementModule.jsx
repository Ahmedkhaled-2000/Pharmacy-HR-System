import React, { useState } from 'react';
import BranchPhonesDirectoryModal from './BranchPhonesDirectoryModal';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

export default function BranchManagementModule({ state, onSaveBranch, onDeleteBranch }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPhonesModalOpen, setIsPhonesModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);

  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  // Multiple phone numbers state: array of { id, number, type: 'mobile' | 'landline' | 'whatsapp' }
  const [phones, setPhones] = useState([
    { id: '1', number: '', type: 'landline' }
  ]);
  const [managerId, setManagerId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const branches = state.branches || [];
  const employees = state.employees || [];

  const handleUsernameChange = (val) => {
    setUsername(val);
    const cleanVal = val.trim().toLowerCase();
    if (!cleanVal) {
      setUsernameError('');
      return;
    }
    const currentBranchId = editingBranch ? editingBranch.id : null;
    const duplicateBranch = branches.find(
      (b) => b.id !== currentBranchId && b.username && b.username.trim().toLowerCase() === cleanVal
    );
    const duplicateEmp = employees.find(
      (e) => (e.code && String(e.code).trim().toLowerCase() === cleanVal) ||
             (e.username && String(e.username).trim().toLowerCase() === cleanVal)
    );

    if (duplicateBranch) {
      setUsernameError(`⚠️ اسم المستخدم مستخدم بالفعل لفرع "${duplicateBranch.name}"`);
    } else if (duplicateEmp) {
      setUsernameError(`⚠️ اسم المستخدم مستخدم بالفعل ككود للموظف "${duplicateEmp.name}" (كود: ${duplicateEmp.code})`);
    } else {
      setUsernameError('');
    }
  };

  const handleOpenAdd = () => {
    setEditingBranch(null);
    setBranchCode(`BR-${branches.length + 101}`);
    setBranchName('');
    setBranchAddress('');
    setPhones([
      { id: Date.now().toString(), number: '', type: 'landline' }
    ]);
    setManagerId('');
    
    // Auto-generate safe username that doesn't conflict with existing branches or employee codes
    let bIndex = branches.length + 1;
    let candidateUser = `branch_${bIndex}`;
    const isUserTaken = (cand) => {
      const u = cand.toLowerCase();
      const bTaken = branches.some(b => b.username && b.username.trim().toLowerCase() === u);
      const eTaken = employees.some(e => 
        (e.code && String(e.code).trim().toLowerCase() === u) ||
        (e.username && String(e.username).trim().toLowerCase() === u)
      );
      return bTaken || eTaken;
    };
    while (isUserTaken(candidateUser)) {
      bIndex++;
      candidateUser = `branch_${bIndex}`;
    }

    setUsername(candidateUser);
    setPassword('123456');
    setUsernameError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (branch) => {
    setEditingBranch(branch);
    setBranchCode(branch.branchCode || '');
    setBranchName(branch.name || '');
    setBranchAddress(branch.address || '');
    
    // Load phones array or fallback to legacy single phone string
    if (Array.isArray(branch.phones) && branch.phones.length > 0) {
      setPhones(branch.phones.map(p => ({
        id: p.id || Math.random().toString(),
        number: p.number || '',
        type: p.type || 'landline'
      })));
    } else if (branch.phone && branch.phone.trim()) {
      setPhones([
        { id: '1', number: branch.phone.trim(), type: 'landline' }
      ]);
    } else {
      setPhones([
        { id: '1', number: '', type: 'landline' }
      ]);
    }

    setManagerId(branch.managerId || '');
    setUsername(branch.username || '');
    setPassword(branch.password || '');
    setUsernameError('');
    setIsModalOpen(true);
  };

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
      setPhones([{ id: '1', number: '', type: 'landline' }]);
      return;
    }
    setPhones(phones.filter(p => p.id !== id));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!branchName.trim()) {
      alert('يرجى إدخال اسم الفرع');
      return;
    }

    if (usernameError) {
      alert('يرجى اختيار اسم مستخدم غير مكرر للفرع');
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const currentBranchId = editingBranch ? editingBranch.id : null;
    const duplicate = branches.find(
      (b) => b.id !== currentBranchId && b.username && b.username.trim().toLowerCase() === cleanUsername
    );
    if (duplicate) {
      alert(`⚠️ اسم المستخدم مستخدم بالفعل لفرع "${duplicate.name}"`);
      return;
    }

    const duplicateEmp = employees.find(
      (e) => (e.code && String(e.code).trim().toLowerCase() === cleanUsername) ||
             (e.username && String(e.username).trim().toLowerCase() === cleanUsername)
    );
    if (duplicateEmp) {
      alert(`⚠️ لا يمكن استخدام اسم المستخدم هذا لأنه مستخدم بالفعل ككود للموظف "${duplicateEmp.name}" (كود: ${duplicateEmp.code})`);
      return;
    }

    // Clean valid phones
    const validPhones = phones.filter(p => p.number && p.number.trim());
    const primaryPhone = validPhones[0]?.number || '';

    const branchData = {
      id: editingBranch ? editingBranch.id : `branch_${Date.now()}`,
      branchCode,
      name: branchName,
      address: branchAddress,
      phone: primaryPhone,
      phones: validPhones,
      managerId,
      username: username.trim(),
      password,
      createdAt: editingBranch ? editingBranch.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    onSaveBranch(branchData);
    setIsModalOpen(false);
  };

  const getPhoneBadge = (p) => {
    const isWhatsapp = p.type === 'whatsapp';
    const isLandline = p.type === 'landline';
    const icon = isLandline ? '☎️' : isWhatsapp ? '💬' : '📱';
    const bg = isLandline ? '#e0f2fe' : isWhatsapp ? '#dcfce7' : '#f0fdf4';
    const color = isLandline ? '#0369a1' : isWhatsapp ? '#15803d' : '#166534';
    const border = isLandline ? '#bae6fd' : isWhatsapp ? '#86efac' : '#bbf7d0';

    return (
      <span
        key={p.id || p.number}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          background: bg,
          color: color,
          border: `1px solid ${border}`,
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 700,
          margin: '2px 3px'
        }}
      >
        <span>{icon}</span>
        <span style={{ direction: 'ltr' }}>{p.number}</span>
      </span>
    );
  };

  return (
    <div className="bylaws-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>🏢 إدارة الفروع وتعيين المديرين</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            إنشاء وإدارة الفروع وتكليف الموظفين كمديري فروع وإدارة أرقام الهواتف والتواصل
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsPhonesModalOpen(true)}
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary-dark)',
              border: '1px solid var(--primary-tint)',
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📞</span> أرقام الفروع
          </button>
          <button type="button" className="btn btn-start" onClick={handleOpenAdd}>
            ➕ إضافة فرع جديد
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الفرع (Branch ID)</th>
              <th>اسم الفرع</th>
              <th>العنوان</th>
              <th>الهواتف والتواصل</th>
              <th>مدير الفرع المكلف</th>
              <th>اسم المستخدم (صفحة الفرع)</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                  لا توجد فروع مسجلة حتى الآن. انقر على "إضافة فرع جديد" للبدء.
                </td>
              </tr>
            ) : (
              branches.map((b) => {
                const manager = employees.find((e) => String(e.id) === String(b.managerId));
                
                // Get all phones
                let branchPhones = [];
                if (Array.isArray(b.phones) && b.phones.length > 0) {
                  branchPhones = b.phones.filter(p => p && p.number);
                } else if (b.phone && b.phone.trim()) {
                  branchPhones = [{ id: '1', number: b.phone.trim(), type: 'landline' }];
                }

                return (
                  <tr key={b.id}>
                    <td>
                      <span className="badge badge-primary">{b.branchCode || b.id}</span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{b.name}</td>
                    <td>{b.address || '—'}</td>
                    <td>
                      {branchPhones.length === 0 ? (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: '260px' }}>
                          {branchPhones.map((p) => getPhoneBadge(p))}
                        </div>
                      )}
                    </td>
                    <td>
                      {manager ? (
                        <span style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                          👤 {manager.name} ({manager.code})
                        </span>
                      ) : (
                        <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🚫 بدون مدير (مباشر للإدارة)
                        </span>
                      )}
                    </td>
                    <td>
                      <code style={{ background: 'var(--primary-tint)', padding: '2px 8px', borderRadius: '6px' }}>
                        {b.username}
                      </code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => handleOpenEdit(b)}>
                          ✏️ تعديل
                        </button>
                        <button type="button" className="del-btn" style={{ fontSize: '12px' }} onClick={() => onDeleteBranch(b.id)}>
                          🗑️ حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Create/Edit Branch */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '580px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontFamily: 'Cairo', textAlign: 'center', marginBottom: '20px' }}>
              {editingBranch ? '✏️ تعديل بيانات الفرع' : '🏢 إضافة فرع جديد'}
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label>كود الفرع (Branch Code / ID)</label>
                <input type="text" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} required />
              </div>

              <div className="field">
                <label>اسم الفرع</label>
                <input type="text" placeholder="مثال: الفرع الرئيسي - المقطم" value={branchName} onChange={(e) => setBranchName(e.target.value)} required />
              </div>

              <div className="field">
                <label>عنوان الفرع</label>
                <input type="text" placeholder="العنوان بالتفصيل" value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} />
              </div>

              {/* Dynamic Multiple Phone Numbers Section */}
              <div className="field" style={{ background: 'var(--surface-muted)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontWeight: 800, margin: 0 }}>📞 أرقام هواتف وتواصل الفرع</label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleAddPhoneField}
                    style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontWeight: 'bold' }}
                  >
                    ➕ إضافة رقم آخر
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
                        <option value="mobile">📱 محمول / هاتف</option>
                        <option value="landline">☎️ خط أرضي</option>
                        <option value="whatsapp">💬 واتساب</option>
                      </select>

                      <input
                        type="text"
                        placeholder="أرقام فقط (مثال: 0221234567)"
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
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
                  * حقول الأرقام تقبل الأرقام فقط (0-9). يمكنك إضافة خط أرضي، هاتف محمول، أو رقم واتساب.
                </div>
              </div>

              <div className="field">
                <label style={{ fontWeight: 'bold' }}>مدير الفرع (يتم جلبه من قاعدة بيانات الموظفين)</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border)',
                    background: managerId ? 'var(--surface)' : '#fefce8',
                    fontWeight: 700
                  }}
                >
                  <option value="">🚫 فرع بدون مدير (تحويل كافة الطلبات للإدارة العليا مباشرة)</option>
                  {employees.filter(isEmployeeActive).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      👤 {getEmpDisplayName(emp)} (كود: {emp.code} - {emp.jobTitle || 'موظف'})
                    </option>
                  ))}
                </select>
                {!managerId && (
                  <div style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '6px 10px', borderRadius: '6px', fontSize: '11.5px', marginTop: '6px', fontWeight: 'bold' }}>
                    ⚡ في حال اختيار (فرع بدون مدير): سيتم إرسال كافة طلبات موظفي هذا الفرع (إجازات، أذونات، سلف، استقالات، إلخ) مباشرة إلى الإدارة العليا للاعتماد النهائي.
                  </div>
                )}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
              <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
                🔑 بيانات تسجيل الدخول لصفحة مدير الفرع
              </h4>

              <div className="field">
                <label>اسم المستخدم (صفحة الفرع)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  style={usernameError ? { borderColor: 'var(--danger)' } : {}}
                  required
                />
                {usernameError && (
                  <span style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 'bold', marginTop: '4px' }}>
                    {usernameError}
                  </span>
                )}
              </div>

              <div className="field">
                <label>كلمة المرور (صفحة الفرع)</label>
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              <div className="modal-actions" style={{ justifyContent: 'center', marginTop: '16px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-start">
                  حفظ الفرع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Branch Phones Directory Modal */}
      <BranchPhonesDirectoryModal
        isOpen={isPhonesModalOpen}
        onClose={() => setIsPhonesModalOpen(false)}
        branches={branches}
        employees={employees}
      />
    </div>
  );
}
