import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticketFilter, setTicketFilter] = useState('all');
  const [resaleListings, setResaleListings] = useState([]);

  const isEventExpired = (eventDate) => {
    const currentDate = new Date();
    const eventDateTime = new Date(eventDate);
    return eventDateTime < currentDate;
  };

  const getFilteredTickets = () => {
    if (ticketFilter === 'all') return tickets;
    
    return tickets.filter(ticket => {
      if (!ticket.events?.date) return false;
      const expired = isEventExpired(ticket.events.date);
      return ticketFilter === 'upcoming' ? !expired : expired;
    });
  };

  const fetchResaleListings = async (userEmail) => {
    const { data, error } = await supabase
      .from('resale_listings')
      .select('*')
      .eq('seller_email', userEmail)
      .eq('is_sold', false);

    if (!error && data) {
      setResaleListings(data);
    }
  };

  const isTicketOnResale = (eventId) => {
    return resaleListings.some(listing => listing.event_id === eventId);
  };

  const handleResale = async (ticket) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('resale_listings')
        .insert({
          event_id: ticket.event_id,
          seller_address: ticket.owner_address,
          seller_email: user.email,
          price_wei: ticket.events.price_wei,
          is_sold: false
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating resale listing:', error);
        alert('Failed to create resale listing');
        return;
      }

      setResaleListings(prev => [...prev, data]);
      alert('Ticket listed for resale successfully!');
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to create resale listing');
    }
  };

  const handleCancelResale = async (eventId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('resale_listings')
        .delete()
        .eq('event_id', eventId)
        .eq('seller_email', user.email)
        .eq('is_sold', false);

      if (error) {
        console.error('Error canceling resale:', error);
        alert('Failed to cancel resale listing');
        return;
      }

      setResaleListings(prev => prev.filter(listing => listing.event_id !== eventId));
      alert('Resale listing canceled successfully!');
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to cancel resale listing');
    }
  };

  useEffect(() => {
    const fetchTickets = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          event_id,
          attended,
          refunded,
          reputation_decreased,
          owner_address,
          events (
            id,
            name,
            location,
            date,
            is_cancelled,
            price_wei
          )
        `)
        .eq('user_email', user.email);

      if (error) {
        setLoading(false);
        return;
      }

      const processedTickets = await Promise.all(data.map(async (ticket) => {
        const eventDate = new Date(ticket.events?.date);
        const now = new Date();
        const isEventPassed = eventDate < now;
        const isMissed = isEventPassed && !ticket.attended && !ticket.events?.is_cancelled;

        if (isMissed && !ticket.reputation_decreased) {
          try {
            const { data: userData } = await supabase
              .from('user_profiles')
              .select('reputation')
              .eq('email', user.email)
              .single();

            if (userData) {
              const newReputation = Math.max(0, userData.reputation - 2);
              await supabase
                .from('user_profiles')
                .update({ reputation: newReputation })
                .eq('email', user.email);

              await supabase
                .from('tickets')
                .update({ reputation_decreased: true })
                .eq('id', ticket.id);
            }
          } catch (error) {
            console.error('Error updating reputation:', error);
          }

          return {
            ...ticket,
            reputation_decreased: true,
            missedEvent: true
          };
        }

        return ticket;
      }));

      setTickets(processedTickets);
      await fetchResaleListings(user.email);
      setLoading(false);
    };
    fetchTickets();
  }, []);

  const filteredTickets = getFilteredTickets();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading your tickets...</p>
      </div>
    );
  }

  return (
    <div className="my-tickets-container">
      <style jsx>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          background: #0a0a0a;
          color: #ffffff;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          min-height: 100vh;
        }

        .my-tickets-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          padding: 2rem 3rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .header-section {
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #333;
        }

        .page-title {
          font-size: 2.5rem;
          font-weight: 700;
          margin: 0 0 1rem 0;
          color: #fff;
          background: linear-gradient(45deg, #ffffff, #888888);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .filter-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .ticket-count {
          color: #666;
          font-size: 0.9rem;
        }

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

        .no-tickets {
          text-align: center;
          padding: 3rem;
          border: 2px dashed #333;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
          color: #666;
          font-size: 1.1rem;
        }

        .tickets-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .ticket-card {
          background: linear-gradient(135deg, #1a1a1a, #0f0f0f);
          border: 1px solid #333;
          border-radius: 16px;
          padding: 1.5rem;
          transition: all 0.3s ease;
        }

        .ticket-card:hover {
          border-color: #555;
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(255, 255, 255, 0.1);
        }

        .ticket-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
          gap: 1rem;
        }

        .event-name {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0;
          color: #fff;
        }

        .event-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .upcoming-badge {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .past-badge {
          background: rgba(107, 114, 128, 0.1);
          color: #9ca3af;
          border: 1px solid rgba(107, 114, 128, 0.3);
        }

        .event-detail {
          font-size: 1rem;
          margin: 0.75rem 0;
          color: #ccc;
        }

        .event-detail strong {
          color: #888;
          font-weight: 500;
        }

        .status-attended {
          color: #22c55e;
        }

        .status-pending {
          color: #f59e0b;
        }

        .status-resale {
          color: #8b5cf6;
        }

        .resale-section {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #333;
        }

        .resale-btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: white;
        }

        .resale-btn:hover {
          background: linear-gradient(135deg, #7c3aed, #6d28d9);
        }

        .cancel-resale-btn {
          background: linear-gradient(135deg, #ef4444, #dc2626);
        }

        .cancel-resale-btn:hover {
          background: linear-gradient(135deg, #dc2626, #b91c1c);
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          gap: 1rem;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #333;
          border-top: 3px solid #fff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .my-tickets-container {
            padding: 1rem;
          }

          .page-title {
            font-size: 2rem;
          }

          .ticket-card {
            padding: 1rem;
          }
        }
      `}</style>

      <div className="header-section">
        <h1 className="page-title">My Tickets</h1>
        
        <div className="filter-section">
          <div className="ticket-count">
            Showing {filteredTickets.length} of {tickets.length} tickets
          </div>
          <div className="filter-buttons">
            <button 
              className={`filter-btn ${ticketFilter === 'upcoming' ? 'active' : ''}`}
              onClick={() => setTicketFilter('upcoming')}
            >
              🚀 Upcoming
            </button>
            <button 
              className={`filter-btn ${ticketFilter === 'past' ? 'active' : ''}`}
              onClick={() => setTicketFilter('past')}
            >
              📚 Past
            </button>
            <button 
              className={`filter-btn ${ticketFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTicketFilter('all')}
            >
              📋 All
            </button>
          </div>
        </div>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="no-tickets">
          <p>
            {ticketFilter === 'upcoming' && (tickets.length === 0 ? "You haven't bought any tickets yet." : "No upcoming events found.")}
            {ticketFilter === 'past' && (tickets.length === 0 ? "You haven't bought any tickets yet." : "No past events found.")}
            {ticketFilter === 'all' && "You haven't bought any tickets yet."}
          </p>
        </div>
      ) : (
        <ul className="tickets-list">
          {filteredTickets.map((ticket) => {
            const eventDate = ticket.events?.date ? new Date(ticket.events.date) : null;
            const isEventPassed = eventDate && eventDate < new Date();
            const onResale = isTicketOnResale(ticket.event_id);
            const canResale = !isEventPassed && !ticket.events?.is_cancelled && !ticket.attended;
            
            return (
              <li key={ticket.id} className={`ticket-card ${isEventPassed ? 'past-event' : 'upcoming-event'}`}>
                <div className="ticket-header">
                  <h2 className="event-name">{ticket.events?.name || '[Event missing]'}</h2>
                  <span className={`event-badge ${isEventPassed ? 'past-badge' : 'upcoming-badge'}`}>
                    {isEventPassed ? '📚 Past' : '🚀 Upcoming'}
                  </span>
                </div>
                <p className="event-detail">
                  <strong>Location:</strong> {ticket.events?.location || 'N/A'}
                </p>
                <p className="event-detail">
                  <strong>Date:</strong> {eventDate ? eventDate.toLocaleString() : 'N/A'}
                </p>
                {isEventPassed && !ticket.attended && !ticket.events?.is_cancelled && (
                  <p className="event-detail missed-event">
                    <strong>Note:</strong> <span style={{ color: 'red' }}>Event is gone! You missed it.</span>
                  </p>
                )}
                <p className="event-detail">
                  <strong>Status:</strong>{' '}
                  {ticket.events?.is_cancelled 
                      ? <>
                          <span style={{ color: 'red' }}>❌ Cancelled</span>
                          {ticket.refunded 
                          ? <span style={{ color: 'green', marginLeft: '0.5rem' }}>(Refunded)</span>
                          : <span style={{ color: 'orange', marginLeft: '0.5rem' }}>(Not Refunded)</span>}
                      </>
                      : ticket.attended 
                      ? <span className="status-attended">✔ Attended</span>
                      : <span className="status-pending">⏳ Not Attended</span>}
                </p>
                
                {canResale && (
                  <div className="resale-section">
                    {onResale ? (
                      <div className="resale-status">
                        <p className="event-detail">
                          <strong>Resale Status:</strong> <span className="status-resale">🔄 Listed for Resale</span>
                        </p>
                        <button 
                          className="resale-btn cancel-resale-btn"
                          onClick={() => handleCancelResale(ticket.event_id)}
                        >
                          Cancel Resale
                        </button>
                      </div>
                    ) : (
                      <div className="resale-actions">
                        <button 
                          className="resale-btn"
                          onClick={() => handleResale(ticket)}
                        >
                          💰 Resale Ticket
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}