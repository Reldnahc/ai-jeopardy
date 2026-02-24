import React from "react";
import Header from "./Header.tsx";
import Footer from "./Footer.tsx";

const Layout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col bg-gradient-to-r from-[#183a75] via-[#2a5fb3] to-[#1c4a96]">
    <Header />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);

export default Layout;
