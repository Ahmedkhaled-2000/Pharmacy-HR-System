import React, { useState, useEffect } from 'react';
import { Building2, UserPlus, Users, Key, Save, Edit2, Shield, Check, Keyboard, RotateCcw } from 'lucide-react';
import {
  outstockGetBranches,
  outstockSaveBranch,
  outstockGetUsers,
  outstockSaveUser,
  outstockChangePassword
} from '../../../utils/outstockApiClient';
import {
  getActiveShortcuts,
  STORAGE_SHORTCUTS_KEY,
  formatShortcutDisplay,
  formatShortcutFallback
} from '../../../utils/shortcutsConfig';

/**
 * OwnerSettingsTab.jsx
 * شاشة الإعدادات والتحكم والصلاحيات للمالك والمشرف العام
 * 1. إنشاء الفروع وجلب بياناتها من منظومة الرواتب وتعيين اسم مستخدم وكلمة مرور فريدين
 * 2. إنشاء وتعديل يوزرات إدارة المشتريات
 * 3. تخصيص صلاحيات فروع محددة لمسؤولي المشتريات المساعدين (Sub-Purchasing Scope)
 * 4. تعديل كلمة مرور المالك وتأمين الحساب
 * 5. تخصيص وإدارة اختصارات لوحة المفاتيح
 */
