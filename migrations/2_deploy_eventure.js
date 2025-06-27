const EventureNFT = artifacts.require("EventureNFT");

module.exports = async function (deployer) {
  await deployer.deploy(EventureNFT);
};
