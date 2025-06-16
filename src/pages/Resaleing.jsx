/* global BigInt */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { BrowserProvider, Contract } from 'ethers';
import EventureABI from '../abi/EventureNFT.json';

const CONTRACT_ADDRESS = '0x6a7541061A5d3F56566D8a897257843CBaB42228';

export default function Resaleing() {
  const [listings, setListings] = useState([]);
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchListings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('resale_listings')
      .select(`
        *,
        tickets (
          token_uri,
          token_id
        ),
        events (
          name,
          date,
          location,
          is_cancelled
        )
      `)
      .eq('is_sold', false);

    if (!error) {
      const valid = data.filter(item => {
        const eventDate = new Date(item.events.date);
        return !item.events.is_cancelled && eventDate > new Date();
      });
      setListings(valid);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchListings();
    const cached = localStorage.getItem('walletAddress');
    if (cached) setWalletAddress(cached);
  }, []);

  const handleBuy = async (listing) => {
    try {
      if (!window.ethereum) throw new Error('Install MetaMask');
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Transfer ownership in database first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      await supabase
        .from('tickets')
        .update({
          owner_address: walletAddress,
          user_email: user.email
        })
        .eq('id', listing.ticket_id);

      // Mark as sold in resale listings
      await supabase
        .from('resale_listings')
        .update({ is_sold: true })
        .eq('id', listing.id);

      // Optional: Send payment to previous owner (could be done off-chain)
      const contract = new Contract(CONTRACT_ADDRESS, EventureABI.abi, signer);
      const tx = await contract.safeTransferFrom(
        listing.seller_address,
        walletAddress,
        BigInt(listing.tickets.token_id)
      );
      await tx.wait();

      alert('🎉 Ticket purchased successfully!');
      fetchListings();
    } catch (err) {
      console.error('Purchase error:', err);
      alert(`❌ ${err.message}`);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">🎫 Resale Tickets</h1>

      {loading ? (
        <p>Loading resale listings...</p>
      ) : listings.length === 0 ? (
        <p>No resale tickets available.</p>
      ) : (
        <div className="grid gap-4">
          {listings.map((item) => {
            const isPast = new Date(item.events.date) < new Date();
            return (
              <div key={item.id} className="border rounded p-4 shadow">
                <h2 className="text-xl font-semibold">{item.events.name}</h2>
                <p>📍 {item.events.location}</p>
                <p>📅 {new Date(item.events.date).toLocaleString()}</p>
                <p>💰 {Number(item.price_wei) / 1e18} ETH</p>
                <p>🧾 Token URI: {item.tickets.token_uri}</p>
                <button
                  disabled={isPast}
                  className="bg-green-600 text-white px-4 py-2 mt-2 rounded disabled:opacity-50"
                  onClick={() => handleBuy(item)}
                >
                  {isPast ? 'Event Ended' : 'Buy Ticket'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}