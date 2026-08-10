import React, { useState } from 'react';

export default function BranchManagementModule({ state, onSaveBranch, onDeleteBranch }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);

  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [managerId, setManagerId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const branches = state.branches || [];
  const employees = state.employees || [];

  const handleOpenAdd = () => {
    setEditingBranch(null);
    setBranchCode(`BR-${branches.length + 101}`);
    setBranchName('');
    setBranchAddress('');
    setBranchPhone('');
    setManagerId(employees[0]?.id || '');
    setUsername(`branch_${branches.length + 1}`);
    setPassword('123456');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (branch) => {
    setEditingBranch(branch);
    setBranchCode(branch.branchCode || '');
    setBranchName(branch.name || '');
    setBranchAddress(branch.address || '');
    setBranchPhone(branch.phone || '');
    setManagerId(branch.managerId || '');
    setUsername(branch.username || '');
    setPassword(branch.password || '');
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!branchName.trim()) {
      alert('يرجى إدخال اسم الفرع');
      return;
    }
    const branchData = {
      id: editingBranch ? editingBranch.id : `branch_${Date.now()}`,
      branchCode,
      name: branchName,
      address: branchAddress,
      phone: branchPhone,
      managerId,
      username,
      password,
      createdAt: editingBranch ? editingBranch.createdAt : new Date().toISOString()
    };
    onSaveBranch(branchData);
    setIsModalOpen(false);
  };

  return (
    <div className="bylaws-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>🏢 إدارة الفروع وتعيين المديرين</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            إنشاء وإدارة الفروع وتكليف الموظفين كمديري فروع وتعيين بيانات الدخول لصفحة الفرع
          </p>
        </div>
        <button type="button" className="btn btn-start" onClick={handleOpenAdd}>
          ➕ إضافة فرع جديد
        </button>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الفرع (Branch ID)</th>
              <th>اسم الفرع</th>
              <th>العنوان</th>
              <th>الهاتف</th>
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
                const manager = employees.find((e) => e.id === b.managerId);
                return (
                  <tr key={b.id}>
                    <td>
                      <span className="badge badge-primary">{b.branchCode || b.id}</span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{b.name}</td>
                    <td>{b.address || '—'}</td>
                    <td>{b.phone || '—'}</td>
                    <td>
                      {manager ? (
                        <span style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                          👤 {manager.name} ({manager.code})
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>غير محدد</span>
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
          <div className="modal-card" style={{ maxWidth: '540px' }}>
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

              <div className="field">
                <label>هاتف الفرع</label>
                <input type="text" placeholder="0221234567" value={branchPhone} onChange={(e) => setBranchPhone(e.target.value)} />
              </div>

              <div className="field">
                <label>مدير الفرع (يتم جلبه من قاعدة بيانات الموظفين)</label>
                <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                  <option value="">-- اختر مدير الفرع --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (كود: {emp.code} - {emp.jobTitle || 'موظف'})
                    </option>
                  ))}
                </select>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
              <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
                🔑 بيانات تسجيل الدخول لصفحة مدير الفرع
              </h4>

              <div className="field">
                <label>اسم المستخدم (صفحة الفرع)</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
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
    </div>
  );
}
