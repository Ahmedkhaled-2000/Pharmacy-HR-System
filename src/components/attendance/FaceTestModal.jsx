import React, { useRef, useEffect, useState } from 'react';
import { initFaceRecognition, getFaceEmbedding, compareFaces } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding, compareHands } from '../../utils/handApiHelper';
import { loadFaceDescriptor, loadHandDescriptor } from '../../utils/faceStorage';

export default function FaceTestModal({ employee, onClose, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('جارِ التحميل...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const isHand = biometricType === 'hand';

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        if (isHand) {
          await initHandRecognition();
        } else {
          await initFaceRecognition();
        }
        
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        
        setIsInitializing(false);
        setStatus(isHand ? 'انظر للكاميرا وارفع يدك لاختبار البصمة' : 'انظر للكاميرا لاختبار البصمة');
      } catch (err) {
        console.error('Camera/Model error:', err);
        setErrorMsg('فشل في تشغيل الكاميرا.');
        setIsInitializing(false);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isHand]);

  const runTest = async () => {
    if (!videoRef.current || isInitializing) return;

    setStatus('جاري المطابقة...');
    setErrorMsg(null);

    try {
      if (isHand) {
        const result = getHandEmbedding(videoRef.current, 0);
        
        if (!result || !result.hasHand) {
          setErrorMsg('لم يتم التعرف على يد. يرجى المحاولة مرة أخرى.');
          setStatus('يرجى توجيه يدك للكاميرا وفتح أصابعك.');
          return;
        }

        setStatus('جاري جلب بصمة اليد من قاعدة البيانات...');
        const savedDescriptor = employee.hand_descriptor || await loadHandDescriptor(employee.id);
        
        if (!savedDescriptor) {
          setErrorMsg('بصمة اليد غير مسجلة لهذا الموظف في قاعدة البيانات.');
          setStatus('');
          return;
        }

        const matchResult = compareHands(savedDescriptor, result.descriptor);
        
        if (matchResult.isMatch) {
          setStatus(`✅ تم التعرف بنجاح! نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%`);
        } else {
          setErrorMsg(`❌ فشل التعرف. البصمة غير مطابقة (نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%)`);
          setStatus('يرجى المحاولة مرة أخرى أو إعادة تسجيل البصمة.');
        }

      } else {
        const result = await getFaceEmbedding(videoRef.current);
        
        if (result.error) {
          setErrorMsg(result.error);
          setStatus('يرجى المحاولة مرة أخرى');
        } else {
          setStatus('جاري جلب بصمة الوجه من قاعدة البيانات...');
          const savedDescriptor = employee.face_descriptor || await loadFaceDescriptor(employee.id);
          
          if (!savedDescriptor) {
            setErrorMsg('بصمة الوجه غير مسجلة لهذا الموظف في قاعدة البيانات.');
            setStatus('');
            return;
          }

          const matchResult = compareFaces(savedDescriptor, result.descriptor);
          
          if (matchResult.isMatch) {
            setStatus(`✅ تم التعرف بنجاح! نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%`);
          } else {
            setErrorMsg(`❌ فشل التعرف. البصمة غير مطابقة (نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%)`);
            setStatus('يرجى المحاولة مرة أخرى أو إعادة تسجيل البصمة.');
          }
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('حدث خطأ غير متوقع.');
      setStatus('');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px', textAlign: 'center' }}>
        <div className="modal-header">
          <h3>اختبار بصمة {isHand ? 'اليد' : 'الوجه'}: {employee.name}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          
          <div style={{ position: 'relative', width: '100%', maxWidth: '400px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#000' }}>
            <video 
              ref={videoRef}
              style={{ width: '100%', height: 'auto', display: 'block', transform: 'scaleX(-1)' }}
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
            <p style={{ fontWeight: 'bold', color: 'var(--text)', margin: '0 0 8px 0' }}>{status}</p>
            {errorMsg && (
              <p style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: 0, fontWeight: 'bold' }}>{errorMsg}</p>
            )}
          </div>

          <button 
            className="btn btn-primary" 
            onClick={runTest}
            disabled={isInitializing}
            style={{ width: '100%', padding: '12px', fontSize: '1rem', marginTop: '10px' }}
          >
            🔍 بدء الاختبار
          </button>
        </div>
      </div>
    </div>
  );
}
