import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function MyEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function handleCancelEvent(event) {
    const confirmed = window.confirm(`Cancel "${event.name}" and refund all attendees?`);
    if (!confirmed) return;

    try {
      const now = new Date();
      const eventDate = new Date(event.date);

      // Check if event already happened
      if (eventDate < now) {
        throw new Error("Event already happened. Cannot cancel after event date.");
      }

      // 1. Mark event as cancelled
      const { error: cancelError } = await supabase
        .from('events')
        .update({ is_cancelled: true })
        .eq('event_id', event.event_id);
         
      if (cancelError) throw new Error('Failed to cancel event');

      // 2. Refund logic - fetch tickets for this event
      const { data: tickets, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .eq('event_id', event.event_id)
        .eq('refunded', false);

      if (ticketError) throw new Error('Failed to fetch tickets');

      // Mark tickets as refunded
      if (tickets && tickets.length > 0) {
        for (const ticket of tickets) {
          await supabase
            .from('tickets')
            .update({ refunded: true })
            .eq('id', ticket.id);
        }
      }

      // 3. Reduce organizer reputation by 5
      const { data: organizerProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('reputation')
        .eq('email', event.organizer_email)
        .single();

      if (!profileError && organizerProfile) {
        const newReputation = Math.max(0, (organizerProfile.reputation || 0) - 5);

        await supabase
          .from('user_profiles')
          .update({ reputation: newReputation })
          .eq('email', event.organizer_email);
      }

      // 4. Update local state
      setEvents(prev =>
        prev.map(e => e.event_id === event.event_id ? { ...e, is_cancelled: true } : e)
      );

      alert(`✅ Event "${event.name}" cancelled and refunds marked.`);
    } catch (err) {
      console.error('❌ Cancel error:', err);
      alert(`❌ ${err.message}`);
    }
  }

  async function handleMarkAttendance(eventId, userEmail) {
    try {
      // Update ticket attendance
      const { error: ticketError } = await supabase
        .from('tickets')
        .update({ attended: true })
        .eq('event_id', eventId)
        .eq('user_email', userEmail);

      if (ticketError) throw new Error('Failed to update ticket attendance');

      // Fetch user profile to update stats
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('total_events_attended, reputation')
        .eq('email', userEmail)
        .single();

      if (profileError) {
        console.warn('Could not fetch profile for', userEmail);
      } else {
        // Update both total_events_attended and reputation
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            total_events_attended: (userProfile.total_events_attended || 0) + 1,
            reputation: (userProfile.reputation || 0) + 5
          })
          .eq('email', userEmail);

        if (updateError) throw new Error('Failed to update user profile');
      }

      // Update local state
      setEvents(prevEvents => 
        prevEvents.map(event => {
          if (event.event_id === eventId) {
            return {
              ...event,
              attendees: event.attendees.map(attendee => 
                attendee.email === userEmail 
                  ? { ...attendee, attended: true }
                  : attendee
              )
            };
          }
          return event;
        })
      );

      alert(`✅ Marked ${userEmail} as attended`);
    } catch (err) {
      console.error('Mark attendance error:', err);
      alert(`❌ ${err.message}`);
    }
  }

  useEffect(() => {
    const fetchMyEvents = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Fetch events created by the current user
        const { data: eventList, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('organizer_email', user.email)
          .order('date', { ascending: false }); // Order by date, newest first

        if (eventError) {
          console.error('Failed to fetch events:', eventError);
          setLoading(false);
          return;
        }

        if (!eventList || eventList.length === 0) {
          setEvents([]);
          setLoading(false);
          return;
        }

        // Fetch tickets/attendees for these events
        const { data: ticketData, error: ticketError } = await supabase
          .from('tickets')
          .select('event_id, user_email, attended, refunded')
          .in('event_id', eventList.map(e => e.event_id))
          .eq('refunded', false); // Only non-refunded tickets

        if (ticketError) {
          console.error('Failed to fetch attendees:', ticketError);
          // Continue without attendee data
        }

        // Group tickets by event_id
        const grouped = {};
        if (ticketData) {
          ticketData.forEach(ticket => {
            if (!grouped[ticket.event_id]) grouped[ticket.event_id] = [];
            grouped[ticket.event_id].push({
              email: ticket.user_email,
              attended: ticket.attended || false
            });
          });
        }

        // Combine events with their attendees and add status
        const now = new Date();
        const enrichedEvents = eventList.map(event => {
          const eventDate = new Date(event.date);
          const isPastEvent = eventDate < now;
          const isUpcoming = !isPastEvent && !event.is_cancelled;
          
          return {
            ...event,
            attendees: grouped[event.event_id] || [],
            isPastEvent,
            isUpcoming
          };
        });

        setEvents(enrichedEvents);
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyEvents();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading your events...</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h3>No Events Yet</h3>
        <p>You haven't created any events yet.</p>
      </div>
    );
  }

  // Separate events into upcoming and past/cancelled
  const upcomingEvents = events.filter(event => event.isUpcoming);
  const pastOrCancelledEvents = events.filter(event => !event.isUpcoming);

  return (
    <div className="my-events-container">
      <div className="header">
        <div className="header-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h1>My Events</h1>
      </div>
      
      {/* Upcoming Events Section */}
      {upcomingEvents.length > 0 && (
        <div className="events-section">
          <h2 className="section-title">Upcoming Events</h2>
          <div className="events-grid">
            {upcomingEvents.map((event) => (
              <EventCard 
                key={event.event_id} 
                event={event} 
                onCancel={handleCancelEvent}
                onMarkAttendance={handleMarkAttendance}
                isUpcoming={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past/Cancelled Events Section */}
      {pastOrCancelledEvents.length > 0 && (
        <div className="events-section">
          <h2 className="section-title">Past & Cancelled Events</h2>
          <div className="events-grid">
            {pastOrCancelledEvents.map((event) => (
              <EventCard 
                key={event.event_id} 
                event={event} 
                onCancel={handleCancelEvent}
                onMarkAttendance={handleMarkAttendance}
                isUpcoming={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Separate component for event card to keep the main component cleaner
function EventCard({ event, onCancel, onMarkAttendance, isUpcoming }) {
  const eventDate = new Date(event.date);
  const isPastEvent = eventDate < new Date();

  return (
    <div key={event.event_id} className={`event-card ${!isUpcoming ? 'past-event' : ''}`}>
      <div className="event-header">
        <h2 className="event-title">
          {event.name}
          {event.is_cancelled && (
            <span className="cancelled-badge">[Cancelled]</span>
          )}
          {!event.is_cancelled && isPastEvent && (
            <span className="past-badge">[Past Event]</span>
          )}
        </h2>
      </div>
      
      <div className="event-details">
        <div className="detail-item">
          <div className="detail-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="detail-content">
            <span className="detail-label">Date:</span>
            <span className="detail-value">{new Date(event.date).toLocaleString()}</span>
          </div>
        </div>
        
        <div className="detail-item">
          <div className="detail-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
          </div>
          <div className="detail-content">
            <span className="detail-label">Location:</span>
            <span className="detail-value">{event.location}</span>
          </div>
        </div>
        
        <div className="detail-item">
          <div className="detail-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16l6-3 6 3z"/>
            </svg>
          </div>
          <div className="detail-content">
            <span className="detail-label">Tickets Sold:</span>
            <span className="detail-value">{event.ticket_sold || 0} / {event.max_ticket}</span>
          </div>
        </div>
      </div>

      {isUpcoming && !event.is_cancelled && (
        <button
          className="cancel-event-btn"
          onClick={() => onCancel(event)}
        >
          ❌ Cancel Event
        </button>
      )}

      <div className="attendees-section">
        <div className="attendees-header">
          <div className="detail-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <span className="attendees-title">Attendees ({event.attendees.length}):</span>
        </div>
        
        <div className="attendees-list">
          {event.attendees.length > 0 ? (
            event.attendees.map((att, idx) => (
              <div key={idx} className="attendee-item-row">
                <span className="attendee-email">{att.email}</span>
                <div className="attendee-actions">
                  {att.attended ? (
                    <span className="attended-badge">✅ Attended</span>
                  ) : (
                    <button
                      className="mark-attendance-btn"
                      onClick={() => onMarkAttendance(event.event_id, att.email)}
                      disabled={!isUpcoming || event.is_cancelled}
                    >
                      Mark as Attended
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="no-attendees">
              <div className="no-attendees-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 12h8"/>
                </svg>
              </div>
              <span>No attendees yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = `
  .my-events-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    background: #000;
    color: #fff;
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #333;
  }

  .header-icon svg {
    color: #fff;
  }

  .header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0;
    color: #fff;
    letter-spacing: -0.02em;
  }

  .events-section {
    margin-bottom: 3rem;
  }

  .section-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 1.5rem 0;
    color: #fff;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #333;
  }

  .events-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
  }

  .event-card {
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.3s ease;
    box-shadow: 0 4px 20px rgba(255, 255, 255, 0.05);
  }

  .event-card.past-event {
    opacity: 0.7;
    border-color: #444;
    background: #0a0a0a;
  }

  .event-card:hover {
    border-color: #555;
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(255, 255, 255, 0.1);
  }

  .event-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #222;
  }

  .event-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
    color: #fff;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .cancelled-badge {
    font-size: 0.875rem;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    border: 1px solid rgba(239, 68, 68, 0.2);
    font-weight: 500;
  }

  .past-badge {
    font-size: 0.875rem;
    color: #888;
    background: rgba(136, 136, 136, 0.1);
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    border: 1px solid rgba(136, 136, 136, 0.2);
    font-weight: 500;
  }

  .event-details {
    margin-bottom: 1.5rem;
  }

  .detail-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: #0a0a0a;
    border-radius: 8px;
    border: 1px solid #1a1a1a;
  }

  .detail-item:last-child {
    margin-bottom: 0;
  }

  .detail-icon svg {
    color: #888;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .detail-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    flex: 1;
  }

  .detail-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .detail-value {
    font-size: 1rem;
    color: #fff;
    font-weight: 400;
    word-break: break-word;
  }

  .cancel-event-btn {
    background: #ef4444;
    color: white;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
    transition: background-color 0.2s;
    width: 100%;
  }

  .cancel-event-btn:hover {
    background: #dc2626;
  }

  .cancel-event-btn:active {
    background: #b91c1c;
  }

  .attendees-section {
    background: #0a0a0a;
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid #1a1a1a;
  }

  .attendees-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #222;
  }

  .attendees-header svg {
    color: #888;
  }

  .attendees-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .attendees-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .attendee-item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem;
    background: #000;
    border-radius: 6px;
    border: 1px solid #222;
  }

  .attendee-email {
    font-size: 0.875rem;
    color: #ccc;
    word-break: break-all;
    flex: 1;
  }

  .attendee-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .attended-badge {
    font-size: 0.75rem;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    border: 1px solid rgba(34, 197, 94, 0.2);
    font-weight: 500;
  }

  .mark-attendance-btn {
    font-size: 0.75rem;
    background: #3b82f6;
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .mark-attendance-btn:hover {
    background: #2563eb;
  }

  .mark-attendance-btn:active {
    background: #1d4ed8;
  }

  .mark-attendance-btn:disabled {
    background: #6b7280;
    cursor: not-allowed;
  }

  .no-attendees {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    text-align: center;
    color: #666;
    font-size: 0.875rem;
    justify-content: center;
  }

  .no-attendees-icon svg {
    color: #444;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    gap: 1rem;
    color: #fff;
    background: #000;
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

  .loading-container p {
    font-size: 1.1rem;
    color: #888;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
    color: #fff;
    background: #000;
    gap: 1.5rem;
  }

  .empty-icon svg {
    color: #333;
  }

  .empty-state h3 {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0;
    color: #fff;
  }

  .empty-state p {
    font-size: 1rem;
    color: #888;
    margin: 0;
  }

  @media (max-width: 768px) {
    .my-events-container {
      padding: 1rem;
    }

    .events-grid {
      grid-template-columns: 1fr;
    }

    .header h1 {
      font-size: 2rem;
    }

    .event-card {
      padding: 1rem;
    }

    .attendee-item-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .attendee-actions {
      align-self: flex-end;
    }

    .event-title {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
`;

// Add styles to the document and export the main component
export default function MyEventsWithStyles() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <MyEvents />
    </>
  );
}