export default function OwnerSettingsTab({ showToast }) {
  const [activeSubSection, setActiveSubSection] = useState('branches'); // 'branches', 'procurement_users', 'security', 'shortcuts'

  const [shortcutsList, setShortcutsList] = useState(() => getActiveShortcuts());
  const [editingShortcutId, setEditingShortcutId] = useState(null);
  const [shortcutFormKey, setShortcutFormKey] = useState('');
  const [shortcutFormModifiers, setShortcutFormModifiers] = useState([]);

  const [branches, setBranches] = useState([]);
  const [hrBranches, setHrBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [_isLoading, setIsLoading] = useState(true);

  // فورم إضافة / تعديل فرع
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchUsername, setBranchUsername] = useState('');
  const [branchPassword, setBranchPassword] = useState('');
  const [isSavingBranch, setIsSavingBranch] = useState(false);

  // فورم إضافة / تعديل مستخدم مشتريات
  const [editingUser, setEditingUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('procurement');
  const [userPhone, setUserPhone] = useState('');
  const [userAllowedBranches, setUserAllowedBranches] = useState([]);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // فورم تغيير كلمة مرور المالك
  const [oldOwnerPassword, setOldOwnerPassword] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [confirmOwnerPassword, setConfirmOwnerPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const fetchSettingsData = async () => {
    setIsLoading(true);
    try {
      const [branchRes, usersRes] = await Promise.all([
        outstockGetBranches(),
        outstockGetUsers()
      ]);

      if (branchRes?.success) {
        setBranches(branchRes.branches || []);
        setHrBranches(branchRes.hrBranches || []);
      }
      if (usersRes?.success) {
        setUsers(usersRes.users || []);
      }
    } catch (e) {
      console.warn('Fetch settings data error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, []);

  // عند اختيار صيدلية من قائمة فروع الرواتب
  const handleSelectHrBranch = (e) => {
    const selectedId = e.target.value;
    if (!selectedId) return;

    const hrB = hrBranches.find(b => String(b.id) === String(selectedId));
    if (hrB) {
      // تفقد إذا كان مسجلاً بالفعل في outstock
      const existing = branches.find(b => String(b.id) === String(hrB.id));
      setEditingBranch(existing || { id: hrB.id });
      setBranchName(hrB.name || '');
      setBranchCode(hrB.branchCode || hrB.code || '');
      setBranchPhone(hrB.phone || '');
      setBranchAddress(hrB.address || '');
      // اقتراح يوزر مخصص لنظام النواقص يبدأ بـ out_ لمنع التكرار مع نظام الـ HR
      const suggestedUser = existing?.username || `out_${(hrB.branchCode || hrB.id || '').toLowerCase()}`;
      setBranchUsername(suggestedUser);
      setBranchPassword(existing?.password || '1234');
    }
  };

  // حفظ الفرع
  const handleSaveBranchSubmit = async (e) => {
    e.preventDefault();
    if (!branchName || !branchUsername) {
      showToast?.('⚠️ يرجى إدخال اسم الفرع واسم المستخدم');
      return;
    }

    const cleanU = String(branchUsername).trim().toLowerCase();
    const hrCollision = hrBranches.find(b => {
      const bU = String(b.username || '').trim().toLowerCase();
      const bC = String(b.branchCode || b.code || '').trim().toLowerCase();
      const bId = String(b.id || '').trim().toLowerCase();
      return bU === cleanU || bC === cleanU || bId === cleanU;
    });
    if (hrCollision) {
      showToast?.(`⛔ اسم المستخدم "${branchUsername}" مستخدم بالفعل لفرع (${hrCollision.name}) في نظام الـ HR. لا يمكن تكراره؛ يرجى اختيار اسم مستخدم مخصص لنظام النواقص مثل: out_${cleanU}`);
      return;
    }

    setIsSavingBranch(true);
    try {
      const branchId = editingBranch?.id || `branch_${Date.now()}`;
      const res = await outstockSaveBranch({
        id: branchId,
        name: branchName,
        code: branchCode,
        phone: branchPhone,
        address: branchAddress,
        username: branchUsername,
        password: branchPassword
      });

      if (res?.success) {
        showToast?.('✅ تم حفظ بيانات وحساب الفرع في نظام النواقص بنجاح');
        setEditingBranch(null);
        setBranchName('');
        setBranchCode('');
        setBranchPhone('');
        setBranchAddress('');
        setBranchUsername('');
        setBranchPassword('');
        fetchSettingsData();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر حفظ الفرع'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSavingBranch(false);
    }
  };

  // حفظ مستخدم المشتريات
  const handleSaveUserSubmit = async (e) => {
    e.preventDefault();
    if (!userName || !userFullName) {
      showToast?.('⚠️ يرجى إدخال اسم المستخدم والاسم الكامل');
      return;
    }

    const cleanU = String(userName).trim().toLowerCase();
    const hrCollision = hrBranches.find(b => {
      const bU = String(b.username || '').trim().toLowerCase();
      const bC = String(b.branchCode || b.code || '').trim().toLowerCase();
      return bU === cleanU || bC === cleanU;
    });
    if (hrCollision) {
      showToast?.(`⛔ اسم المستخدم "${userName}" مستخدم لفرع (${hrCollision.name}) في نظام الـ HR. يرجى اختيار اسم آخر.`);
      return;
    }

    setIsSavingUser(true);
    try {
      const res = await outstockSaveUser({
        id: editingUser?.id || null,
        username: userName,
        fullName: userFullName,
        password: userPassword,
        role: userRole,
        phone: userPhone,
        allowedBranches: userAllowedBranches
      });

      if (res?.success) {
        showToast?.('✅ تم حفظ مستخدم إدارة المشتريات وتحديد صلاحيات الفروع بنجاح');
        setEditingUser(null);
        setUserName('');
        setUserFullName('');
        setUserPassword('');
        setUserPhone('');
        setUserAllowedBranches([]);
        fetchSettingsData();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر حفظ المستخدم'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء حفظ المستخدم');
    } finally {
      setIsSavingUser(false);
    }
  };

  // تغيير كلمة مرور المالك
  const handleChangeOwnerPassSubmit = async (e) => {
    e.preventDefault();
    if (newOwnerPassword !== confirmOwnerPassword) {
      showToast?.('⚠️ كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }
    if (newOwnerPassword.length < 3) {
      showToast?.('⚠️ كلمة المرور يجب أن تكون 3 أحرف على الأقل');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await outstockChangePassword(oldOwnerPassword, newOwnerPassword);
      if (res?.success) {
        showToast?.('✅ تم تغيير كلمة مرور حساب المالك بنجاح');
        setOldOwnerPassword('');
        setNewOwnerPassword('');
        setConfirmOwnerPassword('');
      } else {
        showToast?.(`⚠️ ${res?.error || 'كلمة المرور الحالية غير صحيحة'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء التغيير');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div>
      {/* ── شريط التبويبات الفرعية للإعدادات ── */}
      <div className="outstock-card" style={{ padding: '12px' }}>
        <div className="outstock-subnav-bar">
          <button
            type="button"
            className={`outstock-nav-btn ${activeSubSection === 'branches' ? 'is-active' : ''}`}
            onClick={() => setActiveSubSection('branches')}
          >
            <Building2 size={16} />
            <span>إدارة وتفعيل الفروع والصيدليات</span>
          </button>

          <button
            type="button"
            className={`outstock-nav-btn ${activeSubSection === 'procurement_users' ? 'is-active' : ''}`}
            onClick={() => setActiveSubSection('procurement_users')}
          >
            <Users size={16} />
            <span>يوزرات إدارة المشتريات والصلاحيات</span>
          </button>

          <button
            type="button"
            className={`outstock-nav-btn ${activeSubSection === 'security' ? 'is-active' : ''}`}
            onClick={() => setActiveSubSection('security')}
          >
            <Key size={16} />
            <span>تأمين حساب المالك وكلمة المرور</span>
          </button>

          <button
            type="button"
            className={`outstock-nav-btn ${activeSubSection === 'shortcuts' ? 'is-active' : ''}`}
            onClick={() => setActiveSubSection('shortcuts')}
          >
            <Keyboard size={16} />
            <span>تخصيص اختصارات لوحة المفاتيح</span>
          </button>
        </div>
      </div>

      {/* ── 1. قسم إدارة الفروع وتكاملها مع نظام الرواتب ── */}
      {activeSubSection === 'branches' && (
        <div className="outstock-settings-grid">
          {/* نموذج إضافة وتعديل الفرع */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '14px' }}>
              <Building2 size={18} color="#0d9488" />
              <span>{editingBranch ? `تعديل بيانات فرع (${branchName})` : 'إضافة أو ربط صيدلية جديدة'}</span>
            </h3>

            {/* قائمة جلب الصيدليات الموجودة في نظام منظومة الرواتب */}
            {hrBranches.length > 0 && (
              <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'block', marginBottom: '6px' }}>
                  📥 جلب بيانات صيدلية مسجلة في منظومة الرواتب تلقائياً:
                </label>
                <select onChange={handleSelectHrBranch} className="outstock-form-select">
                  <option value="">-- اختر صيدلية لجلب معلوماتها والتعديل عليها --</option>
                  {hrBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.branchCode || b.id})</option>
                  ))}
                </select>
              </div>
            )}

            <form onSubmit={handleSaveBranchSubmit}>
              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>اسم الصيدلية / الفرع *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: صيدلية فرع فيصل"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-row" style={{ marginBottom: '12px' }}>
                <div className="outstock-form-group">
                  <label>كود الصيدلية</label>
                  <input
                    type="text"
                    placeholder="BR-01"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>

                <div className="outstock-form-group">
                  <label>رقم هاتف الصيدلية</label>
                  <input
                    type="tel"
                    placeholder="01xxxxxxxxx"
                    value={branchPhone}
                    onChange={(e) => setBranchPhone(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>
              </div>

              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>عنوان ومقر الصيدلية</label>
                <input
                  type="text"
                  placeholder="الشارع، المنطقة، المحافظة"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '4px' }}>
                  🔐 بيانات دخول فرع نظام النواقص (OutStock Login Credentials):
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', lineHeight: '1.5' }}>
                  💡 <b style={{ color: '#0f766e' }}>فصل تام:</b> هذا اليوزر مخصص حصرياً لدخول الفرع على نظام النواقص وطلبات الأدوية. لا يمكن استخدام نفس يوزر الفرع المسجل في الـ HR، ويُقترح استخدام البادئة <code>out_</code> (مثال: out_0).
                </div>

                <div className="outstock-form-row">
                  <div className="outstock-form-group">
                    <label>اسم المستخدم للفرع (OutStock) *</label>
                    <input
                      type="text"
                      required
                      placeholder="out_branch"
                      value={branchUsername}
                      onChange={(e) => setBranchUsername(e.target.value)}
                      className="outstock-form-input"
                      dir="ltr"
                      style={{ textAlign: 'right' }}
                    />
                  </div>

                  <div className="outstock-form-group">
                    <label>كلمة المرور للفرع *</label>
                    <input
                      type="text"
                      required
                      placeholder="كلمة مرور الدخول"
                      value={branchPassword}
                      onChange={(e) => setBranchPassword(e.target.value)}
                      className="outstock-form-input"
                      dir="ltr"
                      style={{ textAlign: 'right' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={isSavingBranch}
                  className="outstock-btn outstock-btn-primary"
                  style={{ flex: 1 }}
                >
                  <Save size={16} />
                  <span>{isSavingBranch ? 'جاري الحفظ...' : 'حفظ بيانات الفرع'}</span>
                </button>

                {editingBranch && (
                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    onClick={() => {
                      setEditingBranch(null);
                      setBranchName('');
                      setBranchCode('');
                      setBranchPhone('');
                      setBranchAddress('');
                      setBranchUsername('');
                      setBranchPassword('');
                    }}
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* قائمة الفروع الحالية المسجلة */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '14px' }}>
              <span>الفروع والصيدليات المسجلة بالنظام ({branches.length})</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {branches.map(b => (
                <div
                  key={b.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{b.name}</strong>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      اسم المستخدم: <strong dir="ltr">{b.username || '—'}</strong> | كود: {b.code || '—'}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    style={{ padding: '5px 12px', fontSize: '12px' }}
                    onClick={() => {
                      setEditingBranch(b);
                      setBranchName(b.name || '');
                      setBranchCode(b.code || '');
                      setBranchPhone(b.phone || '');
                      setBranchAddress(b.address || '');
                      setBranchUsername(b.username || '');
                      setBranchPassword(b.password || '');
                    }}
                  >
                    <Edit2 size={13} />
                    <span>تعديل</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. قسم يوزرات المشتريات وتحديد الصلاحيات المخصصة ── */}
      {activeSubSection === 'procurement_users' && (
        <div className="outstock-settings-grid">
          {/* نموذج إضافة وتعديل مستخدم مشتريات */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '14px' }}>
              <UserPlus size={18} color="#0d9488" />
              <span>{editingUser ? `تعديل مستخدم (${userFullName})` : 'إنشاء يوزر جديد لإدارة المشتريات'}</span>
            </h3>

            <form onSubmit={handleSaveUserSubmit}>
              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>اسم الموظف / المسؤول الكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أ/ محمد عبد الرحمن"
                  value={userFullName}
                  onChange={(e) => setUserFullName(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-row" style={{ marginBottom: '12px' }}>
                <div className="outstock-form-group">
                  <label>اسم المستخدم للدخول (فريد) *</label>
                  <input
                    type="text"
                    required
                    placeholder="procurement_user"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>

                <div className="outstock-form-group">
                  <label>كلمة المرور *</label>
                  <input
                    type="text"
                    required
                    placeholder="كلمة مرور قوية"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="outstock-form-input"
                    dir="ltr"
                    style={{ textAlign: 'right' }}
                  />
                </div>
              </div>

              <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
                <label>المستوى الوظيفي والصلاحية</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="outstock-form-select"
                >
                  <option value="procurement">مدير مشتريات (كامل الفروع والصلاحيات)</option>
                  <option value="procurement">مسؤول مشتريات مساعد (محدد بفروع معينة)</option>
                </select>
              </div>

              {/* اختيار الفروع المصرح بها لمسؤول المشتريات المساعد */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>
                  🏢 الفروع المصرح للمستخدم بمتابعتها والرد عليها:
                </div>
                <small style={{ color: '#64748b', display: 'block', marginBottom: '8px' }}>
                  (إذا لم تحدد فروعاً، سيتمكن المستخدم من متابعة جميع الفروع تلقائياً)
                </small>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                  {branches.map(b => {
                    const isChecked = userAllowedBranches.includes(b.id);
                    return (
                      <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setUserAllowedBranches(prev => [...prev, b.id]);
                            } else {
                              setUserAllowedBranches(prev => prev.filter(id => id !== b.id));
                            }
                          }}
                        />
                        <span>{b.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="outstock-btn outstock-btn-primary"
                  style={{ flex: 1 }}
                >
                  <Save size={16} />
                  <span>{isSavingUser ? 'جاري الحفظ...' : 'حفظ بيانات المستخدم'}</span>
                </button>

                {editingUser && (
                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    onClick={() => {
                      setEditingUser(null);
                      setUserName('');
                      setUserFullName('');
                      setUserPassword('');
                      setUserAllowedBranches([]);
                    }}
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* قائمة مستخدمي المشتريات */}
          <div className="outstock-card">
            <h3 className="outstock-card-title" style={{ marginBottom: '14px' }}>
              <span>فريق إدارة المشتريات</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {users.filter(u => u.role === 'procurement').map(u => (
                <div
                  key={u.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{u.full_name}</strong>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      اسم المستخدم: <strong dir="ltr">{u.username}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '2px' }}>
                      الفروع المصرح بها:{' '}
                      {Array.isArray(u.allowed_branches) && u.allowed_branches.length > 0
                        ? `${u.allowed_branches.length} فروع مخصصة`
                        : 'جميع الفروع (صلاحية كاملة)'}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    style={{ padding: '5px 12px', fontSize: '12px' }}
                    onClick={() => {
                      setEditingUser(u);
                      setUserName(u.username || '');
                      setUserFullName(u.full_name || '');
                      setUserPassword('');
                      setUserRole(u.role || 'procurement');
                      setUserAllowedBranches(Array.isArray(u.allowed_branches) ? u.allowed_branches : []);
                    }}
                  >
                    <Edit2 size={13} />
                    <span>تعديل</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3. قسم تأمين حساب المالك ── */}
      {activeSubSection === 'security' && (
        <div className="outstock-card" style={{ maxWidth: '520px', margin: '0 auto' }}>
          <h3 className="outstock-card-title" style={{ marginBottom: '12px' }}>
            <Key size={18} color="#0d9488" />
            <span>تأمين حساب المالك (OutStock Owner) وتغيير كلمة المرور</span>
          </h3>

          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: '1.5' }}>
            الحساب الافتراضي المبدئي للمالك هو المستخدم: <strong>out</strong> وكلمة المرور: <strong>123</strong>.<br />
            لحماية المنظومة وصلاحيات التحكم، يُنصح بتعيين كلمة مرور قوية وخاصة بك الآن.
          </div>

          <form onSubmit={handleChangeOwnerPassSubmit}>
            <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
              <label>كلمة المرور الحالية *</label>
              <input
                type="password"
                required
                placeholder="كلمة المرور الحالية (123 للمرة الأولى)"
                value={oldOwnerPassword}
                onChange={(e) => setOldOwnerPassword(e.target.value)}
                className="outstock-form-input"
              />
            </div>

            <div className="outstock-form-group" style={{ marginBottom: '12px' }}>
              <label>كلمة المرور الجديدة *</label>
              <input
                type="password"
                required
                placeholder="كلمة المرور الجديدة"
                value={newOwnerPassword}
                onChange={(e) => setNewOwnerPassword(e.target.value)}
                className="outstock-form-input"
              />
            </div>

            <div className="outstock-form-group" style={{ marginBottom: '16px' }}>
              <label>تأكيد كلمة المرور الجديدة *</label>
              <input
                type="password"
                required
                placeholder="أعد إدخال كلمة المرور الجديدة"
                value={confirmOwnerPassword}
                onChange={(e) => setConfirmOwnerPassword(e.target.value)}
                className="outstock-form-input"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingPassword}
              className="outstock-btn outstock-btn-primary"
              style={{ width: '100%', padding: '10px' }}
            >
              <Shield size={16} />
              <span>{isSavingPassword ? 'جاري التحديث...' : 'تحديث كلمة المرور وتأمين الحساب'}</span>
            </button>
          </form>
        </div>
      )}

      {/* ── 4. قسم تخصيص وإدارة اختصارات لوحة المفاتيح ── */}
      {activeSubSection === 'shortcuts' && (
        <div className="outstock-card" style={{ maxWidth: '980px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 className="outstock-card-title" style={{ marginBottom: '4px' }}>
                <Keyboard size={18} color="#0d9488" />
                <span>إدارة وتخصيص اختصارات لوحة المفاتيح السريعة</span>
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                تسهيل وتسريع عمليات الكاشير وإدارة المشتريات بمفاتيح مختصرة قابلة للتخصيص دون التأثير على اختصارات المتصفح
              </p>
            </div>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={() => {
                localStorage.removeItem(STORAGE_SHORTCUTS_KEY);
                setShortcutsList(getActiveShortcuts());
                showToast?.('✅ تم استعادة الاختصارات الافتراضية بنجاح');
              }}
              title="استعادة الإعدادات الافتراضية"
              style={{ fontSize: '12px', padding: '7px 12px' }}
            >
              <RotateCcw size={14} />
              <span>استعادة الافتراضيات</span>
            </button>
          </div>

          <div className="outstock-table-responsive">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>الإجراء / الوظيفة</th>
                  <th style={{ width: '36%' }}>الوصف</th>
                  <th style={{ width: '20%' }}>الاختصار المخصص</th>
                  <th style={{ width: '12%' }}>البديل السريع</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>تعديل</th>
                </tr>
              </thead>
              <tbody>
                {shortcutsList.map((sc) => {
                  const isOutstock = sc.category === 'outstock';
                  const isEditing = editingShortcutId === sc.id;

                  return (
                    <tr key={sc.id} style={{ background: isOutstock ? 'rgba(13, 148, 136, 0.04)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 'bold', color: isOutstock ? '#0f766e' : '#1e293b' }}>
                          {sc.name}
                        </div>
                        {isOutstock && (
                          <span style={{ fontSize: '10px', background: '#ccfbf1', color: '#0f766e', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-block', marginTop: '2px' }}>
                            نظام النواقص
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b' }}>
                        {sc.desc}
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <select
                              value={shortcutFormModifiers[0] || 'None'}
                              onChange={(e) => setShortcutFormModifiers(e.target.value === 'None' ? [] : [e.target.value])}
                              className="outstock-form-select"
                              style={{ padding: '2px 4px', fontSize: '11px', height: '28px' }}
                            >
                              <option value="None">مباشر (بدون Alt)</option>
                              <option value="Alt">Alt +</option>
                              <option value="Ctrl">Ctrl +</option>
                              <option value="Shift">Shift +</option>
                            </select>
                            <input
                              type="text"
                              value={shortcutFormKey}
                              onChange={(e) => setShortcutFormKey(e.target.value.toUpperCase())}
                              className="outstock-form-input"
                              style={{ width: '55px', height: '28px', padding: '2px 6px', textAlign: 'center', fontWeight: 'bold' }}
                              placeholder="F2"
                            />
                          </div>
                        ) : (
                          <span className="outstock-kbd-badge">
                            {formatShortcutDisplay(sc)}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {sc.fallbackKey ? (
                          <span className="outstock-kbd-badge fallback">
                            {formatShortcutFallback(sc)}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-primary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => {
                                if (!shortcutFormKey) return;
                                const updated = shortcutsList.map(item =>
                                  item.id === sc.id
                                    ? { ...item, key: shortcutFormKey, modifiers: shortcutFormModifiers }
                                    : item
                                );
                                setShortcutsList(updated);
                                localStorage.setItem(STORAGE_SHORTCUTS_KEY, JSON.stringify(updated));
                                setEditingShortcutId(null);
                                showToast?.('✅ تم حفظ الاختصار الجديد بنجاح');
                              }}
                              title="حفظ"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => setEditingShortcutId(null)}
                              title="إلغاء"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="outstock-btn outstock-btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={() => {
                              setEditingShortcutId(sc.id);
                              setShortcutFormKey(sc.key || '');
                              setShortcutFormModifiers(sc.modifiers || []);
                            }}
                            title="تعديل المفتاح"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
