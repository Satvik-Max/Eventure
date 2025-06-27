// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EventureNFT is ERC721URIStorage, Ownable {
    uint256 public nextTokenId;
    address public admin;

    struct Event {
        address organizer;
        string metadataHash;
        uint256 maxTickets;
        uint256 soldCount;
        bool isCancelled;
        bool exists;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => uint256) public ticketEvent;   // tokenId => eventId
    mapping(uint256 => uint256) public ticketPrice;   // tokenId => price paid
    mapping(uint256 => bool) public tokenExists;      // tokenId => minted

    mapping(uint256 => uint256) public resalePrice;
    mapping(uint256 => bool) public isListed;

    constructor() ERC721("EventureTicket", "ETIX") Ownable(msg.sender) {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    function createEvent(
        uint256 eventId,
        string memory metadataHash,
        uint256 maxTickets
    ) external {
        require(!events[eventId].exists, "Event already exists");
        events[eventId] = Event({
            organizer: msg.sender,
            metadataHash: metadataHash,
            maxTickets: maxTickets,
            soldCount: 0,
            isCancelled: false,
            exists: true
        });
    }

    function mintTicket(
        address to,
        uint256 eventId,
        string memory tokenURI
    ) external payable {
        Event storage e = events[eventId];
        require(e.exists, "Event does not exist");
        require(!e.isCancelled, "Event cancelled");
        require(e.soldCount < e.maxTickets, "All tickets sold");

        uint256 tokenId = nextTokenId;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);

        ticketEvent[tokenId] = eventId;
        ticketPrice[tokenId] = msg.value;
        tokenExists[tokenId] = true;

        e.soldCount++;
        nextTokenId++;
    }

    function cancelEvent(uint256 eventId) external {
        require(events[eventId].organizer == msg.sender, "Not organizer");
        events[eventId].isCancelled = true;
    }

    function refund(uint256 tokenId) external {
        require(tokenExists[tokenId], "Ticket doesn't exist");
        require(ownerOf(tokenId) == msg.sender, "Not ticket owner");

        uint256 eventId = ticketEvent[tokenId];
        require(events[eventId].isCancelled, "Event not cancelled");

        uint256 price = ticketPrice[tokenId];
        require(price > 0, "Already refunded or no price");

        _burn(tokenId);
        tokenExists[tokenId] = false;
        ticketPrice[tokenId] = 0;

        (bool sent, ) = payable(msg.sender).call{value: price}("");
        require(sent, "Refund failed");
    }

   function listTicketForResale(address user, uint256 eventId, uint256 price) external {
        require(price > 0, "Price must be > 0");
        require(!events[eventId].isCancelled, "Event is cancelled");

        bool found = false;
        uint256 tokenIdToList;

        for (uint256 i = 0; i < nextTokenId; i++) {
            if (tokenExists[i] && ticketEvent[i] == eventId && ownerOf(i) == user) {
                tokenIdToList = i;
                found = true;
                break;
            }
        }

        require(found, "No ticket found for user & event");

        isListed[tokenIdToList] = true;
        resalePrice[tokenIdToList] = price;
    }

    function buyResaleTicket(address seller, uint256 eventId) external payable {
        bool found = false;
        uint256 tokenIdToBuy;

        for (uint256 i = 0; i < nextTokenId; i++) {
            if (
                tokenExists[i] &&
                ticketEvent[i] == eventId &&
                ownerOf(i) == seller &&
                isListed[i]
            ) {
                tokenIdToBuy = i;
                found = true;
                break;
            }
        }

        require(found, "No resale ticket available from seller for this event");
        require(msg.value == resalePrice[tokenIdToBuy], "Incorrect price");

        _transfer(seller, msg.sender, tokenIdToBuy);

        isListed[tokenIdToBuy] = false;
        resalePrice[tokenIdToBuy] = 0;

        (bool sent, ) = payable(seller).call{value: msg.value}("");
        require(sent, "Payment failed");
    }


    function setAdmin(address newAdmin) external onlyOwner {
        admin = newAdmin;
    }

    receive() external payable {}
}