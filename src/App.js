import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import Login from './pages/login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import CreateEvent from './pages/CreatEvent';
import MyTickets from './pages/Mytickets';
import Myevents from './pages/Myevents';

function generateRandomName() {
  const adjectives = ['Clever', 'Brave', 'Swift', 'Happy', 'Wise', 'Bold'];
  const animals = ['Fox', 'Tiger', 'Bear', 'Eagle', 'Panda', 'Otter'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(100 + Math.random() * 900);
  return `${adjective}${animal}${number}`;
}

async function ensureUserProfile(user) {
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!existing) {
    const randomName = generateRandomName();
    await supabase.from('user_profiles').insert({
      id: user.id,
      email: user.email,
      name: randomName,
      reputation: 0,
      total_tickets_minted: 0,
      total_events_attended: 0,
      total_flags: 0,
    });
  }
}

function ProtectedRoute({ children }) {
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    session: null
  });
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let authListener;

    const initializeAuth = async () => {
      try {
        // First check existing session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (session?.user) {
          await ensureUserProfile(session.user);
          if (mounted) {
            setAuthState({
              loading: false,
              authenticated: true,
              session
            });
          }
        } else {
          if (mounted) {
            setAuthState({
              loading: false,
              authenticated: false,
              session: null
            });
          }
        }

        // Then set up listener for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('Auth state changed:', event, session);
            if (session?.user) {
              await ensureUserProfile(session.user);
              if (mounted) {
                setAuthState({
                  loading: false,
                  authenticated: true,
                  session
                });
              }
            } else {
              if (mounted) {
                setAuthState({
                  loading: false,
                  authenticated: false,
                  session: null
                });
                navigate('/');
              }
            }
          }
        );

        authListener = subscription;
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setAuthState({
            loading: false,
            authenticated: false,
            session: null
          });
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      authListener?.unsubscribe();
    };
  }, [navigate]);

  if (authState.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return authState.authenticated ? children : <Navigate to="/" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/CreateEvent"
          element={
            <ProtectedRoute>
              <CreateEvent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/Mytickets"
          element={
            <ProtectedRoute>
              <MyTickets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/Myevents"
          element={
            <ProtectedRoute>
              <Myevents />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;