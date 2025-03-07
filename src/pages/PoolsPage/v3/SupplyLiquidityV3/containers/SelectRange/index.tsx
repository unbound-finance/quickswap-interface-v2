import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { IPresetArgs, PresetRanges } from '../../components/PresetRanges';
import { RangeSelector } from '../../components/RangeSelector';
import { Currency, CurrencyAmount } from '@uniswap/sdk-core';
import './index.scss';
import { Bound, updateSelectedPreset } from 'state/mint/v3/actions';
import {
  IDerivedMintInfo,
  useRangeHopCallbacks,
  useV3MintActionHandlers,
  useV3MintState,
  useInitialUSDPrices,
  useGetUnipilotVaults,
} from 'state/mint/v3/hooks';
import { useUSDCValue } from 'hooks/v3/useUSDCPrice';
import { useAppDispatch } from 'state/hooks';
import { useActivePreset } from 'state/mint/v3/hooks';
import { tryParseAmount } from 'state/swap/v3/hooks';
import { Presets } from 'state/mint/v3/reducer';
import { PriceFormats } from 'components/v3/PriceFomatToggler';
import LiquidityChartRangeInput from 'components/v3/LiquidityChartRangeInput';
import { GlobalConst } from 'constants/index';
import { Box, ButtonGroup, Button } from '@material-ui/core';
import { ReportProblemOutlined } from '@material-ui/icons';
import { useActiveWeb3React } from 'hooks';
import { ChainId, JSBI } from '@uniswap/sdk';
import { StableCoins } from 'constants/v3/addresses';
import { getEternalFarmFromTokens, getGammaPairsForTokens } from 'utils';
import GammaLogo from 'assets/images/gammaLogo.png';
import UnipilotLogo from 'assets/images/unipilot.png';
import AutomaticImage from 'assets/images/automatic.svg';
import AutomaticImageDark from 'assets/images/automaticDark.svg';
import { Trans, useTranslation } from 'react-i18next';

interface IRangeSelector {
  currencyA: Currency | null | undefined;
  currencyB: Currency | null | undefined;
  mintInfo: IDerivedMintInfo;
  priceFormat: PriceFormats;
}

