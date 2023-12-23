import { useEffect, useRef, useState } from 'react';
import ProjectCard from './ProjectCard';
import LoadingSpinner from './LoadingSpinner';
import { BalanceType, ChainPropertiesType, CoreEraStakeInfoType, LockedType, StakingCore, TotalRewardsCoreClaimedQuery, TotalUserStakedData, UserStakedInfoType, getCoreInfo, getTotalUserStaked } from '../routes/staking';
import { AnyJson, Codec } from '@polkadot/types/types';
import { StakedDaoType } from '../routes/overview';
import BigNumber from 'bignumber.js';
import { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { loadProjectCores, loadStakedDaos } from '../utils/stakingServices';
import useApi from '../hooks/useApi';
import { toast } from 'react-hot-toast';
import useAccount from '../stores/account';
import { useQuery } from 'urql';
import { UnsubscribePromise } from '@polkadot/api/types';
import { StakesInfo } from '../routes/claim';
import useModal, { modalName } from '../stores/modals';

const DaoList = () => {
  const api = useApi();
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const setOpenModal = useModal((state) => state.setOpenModal);
  const selectedAccount = useAccount((state) => state.selectedAccount);
  const [isLoading, setLoading] = useState(true);
  const [isDataLoaded, setDataLoaded] = useState(false);
  const [stakedDaos, setStakedDaos] = useState<StakedDaoType[]>([]);
  const [stakingCores, setStakingCores] = useState<StakingCore[]>([]);
  const [availableBalance, setAvailableBalance] = useState<BigNumber>();
  const [chainProperties, setChainProperties] = useState<ChainPropertiesType>();
  const [coreEraStakeInfo, setCoreEraStakeInfo] = useState<CoreEraStakeInfoType[]>([]);
  const [totalUserStakedData, setTotalUserStakedData] = useState<TotalUserStakedData>({});
  const [userStakedInfo, setUserStakedInfo] = useState<UserStakedInfoType[]
  >([]);
  const [currentStakingEra, setCurrentStakingEra] = useState<number>(0);

  const [rewardsCoreClaimedQuery] = useQuery({
    query: TotalRewardsCoreClaimedQuery,
    variables: {}
  });

  const toggleViewMembers = (core: StakingCore, members: AnyJson[]) => {
    setOpenModal({
      name: modalName.MEMBERS,
      metadata: { ...core.metadata, members },
    });
  };

  const toggleReadMore = (core: StakingCore) => {
    setOpenModal({
      name: modalName.READ_MORE,
      metadata: core.metadata,
    });
  };

  const handleManageStaking = async ({
    core,
    totalUserStaked,
    availableBalance,
  }: {
    core: StakingCore;
    totalUserStaked: BigNumber;
    availableBalance: BigNumber;
  }) => {
    setOpenModal({
      name: modalName.MANAGE_STAKING,
      metadata: { ...core, totalUserStaked, availableBalance, stakingCores, totalUserStakedData },
    });
  };

  const loadDaos = async () => {
    if (!selectedAccount) return;
    const daos = await loadStakedDaos(stakingCores, selectedAccount?.address, totalUserStakedData, api);
    setStakedDaos(daos);
  };

  const loadCores = async () => {
    const cores = await loadProjectCores(api);

    if (cores) {
      setStakingCores(cores);
    }
  };

  const loadAccountInfo = async (selectedAccount: InjectedAccountWithMeta) => {
    const account = await api.query.system.account(selectedAccount.address);
    const balance = account.toPrimitive() as BalanceType;
    const locked = (await api.query.ocifStaking.ledger(selectedAccount.address)).toPrimitive() as LockedType;
    const currentBalance = new BigNumber(balance.data.free).minus(new BigNumber(locked.locked));

    setAvailableBalance(currentBalance);
  };

  const loadStakingConstants = async () => {
    const maxStakersPerCore = api.consts.ocifStaking.maxStakersPerCore.toPrimitive() as number;
    const inflationErasPerYear = api.consts.checkedInflation.erasPerYear.toPrimitive() as number;

    setChainProperties({ maxStakersPerCore, inflationErasPerYear });
  };

  const loadDashboardData = async (selectedAccount: InjectedAccountWithMeta | null) => {
    try {
      toast.loading("Loading staking cores...");

      if (selectedAccount) {
        await Promise.all([
          loadAccountInfo(selectedAccount),
          loadCores(),
          loadStakingConstants()
        ]);
      }

      toast.dismiss();
    } catch (error) {
      toast.dismiss();
      setLoading(false);
      toast.error(`${ error }`);
    }
  };

  const setupSubscriptions = ({
    selectedAccount,
  }: {
    selectedAccount: InjectedAccountWithMeta;
  }) => {
    // Current block subscription
    const blocks = api.rpc.chain.subscribeNewHeads(() => { });

    // Next era starting block subscription
    const nextEraStartingBlock = api.query.ocifStaking.nextEraStartingBlock(() => { });

    let generalEraInfo;

    if (currentStakingEra > 0) {
      generalEraInfo = api.query.ocifStaking.generalEraInfo(currentStakingEra);
    }

    // Staking current era subscription
    const currentEra = api.query.ocifStaking.currentEra((era: Codec) => {
      setCurrentStakingEra(era.toPrimitive() as number);
    });

    const account = api.query.system.account(selectedAccount.address);

    const unsubs = [blocks, nextEraStartingBlock, currentEra, account];

    if (generalEraInfo) {
      unsubs.push(generalEraInfo);
    }

    // Core era stake + User era stake subscriptions
    const coreEraStakeInfoMap: Map<
      number, CoreEraStakeInfoType> = new Map();

    const userStakedInfoMap: Map<
      number, UserStakedInfoType
    > = new Map();

    if (coreEraStakeInfo && coreEraStakeInfo.length > 0) {
      for (const stakingCore of stakingCores) {
        const coreEraStake = coreEraStakeInfo.find(info => info.coreId === stakingCore.key);

        if (coreEraStake) {
          coreEraStakeInfoMap.set(stakingCore.key, {
            ...coreEraStake,
          });

          if (Array.from(coreEraStakeInfoMap.values()).length > 0) {
            setCoreEraStakeInfo(Array.from(coreEraStakeInfoMap.values()));
          }
        }

        api.query.ocifStaking.generalStakerInfo(
          stakingCore.key,
          selectedAccount.address,
          (generalStakerInfo: Codec) => {
            const info = generalStakerInfo.toPrimitive() as StakesInfo;
            if (info.stakes.length > 0) {
              const latestInfo = info.stakes.at(-1);
              if (!latestInfo) {
                return;
              }

              userStakedInfoMap.set(stakingCore.key, {
                coreId: stakingCore.key,
                era: parseInt(latestInfo.era),
                staked: new BigNumber(latestInfo.staked),
              });

              if (Array.from(userStakedInfoMap.values()).length != 0) {
                setUserStakedInfo(Array.from(userStakedInfoMap.values()));
              }
            }
          }
        );
      }
    }

    return unsubs as UnsubscribePromise[];
  };

  useEffect(() => {
    loadDashboardData(selectedAccount);
  }, [selectedAccount, api]);

  useEffect(() => {
    if (!selectedAccount) return;
    if (!stakingCores) return;
    loadDaos();
  }, [selectedAccount, stakingCores, totalUserStakedData, api]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const coreInfoResults: { [key: number]: Partial<CoreEraStakeInfoType> | undefined; } = {};
      const totalUserStakedResults: { [key: number]: BigNumber | undefined; } = {};

      for (const core of stakingCores) {
        if (!isMounted) {
          break;
        }

        const coreInfo = getCoreInfo(coreEraStakeInfo, core);
        const totalUserStaked = getTotalUserStaked(userStakedInfo, core);

        if (typeof coreInfo !== 'undefined') {
          coreInfoResults[core.key] = coreInfo;
        }

        if (typeof totalUserStaked !== 'undefined') {
          totalUserStakedResults[core.key] = totalUserStaked;
        }
      }

      if (isMounted) {
        setTotalUserStakedData(prevState => {
          const newState = { ...prevState, ...totalUserStakedResults };
          if (JSON.stringify(newState) !== JSON.stringify(prevState)) {
            return newState;
          }
          return prevState;
        });

        setDataLoaded(true);
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [stakingCores, coreEraStakeInfo, userStakedInfo]);

  useEffect(() => {
    if (!rewardsCoreClaimedQuery.data?.cores?.length || !selectedAccount) return;

    let coreEraStakeInfoMap: CoreEraStakeInfoType[] = [];
    coreEraStakeInfoMap = rewardsCoreClaimedQuery.data.cores.filter((core: CoreEraStakeInfoType) => {
      return !coreEraStakeInfoMap.some((item: CoreEraStakeInfoType) => item.coreId === core.coreId);
    });

    setCoreEraStakeInfo(Array.from(coreEraStakeInfoMap.values()));
  }, [stakingCores, rewardsCoreClaimedQuery]);

  useEffect(() => {
    let unsubs: UnsubscribePromise[] = [];
    if (selectedAccount) {
      unsubs = setupSubscriptions({ selectedAccount });
    }

    return () => {
      unsubs.forEach((unsub: UnsubscribePromise) => {
        if (unsub) {
          unsub.then(unsubFunc => {
            if (typeof unsubFunc === 'function') {
              unsubFunc();
            }
          });
        }
      });
    };
  }, [selectedAccount, api, stakingCores]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {!isLoading && isDataLoaded
        ? stakingCores.map((core: StakingCore) => {
          const coreInfo = coreEraStakeInfo.find((info) => info.coreId === core.key);
          const userStaked = totalUserStakedData[core.key];
          return (
            <div className="relative" key={core.key}>
              <ProjectCard
                members={stakedDaos.find((dao) => dao.key === core.key)?.members as AnyJson[] || []}
                core={core}
                totalUserStaked={userStaked}
                coreInfo={coreInfo}
                handleManageStaking={handleManageStaking}
                toggleExpanded={toggleReadMore}
                toggleViewMembers={toggleViewMembers}
                chainProperties={chainProperties}
                availableBalance={availableBalance}
                descriptionRef={descriptionRef}
                selectedAccount={selectedAccount}
              />
            </div>
          );
        })
        : <LoadingSpinner />}
    </div>
  );
};

export default DaoList;
