import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

export default function ConnectWallet({ onAddressChange }) {
  const [walletAddress, setWalletAddress] = useState(null);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          localStorage.setItem('walletAddress', accounts[0]); // optional cache
          if (onAddressChange) {
            onAddressChange(accounts[0]);
          }
        }
      } catch (error) {
        console.error('User rejected wallet connection', error);
      }
    } else {
      alert('MetaMask not found. Please install it.');
    }
  };

  // ✅ On component mount, check if already connected
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts',
        });
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          if (onAddressChange) {
            onAddressChange(accounts[0]);
          }
        }
      }
    };

    checkWalletConnection();
  }, [onAddressChange]);

  return (
    <>
      {walletAddress ? (
        <p>
          Connected: {walletAddress.slice(0, 6)}...
          {walletAddress.slice(-4)}
        </p>
      ) : (
        <button onClick={connectWallet}>Connect Wallet</button>
      )}
    </>
  );
}