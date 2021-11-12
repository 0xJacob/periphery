const { expect, assert } = require("chai");
const { hre, ethers } = require("hardhat");
const { keccak256 } = require("@ethersproject/keccak256");

const deadline = "0xf000000000000000000000000000000000000000000000000000000000000000";

describe("Liquity contract testing", function () {

    before(async function () {

        this.Factory = await ethers.getContractFactory('UniswapV2Factory');

        this.Router = await ethers.getContractFactory('UniswapV2Router02');

        this.Pair = await ethers.getContractFactory('UniswapV2Pair');

        this.Erc20 = await ethers.getContractFactory('ERC20Mock');

        this.Weth = await ethers.getContractFactory('WETHMock');

        this.LiquidityManager = await ethers.getContractFactory('LiquidityManager');

        this.accounts = await ethers.getSigners();

        // need change @uniswap library init hash with COMPUTED_INIT_CODE_HASH.
        // path： node_modules/@uniswap/v2-periphery/contracts/libraries/UniswapV2Library.sol L24
        const COMPUTED_INIT_CODE_HASH = keccak256(this.Pair.bytecode);
        console.log("COMPUTED_INIT_CODE_HASH: ", COMPUTED_INIT_CODE_HASH);

        this.MintAmount = ethers.utils.parseEther('10000000.0');
        this.InitLPAmount = ethers.utils.parseEther('100000.0');
    });

    beforeEach(async function () {

        this.weth = await this.Weth.deploy();
        await this.weth.deployed();

        this.factory = await this.Factory.deploy(this.accounts[0].address);
        await this.factory.deployed();

        this.router = await this.Router.deploy(this.factory.address, this.weth.address);
        await this.router.deployed();

        this.liquidityManager = await this.LiquidityManager.deploy();
        await this.liquidityManager.deployed();

        await this.liquidityManager.__ZapIn_init(this.accounts[0].address, this.weth.address);

        await this.liquidityManager.setApprovedAMM([1], [this.factory.address], [this.router.address]);

        this.token1 = await this.Erc20.deploy("Tether", "USDT", 16);
        await this.token1.deployed();
        await this.token1.mint(this.MintAmount);

        this.token2 = await this.Erc20.deploy("Wapper Bitcoin", "WBTC", 16);
        await this.token2.deployed();
        await this.token2.mint(this.MintAmount);

    });

    it("Add liquity with uniswap", async function () {

        await this.token1.approve(this.router.address, this.InitLPAmount);
        await this.token2.approve(this.router.address, this.InitLPAmount);

        await this.router.addLiquidity(
            this.token1.address,
            this.token2.address,
            this.InitLPAmount,
            this.InitLPAmount,
            this.InitLPAmount,
            this.InitLPAmount,
            this.accounts[0].address,
            deadline
        );
    });

    it("Add liquity use liquityManager", async function () {

        await this.token1.transfer(this.liquidityManager.address, this.InitLPAmount);
        await this.token2.transfer(this.liquidityManager.address, this.InitLPAmount);

        await this.liquidityManager.addLiquidity(
            1,
            this.token1.address,
            this.token2.address,
            this.InitLPAmount,
            this.InitLPAmount,
        );

        let pairAddress = await this.factory.getPair(this.token1.address, this.token2.address);

        let pair = await this.Pair.attach(pairAddress);

        expect(await pair.balanceOf(this.liquidityManager.address)).to.not.equal("0");
    });

    it("Swap in pool", async function () {

        let token1Amt = ethers.utils.parseEther('12000.0');
        let token2Amt = ethers.utils.parseEther('520.0');

        let swapAmt = ethers.utils.parseEther('2500.0');

        await this.token1.transfer(this.liquidityManager.address, token1Amt);
        await this.token2.transfer(this.liquidityManager.address, token2Amt);

        await this.liquidityManager.addLiquidity(
            1,
            this.token1.address,
            this.token2.address,
            token1Amt,
            token2Amt,
        );

        let pairAddress = await this.factory.getPair(this.token1.address, this.token2.address);

        let pair = await this.Pair.attach(pairAddress);

        let reserve = await pair.getReserves()

        await this.token1.transfer(this.liquidityManager.address, swapAmt);

        await this.liquidityManager.swapInPool(
            this.token1.address,
            1,
            this.token1.address,
            this.token2.address,
            swapAmt
        );

        expect((await this.token1.balanceOf(pairAddress)).toString()).to.equal("13192695122277559332296");
        expect((await this.token2.balanceOf(pairAddress)).toString()).to.equal("473117342316160748469");

        expect((await this.token1.balanceOf(this.liquidityManager.address)).toString()).to.equal("1307304877722440667704");
        expect((await this.token2.balanceOf(this.liquidityManager.address)).toString()).to.equal("46882657683839251531");
        
    });

    it("ZapIn", async function(){
        let token1Amt = ethers.utils.parseEther('12000.0');
        let token2Amt = ethers.utils.parseEther('520.0');

        let swapAmt = ethers.utils.parseEther('2500.0');

        await this.token1.approve(this.router.address, token1Amt);
        await this.token2.approve(this.router.address, token2Amt);

        await this.router.addLiquidity(
            this.token1.address,
            this.token2.address,
            token1Amt,
            token2Amt,
            token1Amt,
            token2Amt,
            this.accounts[0].address,
            deadline
        );

        let pairAddress = await this.factory.getPair(this.token1.address, this.token2.address);

        await this.token1.approve(this.liquidityManager.address, swapAmt);

        await this.liquidityManager.ZapIn(
            this.token1.address, 
            1,
            pairAddress,
            swapAmt,
            1,
            "0x9d4454b023096f34b160d6b654540c56a1f81688",
            "0x00"
            )

        expect(ethers.utils.formatEther(await this.token1.balanceOf(pairAddress))).to.equal("14500.0");
        expect(ethers.utils.formatEther(await this.token2.balanceOf(pairAddress))).to.equal("520.0");
    });
});