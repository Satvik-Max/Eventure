import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          attended,
          refunded,
          events (
            name,
            location,
            date,
            is_cancelled
          )
        `)
        .eq('user_email', user.email);

      if (error) {
        setLoading(false);
        return;
      }

      // Process tickets to check for missed events
      const processedTickets = await Promise.all(data.map(async (ticket) => {
        const eventDate = new Date(ticket.events?.date);
        const now = new Date();
        const isEventPassed = eventDate < now;
        const isMissed = isEventPassed && !ticket.attended && !ticket.events?.is_cancelled;

        if (isMissed) {
          // Update user reputation
          const { data: userData } = await supabase
            .from('profiles')
            .select('reputation')
            .eq('email', user.email)
            .single();

          if (userData) {
            const newReputation = Math.max(0, userData.reputation - 2);
            await supabase
              .from('profiles')
              .update({ reputation: newReputation })
              .eq('email', user.email);

            // Mark ticket as processed to avoid repeated reputation deductions
            await supabase
              .from('tickets')
              .update({ attended: false }) // or add a new column like 'reputation_updated'
              .eq('id', ticket.id);
          }

          return {
            ...ticket,
            missedEvent: true
          };
        }

        return ticket;
      }));

      setTickets(processedTickets);
      setLoading(false);
    };
    fetchTickets();
  }, []);

  if (loading) return <p>Loading your tickets...</p>;

  if (tickets.length === 0) return <p>You haven't bought any tickets yet.</p>;

  return (
    <>
      <div className="my-tickets-container">
        <h1 className="page-title">My Tickets</h1>
        <ul className="tickets-list">
          {tickets.map((ticket) => {
            const eventDate = ticket.events?.date ? new Date(ticket.events.date) : null;
            const isEventPassed = eventDate && eventDate < new Date();
            
            return (
              <li key={ticket.id} className="ticket-card">
                <h2 className="event-name">{ticket.events?.name || '[Event missing]'}</h2>
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
              </li>
            );
          })}
        </ul>
      </div>
      <style jsx>{`
        .my-tickets-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          background: #000;
          color: #fff;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .page-title {
          font-size: 2rem;
          font-weight: 700;
          margin: 0 0 2rem 0;
          color: #fff;
          letter-spacing: -0.02em;
          padding-bottom: 1rem;
          border-bottom: 1px solid #333;
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
          background: #111;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 20px rgba(255, 255, 255, 0.05);
          transition: all 0.3s ease;
        }

        .ticket-card:hover {
          border-color: #555;
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(255, 255, 255, 0.1);
        }

        .event-name {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0 0 1rem 0;
          color: #fff;
          letter-spacing: -0.01em;
        }

        .event-detail {
          font-size: 1rem;
          margin: 0.75rem 0;
          color: #ccc;
          line-height: 1.5;
        }

        .event-detail.missed-event {
          color: #ff6b6b;
        }

        .event-detail strong {
          color: #888;
          font-weight: 500;
          text-transform: uppercase;
          font-size: 0.875rem;
          letter-spacing: 0.05em;
          margin-right: 0.5rem;
        }

        .status-container {
          font-size: 1rem;
          margin: 1rem 0 0 0;
          color: #ccc;
          line-height: 1.5;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-container strong {
          color: #888;
          font-weight: 500;
          text-transform: uppercase;
          font-size: 0.875rem;
          letter-spacing: 0.05em;
        }

        .status-attended {
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          border: 1px solid rgba(34, 197, 94, 0.2);
          font-weight: 500;
          font-size: 0.875rem;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }

        .status-pending {
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.1);
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          border: 1px solid rgba(245, 158, 11, 0.2);
          font-weight: 500;
          font-size: 0.875rem;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }

        @media (max-width: 768px) {
          .my-tickets-container {
            padding: 1rem;
          }

          .page-title {
            font-size: 1.75rem;
          }

          .ticket-card {
            padding: 1rem;
          }

          .event-name {
            font-size: 1.25rem;
          }

          .status-container {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }
        }
      `}</style>
    </>
  );
}