export function SelectRange({
  currencyA,
  currencyB,
  mintInfo,
  priceFormat,
}: IRangeSelector) {
  const { t } = useTranslation();
  const [fullRangeWarningShown, setFullRangeWarningShown] = useState(true);
  const {
    startPriceTypedValue,
    liquidityRangeType,
    presetRange,
  } = useV3MintState();
  const { onChangeLiquidityRangeType } = useV3MintActionHandlers(
    mintInfo.noLiquidity,
  );
  const { chainId } = useActiveWeb3React();
  const chainIdToUse = chainId ? chainId : ChainId.MATIC;

  const dispatch = useAppDispatch();
  const activePreset = useActivePreset();

  //TODO - create one main isUSD
  const isUSD = useMemo(() => {
    return priceFormat === PriceFormats.USD;
  }, [priceFormat]);

  const currencyAAddress =
    currencyA && currencyA.wrapped
      ? currencyA.wrapped.address.toLowerCase()
      : '';
  const currencyBAddress =
    currencyB && currencyB.wrapped
      ? currencyB.wrapped.address.toLowerCase()
      : '';
  const gammaPairData = getGammaPairsForTokens(
    chainId,
    currencyAAddress,
    currencyBAddress,
  );
  const gammaPair = gammaPairData?.pairs;
  const gammaPairReversed = gammaPairData?.reversed;

  const gammaCurrencyA = gammaPairReversed ? currencyB : currencyA;
  const gammaCurrencyB = gammaPairReversed ? currencyA : currencyB;

  const isStablecoinPair = useMemo(() => {
    if (!currencyA || !currencyB) return false;

    const stablecoins = StableCoins[chainIdToUse]
      ? StableCoins[chainIdToUse].map((token) => token.address)
      : [];

    return (
      stablecoins.includes(currencyA.wrapped.address) &&
      stablecoins.includes(currencyB.wrapped.address)
    );
  }, [chainIdToUse, currencyA, currencyB]);

  // get value and prices at ticks
  const { [Bound.LOWER]: tickLower, [Bound.UPPER]: tickUpper } = useMemo(() => {
    return mintInfo.ticks;
  }, [mintInfo]);

  const {
    [Bound.LOWER]: priceLower,
    [Bound.UPPER]: priceUpper,
  } = useMemo(() => {
    return mintInfo.pricesAtTicks;
  }, [mintInfo]);

  const {
    getDecrementLower,
    getIncrementLower,
    getDecrementUpper,
    getIncrementUpper,
    getSetFullRange,
  } = useRangeHopCallbacks(
    currencyA ?? undefined,
    currencyB ?? undefined,
    mintInfo.feeAmount,
    tickLower,
    tickUpper,
    mintInfo.pool,
  );

  const { onLeftRangeInput, onRightRangeInput } = useV3MintActionHandlers(
    mintInfo.noLiquidity,
  );

  const tokenA = (currencyA ?? undefined)?.wrapped;
  const tokenB = (currencyB ?? undefined)?.wrapped;

  const isSorted = useMemo(() => {
    return tokenA && tokenB && tokenA.sortsBefore(tokenB);
  }, [tokenA, tokenB]);

  const leftPrice = useMemo(() => {
    return isSorted ? priceLower : priceUpper?.invert();
  }, [isSorted, priceLower, priceUpper]);

  const rightPrice = useMemo(() => {
    return isSorted ? priceUpper : priceLower?.invert();
  }, [isSorted, priceUpper, priceLower]);

  const price = useMemo(() => {
    if (!mintInfo.price) return;

    return mintInfo.invertPrice
      ? mintInfo.price.invert().toSignificant(5)
      : mintInfo.price.toSignificant(5);
  }, [mintInfo]);

  const priceObj = useMemo(() => {
    if (!mintInfo.price) return;

    return mintInfo.invertPrice ? mintInfo.price.invert() : mintInfo.price;
  }, [mintInfo]);

  const leftPricePercent =
    leftPrice && price
      ? ((Number(leftPrice.toSignificant(5)) - Number(price)) / Number(price)) *
        100
      : 0;
  const rightPricePercent =
    rightPrice && price
      ? ((Number(rightPrice.toSignificant(5)) - Number(price)) /
          Number(price)) *
        100
      : 0;

  const currencyAID = currencyA?.wrapped.address.toLowerCase();
  const currencyBID = currencyB?.wrapped.address.toLowerCase();

  const [minRangeLength, setMinRangeLength] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    setMinRangeLength(undefined);
    if (!currencyAID || !currencyBID || !chainId) return;
    (async () => {
      const eternalFarm = await getEternalFarmFromTokens(
        currencyAID,
        currencyBID,
        chainId,
      );
      const minRangeLength = eternalFarm
        ? Number(eternalFarm.minRangeLength) / 100
        : undefined;
      setMinRangeLength(minRangeLength);
    })();
  }, [currencyAID, currencyBID, chainId]);

  const currentPriceInUSD = useUSDCValue(
    tryParseAmount(price, currencyB ?? undefined),
    true,
  );

  const isBeforePrice = useMemo(() => {
    if (!price || !leftPrice || !rightPrice) return false;

    return mintInfo.outOfRange && price > rightPrice.toSignificant(5);
  }, [price, leftPrice, rightPrice, mintInfo]);

  const isAfterPrice = useMemo(() => {
    if (!price || !leftPrice || !rightPrice) return false;

    return mintInfo.outOfRange && price < leftPrice.toSignificant(5);
  }, [price, leftPrice, rightPrice, mintInfo]);

  const handlePresetRangeSelection = useCallback(
    (preset: IPresetArgs | null) => {
      if (!priceObj) return;

      dispatch(updateSelectedPreset({ preset: preset ? preset.type : null }));

      if (preset && preset.type === Presets.FULL) {
        setFullRangeWarningShown(true);
        getSetFullRange();
      } else {
        setFullRangeWarningShown(false);
        const priceQuoteDecimals = Math.max(3, priceObj.baseCurrency.decimals);
        onLeftRangeInput(
          preset
            ? liquidityRangeType !==
              GlobalConst.v3LiquidityRangeType.MANUAL_RANGE
              ? String(Number(priceObj.toSignificant()) * preset.min)
              : priceObj
                  .quote(
                    CurrencyAmount.fromRawAmount(
                      priceObj.baseCurrency,
                      JSBI.BigInt(
                        (preset.min * 10 ** priceQuoteDecimals).toFixed(0),
                      ),
                    ),
                  )
                  .divide(
                    JSBI.BigInt(
                      10 **
                        (priceQuoteDecimals - priceObj.baseCurrency.decimals),
                    ),
                  )
                  .toSignificant(5)
            : '',
        );
        onRightRangeInput(
          preset
            ? liquidityRangeType !==
              GlobalConst.v3LiquidityRangeType.MANUAL_RANGE
              ? String(Number(priceObj.toSignificant()) * preset.max)
              : priceObj
                  .quote(
                    CurrencyAmount.fromRawAmount(
                      priceObj.baseCurrency,
                      JSBI.BigInt(
                        (preset.max * 10 ** priceQuoteDecimals).toFixed(0),
                      ),
                    ),
                  )
                  .divide(
                    JSBI.BigInt(
                      10 **
                        (priceQuoteDecimals - priceObj.baseCurrency.decimals),
                    ),
                  )
                  .toSignificant(5)
            : '',
        );
      }
    },
    [
      dispatch,
      getSetFullRange,
      onLeftRangeInput,
      onRightRangeInput,
      liquidityRangeType,
      priceObj,
    ],
  );

  const initialUSDPrices = useInitialUSDPrices();

  const currentPriceInUSDA = useUSDCValue(
    tryParseAmount(
      mintInfo.price
        ? mintInfo.invertPrice
          ? Number(mintInfo.price.invert().toSignificant(5)).toFixed(5)
          : Number(mintInfo.price.toSignificant(5)).toFixed(5)
        : undefined,
      currencyB ?? undefined,
    ),
    true,
  );

  const currentPriceInUSDB = useUSDCValue(
    tryParseAmount(
      mintInfo.price
        ? mintInfo.invertPrice
          ? Number(mintInfo.price.invert().toSignificant(5)).toFixed(5)
          : Number(mintInfo.price.toSignificant(5)).toFixed(5)
        : undefined,
      currencyA ?? undefined,
    ),
    true,
  );

  const currentPrice = useMemo(() => {
    if (!mintInfo.price) return;

    const isInitialInUSD = Boolean(
      initialUSDPrices.CURRENCY_A && initialUSDPrices.CURRENCY_B,
    );

    let _price;

    if (!isUSD) {
      _price =
        isUSD && currentPriceInUSDA
          ? parseFloat(currentPriceInUSDA?.toSignificant(5))
          : mintInfo.invertPrice
          ? parseFloat(mintInfo.price.invert().toSignificant(5))
          : parseFloat(mintInfo.price.toSignificant(5));
    } else {
      if (isInitialInUSD) {
        _price = parseFloat(initialUSDPrices.CURRENCY_A);
      } else if (currentPriceInUSDA) {
        _price = parseFloat(currentPriceInUSDA.toSignificant(5));
      } else if (currentPriceInUSDB) {
        _price = parseFloat(currentPriceInUSDB.toSignificant(5));
      }
    }

    if (Number(_price) <= 0.0001) {
      return `< ${
        isUSD && (currentPriceInUSDA || isInitialInUSD) ? '$ ' : ''
      }0.0001`;
    } else {
      return `${
        isUSD && (currentPriceInUSDA || isInitialInUSD) ? '$ ' : ''
      }${_price}`;
    }
  }, [
    mintInfo.price,
    mintInfo.invertPrice,
    initialUSDPrices.CURRENCY_A,
    initialUSDPrices.CURRENCY_B,
    isUSD,
    currentPriceInUSDA,
    currentPriceInUSDB,
  ]);

  const unipilotVaults = useGetUnipilotVaults();
  const unipilotVaultsForPair = unipilotVaults.filter((item) => {
    return (
      (item.token0 &&
        item.token1 &&
        item.token0.toLowerCase() === currencyAAddress.toLowerCase() &&
        item.token1.toLowerCase() === currencyBAddress.toLowerCase()) ||
      (item.token0 &&
        item.token1 &&
        item.token0.toLowerCase() === currencyBAddress.toLowerCase() &&
        item.token1.toLowerCase() === currencyAAddress.toLowerCase())
    );
  });

  useEffect(() => {
    if (gammaPair) {
      onChangeLiquidityRangeType(GlobalConst.v3LiquidityRangeType.GAMMA_RANGE);
    } else if (unipilotVaultsForPair.length > 0) {
      onChangeLiquidityRangeType(
        GlobalConst.v3LiquidityRangeType.UNIPILOT_RANGE,
      );
    } else {
      onChangeLiquidityRangeType(GlobalConst.v3LiquidityRangeType.MANUAL_RANGE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currencyA?.isNative,
    currencyA?.wrapped.address,
    currencyB?.isNative,
    currencyB?.wrapped.address,
    unipilotVaultsForPair.length,
  ]);

  return (
    <Box>
      <small className='weight-600'>{t('selectRange')}</small>
      {(gammaPair || unipilotVaultsForPair.length > 0) && (
        <Box className='buttonGroup poolRangeButtonGroup'>
          <ButtonGroup>
            {gammaPair && (
              <Button
                className={
                  liquidityRangeType ===
                  GlobalConst.v3LiquidityRangeType.GAMMA_RANGE
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  onChangeLiquidityRangeType(
                    GlobalConst.v3LiquidityRangeType.GAMMA_RANGE,
                  )
                }
              >
                <img
                  src={
                    liquidityRangeType ===
                    GlobalConst.v3LiquidityRangeType.GAMMA_RANGE
                      ? AutomaticImageDark
                      : AutomaticImage
                  }
                  alt='gamma range'
                />
              </Button>
            )}
            {unipilotVaultsForPair.length > 0 && (
              <Button
                className={
                  liquidityRangeType ===
                  GlobalConst.v3LiquidityRangeType.UNIPILOT_RANGE
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  onChangeLiquidityRangeType(
                    GlobalConst.v3LiquidityRangeType.UNIPILOT_RANGE,
                  )
                }
              >
                <img
                  src={
                    liquidityRangeType ===
                    GlobalConst.v3LiquidityRangeType.UNIPILOT_RANGE
                      ? AutomaticImageDark
                      : AutomaticImage
                  }
                  alt='unipilot range'
                />
              </Button>
            )}
            <Button
              className={
                liquidityRangeType ===
                GlobalConst.v3LiquidityRangeType.MANUAL_RANGE
                  ? 'active'
                  : ''
              }
              onClick={() =>
                onChangeLiquidityRangeType(
                  GlobalConst.v3LiquidityRangeType.MANUAL_RANGE,
                )
              }
            >
              {t('manual')}
            </Button>
          </ButtonGroup>
        </Box>
      )}
      {liquidityRangeType === GlobalConst.v3LiquidityRangeType.GAMMA_RANGE && (
        <>
          <Box my={1.5} className='poolRangePowerGamma'>
            <span className='text-secondary'>{t('poweredBy')}</span>
            <img src={GammaLogo} alt='Gamma Logo' />
          </Box>
          <Box mb={1.5}>
            <small className='weight-600'>{t('selectStrategy')}</small>
          </Box>
        </>
      )}
      {liquidityRangeType ===
        GlobalConst.v3LiquidityRangeType.UNIPILOT_RANGE && (
        <>
          <Box my={1.5} className='poolRangePowerGamma'>
            <span className='text-secondary'>{t('poweredBy')}</span>
            <img src={UnipilotLogo} alt='Unipilot Logo' />
          </Box>
          <Box mb={1.5}>
            <small className='weight-600'>{t('selectStrategy')}</small>
          </Box>
        </>
      )}
      <Box my={1}>
        <PresetRanges
          mintInfo={mintInfo}
          baseCurrency={currencyA}
          quoteCurrency={currencyB}
          isStablecoinPair={isStablecoinPair}
          activePreset={activePreset}
          handlePresetRangeSelection={handlePresetRangeSelection}
          priceLower={leftPrice?.toSignificant(5)}
          priceUpper={rightPrice?.toSignificant(5)}
          price={price}
          isGamma={
            liquidityRangeType === GlobalConst.v3LiquidityRangeType.GAMMA_RANGE
          }
          isUnipilot={
            liquidityRangeType ===
            GlobalConst.v3LiquidityRangeType.UNIPILOT_RANGE
          }
          gammaPair={gammaPair}
          unipilotPairs={unipilotVaultsForPair}
        />
      </Box>
      {liquidityRangeType === GlobalConst.v3LiquidityRangeType.GAMMA_RANGE &&
        presetRange &&
        gammaCurrencyA &&
        gammaCurrencyB &&
        gammaCurrencyA.wrapped.symbol &&
        gammaCurrencyB.wrapped.symbol &&
        gammaPair && (
          <Box my={2}>
            <small className='text-secondary'>
              <Trans
                i18nKey='gammaLiquidityRangeLearnMore'
                components={{
                  alink: (
                    <a
                      href={`https://quickswap.gamma.xyz/vault-detail/${gammaCurrencyA.wrapped.symbol.toUpperCase()}-${gammaCurrencyB.wrapped.symbol.toUpperCase()}-0${
                        presetRange.type === Presets.GAMMA_NARROW
                          ? '-Narrow'
                          : presetRange.type === Presets.GAMMA_WIDE
                          ? '-Wide'
                          : ''
                      }`}
                      target='_blank'
                      rel='noreferrer'
                    />
                  ),
                }}
              />
            </small>
          </Box>
        )}
      {liquidityRangeType === GlobalConst.v3LiquidityRangeType.MANUAL_RANGE && (
        <>
          {mintInfo.price && (
            <Box textAlign='center'>
              <span>
                {!!mintInfo.noLiquidity
                  ? `${t('initialPrice')}:`
                  : `${t('currentPrice')}:`}
                {currentPrice ?? ''}{' '}
                <span className='text-secondary'>
                  {currentPrice
                    ? `${currencyB?.symbol} ${t('per')} ${currencyA?.symbol}`
                    : `${t('loading')}...`}
                </span>
              </span>
            </Box>
          )}
          <Box my={2}>
            <RangeSelector
              priceLower={priceLower}
              priceUpper={priceUpper}
              getDecrementLower={getDecrementLower}
              getIncrementLower={getIncrementLower}
              getDecrementUpper={getDecrementUpper}
              getIncrementUpper={getIncrementUpper}
              onLeftRangeInput={onLeftRangeInput}
              onRightRangeInput={onRightRangeInput}
              currencyA={currencyA}
              currencyB={currencyB}
              mintInfo={mintInfo}
              disabled={!startPriceTypedValue && !mintInfo.price}
              isBeforePrice={isBeforePrice}
              isAfterPrice={isAfterPrice}
              priceFormat={priceFormat}
            />
          </Box>
          {activePreset === Presets.FULL && fullRangeWarningShown && (
            <Box className='pool-range-chart-warning border-yellow5'>
              <Box width={1} className='flex items-center'>
                <Box className='pool-range-chart-warning-icon'>
                  <ReportProblemOutlined />
                </Box>
                <small>{t('efficiencyComparison')}</small>
              </Box>
              <Box width={1} mt={1} mb={1.5}>
                <span>
                  <Trans
                    i18nKey='fullRangePositionsEarnLessFeeLearnMore'
                    components={{
                      alink: (
                        <a
                          href='https://quickswap.exchange'
                          target='_blank'
                          rel='noreferrer'
                        />
                      ),
                    }}
                  />
                </span>
              </Box>
              <button onClick={() => setFullRangeWarningShown(false)}>
                {t('iunderstand')}
              </button>
            </Box>
          )}
          {leftPrice &&
            rightPrice &&
            minRangeLength !== undefined &&
            rightPricePercent - leftPricePercent < minRangeLength && (
              <Box className='pool-range-chart-warning'>
                <Box className='pool-range-chart-warning-icon'>
                  <ReportProblemOutlined />
                </Box>
                <span>
                  {t('minPriceRangeWarning', { rangeLength: minRangeLength })}
                </span>
              </Box>
            )}
          {mintInfo.outOfRange && (
            <Box className='pool-range-chart-warning'>
              <Box className='pool-range-chart-warning-icon'>
                <ReportProblemOutlined />
              </Box>
              <span>{t('priceRangeNotElligibleWraning')}</span>
            </Box>
          )}
          {mintInfo.invalidRange && (
            <Box className='pool-range-chart-warning'>
              <Box className='pool-range-chart-warning-icon'>
                <ReportProblemOutlined />
              </Box>
              <span>{t('invalidRange')}</span>
            </Box>
          )}
        </>
      )}

      <Box className='pool-range-chart-wrapper'>
        <LiquidityChartRangeInput
          currencyA={currencyA ?? undefined}
          currencyB={currencyB ?? undefined}
          ticksAtLimit={mintInfo.ticksAtLimit}
          price={
            priceFormat === PriceFormats.USD
              ? currentPriceInUSD
                ? parseFloat(currentPriceInUSD.toSignificant(5))
                : undefined
              : price
              ? parseFloat(price)
              : undefined
          }
          priceLower={priceLower}
          priceUpper={priceUpper}
          onLeftRangeInput={onLeftRangeInput}
          onRightRangeInput={onRightRangeInput}
          interactive={false}
          priceFormat={priceFormat}
          feeAmount={mintInfo.feeAmount}
        />
      </Box>
    </Box>
  );
}
