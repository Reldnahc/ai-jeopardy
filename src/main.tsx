import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider} from 'react-router-dom';
import MainPage from './pages/MainPage.tsx';
import Game from './pages/Game';
import Lobby from './pages/Lobby';
import UserHistory from "./pages/UserHistory.tsx";
import './index.css'; // Include this in the main entry point
import {WebSocketProvider} from "./contexts/WebSocketContext.tsx";
import { AuthProvider } from './contexts/AuthContext.tsx';
import Profile from "./pages/Profile.tsx";
import {ProfileProvider} from "./contexts/ProfileContext.tsx";
import RecentBoards from "./pages/RecentBoards.tsx";
import {UserProfileProvider} from "./contexts/UserProfileContext.tsx";
import {AlertProvider} from "./contexts/AlertContext.tsx";
import {DeviceProvider} from "./contexts/DeviceContext.tsx";
import NotFoundPage from "./pages/NotFoundPage.tsx";
import Layout from "./components/common/Layout.tsx";
import RouteWatchRoot from "./components/common/RouteWatchRoot.tsx";

// Define the router configuration
const router = createBrowserRouter([
    {
        element: (
                <RouteWatchRoot/>
        ),
        children: [
            {
                path: "/",
                element: (
                        <Layout><MainPage/></Layout>
                )
            },
            {
                path: "/lobby/:gameId",
                element: (
                        <Layout><Lobby/></Layout>
                )
            },
            {
                path: "/game/:gameId",
                element: (
                        <Game/>
                )
            },
            {
                path: "/profile/:username",
                element: (
                        <Layout><Profile/></Layout>
                )
            },
            {
                path: "/profile/:username/history",
                element: (
                        <Layout><UserHistory/></Layout>
                )
            },
            {
                path: "/recent-boards",
                element: (
                        <Layout><RecentBoards/></Layout>
                )
            },
            {
                path: "*",
                element: (
                        <Layout><NotFoundPage/></Layout>
                )
            }
        ],
    },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <DeviceProvider>
            <AuthProvider>
                <ProfileProvider>
                    <UserProfileProvider>
                        <WebSocketProvider>
                            <AlertProvider>
                                <RouterProvider router={router} />
                            </AlertProvider>
                        </WebSocketProvider>
                    </UserProfileProvider>
                </ProfileProvider>
            </AuthProvider>
        </DeviceProvider>
    </React.StrictMode>
);
