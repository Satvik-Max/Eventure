/* global BigInt */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import ConnectWallet from '../components/ConnectWallet';
import { Link } from 'react-router-dom';
import { BrowserProvider, Contract } from 'ethers';
import EventureABI from '../abi/EventureNFT.json';

const CONTRACT_ADDRESS = '0xeD71d2AA40Ebc5b52492806C3593D34Ce89Cb95A';

const isEventExpired = (eventDate) => {
  const currentDate = new Date();
  const eventDateTime = new Date(eventDate);
  return eventDateTime < currentDate;
};

const EventCard = React.memo(({ event, onBuyClick, walletAddress }) => {
  const eventExpired = useMemo(() => isEventExpired(event.date), [event.date]);
  const isDisabled = event.is_cancelled || eventExpired;
  
  const handleClick = useCallback(() => {
    onBuyClick(event);
  }, [event, onBuyClick]);

  return (
    <div className={`event-card ${eventExpired ? 'event-expired' : ''}`}>
      <h3>{event.name}</h3>
      {event.is_cancelled && (
        <p style={{ color: 'red', fontWeight: 'bold' }}>❌ This event is canceled</p>
      )}
      {eventExpired && !event.is_cancelled && (
        <p style={{ color: 'orange', fontWeight: 'bold' }}>⏰ Sorry, you're late! This event has passed</p>
      )}
      <p>{event.description}</p>
      <p className="location-info"><strong>Location:</strong> {event.location}</p>
      <p className="date-info"><strong>Date:</strong> {new Date(event.date).toLocaleString()}</p>
      <p className="price-info"><strong>Price:</strong> {event.price_wei} wei</p>
      <p className="tickets-info"><strong>Max Tickets:</strong> {event.max_ticket}</p>
      <p className="organizer-info"><strong>Organizer:</strong> {event.organizer_email}</p>
      
      <button 
        onClick={handleClick}
        disabled={isDisabled || !walletAddress}
      >
        {!walletAddress ? 'Connect Wallet First' :
         event.is_cancelled ? 'Cancelled' : 
         eventExpired ? 'Event Passed' : 'Buy Ticket'}
      </button>
    </div>
  );
});

EventCard.displayName = 'EventCard';

