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
          background: #0a0a0a;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 20px;
        }

        .login-card {
          background: linear-gradient(135deg, #1a1a1a, #0f0f0f);
          border: 1px solid #333;
          border-radius: 16px;
          padding: 3rem;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
          width: 100%;
          max-width: 400px;
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
          font-size: 2rem;
          font-weight: 600;
          margin-bottom: 2rem;
          text-align: center;
          color: #ffffff;
          position: relative;
        }

        .login-title::after {
          content: '';
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 2px;
          background: #ffffff;
          border-radius: 2px;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .input-group {
          position: relative;
        }

        .login-input {
          width: 100%;
          padding: 1rem;
          border: 1px solid #333;
          border-radius: 8px;
          font-size: 1rem;
          background: #1a1a1a;
          color: #ffffff;
          transition: all 0.3s ease;
          outline: none;
        }

        .login-input:focus {
          border-color: #666;
          box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
        }

        .login-input::placeholder {
          color: #666;
        }

        .login-button {
          background: linear-gradient(135deg, #ffffff, #cccccc);
          color: #000000;
          padding: 1rem;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .login-button:hover {
          background: linear-gradient(135deg, #cccccc, #999999);
          transform: translateY(-2px);
        }

        .login-button:active {
          transform: translateY(0);
        }

        .status-message {
          margin-top: 1.5rem;
          padding: 1rem;
          border-radius: 8px;
          font-size: 0.9rem;
          text-align: center;
          animation: fadeIn 0.5s ease-out;
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border: 1px solid #333;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 480px) {
          .login-card {
            padding: 2rem 1.5rem;
          }
          
          .login-title {
            font-size: 1.5rem;
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
          <p className="status-message">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}