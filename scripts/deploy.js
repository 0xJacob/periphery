const hre = require("hardhat");

async function main() {

  this.accounts = await hre.ethers.getSigners();

  const WETH = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // WBNB
  const GOV = "0x781834d656a87c686d5202b2f3d03207b26d6700";
  this.LiquidityManager = await hre.ethers.getContractFactory("LiquidityManager");
  this.lm = await this.LiquidityManager.deploy();
  console.log("LiquidityManager deployed to: ", this.lm.address);

  const tx = await this.lm.populateTransaction.__ZapIn_init(this.accounts[0].address, WETH);

  this.Proxy = await hre.ethers.getContractFactory("__AdminUpgradeabilityProxy__");

  this.proxyImp = await this.Proxy.deploy(this.lm.address, "0x781834d656a87c686d5202b2f3d03207b26d6700", tx.data);

  await this.proxyImp.deployed();
  console.log("Proxy deployed to:", this.proxyImp.address);


  const { interface } = await ethers.getContractFactory('LiquidityManager');
  const instance = new ethers.Contract(this.proxyImp.address, interface, this.accounts[0]);

  // HELMET-BNB MLP ：0x83d8E2E030cD820dfdD94723c3bcf2BC52e1701A
  // HELMET-BNB LPT   ：0xC869A9943b702B03770B6A92d2b2d25cf3a3f571
  // HELMET-BNB LPT  ： 0x86ddc49f66fa166e72e650a72752b43ce23ecbe5 暂不支持一键兑换
  // HELMET-BNB CAFE LP ：0x02258ea659a30cc61a2a33bb85c1bba5d1ce216a
  // HELMET-BNB MLP ： 0x2dd0c55bd1ad840cd73da3abd420b3199312e7d4

  // Cake: CakeFactory=0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73, CakeRouter=0x10ed43c718714eb63d5aa57b78b54704e256024e
  // Mdex: MdexFactory=0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8, MdexRouter=0x7dae51bd3e3376b8c7c4900e9107f12be3af1ba8
  // Cafe: CafeFactory=0x3e708FdbE3ADA63fc94F8F61811196f1302137AD, CafeRouter=0x933daea3a5995fb94b14a7696a5f3ffd7b1e385a
  // Mars: MarsFactory=0x6f12482D9869303B998C54D91bCD8bCcba81f3bE, MarsRouter=0xb68825C810E67D4e444ad5B9DeB55BA56A66e72D

  let _lpTypes = [1, 2, 3, 4];
  let _factories = ["0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73","0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8","0x3e708FdbE3ADA63fc94F8F61811196f1302137AD","0x6f12482D9869303B998C54D91bCD8bCcba81f3bE"];
  let _routers = ["0x10ed43c718714eb63d5aa57b78b54704e256024e","0x7dae51bd3e3376b8c7c4900e9107f12be3af1ba8","0x933daea3a5995fb94b14a7696a5f3ffd7b1e385a","0xb68825C810E67D4e444ad5B9DeB55BA56A66e72D"];

  const tx2 = await instance.setApprovedAMM(_lpTypes, _factories, _routers);
  const { gasUsed: setApprovedAMMGasUsed } = await tx2.wait();
  console.log(`setApprovedAMM:           ${setApprovedAMMGasUsed.toString()}`);

  const tx3 = await instance.setApprovedTargets([],[true]);
  const { gasUsed: setApprovedTargetsGasUsed } = await tx3.wait();
  console.log(`setApprovedTargetsGasUsed:           ${setApprovedTargetsGasUsed.toString()}`);


}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