async function handleBuyTicket(event, userEmail, walletAddress) {
  try {
    if (!walletAddress) 
      throw new Error('Please connect your wallet first');
    if (!window.ethereum) 
      throw new Error('Please install MetaMask');
    
    if (isEventExpired(event.date)) {
      throw new Error('⏰ Sorry, you\'re late! This event has already passed.');
    }
    
    if (walletAddress.toLowerCase() === String(event.organizer_wallet).toLowerCase()) {
      throw new Error("Organizers can't buy their own tickets");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!user || userError) throw new Error('You must be logged in to buy tickets');

    const [eventDataResult, userProfileResult] = await Promise.all([
      supabase
        .from('events')
        .select('max_ticket, ticket_sold')
        .eq('event_id', event.event_id)
        .single(),
      supabase
        .from('user_profiles')
        .select('reputation, total_tickets_minted')
        .eq('id', user.id)
        .single()
    ]);

    const { data: eventData, error: fetchError } = eventDataResult;
    const { data: userProfile, error: profileError } = userProfileResult;

    if (fetchError || !eventData) throw new Error('Failed to fetch ticket data');
    if (eventData.ticket_sold >= eventData.max_ticket) throw new Error('⚠️ Event is sold out');
    if (profileError || !userProfile) throw new Error('Failed to fetch user profile for reputation check');
    if (userProfile.reputation < event.reputation_req) {
      throw new Error(`❌ You need at least ${event.reputation_req} reputation to mint a ticket.`);
    }

    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new Contract(CONTRACT_ADDRESS, EventureABI.abi, signer);

    const txResponse = await contract.mintTicket(
      walletAddress,
      event.event_id,
      `https://vnequodfvykmlafcratu.supabase.co/storage/v1/object/public/default-asset/default-ticket.json`,
      { value: BigInt(event.price_wei) }
    );
    await txResponse.wait();

    const ticketInsert = supabase.from('tickets').insert({
      event_id: event.event_id,
      owner_address: walletAddress,
      token_uri: 'default-ticket.json',
      user_email: userEmail,
      created_at: new Date().toISOString(),
    });

    const eventUpdate = supabase
      .from('events')
      .update({ ticket_sold: eventData.ticket_sold + 1 })
      .eq('event_id', event.event_id);

    const profileUpdate = supabase
      .from('user_profiles')
      .update({ total_tickets_minted: (userProfile.total_tickets_minted || 0) + 1 })
      .eq('id', user.id);

    const [insertResult, updateResult, profileResult] = await Promise.all([
      ticketInsert,
      eventUpdate,
      profileUpdate
    ]);

    if (insertResult.error) {
      console.error('❌ DB Insert Error:', insertResult.error);
      throw new Error('Failed to record ticket in database');
    }

    if (updateResult.error) {
      console.warn('⚠️ Could not update ticket_sold count.');
    }

    if (profileResult.error) {
      console.warn('⚠️ Failed to increment user ticket count');
    }

    alert('🎉 Ticket purchased successfully!');
    return true;
  } catch (err) {
    console.error('Full error:', err);
    alert(`❌ ${err.message || 'Something went wrong'}`);
    return false;
  }
}

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [walletAddress, setWalletAddress] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [eventFilter, setEventFilter] = useState('upcoming');
  const [loading, setLoading] = useState(true);

  // Memoized filtered events to prevent unnecessary recalculations
  const filteredEvents = useMemo(() => {
    if (eventFilter === 'all') return events;
    
    return events.filter(event => {
      const expired = isEventExpired(event.date);
      return eventFilter === 'upcoming' ? !expired : expired;
    });
  }, [events, eventFilter]);

  // Memoized buy click handler
  const handleBuyClick = useCallback(async (event) => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    
    const success = await handleBuyTicket(event, userEmail, walletAddress);
    if (success) {
      // Optimistically update local state
      setEvents(prevEvents => 
        prevEvents.map(e => 
          e.event_id === event.event_id 
            ? { ...e, ticket_sold: (e.ticket_sold || 0) + 1 }
            : e
        )
      );
    }
  }, [walletAddress, userEmail]);

  // Memoized filter button click handlers
  const handleFilterChange = useCallback((filter) => {
    setEventFilter(filter);
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        // Parallel fetch for better performance
        const [eventsResult, userResult] = await Promise.all([
          supabase.from('events').select('*'),
          supabase.auth.getUser()
        ]);

        if (!mounted) return;

        if (!eventsResult.error) {
          setEvents(eventsResult.data || []);
        }

        if (userResult.data?.user) {
          setUserEmail(userResult.data.user.email);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    // Debounced realtime subscription
    const subscription = supabase
      .channel('public:events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          if (!mounted) return;
          
          // Optimistic updates instead of full refetch
          if (payload.eventType === 'INSERT') {
            setEvents(prev => [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setEvents(prev => prev.map(event => 
              event.event_id === payload.new.event_id ? payload.new : event
            ));
          } else if (payload.eventType === 'DELETE') {
            setEvents(prev => prev.filter(event => 
              event.event_id !== payload.old.event_id
            ));
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(subscription);
    };
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#0a0a0a',
        color: '#fff'
      }}>
        <div>Loading events...</div>
      </div>
    );
  }

  return (    
    <>
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0a0a0a;
          color: #ffffff;
          line-height: 1.6;
          min-height: 100vh;
        }

        main {
          min-height: 100vh;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
        }

        /* Header Styles */
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2rem 3rem;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #333;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        header .left h1 {
          font-size: 2.5rem;
          font-weight: 700;
          background: linear-gradient(45deg, #ffffff, #888888);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        header .right {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        /* Button Styles */
        button {
          background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
          color: #ffffff;
          border: 1px solid #444;
          padding: 0.8rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.3s ease;
          font-size: 0.9rem;
          position: relative;
          overflow: hidden;
        }

        button:hover {
          background: linear-gradient(135deg, #3a3a3a, #2a2a2a);
          border-color: #555;
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(255, 255, 255, 0.1);
        }

        button:active {
          transform: translateY(0);
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* Link Styles */
        a {
          text-decoration: none;
        }

        /* Actions Section */
        .actions {
          padding: 2rem 3rem;
          display: flex;
          gap: 1rem;
          border-bottom: 1px solid #222;
        }

        /* Explore Section */
        .explore {
          padding: 3rem;
        }

        .explore-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .explore-header .title-section h2 {
          font-size: 2rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          background: linear-gradient(45deg, #ffffff, #cccccc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .explore-header .title-section p {
          color: #999;
          font-size: 1.1rem;
        }

        /* Filter Buttons */
        .filter-buttons {
          display: flex;
          gap: 0.5rem;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.5rem;
          border-radius: 12px;
          border: 1px solid #333;
        }

        .filter-btn {
          padding: 0.6rem 1.2rem;
          border: none;
          background: transparent;
          color: #999;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .filter-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
          transform: none;
          box-shadow: none;
        }

        .filter-btn.active {
          background: linear-gradient(135deg, #ffffff, #cccccc);
          color: #000000;
          font-weight: 600;
        }

        .filter-btn.active:hover {
          background: linear-gradient(135deg, #cccccc, #999999);
          color: #000000;
        }

        /* Event List */
        .event-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 2rem;
          margin-top: 2rem;
        }

        .event-list > p {
          grid-column: 1 / -1;
          text-align: center;
          color: #666;
          font-size: 1.2rem;
          padding: 3rem;
          border: 2px dashed #333;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
        }

        /* Event Card */
        .event-card {
          background: linear-gradient(135deg, #1a1a1a, #0f0f0f);
          border: 1px solid #333;
          border-radius: 16px;
          padding: 2rem;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .event-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #ffffff, #888888);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .event-card:hover {
          transform: translateY(-4px);
          border-color: #555;
          box-shadow: 0 8px 25px rgba(255, 255, 255, 0.1);
        }

        .event-card:hover::before {
          opacity: 1;
        }

        .event-card h3 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: #ffffff;
          position: relative;
          padding-left: 2rem;
        }

        .event-card h3::before {
          content: '🎭';
          position: absolute;
          left: 0;
          font-size: 1.2rem;
        }

        .event-card p {
          margin-bottom: 0.8rem;
          color: #ccc;
          position: relative;
          padding-left: 2rem;
        }

        .event-card p:first-of-type {
          color: #999;
          font-style: italic;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .event-card p:first-of-type::before {
          content: '📝';
          position: absolute;
          left: 0;
        }

        .event-card p strong {
          color: #ffffff;
          font-weight: 600;
          min-width: 80px;
        }

        /* Specific icons for different info types */
        .location-info::before {
          content: '📍';
          position: absolute;
          left: 0;
        }

        .date-info::before {
          content: '📅';
          position: absolute;
          left: 0;
        }

        .price-info::before {
          content: '💰';
          position: absolute;
          left: 0;
        }

        .tickets-info::before {
          content: '🎟️';
          position: absolute;
          left: 0;
        }

        .organizer-info::before {
          content: '👤';
          position: absolute;
          left: 0;
        }

        .event-card button {
          width: 100%;
          margin-top: 1rem;
          padding: 1rem;
          font-size: 1rem;
          font-weight: 600;
          background: linear-gradient(135deg, #ffffff, #cccccc);
          color: #000000;
          border: none;
          border-radius: 8px;
        }

        .event-card button:hover {
          background: linear-gradient(135deg, #cccccc, #999999);
          transform: translateY(-2px);
        }

        .event-card button:disabled {
          background: #333;
          color: #666;
          transform: none;
        }

        /* Expired event styling */
        .event-expired {
          opacity: 0.6;
          border-color: #444;
        }

        .event-expired::before {
          background: linear-gradient(90deg, #666, #444);
        }

        /* Event count display */
        .event-count {
          color: #666;
          font-size: 0.9rem;
          margin-top: 0.5rem;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          header {
            padding: 1rem 1.5rem;
            flex-direction: column;
            gap: 1rem;
          }

          header .left h1 {
            font-size: 2rem;
          }

          .actions {
            padding: 1.5rem;
            flex-direction: column;
          }

          .explore {
            padding: 2rem 1.5rem;
          }

          .explore-header {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-buttons {
            align-self: stretch;
            justify-content: center;
          }

          .event-list {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }

          .event-card {
            padding: 1.5rem;
          }
        }

        /* Loading Animation */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        button:disabled {
          animation: pulse 1.5s infinite;
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: #1a1a1a;
        }

        ::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
      
      <main>
        <header>
          <div className="left">
            <h1>Eventure</h1>
          </div>
          <div className="right">
            <Link to="/profile">
              <button>Profile</button>
            </Link>
            <ConnectWallet onAddressChange={setWalletAddress} />
          </div>
        </header>

        <section className="actions">
          <Link to="/CreateEvent">
            <button>Create Event</button>
          </Link>
          <Link to="/Mytickets">
            <button>My Tickets</button>
          </Link>
          <Link to="/Myevents">
            <button>My Events</button>
          </Link>
           <Link to="/Resale">
            <button>Resale</button>
          </Link>
        </section>

        <section className="explore">
          <div className="explore-header">
            <div className="title-section">
              <h2>Discover Amazing Events</h2>
              <p>Find and attend the best events around you.</p>
              <div className="event-count">
                Showing {filteredEvents.length} of {events.length} events
              </div>
            </div>
            
            <div className="filter-buttons">
              <button 
                className={`filter-btn ${eventFilter === 'upcoming' ? 'active' : ''}`}
                onClick={() => handleFilterChange('upcoming')}
              >
                🚀 Upcoming
              </button>
              <button 
                className={`filter-btn ${eventFilter === 'past' ? 'active' : ''}`}
                onClick={() => handleFilterChange('past')}
              >
                📚 Past
              </button>
              <button 
                className={`filter-btn ${eventFilter === 'all' ? 'active' : ''}`}
                onClick={() => handleFilterChange('all')}
              >
                📋 All
              </button>
            </div>
          </div>

          <div className="event-list">
            {filteredEvents.length === 0 ? (
              <p>
                {eventFilter === 'upcoming' && 'No upcoming events yet. Be the first to create one!'}
                {eventFilter === 'past' && 'No past events found.'}
                {eventFilter === 'all' && 'No events yet. Be the first to create one!'}
              </p>
            ) : (
              filteredEvents.map((event) => (
                <EventCard
                  key={event.event_id}
                  event={event}
                  onBuyClick={handleBuyClick}
                  walletAddress={walletAddress}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}