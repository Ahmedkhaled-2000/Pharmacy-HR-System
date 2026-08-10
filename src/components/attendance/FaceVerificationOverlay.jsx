import React, { useRef, useEffect, useState } from 'react';
import { initFaceRecognition, getFaceEmbedding, compareFaces, checkLiveness } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding, compareHands } from '../../utils/handApiHelper';
import { loadFaceDescriptor, loadHandDescriptor } from '../../utils/faceStorage';

export default function FaceVerificationOverlay({ employee, actionType, onVerifySuccess, onVerifyFailed, onCancel, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('جارِ تهيئة الكاميرا والذكاء الاصطناعي...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [livenessStage, setLivenessStage] = useState(0); 
  const [failedAttempts, setFailedAttempts] = useState(0);

  const isHand = biometricType === 'hand';
  const [facingMode, setFacingMode] = useState('user'); // 'user' (أمامية) or 'environment' (خلفية)

  useEffect(() => {
    let stream = null;
    let checkInterval = null;

    const startProcess = async () => {
      try {
        if (isHand) {
          await initHandRecognition();
        } else {
          await initFaceRecognition();
        }
        
        if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        
        setIsInitializing(false);
        setStatus(isHand ? 'يرجى وضع يدك وفتح أصابعك أمام الكاميرا...' : 'يرجى النظر مباشرة للكاميرا...');
        setLivenessStage(1);
      } catch (err) {
        console.error('Camera/Model error:', err);
        setErrorMsg('فشل في تشغيل الكاميرا.');
        setIsInitializing(false);
      }
    };

    startProcess();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [isHand, facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  useEffect(() => {
    if (isInitializing || !videoRef.current) return;
    
    // For hand tracking, we don't need a multi-stage liveness check, just detect hand and match
    if (isHand) {
      const checkInterval = setInterval(() => {
        if (livenessStage === 1) {
          performMatch(); // Will check for hand presence inside performMatch
          setLivenessStage(2); // Prevents multiple calls
        }
      }, 1000);
      return () => clearInterval(checkInterval);
    }

    // For Face tracking, use multi-stage liveness
    const checkInterval = setInterval(async () => {
      try {
        const liveness = checkLiveness(videoRef.current, 0); 
        
        if (!liveness || !liveness.hasFace) return;

        if (livenessStage === 1) {
          setStatus('يرجى الالتفات قليلاً نحو اليسار ⬅️');
          if (liveness.isLookingLeft) {
            setLivenessStage(2);
          }
        } else if (livenessStage === 2) {
          setStatus('يرجى الالتفات قليلاً نحو اليمين ➡️');
          if (liveness.isLookingRight) {
            setLivenessStage(3); // Liveness passed
            setStatus('تم التحقق من الحيوية بنجاح! جاري مطابقة الوجه...');
            clearInterval(checkInterval);
            performMatch();
          }
        }
      } catch (err) {
        // fail silently for liveness loop
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [isInitializing, livenessStage, isHand]);

  const performMatch = async () => {
    try {
      if (isHand) {
        const result = getHandEmbedding(videoRef.current, 0);
        if (!result || !result.hasHand) {
          handleFailure('لم يتم التعرف على يد بشكل واضح.');
          return;
        }

        setStatus('جاري جلب بصمة اليد من قاعدة البيانات...');
        const savedDescriptor = employee.hand_descriptor || await loadHandDescriptor(employee.id);
        if (!savedDescriptor) {
          handleFailure('بصمة اليد غير مسجلة لهذا الموظف.');
          return;
        }

        const matchResult = compareHands(savedDescriptor, result.descriptor);
        if (matchResult.isMatch) {
          setStatus(`✅ تمت المطابقة! (${Math.round(matchResult.matchPercentage)}%) جاري تنفيذ الإجراء...`);
          setTimeout(() => {
            onVerifySuccess(actionType);
          }, 1500);
        } else {
          handleFailure(`بصمة اليد غير متطابقة (${Math.round(matchResult.matchPercentage)}%)`);
        }

      } else {
        const result = await getFaceEmbedding(videoRef.current);
        
        if (result.error) {
          handleFailure(result.error);
          return;
        }

        setStatus('جاري جلب بصمة الوجه من قاعدة البيانات...');
        const savedDescriptor = employee.face_descriptor || await loadFaceDescriptor(employee.id);
        if (!savedDescriptor) {
          handleFailure('بصمة الوجه غير مسجلة لهذا الموظف.');
          return;
        }

        const matchResult = compareFaces(savedDescriptor, result.descriptor);
        
        if (matchResult.isMatch) {
          setStatus(`✅ تمت المطابقة! (${Math.round(matchResult.matchPercentage)}%) جاري تنفيذ الإجراء...`);
          setTimeout(() => {
            onVerifySuccess(actionType);
          }, 1500);
        } else {
          handleFailure(`البصمة غير متطابقة (${Math.round(matchResult.matchPercentage)}%)`);
        }
      }
    } catch (err) {
      handleFailure(`حدث خطأ أثناء المعالجة.`);
    }
  };

  const handleFailure = (msg) => {
    const newFails = failedAttempts + 1;
    setFailedAttempts(newFails);
    setErrorMsg(`❌ ${msg}`);
    
    if (newFails >= 3) {
      setStatus('فشل التحقق 3 مرات متتالية. سيتم إرسال طلب للمدير للتحقق...');
      setTimeout(() => {
        onVerifyFailed(actionType); // Parent will handle sending the request
      }, 2000);
    } else {
      setStatus('يرجى المحاولة مرة أخرى...');
      setLivenessStage(1); // restart liveness / hand detection
    }
  };

  const actionName = {
    'shift_start': 'تسجيل بداية الدوام',
    'shift_end': 'تسجيل نهاية الدوام',
    'break_start': 'تسجيل بداية الاستراحة',
    'break_end': 'تسجيل نهاية الاستراحة'
  }[actionType] || actionType;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content" style={{ maxWidth: '500px', textAlign: 'center' }}>
        <div className="modal-header">
          <h3>توثيق الإجراء: {actionName}</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          
          <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={toggleCamera}
              style={{ fontSize: '0.85rem', padding: '6px 14px', borderRadius: '8px' }}
            >
              🔄 الكاميرا: {facingMode === 'user' ? 'الأمامية 🤳' : 'الخلفية 📷'}
            </button>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '400px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000', border: '2px solid var(--border)' }}>
            <video 
              ref={videoRef}
              style={{ width: '100%', height: 'auto', display: 'block', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
              muted
              playsInline
            />
            {isInitializing && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)' }}>
                جارِ تجهيز الكاميرا...
              </div>
            )}
          </div>

          <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '8px', width: '100%' }}>
            <p style={{ fontWeight: 'bold', color: 'var(--primary)', margin: '0 0 8px 0', fontSize: '1.1rem' }}>{status}</p>
            {errorMsg && (
              <p style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: 0, fontWeight: 'bold' }}>{errorMsg} (المحاولة {failedAttempts}/3)</p>
            )}
          </div>

        </div>
        <div className="modal-footer" style={{ justifyContent: 'center' }}>
          <button className="btn btn-secondary" style={{ width: '200px' }} onClick={onCancel}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
