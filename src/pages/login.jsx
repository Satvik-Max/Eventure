import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  // 🔁 Check session on load or after magic link redirect
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        navigate('/dashboard');
      }
    };

    checkUser();

    // 🔁 Listen for auth changes (e.g. magic link login completes)
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate('/dashboard');
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatus('Sending magic link...');

    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
      setStatus('Error sending magic link');
      console.error(error);
    } else {
      setStatus('Magic link sent! Check your email.');
    }
  };

  return (
    <div className="login-container">
      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .login-container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><radialGradient id="a" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="%23ffffff" stop-opacity="0.1"/><stop offset="100%" stop-color="%23ffffff" stop-opacity="0"/></radialGradient></defs><circle cx="200" cy="200" r="100" fill="url(%23a)"/><circle cx="800" cy="300" r="150" fill="url(%23a)"/><circle cx="400" cy="700" r="120" fill="url(%23a)"/><circle cx="900" cy="800" r="80" fill="url(%23a)"/></svg>');
          opacity: 0.3;
          animation: float 20s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }

        .login-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 24px;
          padding: 48px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
          position: relative;
          z-index: 1;
          max-width: 400px;
          width: 100%;
          animation: slideUp 0.8s ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .login-title {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 32px;
          text-align: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          position: relative;
        }

        .login-title::after {
          content: '';
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 3px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 2px;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .input-group {
          position: relative;
        }

        .login-input {
          width: 100%;
          padding: 16px 20px;
          border: 2px solid #e1e5e9;
          border-radius: 12px;
          font-size: 16px;
          background: #fafbfc;
          transition: all 0.3s ease;
          outline: none;
          box-sizing: border-box;
        }

        .login-input:focus {
          border-color: #667eea;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
          transform: translateY(-2px);
        }

        .login-input::placeholder {
          color: #94a3b8;
          transition: all 0.3s ease;
        }

        .login-input:focus::placeholder {
          color: #cbd5e1;
        }

        .login-button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 16px 32px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .login-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s ease;
        }

        .login-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
        }

        .login-button:hover::before {
          left: 100%;
        }

        .login-button:active {
          transform: translateY(0);
        }

        .status-message {
          margin-top: 24px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          text-align: center;
          animation: fadeIn 0.5s ease-out;
          backdrop-filter: blur(10px);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .status-success {
          background: rgba(34, 197, 94, 0.1);
          color: #059669;
          border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .status-error {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .status-loading {
          background: rgba(59, 130, 246, 0.1);
          color: #2563eb;
          border: 1px solid rgba(59, 130, 246, 0.2);
        }

        @media (max-width: 480px) {
          .login-card {
            padding: 32px 24px;
            margin: 16px;
          }
          
          .login-title {
            font-size: 28px;
          }
        }
      `}</style>
      
      <div className="login-card">
        <h2 className="login-title">Login with Magic Link</h2>
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <input
              className="login-input"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button
            className="login-button"
            type="submit"
          >
            Send Magic Link
          </button>
        </form>
        {status && (
          <p className={`status-message ${
            status.includes('Error') ? 'status-error' : 
            status.includes('sent') ? 'status-success' : 
            'status-loading'
          }`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}