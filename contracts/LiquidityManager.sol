//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.6;

// Inheritance
import "./include.sol";

// Internal references
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract LiquidityManager is Configurable, ReentrancyGuardUpgradeSafe {
    using SafeERC20 for IERC20;
    // swapTarget => approval status
    mapping(address => bool) public approvedTargets;
    mapping(uint256 => address) public approvedRouters;
    mapping(uint256 => address) public approvedFactories;

    address internal WETH;
    address internal constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 internal constant deadline =
        0xf000000000000000000000000000000000000000000000000000000000000000;

    function __ZapIn_init(address _governor, address _weth) public initializer {
        __Governable_init_unchained(_governor);
        __ReentrancyGuard_init_unchained();
        __ZapIn_init_unchained(_weth);
    }

    function __ZapIn_init_unchained(address _weth) public governance {
        WETH = _weth;
    }

    event tokenZapIn(address sender, address pool, uint256 tokensRec);

    function setApprovedTargets(
        address[] calldata _targets,
        bool[] calldata _isApproved
    ) external governance {
        require(_targets.length == _isApproved.length, "Invalid_Input_Length");

        for (uint256 i = 0; i < _targets.length; i++) {
            approvedTargets[_targets[i]] = _isApproved[i];
        }
    }

    function setApprovedAMM(
        uint256[] calldata _lpTypes,
        address[] calldata _factories,
        address[] calldata _routers
    ) external governance {
        require(_factories.length == _lpTypes.length, "Invalid_Input_Length");
        require(_factories.length == _routers.length, "Invalid_Input_Length");

        for (uint256 i = 0; i < _lpTypes.length; i++) {
            require(
                _factories[i] != address(0) && _routers[i] != address(0),
                "NOT_ALLOW_ZERO_ADDRESS"
            );
            approvedRouters[_lpTypes[i]] = _routers[i];
            approvedFactories[_lpTypes[i]] = _factories[i];
        }
    }

    function ZapIn(
        address _token,
        uint256 _lpType,
        address _pairAddress,
        uint256 _amount,
        uint256 _minLpAmount,
        address _swapTarget,
        bytes calldata _swapData
    ) external payable returns (uint256) {
        pullToken(_token, _amount);

        uint256 lpReceived = swapAndAddLiquity(
            _token,
            _pairAddress,
            _lpType,
            _amount,
            _swapTarget,
            _swapData
        );

        require(lpReceived >= _minLpAmount, "ERR_SLIPPAGE_TOO_HIGH");

        emit tokenZapIn(msg.sender, _pairAddress, lpReceived);

        IERC20(_pairAddress).safeTransfer(msg.sender, lpReceived);

        return lpReceived;
    }

    function swapAndAddLiquity(
        address _token,
        address _pairAddress,
        uint256 _lpType,
        uint256 _amount,
        address _swapTarget,
        bytes memory _swapData
    ) internal returns (uint256) {
        (address token0, address token1) = getPairTokens(_pairAddress);

        address supplyToken;
        uint256 amount;

        if (_token != token0 && _token != token1) {
            (supplyToken, amount) = fillQuote(
                _token,
                _pairAddress,
                _amount,
                _swapTarget,
                _swapData
            );
        } else {
            supplyToken = _token;
            amount = _amount;
        }

        (uint256 balance0, uint256 balance1) = swapInPool(
            supplyToken,
            _lpType,
            token0,
            token1,
            amount
        );
        return addLiquidity(_lpType, token0, token1, balance0, balance1);
    }

    function getPairTokens(address _pairAddress)
        internal
        view
        returns (address token0, address token1)
    {
        IUniswapV2Pair uniPair = IUniswapV2Pair(_pairAddress);
        token0 = uniPair.token0();
        token1 = uniPair.token1();
    }

    function fillQuote(
        address _token,
        address _pairAddress,
        uint256 _amount,
        address _swapTarget,
        bytes memory _swapData
    ) internal returns (address intermediateToken, uint256 amountBought) {
        if (_swapTarget == WETH) {
            IWETH(WETH).deposit{value: _amount}();
            return (WETH, _amount);
        }

        uint256 valueToSend;
        if (_token == ETH) {
            valueToSend = _amount;
        } else {
            safeApprove(_token, _swapTarget, _amount);
        }

        (address _token0, address _token1) = getPairTokens(_pairAddress);
        IERC20 token0 = IERC20(_token0);
        IERC20 token1 = IERC20(_token1);
        uint256 initialBalance0 = token0.balanceOf(address(this));
        uint256 initialBalance1 = token1.balanceOf(address(this));

        require(approvedTargets[_swapTarget], "Target_not_Authorized");

        (bool success, ) = _swapTarget.call{value: valueToSend}(_swapData);
        require(success, "Error_Swapping_Tokens_1");

        uint256 finalBalance0 = token0.balanceOf(address(this)) -
            initialBalance0;
        uint256 finalBalance1 = token1.balanceOf(address(this)) -
            initialBalance1;

        if (finalBalance0 > finalBalance1) {
            amountBought = finalBalance0;
            intermediateToken = _token0;
        } else {
            amountBought = finalBalance1;
            intermediateToken = _token1;
        }

        require(amountBought > 0, "Swapped_to_Invalid_Intermediate");
    }

    function safeApprove(
        address _token,
        address _spender,
        uint256 _amount
    ) internal {
        IERC20(_token).safeApprove(_spender, 0);
        IERC20(_token).safeApprove(_spender, _amount);
    }

    function addLiquidity(
        uint256 _lpType,
        address _token0,
        address _token1,
        uint256 _token0Bought,
        uint256 _token1Bought
    ) public returns (uint256) {
        address router = approvedRouters[_lpType];
        require(router != address(0), "WROING_ROUTER_ADDRESS");

        safeApprove(_token0, router, _token0Bought);
        safeApprove(_token1, router, _token1Bought);

        (uint256 amountA, uint256 amountB, uint256 LP) = IUniswapV2Router02(
            router
        ).addLiquidity(
                _token0,
                _token1,
                _token0Bought,
                _token1Bought,
                1,
                1,
                address(this),
                deadline
            );

        //Returning Residue in token0, if any.
        if (_token0Bought - amountA > 0) {
            IERC20(_token0).safeTransfer(msg.sender, _token0Bought - amountA);
        }

        //Returning Residue in token1, if any
        if (_token1Bought - amountB > 0) {
            IERC20(_token1).safeTransfer(msg.sender, _token1Bought - amountB);
        }
        return LP;
    }

    function swapInPool(
        address _swapToken,
        uint256 _lpType,
        address _token0,
        address _token1,
        uint256 _amount
    ) public returns (uint256 token0Amount, uint256 token1Amount) {
        address pairAddress = IUniswapV2Factory(approvedFactories[_lpType])
            .getPair(_token0, _token1);
        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

        (uint256 res0, uint256 res1, ) = pair.getReserves();
        if (_swapToken == _token0) {
            uint256 amountToSwap = getOptimalSwapAmount(res0, _amount);

            if (amountToSwap <= 0) amountToSwap = _amount / 2;

            token1Amount = _swapInPool(
                approvedRouters[_lpType],
                _swapToken,
                _token1,
                pairAddress,
                amountToSwap
            );
            token0Amount = _amount - amountToSwap;
        } else {
            uint256 amountToSwap = getOptimalSwapAmount(res1, _amount);

            if (amountToSwap <= 0) amountToSwap = _amount / 2;

            token0Amount = _swapInPool(
                approvedRouters[_lpType],
                _swapToken,
                _token0,
                pairAddress,
                amountToSwap
            );
            token1Amount = _amount - amountToSwap;
        }
    }

    function _swapInPool(
        address _router,
        address _swapFrom,
        address _swapTo,
        address _pairAddress,
        uint256 tokens2Trade
    ) internal returns (uint256 tokenBought) {
        if (_swapFrom == _swapTo) {
            return tokens2Trade;
        }

        safeApprove(_swapFrom, _router, tokens2Trade);

        require(_pairAddress != address(0), "No_POOL_Available");
        address[] memory path = new address[](2);
        path[0] = _swapFrom;
        path[1] = _swapTo;

        tokenBought = IUniswapV2Router02(_router).swapExactTokensForTokens(
            tokens2Trade,
            1,
            path,
            address(this),
            deadline
        )[path.length - 1];

        require(tokenBought > 0, "Error_Swapping_Tokens_2");
    }

    function pullToken(address _token, uint256 _amount) internal {
        if (_token == ETH) {
            require(msg.value == _amount, "WRONG_ETHER_AMOUNT");
            return;
        }

        require(_amount > 0 && msg.value == 0, "INVALID_TOKEN_AMOUNT");

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
    }

    /*
      s = optimal swap amount
      r = amount of reserve for token a
      a = amount of token a the user currently has (not added to reserve yet)
      f = swap fee percent
      s = (sqrt(((2 - f)r)^2 + 4(1 - f)ar) - (2 - f)r) / (2(1 - f))
      */
    function getOptimalSwapAmount(uint256 reserveIn, uint256 amount)
        internal
        pure
        returns (uint256)
    {
        return
            (Babylonian.sqrt(
                reserveIn * ((amount * 3988000) + (reserveIn * 3988009))
            ) - (reserveIn * 1997)) / 1994;
    }

    ///@notice Withdraw goodwill share, retaining affilliate share
    function withdrawTokens(address[] calldata tokens) external governance {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == ETH) {
                Address.sendValue(payable(_admin()), address(this).balance);
            } else {
                IERC20(tokens[i]).safeTransfer(
                    _admin(),
                    IERC20(tokens[i]).balanceOf(address(this))
                );
            }
        }
    }

    receive() external payable {
        require(msg.sender != tx.origin, "Do_Not_Send_ETH_Directly");
    }
}
