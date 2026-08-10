import React, { useState, useRef } from 'react';
import { fetchCurrentIP } from '../../utils/deviceAuth';
import { exportFullBackup, restoreFullBackup } from '../../utils/backupHelper';

export default function SettingsModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'rules' | 'security' | 'whatsapp' | 'ip' | 'backup'

  const orgSettings = state.orgSettings || {};
  const [orgName, setOrgName] = useState(orgSettings.orgName || 'مجموعة الصيدليات الطبية');
  const [gmName, setGmName] = useState(orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات');
  const [logoUrl, setLogoUrl] = useState(orgSettings.logoUrl || '');
  const [adminUser, setAdminUser] = useState(orgSettings.adminUser || 'admin');
  const [adminPass, setAdminPass] = useState(orgSettings.adminPass || 'admin123');
  const [biometricType, setBiometricType] = useState(orgSettings.biometricType || 'face');

  // Router IP Restrictions
  const ipRestrictions = state.ipRestrictions || { enabled: false, allowedIps: [] };
  const [ipEnabled, setIpEnabled] = useState(ipRestrictions.enabled);
  const [approvedIPs, setApprovedIPs] = useState(
    ipRestrictions.allowedIps.length > 0 
      ? ipRestrictions.allowedIps.map(ipObj => typeof ipObj === 'string' ? ipObj : ipObj.ip) 
      : (orgSettings.approvedIPs || ['192.168.1.1', '10.0.0.1'])
  );
  const [newIP, setNewIP] = useState('');
  const [isFetchingIp, setIsFetchingIp] = useState(false);

  // Backup State
  const fileInputRef = useRef(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Approval Rules Configuration
  const [rules, setRules] = useState(state.approvalRules || [
    { id: '1', requestType: 'leave', typeLabel: 'طلبات الإجازات السنوية', reqBranch: true, reqAdmin: true },
    { id: '2', requestType: 'loan', typeLabel: 'طلبات السلف والآجل', reqBranch: false, reqAdmin: true },
    { id: '3', requestType: 'permission', typeLabel: 'طلبات الأذونات والتأخيرات', reqBranch: true, reqAdmin: true },
    { id: '4', requestType: 'swap', typeLabel: 'طلبات تبديل الشفتات', reqBranch: true, reqAdmin: true }
  ]);

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    const updatedSettings = {
      ...orgSettings,
      orgName: orgName.trim(),
      generalManagerName: gmName.trim(),
      logoUrl,
      adminUser: adminUser.trim(),
      adminPass: adminPass.trim(),
      biometricType,
      approvedIPs // keeping this for legacy components
    };
    const updatedIpRestrictions = {
      enabled: ipEnabled,
      allowedIps: approvedIPs.map(ip => ({ label: `راوتر`, ip }))
    };
    const updatedState = { ...state, orgSettings: updatedSettings, ipRestrictions: updatedIpRestrictions };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم حفظ إعدادات المؤسسة وحماية النظام بنجاح');
  };

  const handleToggleRule = async (ruleId, field) => {
    const updatedRules = rules.map((r) => {
      if (r.id === ruleId) {
        return { ...r, [field]: !r[field] };
      }
      return r;
    });
    setRules(updatedRules);
    const updatedState = { ...state, approvalRules: updatedRules };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم التحديث والتأثير على قواعد التسلسل والموافقات');
  };

  const handleAddIP = () => {
    if (!newIP.trim()) return;
    if (approvedIPs.includes(newIP.trim())) return;
    const updated = [...approvedIPs, newIP.trim()];
    setApprovedIPs(updated);
    setNewIP('');
  };

  const handleAddCurrentIP = async () => {
    setIsFetchingIp(true);
    const ip = await fetchCurrentIP();
    if (ip && !approvedIPs.includes(ip)) {
      setApprovedIPs([...approvedIPs, ip]);
      showToast?.('✅ تم التقاط عنوان الـ IP الحالي بنجاح!');
    }
    setIsFetchingIp(false);
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            ⚙️ إعدادات منظومة الموارد البشرية والأجهزة والأدمن
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            تعديل اسم وشعار الصيدلية، قواعد التتابع المزدوج للموافقات، ومركز النسخ الاحتياطي
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`btn ${activeTab === 'general' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('general')}>
            🏥 بيانات الصيدلية والمدير العام
          </button>
          <button className={`btn ${activeTab === 'rules' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('rules')}>
            🔐 قواعد الموافقة المزدوجة
          </button>
          <button className={`btn ${activeTab === 'ip' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('ip')}>
            🌐 راوترات الفروع
          </button>
          <button className={`btn ${activeTab === 'backup' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('backup')}>
            💾 النسخ الاحتياطي
          </button>
        </div>
      </div>

      {/* Tab 1: General Org & Admin Settings */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveGeneral} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <h4 style={{ margin: '0 0 16px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
            🏥 إعدادات اسم المؤسسة واسم المدير العام والشعار
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div className="field">
              <label>اسم الصيدلية / مجموعة الصيدليات</label>
              <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
            </div>

            <div className="field">
              <label>اسم المدير العام للصيدليات</label>
              <input type="text" value={gmName} onChange={(e) => setGmName(e.target.value)} required />
            </div>

            <div className="field grow" style={{ width: '100%' }}>
              <label>طريقة البصمة الافتراضية للشركة (Biometric Type)</label>
              <select
                value={biometricType}
                onChange={(e) => setBiometricType(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}
              >
                <option value="face">بصمة الوجه (Face Recognition & Liveness)</option>
                <option value="hand">بصمة اليد (Hand Geometry 3D)</option>
              </select>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                اختر التقنية المعتمدة لتوثيق حضور الموظفين في المنصة.
              </p>
            </div>

            <div className="field">
              <label>رابط الشعار (Logo URL)</label>
              <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
            </div>
          </div>

          <h4 style={{ margin: '20px 0 16px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
            🔐 بيانات دخول المدير العام وحماية اللوحة
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div className="field">
              <label>اسم المستخدم للأدمن (Admin Username)</label>
              <input type="text" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} required />
            </div>

            <div className="field">
              <label>كلمة سر الإدارة العليا</label>
              <input type="text" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} required />
            </div>
          </div>


          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-start">💾 حفظ كافة الإعدادات</button>
          </div>
        </form>
      )}

      {/* Tab 2: Approval Rules Config */}
      {activeTab === 'rules' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <h4 style={{ margin: '0 0 14px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
            🔐 تحديد وتخصيص قواعد موافقات الطلبات لكل نوع
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
            اختر الطلب من قائمة الطلبات المتاحة وحدد تسلسل القاعدة (موافقة مدير الفرع + موافقة الإدارة العليا):
          </p>

          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>نوع الطلب</th>
                  <th>موافقة مدير الفرع</th>
                  <th>موافقة الإدارة العليا</th>
                  <th>حالة القاعدة والتطبيق</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td style={{ fontWeight: '800' }}>{rule.typeLabel || rule.name}</td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={rule.reqBranch !== false}
                          onChange={() => handleToggleRule(rule.id, 'reqBranch')}
                        />
                        <span>مطلوبة</span>
                      </label>
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={rule.reqAdmin !== false}
                          onChange={() => handleToggleRule(rule.id, 'reqAdmin')}
                        />
                        <span>مطلوبة</span>
                      </label>
                    </td>
                    <td>
                      {rule.reqBranch && rule.reqAdmin ? (
                        <span className="badge badge-success">🟢 موافقة مزدوجة معتمدة</span>
                      ) : (
                        <span className="badge badge-warning">🟡 موافقة مباشرة واحدة</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: IP Restrictions */}
      {activeTab === 'ip' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h4 style={{ margin: '0 0 10px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
                🌐 قيود الشبكة — عناوين راوترات الصيدليات المعتمدة (Approved IPs)
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
                منع تسجيل الحضور والانصراف إلا عند الاتصال بشركة أو شبكة راوتر الفرع المعتمدة.
              </p>
            </div>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--primary-tint)', padding: '8px 16px', borderRadius: '30px' }}>
              <input 
                type="checkbox" 
                checked={ipEnabled} 
                onChange={(e) => setIpEnabled(e.target.checked)} 
                style={{ width: '18px', height: '18px' }}
              />
              <span style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>تفعيل قيود الـ IP</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="مثال: 192.168.1.100"
              value={newIP}
              onChange={(e) => setNewIP(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', flex: 1, minWidth: '200px' }}
            />
            <button className="btn btn-start" onClick={handleAddIP}>➕ إضافة راوتر معتمد</button>
            <button 
              className="btn btn-outline" 
              onClick={handleAddCurrentIP}
              disabled={isFetchingIp}
            >
              {isFetchingIp ? '⏳ جاري التقاط الـ IP...' : '📡 التقاط الـ IP للجهاز الحالي'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {approvedIPs.map((ip, idx) => (
              <div key={idx} style={{ background: '#f1f5f9', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>🌐 {ip}</span>
                <button
                  style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
                  onClick={() => setApprovedIPs(approvedIPs.filter((_, i) => i !== idx))}
                  title="حذف"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
          
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-start" onClick={handleSaveGeneral} style={{ padding: '10px 24px', fontSize: '15px' }}>
              💾 حفظ الإعدادات وتطبيق القيود
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Backup Center */}
      {activeTab === 'backup' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <h4 style={{ margin: '0 0 16px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
            💾 مركز النسخ الاحتياطي واسترجاع البيانات
          </h4>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>
            من هنا يمكنك أخذ نسخة احتياطية كاملة لجميع بيانات المنظومة (الموظفين، الورديات، بصمات الوجه واليد، الرواتب، الطلبات) وحفظها كملف مشفر على جهازك. 
            وفي حالة حدوث أي خطأ، يمكنك استرجاع هذه البيانات بالكامل.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            {/* Export Section */}
            <div style={{ padding: '20px', border: '1px solid #10b981', borderRadius: '12px', background: '#ecfdf5', textAlign: 'center' }}>
              <h3 style={{ color: '#047857', marginBottom: '10px' }}>أخذ نسخة احتياطية (Export)</h3>
              <p style={{ fontSize: '13px', color: '#065f46', marginBottom: '15px' }}>
                سيتم تجميع جميع البيانات الحالية وتحميلها في ملف JSON.
              </p>
              <button 
                className="btn btn-start" 
                style={{ width: '100%', background: '#10b981', color: '#fff', border: 'none' }}
                disabled={isBackingUp}
                onClick={async () => {
                  setIsBackingUp(true);
                  showToast?.('⏳ جاري تجميع البيانات للنسخ الاحتياطي...');
                  const res = await exportFullBackup(state);
                  if (res.success) {
                    showToast?.('✅ تم استخراج النسخة الاحتياطية بنجاح!');
                  } else {
                    showToast?.('❌ حدث خطأ: ' + res.error);
                  }
                  setIsBackingUp(false);
                }}
              >
                {isBackingUp ? '⏳ جاري التحميل...' : '📥 تحميل النسخة الاحتياطية'}
              </button>
            </div>

            {/* Import Section */}
            <div style={{ padding: '20px', border: '1px solid #f59e0b', borderRadius: '12px', background: '#fffbeb', textAlign: 'center' }}>
              <h3 style={{ color: '#b45309', marginBottom: '10px' }}>استرجاع بيانات (Restore)</h3>
              <p style={{ fontSize: '13px', color: '#92400e', marginBottom: '15px' }}>
                تحذير: هذه العملية ستستبدل البيانات الحالية بالبيانات الموجودة في الملف!
              </p>
              <input 
                type="file" 
                accept=".json" 
                ref={fileInputRef} 
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  
                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    setIsRestoring(true);
                    showToast?.('⏳ جاري استرجاع البيانات... قد يستغرق ذلك بضع ثوانٍ.');
                    const res = await restoreFullBackup(event.target.result, setState, saveState);
                    if (res.success) {
                      showToast?.('✅ تمت استعادة جميع البيانات بنجاح!');
                    } else {
                      showToast?.('❌ فشل الاسترجاع: ' + res.error);
                    }
                    setIsRestoring(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  };
                  reader.readAsText(file);
                }}
              />
              <button 
                className="btn btn-ghost" 
                style={{ width: '100%', border: '1px solid #f59e0b', color: '#b45309' }}
                disabled={isRestoring}
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من رغبتك في استرجاع البيانات؟ سيتم فقدان التعديلات التي أجريت بعد تاريخ هذه النسخة الاحتياطية.')) {
                    fileInputRef.current.click();
                  }
                }}
              >
                {isRestoring ? '⏳ جاري الاسترجاع...' : '📤 اختيار ملف النسخة لاسترجاعه'}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
