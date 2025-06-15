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
      // First try to use cached profile if available
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

  // Debug info in loading state
  if (state.loading) {
    return (
      <div className="profile-container">
        <style jsx>{`
          .profile-container {
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            position: relative;
            overflow: hidden;
          }

          /* ... (keep all your existing styles) ... */
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

  // Show error state with debug info
  if (state.error || !state.profile) {
    return (
      <div className="profile-container">
        <style jsx>{`
          /* ... (keep all your existing error styles) ... */
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          position: relative;
          overflow: hidden;
        }

        .profile-container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><radialGradient id="a" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="%23ffffff" stop-opacity="0.05"/><stop offset="100%" stop-color="%23ffffff" stop-opacity="0"/></radialGradient></defs><circle cx="200" cy="200" r="100" fill="url(%23a)"/><circle cx="800" cy="300" r="150" fill="url(%23a)"/><circle cx="400" cy="700" r="120" fill="url(%23a)"/><circle cx="900" cy="800" r="80" fill="url(%23a)"/></svg>');
          opacity: 0.3;
          animation: float 20s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }

        .profile-content {
          position: relative;
          z-index: 1;
          padding: 48px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .profile-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 24px 32px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }

        .profile-title {
          font-size: 36px;
          font-weight: 700;
          color: white;
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 0;
        }

        .profile-title::before {
          content: '👤';
          font-size: 32px;
          animation: bounce 2s ease-in-out infinite;
        }

        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-10px); }
          60% { transform: translateY(-5px); }
        }

        .profile-actions {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .logout-button {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
        }

        .logout-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s ease;
        }

        .logout-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(239, 68, 68, 0.6);
        }

        .logout-button:hover::before {
          left: 100%;
        }

        .profile-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .stat-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.3s ease;
        }

        .stat-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
        }

        .stat-card:hover::before {
          transform: scaleX(1);
        }

        .stat-content {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .stat-icon {
          width: 60px;
          height: 60px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: white;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
          flex-shrink: 0;
        }

        .stat-info {
          flex: 1;
        }

        .stat-label {
          font-size: 14px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #1e293b;
          margin: 0;
        }

        @media (max-width: 768px) {
          .profile-content {
            padding: 24px;
          }
          
          .profile-header {
            flex-direction: column;
            gap: 16px;
            align-items: stretch;
          }
          
          .profile-title {
            font-size: 28px;
            justify-content: center;
          }
          
          .profile-actions {
            justify-content: center;
          }
          
          .profile-stats {
            grid-template-columns: 1fr;
          }
          
          .stat-card {
            padding: 24px;
          }
        }
      `}</style>
      
      <div className="profile-content">
        <div className="profile-header">
          <h1 className="profile-title">{state.profile.name || 'User Profile'}</h1>
          <div className="profile-actions">
            <ConnectWallet />
            <button
              onClick={handleLogout}
              className="logout-button"
            >
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