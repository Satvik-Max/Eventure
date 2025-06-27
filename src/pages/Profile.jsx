import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import ConnectWallet from '../components/ConnectWallet';

export default function Profile() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    profile: null
  });
  const navigate = useNavigate();

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error(authError?.message || 'No authenticated user');
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setState({
        loading: false,
        error: null,
        profile: data
      });
      localStorage.setItem('cachedProfile', JSON.stringify(data));
      return data;
    } catch (error) {
      console.error('Profile fetch error:', error);
      setState({
        loading: false,
        error: error.message,
        profile: null
      });
      throw error;
    }
  };

  const setupRealtime = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const channel = supabase
      .channel(`realtime:user_profiles_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${user.id}`
        },
        () => {
          console.log('🔄 Profile change detected - refetching');
          fetchProfile();
        }
      );

    const { error } = await channel.subscribe();
    if (error) {
      console.error('❌ Subscription error:', error);
      return null;
    }

    return channel;
  };

  useEffect(() => {
    let mounted = true;
    let channel = null;

    const initialize = async () => {
      const cachedProfile = localStorage.getItem('cachedProfile');
      if (cachedProfile) {
        try {
          const parsed = JSON.parse(cachedProfile);
          if (mounted) {
            setState(prev => ({
              ...prev,
              loading: false,
              profile: parsed
            }));
          }
        } catch (e) {
          localStorage.removeItem('cachedProfile');
        }
      }

      try {
        await fetchProfile();
        channel = await setupRealtime();
      } catch (error) {
        console.error('Initialization error:', error);
      }
    };

    initialize();

    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [navigate]);

  const handleLogout = async () => {
    console.log('🚪 Logging out...');
    await supabase.auth.signOut();
    localStorage.removeItem('cachedProfile');
    console.log('🧹 localStorage cleared');
    navigate('/');
    window.location.reload();
  };

  if (state.loading) {
    return (
      <div className="profile-container">
        <style jsx>{`
          .profile-container {
            min-height: 100vh;
            background: #0a0a0a;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }

          .loading-container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }

          .loading-card {
            background: linear-gradient(135deg, #1a1a1a, #0f0f0f);
            border: 1px solid #333;
            border-radius: 16px;
            padding: 2rem;
            text-align: center;
            color: #ffffff;
            max-width: 400px;
            width: 100%;
          }

          .loading-spinner {
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top: 4px solid #ffffff;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        
        <div className="loading-container">
          <div className="loading-card">
            <div className="loading-spinner"></div>
            Loading profile...
            <br />
            <small style={{marginTop: '8px', display: 'block', opacity: 0.7}}>
              Check console for debug info
            </small>
          </div>
        </div>
      </div>
    );
  }

  if (state.error || !state.profile) {
    return (
      <div className="profile-container">
        <style jsx>{`
          .profile-container {
            min-height: 100vh;
            background: #0a0a0a;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }

          .error-container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }

          .error-card {
            background: linear-gradient(135deg, #1a1a1a, #0f0f0f);
            border: 1px solid #333;
            border-radius: 16px;
            padding: 2rem;
            text-align: center;
            color: #ffffff;
            max-width: 400px;
            width: 100%;
          }

          .error-title {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #ffffff;
          }

          .error-message {
            margin-bottom: 1.5rem;
            color: #ccc;
          }

          .retry-button {
            background: linear-gradient(135deg, #ffffff, #cccccc);
            color: #000000;
            padding: 0.8rem 1.5rem;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          .retry-button:hover {
            background: linear-gradient(135deg, #cccccc, #999999);
            transform: translateY(-2px);
          }
        `}</style>
        
        <div className="error-container">
          <div className="error-card">
            <div className="error-title">⚠️ Profile Loading Failed</div>
            <div className="error-message">
              {state.error || 'Profile not found or not loaded.'}
            </div>
            <button 
              className="retry-button"
              onClick={() => window.location.reload()}
            >
              🔄 Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <style jsx>{`
        .profile-container {
          min-height: 100vh;
          background: #0a0a0a;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .profile-content {
          padding: 2rem 3rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding: 2rem 3rem;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #333;
        }

        .profile-title {
          font-size: 2.5rem;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 0;
        }

        .profile-actions {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .logout-button {
          background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
          color: #ffffff;
          border: 1px solid #444;
          padding: 0.8rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .logout-button:hover {
          background: linear-gradient(135deg, #3a3a3a, #2a2a2a);
          transform: translateY(-2px);
        }

        .profile-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .stat-card {
          background: linear-gradient(135deg, #1a1a1a, #0f0f0f);
          border: 1px solid #333;
          border-radius: 16px;
          padding: 2rem;
          transition: all 0.3s ease;
        }

        .stat-card:hover {
          transform: translateY(-4px);
          border-color: #555;
          box-shadow: 0 8px 25px rgba(255, 255, 255, 0.1);
        }

        .stat-content {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .stat-icon {
          width: 60px;
          height: 60px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: #000000;
          background: linear-gradient(135deg, #ffffff, #cccccc);
          flex-shrink: 0;
        }

        .stat-info {
          flex: 1;
        }

        .stat-label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 0.5rem;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        @media (max-width: 768px) {
          .profile-content {
            padding: 1.5rem;
          }
          
          .profile-header {
            flex-direction: column;
            gap: 1rem;
            padding: 1.5rem;
          }
          
          .profile-title {
            font-size: 2rem;
            justify-content: center;
          }
          
          .profile-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      
      <div className="profile-content">
        <div className="profile-header">
          <h1 className="profile-title">{state.profile.name || 'User Profile'}</h1>
         <div className="profile-actions">
            <div className="connect-wallet-wrapper" style={{ color: 'white' }}>
                <ConnectWallet />
            </div>
            <button onClick={handleLogout} className="logout-button">
                Logout
            </button>
            </div>
        </div>

        <ul className="profile-stats">
          <li className="stat-card">
            <div className="stat-content">
              <div className="stat-icon">👤</div>
              <div className="stat-info">
                <div className="stat-label">Name</div>
                <div className="stat-value">{state.profile.name || 'N/A'}</div>
              </div>
            </div>
          </li>
          <li className="stat-card">
            <div className="stat-content">
              <div className="stat-icon">📧</div>
              <div className="stat-info">
                <div className="stat-label">Email</div>
                <div className="stat-value">{state.profile.email || 'N/A'}</div>
              </div>
            </div>
          </li>
          <li className="stat-card">
            <div className="stat-content">
              <div className="stat-icon">⭐</div>
              <div className="stat-info">
                <div className="stat-label">Reputation</div>
                <div className="stat-value">{state.profile.reputation || 0}</div>
              </div>
            </div>
          </li>
          <li className="stat-card">
            <div className="stat-content">
              <div className="stat-icon">🎫</div>
              <div className="stat-info">
                <div className="stat-label">Tickets Minted</div>
                <div className="stat-value">{state.profile.total_tickets_minted || 0}</div>
              </div>
            </div>
          </li>
          <li className="stat-card">
            <div className="stat-content">
              <div className="stat-icon">🎪</div>
              <div className="stat-info">
                <div className="stat-label">Events Attended</div>
                <div className="stat-value">{state.profile.total_events_attended || 0}</div>
              </div>
            </div>
          </li>
          <li className="stat-card">
            <div className="stat-content">
              <div className="stat-icon">🚩</div>
              <div className="stat-info">
                <div className="stat-label">Flags</div>
                <div className="stat-value">{state.profile.total_flags || 0}</div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}