import { Outlet } from "react-router-dom";
import Header from "./Header";

import pattern from "../../assets/pattern.svg";
import SideNav from "./SideNav";

const Layout = () => {
  return (
    <div
      className="bg-neutral-900 h-screen overflow-y-hidden flex flex-col justify-between"
      aria-hidden="true"
      style={{
        backgroundImage: `url(${ pattern })`,
        backgroundRepeat: 'repeat',
        backgroundSize: 'stretch',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >

      <div className="block md:hidden">
        <Header />
      </div>

      <div className="flex flex-row overflow-y-auto">
        <div className="hidden md:block">
          <SideNav />
        </div>
        <main className="w-full relative text-white tinker-scrollbar scrollbar scrollbar-thumb-amber-300 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
