import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ethers } from 'ethers'; // Make sure ethers is installed
import EventureABI from '../abi/EventureNFT.json'; 


const CONTRACT_ADDRESS = "0xeD71d2AA40Ebc5b52492806C3593D34Ce89Cb95A";


export default function Resale() {
  const [resaleTickets, setResaleTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'upcoming', 'today'
  const [sortBy, setSortBy] = useState('date'); // 'date', 'price', 'recent'

  // Helper function to check if event is today
  const isEventToday = (eventDate) => {
    const today = new Date();
    const event = new Date(eventDate);
    return today.toDateString() === event.toDateString();
  };

  // Helper function to check if event is upcoming
  const isEventUpcoming = (eventDate) => {
    const now = new Date();
    const event = new Date(eventDate);
    return event > now;
  };

  // Filter resale tickets
  const getFilteredTickets = () => {
    let filtered = resaleTickets;

    // Apply filter
    if (filter === 'upcoming') {
      filtered = filtered.filter(ticket => isEventUpcoming(ticket.events?.date));
    } else if (filter === 'today') {
      filtered = filtered.filter(ticket => isEventToday(ticket.events?.date));
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(a.events?.date) - new Date(b.events?.date);
        case 'price':
          return (a.price_wei || 0) - (b.price_wei || 0);
        case 'recent':
          return new Date(b.created_at) - new Date(a.created_at);
        default:
          return 0;
      }
    });
  };

  // Format price from wei (assuming it's in wei, convert as needed)
  const formatPrice = (priceWei) => {
    if (!priceWei) return 'Free';
    // This is a placeholder - adjust based on your actual price format
    // If it's actually in wei, you'd divide by 1e18 for ETH
    return `₹${(priceWei / 1000000).toFixed(2)}`;
  };

  // Handle purchase resale ticket with smart contract integration
  const handlePurchaseResale = async (resaleListing) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to purchase tickets');
        return;
      }

      // Check if user is trying to buy their own ticket
      if (user.email === resaleListing.seller_email) {
        alert('You cannot buy your own resale ticket');
        return;
      }

      const confirmed = window.confirm(
        `Purchase ticket for ${resaleListing.events?.name} at ${formatPrice(resaleListing.price_wei)}?`
      );

      if (!confirmed) return;

      // Check if MetaMask is available
      if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask to purchase tickets');
        return;
      }

      // Connect to MetaMask
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Create contract instance
      const contract = new ethers.Contract(CONTRACT_ADDRESS, EventureABI.abi , signer);

      // Call smart contract buyResaleTicket function
      const transaction = await contract.buyResaleTicket(
        resaleListing.seller_address,
        resaleListing.event_id,
        {
          value: resaleListing.price_wei.toString() // Send the exact price in wei
        }
      );

      // Wait for transaction confirmation
      const receipt = await transaction.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Smart contract transaction failed');
      }

      // If smart contract call succeeds, update database
      // Start database transaction
      const { error: deleteError } = await supabase
        .from('resale_listings')
        .delete()
        .eq('id', resaleListing.id);

      if (deleteError) {
        console.error('Error deleting resale listing:', deleteError);
        alert('Blockchain transaction succeeded but database update failed. Please contact support.');
        return;
      }

      // Update ticket ownership in tickets table
      const { error: ticketError } = await supabase
        .from('tickets')
        .update({ 
          user_email: user.email,
          owner_address: await signer.getAddress() // Get the buyer's address
        })
        .eq('event_id', resaleListing.event_id)
        .eq('user_email', resaleListing.seller_email);

      if (ticketError) {
        console.error('Error updating ticket ownership:', ticketError);
        alert('Blockchain transaction succeeded but ticket ownership update failed. Please contact support.');
        return;
      }

      alert('Ticket purchased successfully!');
      // Refresh the listings
      fetchResaleTickets();

    } catch (error) {
      console.error('Error purchasing resale ticket:', error);
      
      // Provide more specific error messages
      if (error.code === 'ACTION_REJECTED') {
        alert('Transaction was rejected by user');
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        alert('Insufficient funds for transaction');
      } else if (error.message?.includes('execution reverted')) {
        alert('Smart contract error: ' + error.message);
      } else {
        alert('Failed to purchase ticket: ' + (error.message || 'Unknown error'));
      }
    }
  };

  // Fetch all resale listings
  const fetchResaleTickets = async () => {
    setLoading(true);
    
    const { data, error } = await supabase
      .from('resale_listings')
      .select(`
        id,
        event_id,
        seller_address,
        seller_email,
        price_wei,
        created_at,
        events (
          name,
          location,
          date,
          is_cancelled,
          price_wei
        )
      `)
      .eq('is_sold', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching resale tickets:', error);
      setLoading(false);
      return;
    }

    // Filter out cancelled events and past events
    const validResaleTickets = data.filter(ticket => 
      !ticket.events?.is_cancelled && 
      isEventUpcoming(ticket.events?.date)
    );

    setResaleTickets(validResaleTickets || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchResaleTickets();
  }, []);

  const filteredTickets = getFilteredTickets();

  if (loading) return <p>Loading resale tickets...</p>;

  return (
    <>
      <div className="resale-container">
        <div className="header-section">
          <h1 className="page-title">🎫 Ticket Resale Marketplace</h1>
          <p className="page-subtitle">Find tickets from other users at original prices</p>
          
          <div className="controls-section">
            <div className="stats">
              <span className="ticket-count">
                {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''} available
              </span>
            </div>

            <div className="filters-and-sort">
              {/* Filter Buttons */}
              <div className="filter-buttons">
                <button 
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  📋 All
                </button>
                <button 
                  className={`filter-btn ${filter === 'upcoming' ? 'active' : ''}`}
                  onClick={() => setFilter('upcoming')}
                >
                  🚀 Upcoming
                </button>
                <button 
                  className={`filter-btn ${filter === 'today' ? 'active' : ''}`}
                  onClick={() => setFilter('today')}
                >
                  ⚡ Today
                </button>
              </div>

              {/* Sort Dropdown */}
              <div className="sort-section">
                <label htmlFor="sort-select">Sort by:</label>
                <select 
                  id="sort-select"
                  className="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="date">Event Date</option>
                  <option value="price">Price</option>
                  <option value="recent">Recently Listed</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="no-tickets">
            <div className="no-tickets-icon">🎭</div>
            <h3>No Resale Tickets Available</h3>
            <p>
              {filter === 'today' && "No tickets for events happening today."}
              {filter === 'upcoming' && "No upcoming events have resale tickets."}
              {filter === 'all' && "No resale tickets are currently available."}
            </p>
            <p>Check back later for new listings!</p>
          </div>
        ) : (
          <div className="tickets-grid">
            {filteredTickets.map((ticket) => {
              const eventDate = new Date(ticket.events?.date);
              const listingDate = new Date(ticket.created_at);
              const isToday = isEventToday(ticket.events?.date);
              
              return (
                <div key={ticket.id} className={`resale-ticket-card ${isToday ? 'today-event' : ''}`}>
                  <div className="ticket-header">
                    <div className="event-info">
                      <h3 className="event-name">{ticket.events?.name || 'Unknown Event'}</h3>
                      <div className="event-badges">
                        {isToday && <span className="badge today-badge">⚡ Today</span>}
                        <span className="badge resale-badge">🔄 Resale</span>
                      </div>
                    </div>
                    <div className="price-section">
                      <div className="price">{formatPrice(ticket.price_wei)}</div>
                      <div className="price-label">Original Price</div>
                    </div>
                  </div>

                  <div className="ticket-details">
                    <div className="detail-row">
                      <span className="detail-label">📍 Location:</span>
                      <span className="detail-value">{ticket.events?.location || 'TBA'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">📅 Date:</span>
                      <span className="detail-value">
                        {eventDate.toLocaleDateString()} at {eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">⏰ Listed:</span>
                      <span className="detail-value">
                        {listingDate.toLocaleDateString()}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">👤 Seller:</span>
                      <span className="detail-value seller-email">
                        {ticket.seller_email?.substring(0, 3)}***@{ticket.seller_email?.split('@')[1] || 'hidden'}
                      </span>
                    </div>
                  </div>

                  <div className="ticket-actions">
                    <button 
                      className="purchase-btn"
                      onClick={() => handlePurchaseResale(ticket)}
                    >
                      💳 Purchase Ticket
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .resale-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
          background: #000;
          color: #fff;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .header-section {
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #333;
        }

        .page-title {
          font-size: 2.5rem;
          font-weight: 700;
          margin: 0 0 0.5rem 0;
          background: linear-gradient(135deg, #8b5cf6, #06b6d4);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .page-subtitle {
          color: #888;
          font-size: 1.1rem;
          margin: 0 0 1.5rem 0;
        }

        .controls-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .stats {
          color: #666;
          font-size: 0.9rem;
        }

        .filters-and-sort {
          display: flex;
          gap: 1.5rem;
          align-items: center;
          flex-wrap: wrap;
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
          background: linear-gradient(135deg, #8b5cf6, #7c3aed);
          color: #ffffff;
          font-weight: 600;
        }

        .sort-section {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #888;
          font-size: 0.9rem;
        }

        .sort-select {
          background: #111;
          border: 1px solid #333;
          color: #fff;
          padding: 0.5rem;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .sort-select:focus {
          outline: none;
          border-color: #8b5cf6;
        }

        .no-tickets {
          text-align: center;
          padding: 4rem 2rem;
          background: rgba(255, 255, 255, 0.02);
          border: 2px dashed #333;
          border-radius: 16px;
          margin: 2rem 0;
        }

        .no-tickets-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .no-tickets h3 {
          color: #fff;
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }

        .no-tickets p {
          color: #888;
          margin: 0.5rem 0;
          font-size: 1rem;
        }

        .tickets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 1.5rem;
          margin-top: 1rem;
        }

        .resale-ticket-card {
          background: #111;
          border: 1px solid #333;
          border-radius: 16px;
          padding: 1.5rem;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .resale-ticket-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, #8b5cf6, #06b6d4);
        }

        .resale-ticket-card.today-event::before {
          background: linear-gradient(90deg, #f59e0b, #ef4444);
        }

        .resale-ticket-card:hover {
          border-color: #555;
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(139, 92, 246, 0.15);
        }

        .ticket-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          gap: 1rem;
        }

        .event-info {
          flex: 1;
        }

        .event-name {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0 0 0.5rem 0;
          color: #fff;
          line-height: 1.3;
        }

        .event-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .today-badge {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .resale-badge {
          background: rgba(139, 92, 246, 0.1);
          color: #8b5cf6;
          border: 1px solid rgba(139, 92, 246, 0.3);
        }

        .price-section {
          text-align: right;
          flex-shrink: 0;
        }

        .price {
          font-size: 1.5rem;
          font-weight: 700;
          color: #22c55e;
          line-height: 1;
        }

        .price-label {
          font-size: 0.75rem;
          color: #666;
          margin-top: 0.25rem;
        }

        .ticket-details {
          margin-bottom: 1.5rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 0.75rem 0;
          gap: 1rem;
        }

        .detail-label {
          color: #888;
          font-size: 0.875rem;
          font-weight: 500;
          flex-shrink: 0;
        }

        .detail-value {
          color: #ccc;
          font-size: 0.875rem;
          text-align: right;
          flex: 1;
        }

        .seller-email {
          font-family: monospace;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
        }

        .ticket-actions {
          display: flex;
          gap: 0.5rem;
        }

        .purchase-btn {
          flex: 1;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .purchase-btn:hover {
          background: linear-gradient(135deg, #16a34a, #15803d);
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(34, 197, 94, 0.3);
        }

        @media (max-width: 768px) {
          .resale-container {
            padding: 1rem;
          }

          .page-title {
            font-size: 2rem;
          }

          .controls-section {
            flex-direction: column;
            align-items: stretch;
          }

          .filters-and-sort {
            flex-direction: column;
            gap: 1rem;
          }

          .filter-buttons {
            justify-content: center;
          }

          .tickets-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .ticket-header {
            flex-direction: column;
            gap: 1rem;
          }

          .price-section {
            text-align: left;
          }

          .detail-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }

          .detail-value {
            text-align: left;
          }
        }
      `}</style>
    </>
  );
}