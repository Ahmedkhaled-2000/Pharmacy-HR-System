import React, { useState } from 'react';

export default function WorkBylawsModule({ state, onSaveBylaws }) {
  // Configurable Bylaws State initialized from state or defaults
  const defaultBylaws = {
    gracePeriodMinutes: 15,
    resetPeriodDays: 30,
    latePenalties: [
      { occurrence: 1, action: 'تنبيه', deductionFraction: 0 },
      { occurrence: 2, action: 'إنذار كتابي', deductionFraction: 0 },
      { occurrence: 3, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
      { occurrence: 4, action: 'خصم ½ يوم', deductionFraction: 0.5 },
      { occurrence: 5, action: 'خصم يوم', deductionFraction: 1.0 }
    ],
    earlyExitPenalties: [
      { occurrence: 1, action: 'إنذار', deductionFraction: 0 },
      { occurrence: 2, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
      { occurrence: 3, action: 'خصم ½ يوم', deductionFraction: 0.5 },
      { occurrence: 4, action: 'خصم يوم', deductionFraction: 1.0 }
    ],
    deductionOptions: [
      { label: 'تنبيه / إنذار', value: 0 },
      { label: 'خصم ¼ يوم', value: 0.25 },
      { label: 'خصم ½ يوم', value: 0.5 },
      { label: 'خصم يوم كامل', value: 1.0 },
      { label: 'خصم يومين', value: 2.0 },
      { label: 'خصم ثلاث أيام', value: 3.0 }
    ]
  };

  const [bylaws, setBylaws] = useState(state.bylaws || defaultBylaws);
  const [isEditing, setIsEditing] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const handleLateChange = (index, field, val) => {
    const updated = [...bylaws.latePenalties];
    if (field === 'deductionFraction') {
      const selectedOption = bylaws.deductionOptions.find(o => o.value === parseFloat(val));
      updated[index].deductionFraction = parseFloat(val);
      updated[index].action = selectedOption ? selectedOption.label : 'خصم';
    } else {
      updated[index][field] = val;
    }
    setBylaws({ ...bylaws, latePenalties: updated });
  };

  const handleEarlyChange = (index, field, val) => {
    const updated = [...bylaws.earlyExitPenalties];
    if (field === 'deductionFraction') {
      const selectedOption = bylaws.deductionOptions.find(o => o.value === parseFloat(val));
      updated[index].deductionFraction = parseFloat(val);
      updated[index].action = selectedOption ? selectedOption.label : 'خصم';
    } else {
      updated[index][field] = val;
    }
    setBylaws({ ...bylaws, earlyExitPenalties: updated });
  };

  const handleSave = () => {
    onSaveBylaws(bylaws);
    setIsEditing(false);
    setSavedMsg('✅ تم حفظ تعديلات لائحة الجزاءات بنجاح في التطبيق وقاعدة البيانات!');
    setTimeout(() => setSavedMsg(''), 4000);
  };

  return (
    <div className="bylaws-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>📜 لائحة العمل والجزاءات المعتمدة</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            لائحة ديناميكية قابلة للتعديل (Configurable) من قبل الإدارة العليا ومربوطة بحساب الأجور والخصومات
          </p>
        </div>

        <div>
          {isEditing ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setIsEditing(false)}>
                إلغاء
              </button>
              <button type="button" className="btn btn-start" onClick={handleSave}>
                💾 حفظ اللائحة
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-start" onClick={() => setIsEditing(true)}>
              ✏️ تعديل بنود اللائحة
            </button>
          )}
        </div>
      </div>

      {savedMsg && (
        <div style={{ background: '#DCFCE7', color: '#166534', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontWeight: 'bold' }}>
          {savedMsg}
        </div>
      )}

      {/* General Settings */}
      <div style={{ display: 'flex', gap: '20px', background: 'var(--primary-tint)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
        <div>
          <strong>⏱️ فترة السماح للتأخير: </strong>
          {isEditing ? (
            <input
              type="number"
              value={bylaws.gracePeriodMinutes}
              onChange={(e) => setBylaws({ ...bylaws, gracePeriodMinutes: parseInt(e.target.value) || 0 })}
              style={{ width: '80px', margin: '0 8px' }}
            />
          ) : (
            <span className="badge badge-primary">{bylaws.gracePeriodMinutes} دقيقة</span>
          )}
        </div>

        <div>
          <strong>🔄 فترة تصفير التكرار (Reset Period): </strong>
          {isEditing ? (
            <input
              type="number"
              value={bylaws.resetPeriodDays}
              onChange={(e) => setBylaws({ ...bylaws, resetPeriodDays: parseInt(e.target.value) || 30 })}
              style={{ width: '80px', margin: '0 8px' }}
            />
          ) : (
            <span className="badge badge-primary">{bylaws.resetPeriodDays} يوم</span>
          )}
        </div>
      </div>

      {/* Section 1: Simple Attendance Violations */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontFamily: 'Cairo', color: 'var(--primary-dark)', marginBottom: '12px' }}>
          المستوى الأول – مخالفات الحضور البسيطة (التأخير بعد فترة السماح)
        </h3>

        <table className="bylaws-table">
          <thead>
            <tr>
              <th>تكرار المخالفة</th>
              <th>الإجراء المتخذ</th>
              <th>نسبة الخصم المقررة</th>
            </tr>
          </thead>
          <tbody>
            {bylaws.latePenalties.map((item, idx) => (
              <tr key={idx}>
                <td>المرة {item.occurrence}</td>
                <td>
                  {isEditing ? (
                    <input
                      type="text"
                      value={item.action}
                      onChange={(e) => handleLateChange(idx, 'action', e.target.value)}
                    />
                  ) : (
                    <span style={{ fontWeight: 'bold' }}>{item.action}</span>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <select
                      value={item.deductionFraction}
                      onChange={(e) => handleLateChange(idx, 'deductionFraction', e.target.value)}
                    >
                      {bylaws.deductionOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`badge ${item.deductionFraction > 0 ? 'badge-danger' : 'badge-warning'}`}>
                      {item.deductionFraction === 0 ? 'بدون خصم مال' : `${item.deductionFraction} يوم`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 2: Early Exit without Permission */}
      <div>
        <h3 style={{ fontFamily: 'Cairo', color: 'var(--primary-dark)', marginBottom: '12px' }}>
          المستوى الثاني – الانصراف قبل نهاية الشيفت بدون إذن
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '-8px', marginBottom: '12px' }}>
          * يتم احتساب الوقت غير المؤدى بصورة مستقلة وفق نظام الأجر وإضافته للخصم.
        </p>

        <table className="bylaws-table">
          <thead>
            <tr>
              <th>تكرار المخالفة</th>
              <th>الإجراء المتخذ</th>
              <th>نسبة الخصم المقررة</th>
            </tr>
          </thead>
          <tbody>
            {bylaws.earlyExitPenalties.map((item, idx) => (
              <tr key={idx}>
                <td>المرة {item.occurrence}</td>
                <td>
                  {isEditing ? (
                    <input
                      type="text"
                      value={item.action}
                      onChange={(e) => handleEarlyChange(idx, 'action', e.target.value)}
                    />
                  ) : (
                    <span style={{ fontWeight: 'bold' }}>{item.action}</span>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <select
                      value={item.deductionFraction}
                      onChange={(e) => handleEarlyChange(idx, 'deductionFraction', e.target.value)}
                    >
                      {bylaws.deductionOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`badge ${item.deductionFraction > 0 ? 'badge-danger' : 'badge-warning'}`}>
                      {item.deductionFraction === 0 ? 'بدون خصم مال' : `${item.deductionFraction} يوم`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
