import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import {supabase} from "../supabaseClient";
import {useAuth} from "./AuthContext.tsx";

// Define the shape of the data you expect from the "profiles" table
export interface Profile {
    displayname: string;
    id: string;
    username: string;
    role: string; // Admin, Privileged, or Default
    tokens: number;
    bio?: string;
    boards_generated?: number;
    games_finished?: number;
    games_won?: number;
}

// Context value type definition
interface ProfileContextType {
    profile: Profile | null;
    loading: boolean;
    error: string | null;
    refetchProfile: () => Promise<void>; // Function to refetch profile
}

// Default value for the context
const ProfileContext = createContext<ProfileContextType>({
    profile: null,
    loading: true,
    error: null,
    refetchProfile: async () => {}
});

// Context Provider Component
export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user, loading } = useAuth();

    // Fetch the profile from Supabase
    const fetchProfile = async () => {
        try {
            setProfileLoading(true);
            if (user) {
                const { data, error } = await supabase
                    .from('profiles') // Replace with your table name
                    .select('*') // Select all columns or limit as needed (e.g., 'id, username, role')
                    .eq('id', user.id)
                    .single();

                if (error) {
                    throw new Error(error.message);
                }
                setProfile(data); // Set the profile in state
            } else {
                setProfile({
                    displayname: "", // Default display name
                    id: "placeholder-id", // Generic placeholder ID
                    username: "", // Default username
                    role: "Default", // Default role
                    tokens: 0, // Default tokens value
                });
            }
        } catch (err: any) {
            console.error('Error fetching profile:', err.message);
            setError(err.message);
        } finally {
            setProfileLoading(false);
        }
    };

    // Fetch the profile on component mount
    useEffect(() => {
        if (!loading){
           void fetchProfile();
        }
    }, [user, loading]);

    // Provide the context value
    return (
        <ProfileContext.Provider
            value={{
                profile,
                loading: profileLoading,
                error,
                refetchProfile: fetchProfile // Allow re-fetching
            }}
        >
            {children}
        </ProfileContext.Provider>
    );
};

// Custom Hook to Use the Profile Context
export const useProfile = () => {
    const context = useContext(ProfileContext);

    if (!context) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }

    return context;
};