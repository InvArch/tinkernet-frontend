import { Dialog } from "@headlessui/react";
import {
  ArrowLeftOnRectangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import shallow from "zustand/shallow";

import useAccount from "../stores/account";
import useModal from "../stores/modals";

const SelectWallet = ({ isOpen }: { isOpen: boolean }) => {
  const setOpenModal = useModal((state) => state.setOpenModal);

  const { selectedAccount, accounts, setSelectedAccount } = useAccount(
    (state) => ({
      selectedAccount: state.selectedAccount,
      accounts: state.accounts,
      setSelectedAccount: state.setSelectedAccount,
    }),
    shallow
  );

  const handleAccountSelection = async (
    account: InjectedAccountWithMeta | null
  ) => {
    if (!account) {
      setSelectedAccount(null);

      setOpenModal({ name: null });

      return;
    }

    setSelectedAccount(account);

    setOpenModal({ name: null });
  };

  return (
    <Dialog open={isOpen} onClose={() => setOpenModal({ name: null })}>
      <Dialog.Overlay className="fixed inset-0 z-40 h-screen w-full bg-black/40 backdrop-blur-md" />

      <button className="pointer fixed top-0 right-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-neutral-800 bg-transparent bg-opacity-50 p-6 text-gray-100 outline-none duration-500 hover:bg-opacity-100 hover:opacity-30">
        <XMarkIcon className="h-5 w-5" />
        <span className="block">close</span>
      </button>
      <Dialog.Panel>
        <div className="fixed left-1/2 top-1/2 z-50 mx-auto block max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 transform flex-col overflow-auto rounded-md border border-gray-50 bg-neutral-900 p-6 sm:w-full">
          <h2 className="text-xl font-bold text-white">Select your Wallet</h2>
          <ul className="w-full divide-y divide-gray-200">
            {accounts.map((account) => (
              <li
                role="menuitem"
                tabIndex={0}
                key={account.address}
                className="w-full cursor-pointer py-4 text-white transition-colors hover:text-amber-300"
                onClick={() => {
                  handleAccountSelection(account);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAccountSelection(account);
                  }
                }}
              >
                <span className="block font-bold">{account.meta?.name}</span>
                <span className="block overflow-hidden text-ellipsis text-sm">
                  {account.address}
                </span>
              </li>
            ))}
            {selectedAccount ? (
              <li
                role="menuitem"
                tabIndex={0}
                key={selectedAccount.address}
                className="underline-offset-2w-full flex cursor-pointer items-center gap-2 overflow-hidden text-ellipsis py-4 text-white underline transition-colors hover:text-amber-300"
                onClick={() => {
                  handleAccountSelection(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAccountSelection(null);
                  }
                }}
              >
                <ArrowLeftOnRectangleIcon className="h-5 w-5" />
                Disconnect
              </li>
            ) : null}
          </ul>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
};

export default SelectWallet;