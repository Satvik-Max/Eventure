/* global BigInt */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import ConnectWallet from '../components/ConnectWallet';
import { Link } from 'react-router-dom';
import { BrowserProvider , Contract} from 'ethers';
import EventureABI from '../abi/EventureNFT.json';

const CONTRACT_ADDRESS = '0x3222f1326A699a1fD84b3BB3F67b03D9d35Eea25'; 

// Helper function to check if event date has passed
const isEventExpired = (eventDate) => {
  const currentDate = new Date();
  const eventDateTime = new Date(eventDate);
  return eventDateTime < currentDate;
};

async function handleBuyTicket(event, userEmail, walletAddress) {
  try {
    console.log(" Pressed ");
    if (!walletAddress) 
        throw new Error('Please connect your wallet first');
    if (!window.ethereum) throw new Error('Please install MetaMask');
    
    // Check if event date has passed
    if (isEventExpired(event.date)) {
      throw new Error('⏰ Sorry, you\'re late! This event has already passed.');
    }
    
    console.log(" Cheaking User ");
    if (
      walletAddress.toLowerCase() === String(event.organizer_wallet).toLowerCase()
    ) {
      throw new Error("Organizers can't buy their own tickets");
    }
    console.log("Getting User");
    // ✅ Get Supabase user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (!user || userError) throw new Error('You must be logged in to buy tickets');
    console.log("cheaking availability ");
    // ✅ Check ticket availability
    const { data: eventData, error: fetchError } = await supabase
      .from('events')
      .select('max_ticket, ticket_sold')
      .eq('event_id', event.event_id)
      .single();

    if (fetchError || !eventData) throw new Error('Failed to fetch ticket data');
    if (eventData.ticket_sold >= eventData.max_ticket) throw new Error('⚠️ Event is sold out');

    const { data: userProfile, error: profileErrorr } = await supabase
        .from('user_profiles')
        .select('reputation')
        .eq('id', user.id)
        .single();

        if (profileErrorr || !userProfile) {
        throw new Error('Failed to fetch user profile for reputation check');
        }

        // ✅ Fetch event's required reputation
        const { reputation_req } = event;

        if (userProfile.reputation < reputation_req) {
        throw new Error(`❌ You need at least ${reputation_req} reputation to mint a ticket.`);
     }

    // ✅ Smart contract interaction
    console.log(" Initiating Payment ");
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

    // ✅ Insert into tickets
    const { error: insertError } = await supabase.from('tickets').insert({
      event_id: event.event_id,
      owner_address: walletAddress,
      token_uri: 'default-ticket.json',
      user_email: userEmail,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error('❌ DB Insert Error:', insertError);
      throw new Error('Failed to record ticket in database');
    }

    // ✅ Increment event's ticket_sold
    const { error: updateError } = await supabase
      .from('events')
      .update({ ticket_sold: eventData.ticket_sold + 1 })
      .eq('event_id', event.event_id);

    if (updateError) {
      console.warn('⚠️ Could not update ticket_sold count.');
    }

    // ✅ Increment total_tickets_minted in user_profiles
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('total_tickets_minted')
      .eq('id', user.id)
      .single();

    if (!profileError && profileData) {
      const newMintedCount = (profileData.total_tickets_minted || 0) + 1;

      const { error: updateMintedError } = await supabase
        .from('user_profiles')
        .update({ total_tickets_minted: newMintedCount })
        .eq('id', user.id);

      if (updateMintedError) {
        console.warn('⚠️ Failed to increment user ticket count');
      }
    } else {
      console.warn('⚠️ Could not fetch user profile to increment ticket mint count');
    }

    alert('🎉 Ticket purchased successfully!');
  } catch (err) {
    console.error('Full error:', err);
    alert(`❌ ${err.message || 'Something went wrong'}`);
  }
}


export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [walletAddress, setWalletAddress] = useState('');
  const [userEmail, setUserEmail] = useState('');

   const handleBuyClick = async (event) => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    try {
      await handleBuyTicket(event, userEmail, walletAddress);
    } finally {
    }
  };

  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase.from('events').select('*');
      
      if (!error) setEvents(data);
    };

    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email);
      }
    };

    fetchEvents();
    fetchUser();

    // Realtime subscription
    const subscription = supabase
      .channel('public:events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          fetchEvents(); // or apply change optimally using `payload`
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

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

        .explore h2 {
          font-size: 2rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          background: linear-gradient(45deg, #ffffff, #cccccc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .explore > p {
          color: #999;
          margin-bottom: 2rem;
          font-size: 1.1rem;
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
            <button> Create Event </button>
          </Link>
           <Link to="/Mytickets">
            <button> My Tickets </button>
          </Link>
          <Link to="/Myevents">
            <button> My Events </button>
          </Link>
        </section>

        <section className="explore">
          <h2>Discover Amazing Events</h2>
          <p>Find and attend the best events around you.</p>

          <div className="event-list">
            {events.length === 0 ? (
              <p>No events yet. Be the first to create one!</p>
            ) : (
              events.map((event) => {
                const eventExpired = isEventExpired(event.date);
                const isDisabled = event.is_cancelled || eventExpired;
                
                return (
                  <div 
                    className={`event-card ${eventExpired ? 'event-expired' : ''}`} 
                    key={event.event_id}
                  >
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
                        onClick={() => handleBuyClick(event)}
                        disabled={isDisabled}
                    >
                        {event.is_cancelled ? 'Cancelled' : 
                         eventExpired ? 'Event Passed' : 'Buy Ticket'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </>
  );
}