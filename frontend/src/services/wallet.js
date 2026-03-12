// MetaMask wallet connection service

export const connectWallet = async () => {
  if (!window.ethereum) {
    alert("MetaMask installed নেই! Install করো: https://metamask.io");
    return null;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const chainId = await window.ethereum.request({
      method: "eth_chainId",
    });

    // Sepolia chainId = 0xaa36a7
    if (chainId !== "0xaa36a7") {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        });
      } catch (err) {
        alert("Sepolia network এ switch করো MetaMask এ!");
        return null;
      }
    }

    return accounts[0];
  } catch (err) {
    console.error("Wallet connect error:", err);
    return null;
  }
};

export const getWalletAddress = async () => {
  if (!window.ethereum) return null;
  const accounts = await window.ethereum.request({
    method: "eth_accounts",
  });
  return accounts[0] || null;
};

export const onAccountChange = (callback) => {
  if (!window.ethereum) return;
  window.ethereum.on("accountsChanged", (accounts) => {
    callback(accounts[0] || null);
  });
};

export const onChainChange = (callback) => {
  if (!window.ethereum) return;
  window.ethereum.on("chainChanged", () => {
    callback();
    window.location.reload();
  });
};