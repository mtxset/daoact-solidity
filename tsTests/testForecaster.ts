const ForecasterReward = artifacts.require("./ForecasterReward.sol");
const Tempo = require('@digix/tempo');
const { wait, waitUntilBlock } = require('@digix/tempo')(web3)
import { expect, should } from "chai";
import { expectThrow, revert, snapshot, mineBlocks, reset } from "./helpers/index"

    var fr = null; // forecaster instance

    var startTimeOffset = 10*60;
    var endTimeOffset = 10*60;
    var owner;
    var startTime;
    var endTime;
    var forecaster;
    var preICO;
    var investor0;
    var investor1;

    const state = 
    {
        'PreFunding':0, 
        'Funding':1, 
        'Closed':2
    }

function currentTimeInSec()
{ return Math.floor(new Date().getTime() / 1000);}

function lastBlockTimeInSec()
{ return web3.eth.getBlock(web3.eth.blockNumber).timestamp}

contract("ForecasterReward", (accounts) =>
{
    describe("Initialization", async()=>
    {
        before(async()=>
        {
            owner = accounts[0];
            startTime = lastBlockTimeInSec() + startTimeOffset;
            endTime = startTime + endTimeOffset;
            forecaster = accounts[1];
            preICO = accounts[2];
            investor0 = accounts[3];
            investor1 = accounts[4];
        });

        it("Should init correctly ", async()=>
        {     
            fr = await ForecasterReward.new
                (owner, 
                startTime, 
                endTime,
                forecaster, 
                preICO);

            expect(await fr.owner(), "Owner incorrect/not set").to.equal(owner);
            expect(await fr.forecastersAddress(), "Forecasters incorrect/not set").to.equal(forecaster);
            expect(await fr.preICOAddress(), "PreICO incorrect/not set").to.equal(preICO);
            expect((await fr.fundingStartAt()).toNumber(), "Start Time incorrect/not set").to.equal(startTime);
            expect((await fr.fundingEndsAt()).toNumber(), "End Time incorrect/not set").to.equal(endTime);
        });
    });

    describe("Incorrect Initialization", async()=>
    {
        it("Should fail (passing wrong params)", async()=>
        {
            expect(await expectThrow(ForecasterReward.new(0,0,0,0,0))).to.be.true;

            expect(await expectThrow(
                ForecasterReward.new(0,startTime,endTime,forecaster,preICO)),
                "Passing owner as 0 should throw")
                    .to.be.true;
                    
            expect(await expectThrow(
                ForecasterReward.new(owner,0,endTime,forecaster,preICO)),
                "Passing start block as 0 should throw")
                    .to.be.true;

            expect(await expectThrow(
                ForecasterReward.new(owner,startTime,0,forecaster,preICO)),
                "Passing end block as 0 should throw")
                    .to.be.true;

            expect(await expectThrow(
                ForecasterReward.new(owner,startTime,endTime,0,preICO)),
                "Passing forecaster as 0 should throw")
                    .to.be.true;

            expect(await expectThrow(
                ForecasterReward.new(owner,startTime,endTime,forecaster,0)),
                "Passing preIco as 0 should throw")
                    .to.be.true;
            
        });

        it("Testing Incorrect start/end block numbers", async()=>
        {
            let blockNumber = web3.eth.blockNumber;

            expect(await expectThrow(
                ForecasterReward.new(owner,blockNumber - 1,endTime,forecaster,preICO)),
                "Passing already passed block number")
                    .to.be.true;

            expect(await expectThrow(
                ForecasterReward.new(owner,blockNumber - 1,endTime,forecaster,preICO)),
                "End block should be ahead of start block"
                )
                    .to.be.true;
        })
    });

    describe("Testing states", async()=>
    {
        before(async()=>
        {
            owner = accounts[0];
            startTime = lastBlockTimeInSec() + startTimeOffset;
            endTime = startTime + endTimeOffset;
            forecaster = accounts[1];
            preICO = accounts[2];
            investor0 = accounts[3];
            investor1 = accounts[4];

            fr = await ForecasterReward.new
                (owner, 
                startTime, 
                endTime,
                forecaster, 
                preICO);
        });
        
        it("Contract should be initiated with PreFunding state", async()=>
        {
            expect((await fr.getState()).toNumber()).to.deep.equal(state["PreFunding"]);
        });

        it("Contract should traverse to Funding state", async()=>
        {
            expect((await fr.getState()).toNumber()).to.deep.equal(state["PreFunding"]);
            await wait(startTime - lastBlockTimeInSec() + 10);
            expect((await fr.getState()).toNumber()).to.deep.equal(state["Funding"]);
        });

        it("Contract should traverse to last Closed state", async()=>
        {
            expect((await fr.getState()).toNumber()).to.deep.equal(state["Funding"]);
            await wait(endTime - lastBlockTimeInSec() + 10);
            expect((await fr.getState()).toNumber()).to.deep.equal(state["Closed"]);
        });
        
    });

    describe("Investment flow", async()=>
    {
        before(async()=>
        {
            owner = accounts[0];
            startTime = lastBlockTimeInSec() + startTimeOffset;
            endTime = startTime + endTimeOffset;
            forecaster = accounts[1];
            preICO = accounts[2];
            investor0 = accounts[3];
            investor1 = accounts[4];

            fr = await ForecasterReward.new
                (owner, 
                startTime, 
                endTime,
                forecaster, 
                preICO);
        });

        it("Funding", async()=>
        {
            let forecasterBalance = web3.eth.getBalance(forecaster);
            let preICOBalance = web3.eth.getBalance(preICO);

            let investment = web3.toWei(1, "ether");

            expect((await fr.getState()).toNumber(),
                "State should be Prefunding")
                .to.deep.equal(state["PreFunding"]);

            expect(await expectThrow(fr.buy(investor0, {value:investment, from:investor0})),
                "Buying in PreFunding should be now allowed")
                    .to.be.true;
            
            await wait(startTime - lastBlockTimeInSec() + 10);
            
            expect((await fr.getState()).toNumber(),
                "State should be Funding")
                .to.deep.equal(state["Funding"]);

            await fr.buy(investor0, {value:investment, from:investor0});
            await fr.buy(investor0, {value:investment, from:investor0});
            await fr.buy(investor1, {value:investment, from:investor1});

            expect((await fr.distinctInvestors()).toNumber(), "Should be 2 investors").to.equal(2);
            expect((await fr.investments()).toNumber(), "Should be 3 investments").to.equal(3);
            expect((await fr.fundingRaised()).toNumber(), "Should be 3 ethers").to.equal(3*investment);
            
            let forecastersPart = ((investment*3) / 20); // 5% rest goes to PreICO
            let expectedForForecaster = forecasterBalance.toNumber() + forecastersPart;
            let expectedForPreICO = preICOBalance.toNumber() + (investment*3 - forecastersPart);
            
            expect(await web3.eth.getBalance(forecaster).toNumber(), 
                "Forecasters balance is incorrect")
                .to.equal(expectedForForecaster);

            expect(await web3.eth.getBalance(preICO).toNumber(),
                "PreICO balance is incorrect")
                .to.equal(expectedForPreICO);
        });
    })
});