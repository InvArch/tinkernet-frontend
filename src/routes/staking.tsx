import { WsProvider, ApiPromise } from "@polkadot/api";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import { formatBalance } from "@polkadot/util";
import BigNumber from "bignumber.js";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import shallow from "zustand/shallow";
import LoadingSpinner from "../components/LoadingSpinner";
import useAccount from "../stores/account";
import useModal, { ModalName } from "../stores/modals";

type StakingCore = {
  key: string;
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
      account: string;
      era: number;
      staked: BigNumber;
    }[]
  >([]);
  const [unclaimedEras, setUnclaimedEras] = useState<number>(0);

  const [isLoading, setLoading] = useState(false);

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
        // current era
        apiBST.query.checkedInflation.currentEra(),
      ]);

        const stakingCores = results[0].map(([{ args: [key] }, core]) => {
        const c = core.toPrimitive() as {
          account: string;
          metadata: {
            name: string;
            description: string;
            image: string;
          };
        };

        const primitiveKey = key.toPrimitive() as BigNumber;

        return {
          key: primitiveKey,
          ...c,
        };
      });

      setStakingCores(stakingCores);

      const currentEra = {
        era: results[1].toPrimitive() as number,
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
        const userStakedInfo: {
          account: string;
          era: number;
          staked: BigNumber;
        }[] = [];

        for (const stakingCore of stakingCores) {
            console.log(stakingCores)
          const generalStakerInfo =
            await apiBST.query.ocifStaking.generalStakerInfo(
              stakingCore.key,
              // selectedAccount.address
              "i52rHjTpyEPda2cpmrxPkmuBu5JM2i1QMWZTSHBcRPb3g7BMn"
            );

          const info = generalStakerInfo.toPrimitive() as {
            stakes: { era: string; staked: string }[];
          };

          const unclaimed = info.length - 1;

          if (unclaimed > unclaimedEras) {
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

  const handleManageStaking = async (core: StakingCore) => {
    setOpenModal({ name: ModalName.MANAGE_STAKING, metadata: core });
  };

  const handleClaimAll = async () => {
    console.log("TODO");
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
          {selectedAccount && currentEra && totalStaked ? (
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

              <div className="relative overflow-hidden rounded-md border border-neutral-50 bg-black shadow sm:grid sm:grid-cols-3">
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
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-6">
                  <div>
                    <span className="text-sm">Unclaimed Eras</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold">{unclaimedEras} eras</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-6">
                  <div>
                    <span className="text-sm">Current Era</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold">
                      {currentEra.era} / {currentEra.erasPerYear}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stakingCores.map((core) => {
              const totalStaked = userStakedInfo.find(
                (info) => info.account === core.account
              )?.staked;

              return (
                <div
                  key={core.account}
                  className="relative flex flex-col gap-4 overflow-hidden rounded-md border border-neutral-50 p-6 sm:flex-row"
                >
                  <div className="absolute top-6 right-6">
                    <span className="text-sm">
                      {totalStaked
                        ? `Staked ${formatBalance(totalStaked.toString(), {
                            decimals: 12,
                            withUnit: "TNKR",
                            forceUnit: "-",
                          })}`
                        : null}
                    </span>
                  </div>

                  <div className="flex flex-shrink-0">
                    <img
                      src={core.metadata.image}
                      alt={core.metadata.name}
                      className="h-16 w-16 rounded-full"
                    />
                  </div>
                  <div className="flex flex-col gap-4">
                    <h4 className="font-bold">{core.metadata.name}</h4>

                    <p className="text-sm line-clamp-3">
                      {core.metadata.description}
                    </p>

                    {selectedAccount ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-amber-300 px-2 py-1 text-sm font-medium text-black shadow-sm hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
                          onClick={() => handleManageStaking(core)}
                        >
                          Manage Staking
                        </button>
                      </div>
                    ) : null}
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
