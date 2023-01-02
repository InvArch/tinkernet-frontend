import { WsProvider, ApiPromise } from "@polkadot/api";
import { web3Enable, web3FromAddress } from "@polkadot/extension-dapp";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import { formatBalance } from "@polkadot/util";
import { encodeAddress } from "@polkadot/util-crypto";
import BigNumber from "bignumber.js";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import shallow from "zustand/shallow";
import LoadingSpinner from "../components/LoadingSpinner";
import useAccount from "../stores/account";
import useModal, { ModalName } from "../stores/modals";
import { useQuery } from "urql";

const totalRewardsClaimed = `
  query totalRewardsClaimed($accountId: String!) {
    stakers(where: {account_eq: $accountId}) {
      latestClaimBlock
      totalRewards
    }
  }
`;

type StakingCore = {
  key: number;
  account: string;
  metadata: {
    name: string;
    description: string;
    image: string;
  };
};

const BRAINSTORM_RPC_URL = "wss://brainstorm.invarch.network";

const Staking = () => {
  const setOpenModal = useModal((state) => state.setOpenModal);
  const { selectedAccount } = useAccount(
    (state) => ({ selectedAccount: state.selectedAccount }),
    shallow
  );
  const [stakingCores, setStakingCores] = useState<StakingCore[]>([]);
  const [currentEra, setCurrentEra] = useState<{
    era: number;
    inflationEra: number;
    erasPerYear: number;
  }>();
  const [coreEraStakeInfo, setCoreEraStakeInfo] = useState<
    {
      account: string;
      total: string;
      numberOfStakers: number;
      rewardClaimed: boolean;
      active: boolean;
    }[]
  >([]);
  const [totalStaked, setTotalStaked] = useState<BigNumber>();
  const [userStakedInfo, setUserStakedInfo] = useState<
    {
      coreId: number;
      era: number;
      staked: BigNumber;
    }[]
  >([]);
  const [unclaimedEras, setUnclaimedEras] = useState<{
    cores: { coreId: number; earliestEra: number }[];
    total: number;
  }>({ cores: [], total: 0 });
  const [availableBalance, setAvailableBalance] = useState<BigNumber>();

  const [isLoading, setLoading] = useState(false);

    const [currentAddress, setCurrentAddress] = useState<string | null>(null);

    const [query] = useQuery({
        query: totalRewardsClaimed,
        variables: { accountId: currentAddress },
        pause: !currentAddress,
    });

  const [totalClaimed, setTotalClaimed] = useState<BigNumber>(new BigNumber(0));

  const loadStakingCores = async (
    selectedAccount: InjectedAccountWithMeta | null
  ) => {
    setLoading(true);

    try {
      toast.loading("Loading staking cores...");

      const wsProviderBST = new WsProvider(BRAINSTORM_RPC_URL);

      const apiBST = await ApiPromise.create({ provider: wsProviderBST });

      const results = await Promise.all([
        // registered cores
        apiBST.query.ocifStaking.registeredCore.entries(),
        // current era of inflation
        apiBST.query.checkedInflation.currentEra(),
        // current era of staking
        apiBST.query.ocifStaking.currentEra(),
      ]);

      const stakingCores = results[0].map(
        ([
          {
            args: [key],
          },
          core,
        ]) => {
          const c = core.toPrimitive() as {
            account: string;
            metadata: {
              name: string;
              description: string;
              image: string;
            };
          };

          const primitiveKey = key.toPrimitive() as number;

          return {
            key: primitiveKey,
            ...c,
          };
        }
      );

      setStakingCores(stakingCores);

      const currentEra = {
        inflationEra: results[1].toPrimitive() as number,
        era: results[2].toPrimitive() as number,
        erasPerYear:
          apiBST.consts.checkedInflation.erasPerYear.toPrimitive() as number,
      };

      setCurrentEra(currentEra);

      const coreEraStakeInfo: {
        account: string;
        total: string;
        numberOfStakers: number;
        rewardClaimed: boolean;
        active: boolean;
      }[] = [];

      for (const stakingCore of stakingCores) {
        const coreEraStake = (
          await apiBST.query.ocifStaking.coreEraStake(
            stakingCore.key,
            currentEra.era
          )
        ).toPrimitive() as {
          total: string;
          numberOfStakers: number;
          rewardClaimed: boolean;
          active: boolean;
        };

        coreEraStakeInfo.push({
          account: stakingCore.account,
          ...coreEraStake,
        });
      }

      setCoreEraStakeInfo(coreEraStakeInfo);

      if (selectedAccount) {
          setCurrentAddress(encodeAddress(selectedAccount.address, 2));

        //  if (query.fetching) return;

          if (query.data) {
              const totalClaimedQuery: BigNumber = query.data.stakers.map(
                  ({ totalRewards, latestClaimBlock }: { totalRewards: BigNumber; latestClaimBlock: number; }) => totalRewards
              );

              setTotalClaimed(totalClaimedQuery);
          }

        const balanceInfo = await apiBST.query.system.account(
          selectedAccount.address
        );

        const balance = balanceInfo.toPrimitive() as {
          nonce: string;
          consumers: string;
          providers: string;
          sufficients: string;
          data: {
            free: string;
            reserved: string;
            miscFrozen: string;
            feeFrozen: string;
          };
        };

        setAvailableBalance(new BigNumber(balance.data.free));

        const userStakedInfo: {
          coreId: number;
          era: number;
          staked: BigNumber;
        }[] = [];

        for (const stakingCore of stakingCores) {
          const generalStakerInfo =
            await apiBST.query.ocifStaking.generalStakerInfo(
              stakingCore.key,
              selectedAccount.address
            );

          const info = generalStakerInfo.toPrimitive() as {
            stakes: { era: string; staked: string }[];
          };

          if (info.stakes.length > 0) {
            const unclaimedEarliest = info.stakes[0].era;

            if (parseInt(unclaimedEarliest) < currentEra.era) {
              const unclaimed = unclaimedEras;

              unclaimed.cores.filter((value) => {
                return value.coreId != stakingCore.key;
              });

              unclaimed.cores.push({
                coreId: stakingCore.key,
                earliestEra: parseInt(unclaimedEarliest),
              });

              if (
                currentEra.era - parseInt(unclaimedEarliest) >
                unclaimed.total
              ) {
                unclaimed.total = currentEra.era - parseInt(unclaimedEarliest);
              }

              setUnclaimedEras(unclaimed);
            }

            const latestInfo = info.stakes.at(-1);

            if (!latestInfo) {
              continue;
            }

            userStakedInfo.push({
              coreId: stakingCore.key,
              era: parseInt(latestInfo.era),
              staked: new BigNumber(latestInfo.staked),
            });
          }
        }

        setUserStakedInfo(userStakedInfo);

        const totalStaked = userStakedInfo.reduce(
          (acc, cur) => acc.plus(cur.staked),
          new BigNumber(0)
        );

        setTotalStaked(totalStaked);
      }

      toast.dismiss();

      setLoading(false);
    } catch (e) {
      console.error(e);

      toast.dismiss();

      setLoading(false);

      toast.error("Failed to load staking cores!");
    }
  };

  const handleManageStaking = async ({
    core,
    totalStaked,
    availableBalance,
  }: {
    core: StakingCore;
    totalStaked: BigNumber;
    availableBalance: BigNumber;
  }) => {
    setOpenModal({
      name: ModalName.MANAGE_STAKING,
      metadata: { ...core, totalStaked, availableBalance },
    });
  };

  const handleClaimAll = async () => {
    if (!selectedAccount) return;

    if (!unclaimedEras) return;

    if (!currentEra) return;

    await web3Enable("Tinkernet");

    const injector = await web3FromAddress(selectedAccount.address);

    const wsProviderBST = new WsProvider(BRAINSTORM_RPC_URL);

    const apiBST = await ApiPromise.create({ provider: wsProviderBST });

    const batch = [];

    const uniqueCores = [
      ...new Map(unclaimedEras.cores.map((x) => [x.coreId, x])).values(),
    ];

    for (const core of uniqueCores) {
      if (!core?.earliestEra) continue;

      for (let i = 0; i < currentEra.era - core.earliestEra; i++) {
        batch.push(apiBST.tx.ocifStaking.stakerClaimRewards(core.coreId));
      }
    }

    apiBST.tx.utility
      .batch(batch)
      .signAndSend(
        selectedAccount.address,
        { signer: injector.signer },
        (result) => {
          toast.dismiss();

          toast.loading("Submitting transaction...");

          if (result.status.isFinalized) {
            toast.dismiss();

            toast.success("Successfully claimed all rewards!");
          }
        }
      );
  };

  useEffect(() => {
    loadStakingCores(selectedAccount);
  }, [selectedAccount]);

  return (
    <>
      {isLoading ? (
        <div className="flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : null}

      {!isLoading && stakingCores.length > 0 ? (
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 p-4 sm:px-6 lg:px-8">
          {selectedAccount &&
          currentEra &&
          totalStaked &&
          unclaimedEras &&
          availableBalance ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <span>Dashboard</span>
                </div>

                <div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-amber-300 px-4 py-2 text-base font-medium text-black shadow-sm hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
                    onClick={handleClaimAll}
                  >
                    Claim All
                  </button>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-md border border-neutral-50 bg-black shadow sm:grid md:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-2 p-6">
                  <div>
                    <span className="text-sm">Available balance</span>
                  </div>
                  <div>
                    <span className="truncate text-2xl font-bold">
                      {formatBalance(availableBalance.toString(), {
                        decimals: 12,
                        withUnit: "TNKR",
                        forceUnit: "-",
                      }).replace(".0000", "")}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-6">
                  <div>
                    <span className="text-sm">Total staked</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold">
                      {formatBalance(totalStaked.toString(), {
                        decimals: 12,
                        withUnit: "TNKR",
                        forceUnit: "-",
                      }).replace(".0000", "")}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-6">
                  <div>
                    <span className="text-sm">Unclaimed Eras</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold">
                      {unclaimedEras.total} eras
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-6">
                    <div>
                        <span className="text-sm">Total Rewards Claimed</span>
                    </div>
                    <div>
                        <span className="text-2xl font-bold">
                            {formatBalance(totalClaimed.toString(), {
                                decimals: 12,
                                withUnit: "TNKR",
                                forceUnit: "-",
                            }).replace(".0000", "")}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-2 p-6">
                  <div>
                    <span className="text-sm">Current Era</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold">
                      {currentEra.inflationEra} / {currentEra.erasPerYear}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stakingCores.map((core) => {
              const totalStaked = userStakedInfo.find(
                (info) => info.coreId === core.key
              )?.staked;

              const coreInfo = coreEraStakeInfo.find(
                (info) => info.account === core.account
              );

              return (
                <div
                  key={core.account}
                  className="flex flex-col gap-4 overflow-hidden rounded-md border border-neutral-50 p-6 sm:flex-row"
                >
                  <div className="flex w-full flex-col justify-between gap-4">
                    <div className="flex flex-shrink-0">
                      <img
                        src={core.metadata.image}
                        alt={core.metadata.name}
                        className="h-16 w-16 rounded-full"
                      />
                    </div>
                    <div className="flex flex-col gap-4">
                      <h4 className="font-bold">{core.metadata.name}</h4>

                      <p className="h-16 text-sm line-clamp-3">
                        {core.metadata.description}
                      </p>

                      {selectedAccount ? (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-amber-300 px-2 py-1 text-sm font-medium text-black shadow-sm hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
                            onClick={() => {
                              handleManageStaking({
                                core,
                                totalStaked: totalStaked || new BigNumber("0"),
                                availableBalance:
                                  availableBalance || new BigNumber("0"),
                              });
                            }}
                          >
                            {totalStaked ? "Manage Staking" : "Stake"}
                          </button>

                          <span className="block text-sm">
                            {totalStaked
                              ? `Staked ${formatBalance(
                                  totalStaked.toString(),
                                  {
                                    decimals: 12,
                                    withUnit: "TNKR",
                                    forceUnit: "-",
                                  }
                                ).replace(".0000", "")}`
                              : null}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="truncate text-sm">
                        {coreInfo ? coreInfo.numberOfStakers : "0"} stakers
                      </div>
                      <div className="truncate text-sm">
                        {coreInfo?.total
                          ? formatBalance(coreInfo.total.toString(), {
                              decimals: 12,
                              withUnit: "TNKR",
                              forceUnit: "-",
                            }).replace(".0000", "")
                          : "0"}{" "}
                        staked
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedAccount ? (
            <div className="flex items-center justify-between">
              <div />

              <div>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-amber-300 px-4 py-2 text-base font-medium text-black shadow-sm hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 disabled:opacity-40"
                >
                  Register Project (Coming Soon)
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export default Staking;
