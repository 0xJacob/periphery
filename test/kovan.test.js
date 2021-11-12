const { expect, assert } = require("chai");
const BigNumber = require('bignumber.js');
const fetch = require('node-fetch');
const { hre, ethers } = require("hardhat");
const { keccak256 } = require("@ethersproject/keccak256");

const API_QUOTE_URL = 'https://kovan.api.0x.org/swap/v1/quote';

function createQueryString(params) {
    return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}

function etherToWei(etherAmount) {
    return new BigNumber(etherAmount)
        .times('1e18')
        .integerValue()
        .toString(10);
}

function weiToEther(weiAmount) {
    return new BigNumber(weiAmount)
        .div('1e18')
        .toString(10);
}

describe("Liquity contract testing", function () {

    let kovanUniRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
    let kovanUniFactory = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    let kovanWeth = "0xd0a1e359811322d97991e03f863a0c30c2cf029c";
    let kovanZeroEx = "0xdef1c0ded9bec7f1a1670819833240f027b25eff";

    let DAI = "0x4f96fe3b7a6cf9725f59d353f723c1bdb64ca6aa";
    let MKR = "0xaaf64bfcc32d0f15873a02163e7e500671a4ffcd";

    before(async function () {

        this.LiquityManager = await ethers.getContractFactory('LiquidityManager');

        this.accounts = await ethers.getSigners();

    });

    beforeEach(async function () {

        this.liquidityManager = await this.LiquityManager.deploy();

        await this.liquidityManager.deployed();

        await this.liquidityManager.__ZapIn_init(this.accounts[0].address, kovanWeth);

        await this.liquidityManager.setApprovedAMM([1], [kovanUniFactory], [kovanUniRouter]);

        await this.liquidityManager.setApprovedTargets([kovanZeroEx], [true]);

        const { interface } = await ethers.getContractFactory('UniswapV2Factory');

        this.factory = new ethers.Contract(kovanUniFactory, interface, this.accounts[0]);

    });


    it("ZapIn with signal pool token", async function () {
        let sellToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
        let sellAmount = 0.1;
        let sellAmountWei = etherToWei(sellAmount);

        // Get a quote from 0x-API to sell the WETH we just minted.
        console.info(`Fetching swap quote from 0x-API to sell ${sellAmount} WETH for DAI...`);
        const qs = createQueryString({
            sellToken: sellToken,
            buyToken: DAI,
            sellAmount: sellAmountWei,
        });
        const quoteUrl = `${API_QUOTE_URL}?${qs}`;
        console.info("quote: ", quoteUrl);
        const response = await fetch(quoteUrl);
        const quote = await response.json();
        console.info(`Received a quote with price ${quote.price}`);

        let pairAddress = await this.factory.getPair(DAI, kovanWeth);
        console.log("WETH-DAI pair: ", pairAddress);

        await this.liquidityManager.ZapIn(
            sellToken,
            1,
            pairAddress,
            sellAmountWei,
            1,
            quote.to,
            quote.data, { value: sellAmountWei }
        )
    });
});