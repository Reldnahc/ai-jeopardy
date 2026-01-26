import React from "react";
import Header from "./Header.tsx";
import Footer from "./Footer.tsx";

const Layout = ({ children }: { children: React.ReactNode }) => (
    <>
        <Header />
        {children}
        <Footer />
    </>
);

export default Layout;
