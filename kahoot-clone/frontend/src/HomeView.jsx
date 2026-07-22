import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css'; 

export default function HomeView() {
  const [pin, setPin] = useState('');
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    if (pin.trim().length === 6) {
      navigate(`/play?pin=${pin}`);
    } else {
      alert("Please enter a valid 6-digit game PIN.");
    }
  };

  return (
    <div className="home-container" style={{ backgroundColor: '#ffcc00', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      
      <button 
        onClick={() => navigate('/dashboard')}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          padding: '10px 20px',
          backgroundColor: '#fff',
          color: '#333',
          border: 'none',
          borderRadius: '5px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}
      >
        เข้าสู่ระบบ
      </button>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '4rem', color: '#fff', textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000', margin: 0 }}>
          Kamooy!
        </h1>
      </div>

      <form onSubmit={handleJoin} style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '5px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        width: '300px'
      }}>
        <input 
          type="text" 
          placeholder="Game PIN" 
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          style={{
            padding: '15px',
            fontSize: '1.2rem',
            textAlign: 'center',
            marginBottom: '10px',
            border: '2px solid #ccc',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        />
        <button 
          type="submit"
          style={{
            padding: '15px',
            fontSize: '1.2rem',
            backgroundColor: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Enter
        </button>
      </form>
    </div>
  );
}
