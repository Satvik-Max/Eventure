import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { BrowserProvider, Contract } from 'ethers'; 
import EventureABI from '../abi/EventureNFT.json';
import { MapPin, Calendar, DollarSign, Star , Ticket, Plus, Type, FileText } from 'lucide-react';

const CONTRACT_ADDRESS = '0xeD71d2AA40Ebc5b52492806C3593D34Ce89Cb95A';

export default function CreateEvent() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    date: '',
    location: '',
    price: '',
    max_ticket: '',
    reputation_req: '',
  });
  const [status, setStatus] = useState('');

  // Check for cached wallet address on component mount
  useEffect(() => {
    const cachedWallet = localStorage.getItem('walletAddress');
    if (cachedWallet) {
      setWalletAddress(cachedWallet);
    }

    // Get user email from Supabase auth
    const getUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }
    };
    getUserEmail();
  }, []);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          localStorage.setItem('walletAddress', accounts[0]); 
        }
      } catch (error) {
        console.error('User rejected wallet connection', error);
        setStatus('❌ User rejected wallet connection');
      }
    } else {
      setStatus('❌ MetaMask not found. Please install it.');
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('');

    // Connect wallet if not already connected
    if (!walletAddress) {
      await connectWallet();
      if (!walletAddress) {
        setStatus('❌ Wallet connection required');
        return;
      }
    }

    setStatus('📦 Saving event to Supabase...');
    const eventId = Date.now();
    const metadata_hash = `event-${eventId}`;
    const maxTickets = parseInt(form.max_ticket);
    const price = parseFloat(form.price);
    const reputationRequired = parseInt(form.reputation_req);

    if (isNaN(maxTickets) || maxTickets <= 0) {
      setStatus('❌ Max tickets must be a positive number');
      return;
    }

    if (isNaN(price) || price < 0) {
      setStatus('❌ Price must be a positive number');
      return;
    }

   try {
    // 1. Insert event into Supabase
    const { error } = await supabase.from('events').insert([{
        name: form.name,
        event_id: eventId,
        description: form.description,
        organizer_address: walletAddress,
        organizer_email: userEmail,
        metadata_hash,
        date: form.date,
        location: form.location,
        price_wei: price,
        max_ticket: maxTickets,
        is_cancelled: false,
        reputation_req: reputationRequired 
    }]).select();

    if (error) throw error;

    // 2. Increment user's reputation by 5
    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('reputation')
        .eq('email', userEmail)
        .single();

    if (!profileError && profile) {
        const newReputation = (profile.reputation || 0) + 5;

        const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ reputation: newReputation })
        .eq('email', userEmail);

        if (updateError) {
        console.warn('⚠️ Failed to update user reputation');
        }
    } else {
        console.warn('⚠️ Could not fetch user profile to update reputation');
    }

    // 3. Create on-chain event
    setStatus('🔗 Calling smart contract...');
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new Contract(CONTRACT_ADDRESS, EventureABI.abi, signer);

    const tx = await contract.createEvent(eventId, metadata_hash, maxTickets);
    await tx.wait();

    setStatus('✅ Event created successfully!');
    setForm({
        name: '',
        description: '',
        date: '',
        location: '',
        price: '',
        max_ticket: '',
        reputation_req: '', 
    });
    } catch (err) {
    console.error('Error:', err);
    setStatus(`❌ ${err.message || 'Failed to create event'}`);
    }

  };

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '40px 20px',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <style jsx>{`
        .form-container {
          background: linear-gradient(145deg, #1a1a2e, #16213e);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .form-title {
          color: #ffffff;
          font-size: 2.5rem;
          font-weight: 700;
          text-align: center;
          margin-bottom: 40px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .form-grid {
          display: grid;
          gap: 24px;
          margin-bottom: 32px;
        }

        .input-group {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          z-index: 2;
          color: #8b5cf6;
        }

        .form-input {
          width: 100%;
          padding: 16px 16px 16px 48px;
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          color: #ffffff;
          font-size: 16px;
          font-weight: 500;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .form-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .form-input:focus {
          outline: none;
          border-color: #8b5cf6;
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.1);
          transform: translateY(-2px);
        }

        .form-input:hover {
          border-color: rgba(255, 255, 255, 0.2);
        }

        .submit-button {
          width: 100%;
          padding: 18px 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          border-radius: 16px;
          color: #ffffff;
          font-size: 18px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
          position: relative;
          overflow: hidden;
        }

        .submit-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s;
        }

        .submit-button:hover::before {
          left: 100%;
        }

        .submit-button:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 48px rgba(102, 126, 234, 0.4);
        }

        .submit-button:active {
          transform: translateY(-1px);
        }

        .status-message {
          margin-top: 24px;
          padding: 16px 20px;
          border-radius: 12px;
          font-weight: 500;
          text-align: center;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .status-success {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.3);
        }

        .status-error {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.3);
        }

        .status-info {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          border-color: rgba(59, 130, 246, 0.3);
        }

        .wallet-notice {
          margin-top: 24px;
          padding: 20px;
          background: rgba(251, 191, 36, 0.1);
          color: #fbbf24;
          border-radius: 12px;
          text-align: center;
          font-weight: 500;
          border: 1px solid rgba(251, 191, 36, 0.3);
          backdrop-filter: blur(10px);
        }

        .glass-effect {
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
      `}</style>

      <div className="form-container">
        <h2 className="form-title">
          <Plus size={32} />
          Create Event
        </h2>
        
        <div onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="input-group">
              <Type className="input-icon" size={20} />
              <input
                type="text"
                name="name"
                placeholder="Event Name"
                value={form.name}
                onChange={handleChange}
                className="form-input"
                required
              />
            </div>

            <div className="input-group">
              <FileText className="input-icon" size={20} />
              <input
                type="text"
                name="description"
                placeholder="Description"
                value={form.description}
                onChange={handleChange}
                className="form-input"
                required
              />
            </div>

            <div className="input-group">
              <MapPin className="input-icon" size={20} />
              <input
                type="text"
                name="location"
                placeholder="Location"
                value={form.location}
                onChange={handleChange}
                className="form-input"
                required
              />
            </div>

            <div className="input-group">
              <Calendar className="input-icon" size={20} />
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="form-input"
                required
              />
            </div>

            <div className="input-group">
              <DollarSign className="input-icon" size={20} />
              <input
                type="number"
                name="price"
                placeholder="Price per ticket (ETH)"
                value={form.price}
                onChange={handleChange}
                className="form-input"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div className="input-group">
              <Ticket className="input-icon" size={20} />
              <input
                type="number"
                name="max_ticket"
                placeholder="Max Tickets"
                value={form.max_ticket}
                onChange={handleChange}
                className="form-input"
                min="1"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <Star className="input-icon" size={20} />
            <input
                type="number"
                name="reputation_req"
                placeholder="Minimum Reputation Required"
                value={form.reputation_req}
                onChange={handleChange}
                className="form-input"
                min="0"
                required
            />
        </div>


          <button type="submit" className="submit-button" onClick={handleSubmit}>
            <Plus size={20} />
            Create Event
          </button>
        </div>

        {status && (
          <div className={`status-message ${
            status.includes('successfully') ? 'status-success' :
            status.includes('error') || status.includes('failed') ? 'status-error' :
            'status-info'
          }`}>
            {status}
          </div>
        )}

        {!walletAddress && (
          <div className="wallet-notice">
            <p>Wallet not connected. You'll be prompted to connect when submitting.</p>
          </div>
        )}
      </div>
    </div>
  );
}