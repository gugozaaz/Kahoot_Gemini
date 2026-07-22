import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

export default function DashboardView() {
  const [presentations, setPresentations] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem('kamooy_presentations');
    if (saved) {
      try {
        setPresentations(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse presentations from localStorage", e);
      }
    }
  }, []);

  const createNew = () => {
    const newId = uuidv4();
    const newPresentation = {
      id: newId,
      title: 'สื่อการสอนใหม่',
      createdAt: new Date().toISOString(),
      slides: []
    };
    const updated = [...presentations, newPresentation];
    setPresentations(updated);
    localStorage.setItem('kamooy_presentations', JSON.stringify(updated));
    navigate(`/creator/${newId}`);
  };

  const deletePresentation = (id) => {
    if (window.confirm('คุณต้องการลบสื่อการสอนนี้ใช่หรือไม่?')) {
      const updated = presentations.filter(p => p.id !== id);
      setPresentations(updated);
      localStorage.setItem('kamooy_presentations', JSON.stringify(updated));
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f0f0', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: 0, color: '#333' }}>จัดการสื่อการสอน</h1>
        <button 
          onClick={createNew}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem'
          }}
        >
          + สร้างสื่อใหม่
        </button>
      </div>

      {presentations.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#777', marginTop: '50px' }}>
          <h2>ยังไม่มีสื่อการสอน</h2>
          <p>คลิก "สร้างสื่อใหม่" เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {presentations.map(p => (
            <div key={p.id} style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <h3 style={{ margin: '0 0 10px 0' }}>{p.title || 'ไม่มีชื่อ'}</h3>
              <p style={{ color: '#777', fontSize: '0.9rem', marginBottom: '20px' }}>
                จำนวนข้อ: {p.slides ? p.slides.length : 0}
              </p>
              
              <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                <button 
                  onClick={() => window.open(`/host/${p.id}`, '_blank')}
                  style={{ flex: 1, padding: '8px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  เล่น
                </button>
                <button 
                  onClick={() => navigate(`/creator/${p.id}`)}
                  style={{ flex: 1, padding: '8px', backgroundColor: '#ffc107', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  แก้ไข
                </button>
                <button 
                  onClick={() => deletePresentation(p.id)}
                  style={{ flex: 1, padding: '8px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
